/**
 * Shared fix orchestration engine.
 *
 * Encapsulates the generate → verify → retry → best-attempt loop so both
 * the main /audit workspace (useAuditSession) and the standalone /session/:id
 * page (Session.tsx) run identical logic.
 */

import { supabase } from '@/integrations/supabase/client';
import { ImageAsset, FixAttempt, FixProgressState, FixStrategy, FixPlan, ImageCategory, BestAttemptSelection, ProductIdentityCard } from '@/types';
import { extractImageCategory } from '@/utils/imageCategory';
import { buildFixPlan } from '@/utils/fixPlanEngine';
import { planRetry, RetryDecision } from '@/utils/retryPlanner';
import { selectBestAttempt } from '@/utils/bestAttemptSelector';

// ── Public types ───────────────────────────────────────────────

export interface FixOrchestratorInput {
  asset: ImageAsset;
  originalBase64: string;
  mainImageBase64?: string;
  listingTitle?: string;
  productAsin?: string;
  customPrompt?: string;
  previousGeneratedImage?: string;
  productIdentity?: ProductIdentityCard | Record<string, unknown> | null;
}

export interface FixOrchestratorCallbacks {
  onProgress: (updater: (prev: FixProgressState | null) => FixProgressState | null) => void;
  onLog: (level: 'info' | 'processing' | 'success' | 'warning' | 'error', message: string) => void;
}

export interface FixOrchestratorResult {
  finalImage: string | undefined;
  allAttempts: FixAttempt[];
  bestAttemptSelection: BestAttemptSelection | undefined;
  stopReason: string | undefined;
  lastStrategy: FixStrategy | undefined;
  lastFixMethod: ImageAsset['fixMethod'];
}

// ── Helpers ────────────────────────────────────────────────────

function parsePaymentError(genError: unknown): { isPayment: boolean; message: string } {
  const errorContext = (genError as any)?.context;
  const status = errorContext?.status as number | undefined;
  let body: any;
  if (errorContext?.body) {
    try { body = typeof errorContext.body === 'string' ? JSON.parse(errorContext.body) : errorContext.body; } catch { /* */ }
  }
  const serverMsg: string | undefined = body?.error || body?.message;
  const serverType: string | undefined = body?.errorType;

  if (status === 402 || serverType === 'payment_required') {
    return { isPayment: true, message: serverMsg || 'No fix credits remaining' };
  }
  return { isPayment: false, message: serverMsg || (genError as any)?.message || 'Generation failed' };
}

// ── Core orchestrator ──────────────────────────────────────────

