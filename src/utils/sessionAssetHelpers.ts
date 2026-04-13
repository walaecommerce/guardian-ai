import { ImageAsset, AnalysisResult, FixAttempt, BestAttemptSelection, FixStrategy } from '@/types';

/**
 * Hydrate fix review data from the persisted fix_attempts JSONB column.
 * Returns partial ImageAsset fields for fix history display.
 */
function hydrateFixReview(fixAttemptsJson: unknown): Partial<ImageAsset> {
  if (!fixAttemptsJson || typeof fixAttemptsJson !== 'object') return {};

  const data = fixAttemptsJson as Record<string, unknown>;

  // Enhancement-only record: { fixMethod: 'enhancement' }
  if (data.fixMethod === 'enhancement') {
    return { fixMethod: 'enhancement' };
  }

  // Skipped/manual-review state
  if (data.skipped === true) {
    return {
      batchFixStatus: 'skipped',
      batchSkipReason: data.skipReason as string | undefined,
      fixabilityTier: (data.fixabilityTier as ImageAsset['fixabilityTier']) || 'manual_review',
      unresolvedState: (data.unresolvedState as ImageAsset['unresolvedState']) || 
        (data.fixabilityTier === 'warn_only' ? 'warn_only' : 'manual_review'),
    };
  }

  // New structured format: { attempts, bestAttemptSelection, stopReason, lastFixStrategy }
  if (Array.isArray(data.attempts)) {
    const attempts: FixAttempt[] = (data.attempts as any[]).map(a => ({
      attempt: a.attempt ?? 1,
      generatedImage: '', // Not persisted to save storage — only metadata
      status: a.status ?? 'passed',
      strategyUsed: a.strategyUsed,
      isBestAttempt: a.isBestAttempt,
      verification: a.verification,
      retryDecision: a.retryDecision,
    }));

    const bestAttemptSelection = data.bestAttemptSelection as BestAttemptSelection | undefined;

    return {
      fixAttempts: attempts,
      bestAttemptSelection: bestAttemptSelection,
      selectedAttemptIndex: bestAttemptSelection?.selectedAttemptIndex,
      fixStopReason: data.stopReason as string | undefined,
      lastFixStrategy: data.lastFixStrategy as FixStrategy | undefined,
      unresolvedState: (data.unresolvedState as ImageAsset['unresolvedState']) || 
        (data.stopReason && !bestAttemptSelection ? 'retry_stopped' : undefined),
      // If there's a stopReason and no fixed image, mark as failed
      batchFixStatus: data.unresolvedState ? 'failed' as const : undefined,
    };
  }

  // Legacy: fix_attempts was an array directly (old format, no review data)
  if (Array.isArray(fixAttemptsJson)) {
    return {};
  }

  return {};
}

/**
 * Infer legacy fix metadata when fix_attempts is empty/missing but fixed_image_url exists.
 * Called by buildAssetFromSessionImage to recover enough state for pre-fix sessions.
 */
function inferLegacyFixMeta(
  hasFixedUrl: boolean,
  fixAttemptsJson: unknown,
): Partial<ImageAsset> {
  if (!hasFixedUrl) return {};
  // If fix_attempts already has structured data, don't override
  if (fixAttemptsJson && typeof fixAttemptsJson === 'object' && !Array.isArray(fixAttemptsJson)) {
    const obj = fixAttemptsJson as Record<string, unknown>;
    if (obj.fixMethod || obj.attempts || obj.skipped) return {};
  }
  // Legacy: has a fixed image but no structured fix_attempts → mark as legacy fix
  return { fixMethod: 'fix' as const };
}

/**
 * Canonical helper for building ImageAsset from a session_images DB row.
 * Used by useSessionLoader for rehydration.
 */
export function buildAssetFromSessionImage(
  img: {
    id: string;
    image_name: string;
    image_type: string;
    analysis_result: unknown;
    fix_attempts?: unknown;
    fixed_image_url?: string | null;
  },
  file: File,
  signedOriginalUrl: string,
  signedFixedUrl?: string,
): { asset: ImageAsset; assetId: string } {
  const assetId = Math.random().toString(36).substring(2, 9);

  const fixReview = hydrateFixReview(img.fix_attempts);

  const asset: ImageAsset = {
    id: assetId,
    file,
    preview: signedOriginalUrl,
    type: img.image_type as 'MAIN' | 'SECONDARY',
    name: img.image_name,
    sourceUrl: signedOriginalUrl,
    analysisResult: img.analysis_result as unknown as AnalysisResult | undefined,
    fixedImage: signedFixedUrl,
    ...fixReview,
  };

  return { asset, assetId };
}

/**
 * Canonical helper for building ImageAsset from a freshly downloaded file.
 * Used by useAuditSession import flows.
 */
export function buildAssetFromDownload(
  file: File,
  category: string,
  sourceUrl: string,
  contentHash: string,
  isMain: boolean,
): ImageAsset {
  const assetId = Math.random().toString(36).substring(2, 9);

  return {
    id: assetId,
    file,
    preview: URL.createObjectURL(file),
    type: isMain ? 'MAIN' : 'SECONDARY',
    name: `${category}_${file.name}`,
    sourceUrl,
    contentHash,
  };
}