export async function runFixOrchestration(
  input: FixOrchestratorInput,
  callbacks: FixOrchestratorCallbacks,
): Promise<FixOrchestratorResult> {
  const { asset, originalBase64, mainImageBase64, listingTitle, productAsin, customPrompt, previousGeneratedImage, productIdentity } = input;
  const { onProgress, onLog } = callbacks;

  const maxAttempts = 3;
  const assetContentType = extractImageCategory(asset) as ImageCategory;
  let previousCritique: string | undefined;
  let lastGeneratedImage: string | undefined = previousGeneratedImage;
  let lastFixMethod: ImageAsset['fixMethod'];
  let lastStrategy: FixStrategy | undefined;
  let finalImage: string | undefined;
  let retryInstructions: string[] = [];
  const retryDecisions: RetryDecision[] = [];

  // Initialize fix plan
  let fixPlan = buildFixPlan(
    asset.type as 'MAIN' | 'SECONDARY',
    asset.analysisResult?.productCategory || 'GENERAL',
    asset.analysisResult?.violations || [],
    asset.analysisResult?.deterministicFindings || [],
    productIdentity as any || undefined,
    assetContentType,
  );

  // If fix plan says skip, bail out
  if (fixPlan.strategy === 'skip') {
    onLog('warning', `⏭️ ${asset.name}: Content type "${assetContentType}" — not safe to auto-fix.`);
    return { finalImage: undefined, allAttempts: [], bestAttemptSelection: undefined, stopReason: 'skip', lastStrategy: 'skip', lastFixMethod: undefined };
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    onLog('processing', `🖼️ Generation attempt ${attempt}/${maxAttempts}...`);

    try {
      onProgress(prev => prev ? {
        ...prev,
        attempt,
        currentStep: 'generating',
        thinkingSteps: [...prev.thinkingSteps, `🖼️ Generation attempt ${attempt}/${maxAttempts}...`],
      } : prev);

      lastStrategy = fixPlan.strategy;
      onLog('info', `📋 Fix plan: strategy=${fixPlan.strategy}, rules=${fixPlan.targetRuleIds.join(',') || 'general'}`);

      const { data: genData, error: genError } = await supabase.functions.invoke('generate-fix', {
        body: {
          imageBase64: originalBase64,
          imageType: asset.type,
          generativePrompt: customPrompt || asset.analysisResult?.generativePrompt,
          mainImageBase64,
          previousCritique,
          previousGeneratedImage: lastGeneratedImage,
          productTitle: listingTitle || undefined,
          productAsin: productAsin || undefined,
          customPrompt,
          spatialAnalysis: asset.analysisResult?.spatialAnalysis,
          imageCategory: asset.analysisResult?.productCategory || undefined,
          imageContentType: assetContentType,
          productIdentity: productIdentity || undefined,
          violations: asset.analysisResult?.violations || [],
          scoringRationale: asset.analysisResult?.scoringRationale || undefined,
          fixPlan,
          retryInstructions: retryInstructions.length > 0 ? retryInstructions : undefined,
        },
      });

      if (genError) {
        const pe = parsePaymentError(genError);
        if (pe.isPayment) {
          onLog('error', `❌ ${pe.message}`);
          throw Object.assign(new Error(pe.message), { isPayment: true });
        }
        throw new Error(pe.message);
      }
      if (genData?.error) {
        if (genData.errorType === 'payment_required') {
          onLog('error', `❌ ${genData.error}`);
          throw Object.assign(new Error(genData.error), { isPayment: true });
        }
        throw new Error(genData.error);
      }
      if (!genData?.fixedImage) throw new Error('No image generated');

      const fixMethod = genData.usedBackgroundSegmentation
        ? 'bg-segmentation' as const
        : asset.type === 'MAIN'
          ? 'full-regeneration' as const
          : 'surgical-edit' as const;
      lastFixMethod = fixMethod;

      onLog('success', `✨ AI generation complete (${fixMethod})`);
      lastGeneratedImage = genData.fixedImage;

      const newAttempt: FixAttempt = {
        attempt,
        generatedImage: genData.fixedImage,
        status: 'verifying',
        fixTier: 'gemini-flash',
        strategyUsed: fixPlan.strategy,
      };

      onProgress(prev => prev ? {
        ...prev,
        currentStep: 'verifying',
        intermediateImage: genData.fixedImage,
        attempts: [...prev.attempts, newAttempt],
        thinkingSteps: [...prev.thinkingSteps, '✨ Image generated, starting verification...'],
      } : prev);

      // ── Verify ──
      const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-image', {
        body: {
          originalImageBase64: originalBase64,
          generatedImageBase64: genData.fixedImage,
          imageType: asset.type,
          imageContentType: assetContentType,
          mainImageBase64,
          spatialAnalysis: asset.analysisResult?.spatialAnalysis,
          productIdentity: productIdentity || undefined,
          targetRuleIds: fixPlan.targetRuleIds,
          fixCategory: fixPlan.category,
        },
      });

      if (verifyError) {
        onLog('warning', `⚠️ Verification unavailable, using generated image`);
        finalImage = genData.fixedImage;
        // Update attempt status
        onProgress(prev => {
          if (!prev) return prev;
          const updated = [...prev.attempts];
          updated[updated.length - 1] = { ...updated[updated.length - 1], status: 'passed' };
          return { ...prev, attempts: updated };
        });
        break;
      }

      const verification = verifyData;
      onLog('info', `📊 Verification score: ${verification.score}%`);

      onProgress(prev => prev ? {
        ...prev,
        thinkingSteps: [...prev.thinkingSteps, ...(verification.thinkingSteps || [])],
      } : prev);

      const passed = verification.isSatisfactory && verification.productMatch;

      onProgress(prev => {
        if (!prev) return prev;
        const updated = [...prev.attempts];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0) {
          updated[lastIdx] = { ...updated[lastIdx], verification, status: passed ? 'passed' : 'failed' };
        }
        return { ...prev, attempts: updated };
      });

      if (passed) {
        onLog('success', `✅ All verification checks passed!`);
        onProgress(prev => prev ? { ...prev, currentStep: 'complete' } : prev);
        finalImage = genData.fixedImage;
        break;
      } else {
        if (!verification.productMatch) onLog('error', `🚨 CRITICAL: Product identity mismatch detected`);
        onLog('warning', `⚠️ Issues: ${verification.critique}`);

        // ── Retry planner ──
        const retryDecision = planRetry({
          imageType: asset.type as 'MAIN' | 'SECONDARY',
          category: fixPlan.category,
          currentStrategy: fixPlan.strategy,
          attempt,
          maxAttempts,
          verification,
          targetRuleIds: fixPlan.targetRuleIds,
          previousDecisions: retryDecisions,
          contentType: assetContentType,
        });
        retryDecisions.push(retryDecision);

        // Store decision on attempt
        onProgress(prev => {
          if (!prev) return prev;
          const updated = [...prev.attempts];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0) updated[lastIdx] = { ...updated[lastIdx], retryDecision };
          return { ...prev, attempts: updated };
        });

        onLog('info', `🧠 Retry decision: ${retryDecision.rationale}`);

        if (!retryDecision.shouldContinue) {
          onLog('warning', `🛑 Stopping retries: ${retryDecision.stopReason}`);
          onProgress(prev => prev ? { ...prev, currentStep: 'complete', stopReason: retryDecision.stopReason } : prev);
          break;
        } else if (attempt < maxAttempts) {
          fixPlan = { ...fixPlan };
          fixPlan.strategy = retryDecision.nextStrategy;
          fixPlan.preserve = [...new Set([...fixPlan.preserve, ...retryDecision.tightenedPreserve])];
          fixPlan.prohibited = [...new Set([...fixPlan.prohibited, ...retryDecision.tightenedProhibited])];
          retryInstructions = retryDecision.additionalInstructions;

          onLog('processing', `🔄 Retrying with strategy: ${retryDecision.nextStrategy}`);
          onProgress(prev => prev ? { ...prev, currentStep: 'retrying', lastCritique: verification.critique } : prev);
          previousCritique = verification.critique;

          if (verification.improvements?.length > 0) {
            previousCritique += '\n\nRequired improvements:\n' + verification.improvements.map((i: string) => `- ${i}`).join('\n');
          }

          await new Promise(r => setTimeout(r, 2000));
        } else {
          onLog('warning', `⚠️ Max retries reached.`);
          onProgress(prev => prev ? { ...prev, currentStep: 'complete' } : prev);
        }
      }
    } catch (error: any) {
      if (error.isPayment) throw error;
      const msg = error instanceof Error ? error.message : 'Generation failed';
      onLog('error', `❌ Attempt ${attempt} failed: ${msg}`);

      if (attempt === maxAttempts) throw error;
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  // ── Best-attempt selection ──────────────────────────────────
  let allAttempts: FixAttempt[] = [];
  onProgress(prev => { if (prev) allAttempts = [...prev.attempts]; return prev; });

  let bestAttemptSelection: BestAttemptSelection | undefined;
  let stopReason: string | undefined;
  onProgress(prev => { stopReason = prev?.stopReason; return prev; });

  if (!finalImage && allAttempts.length > 0) {
    const selection = selectBestAttempt(allAttempts, asset.type as 'MAIN' | 'SECONDARY', assetContentType);
    const bestAttempt = allAttempts[selection.selectedAttemptIndex];
    if (bestAttempt?.generatedImage) {
      finalImage = bestAttempt.generatedImage;
      bestAttemptSelection = selection;
      onLog('info', `🏆 ${selection.selectedReason}`);

      onProgress(prev => {
        if (!prev) return prev;
        const updated = prev.attempts.map((a, i) => ({ ...a, isBestAttempt: i === selection.selectedAttemptIndex }));
        return { ...prev, attempts: updated, bestAttemptSelection: selection };
      });
      // Re-read allAttempts with isBestAttempt set
      onProgress(prev => { if (prev) allAttempts = [...prev.attempts]; return prev; });
    }
  } else if (finalImage && allAttempts.length > 0) {
    // Even for passing images, read bestAttemptSelection if set
    onProgress(prev => { bestAttemptSelection = prev?.bestAttemptSelection; return prev; });
  }

  return { finalImage, allAttempts, bestAttemptSelection, stopReason, lastStrategy, lastFixMethod };
}

// ── Persistence helper ─────────────────────────────────────────

export function buildFixReviewPayload(
  allAttempts: FixAttempt[],
  bestAttemptSelection: BestAttemptSelection | undefined,
  stopReason: string | undefined,
  lastStrategy: FixStrategy | undefined,
  unresolvedState?: string,
) {
  return {
    attempts: allAttempts.map(a => ({
      attempt: a.attempt,
      status: a.status,
      strategyUsed: a.strategyUsed,
      isBestAttempt: a.isBestAttempt,
      verification: a.verification ? {
        score: a.verification.score,
        isSatisfactory: a.verification.isSatisfactory,
        productMatch: a.verification.productMatch,
        critique: a.verification.critique,
        passedChecks: a.verification.passedChecks,
        failedChecks: a.verification.failedChecks,
        componentScores: a.verification.componentScores,
      } : undefined,
      retryDecision: a.retryDecision ? {
        rationale: a.retryDecision.rationale,
        nextStrategy: a.retryDecision.nextStrategy,
        stopReason: a.retryDecision.stopReason,
      } : undefined,
    })),
    bestAttemptSelection,
    stopReason,
    lastFixStrategy: lastStrategy,
    ...(unresolvedState ? { unresolvedState } : {}),
  };
}
