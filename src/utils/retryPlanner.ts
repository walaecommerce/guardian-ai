import type { FixStrategy, VerificationResult, ImageCategory } from '@/types';

export interface RetryDecision {
  shouldContinue: boolean;
  nextStrategy: FixStrategy;
  rationale: string;
  tightenedPreserve: string[];
  tightenedProhibited: string[];
  additionalInstructions: string[];
  stopReason?: string;
}

export interface RetryPlannerInput {
  imageType: 'MAIN' | 'SECONDARY';
  category: string;
  currentStrategy: FixStrategy;
  attempt: number;
  maxAttempts: number;
  verification: VerificationResult;
  targetRuleIds: string[];
  previousDecisions: RetryDecision[];
  contentType?: ImageCategory;
}

// MAIN images follow this strict escalation path — never reaches full-regeneration
const MAIN_STRATEGY_ORDER: FixStrategy[] = ['bg-cleanup', 'crop-reframe', 'inpaint-edit'];
const SECONDARY_STRATEGY_ORDER: FixStrategy[] = ['overlay-removal', 'inpaint-edit'];

function countIdentityDrifts(previousDecisions: RetryDecision[]): number {
  return previousDecisions.filter(d =>
    d.additionalInstructions.some(i => i.includes('identity')) ||
    d.tightenedPreserve.length > 0
  ).length;
}

function hasRepeatedFailure(previousDecisions: RetryDecision[], keyword: string): boolean {
  const relevant = previousDecisions.filter(d =>
    d.additionalInstructions.some(i => i.toLowerCase().includes(keyword))
  );
  return relevant.length >= 2;
}

function getNextStrategy(current: FixStrategy, order: FixStrategy[]): FixStrategy | null {
  const idx = order.indexOf(current);
  if (idx === -1) return order[order.length - 1]; // default to last safe strategy
  if (idx >= order.length - 1) return null; // already at end
  return order[idx + 1];
}

function detectIdentityDrift(verification: VerificationResult): boolean {
  return verification.productMatch === false;
}

function detectNewViolations(verification: VerificationResult): boolean {
  if (verification.failedChecks?.some(c => c.toLowerCase().includes('no_new_violations') || c.toLowerCase().includes('no new'))) return true;
  if (verification.componentScores?.noNewIssues !== undefined && verification.componentScores.noNewIssues < 70) return true;
  return false;
}

function detectTargetRuleFailure(verification: VerificationResult): boolean {
  return verification.failedChecks?.some(c =>
    c.toLowerCase().includes('target_rules_fixed') || c.toLowerCase().includes('target rule')
  ) ?? false;
}

function detectComplianceFailure(verification: VerificationResult): boolean {
  return verification.failedChecks?.some(c =>
    c.toLowerCase().includes('background') || c.toLowerCase().includes('compliance') || c.toLowerCase().includes('occupancy')
  ) ?? false;
}

// ── Content-type-specific failure detectors ───────────────────

function detectContextPreservationFailure(verification: VerificationResult): boolean {
  if (verification.componentScores?.contextPreservation !== undefined && verification.componentScores.contextPreservation < 70) return true;
  if (verification.failedChecks?.some(c => c.toLowerCase().includes('context') || c.toLowerCase().includes('scene'))) return true;
  return false;
}

function detectLabelFidelityFailure(verification: VerificationResult): boolean {
  if (verification.componentScores?.labelFidelity !== undefined && verification.componentScores.labelFidelity < 70) return true;
  if (verification.failedChecks?.some(c => c.toLowerCase().includes('label') || c.toLowerCase().includes('text drift'))) return true;
  return false;
}

function detectLayoutPreservationFailure(verification: VerificationResult): boolean {
  if (verification.componentScores?.layoutPreservation !== undefined && verification.componentScores.layoutPreservation < 70) return true;
  if (verification.failedChecks?.some(c => c.toLowerCase().includes('layout') || c.toLowerCase().includes('text changed'))) return true;
  return false;
}

// ── Content-type-specific retry adjustments ───────────────────

function applyContentTypeConstraints(
  contentType: ImageCategory | undefined,
  verification: VerificationResult,
  previousDecisions: RetryDecision[],
  tightenedPreserve: string[],
  tightenedProhibited: string[],
  additionalInstructions: string[],
  rationale: string[],
): { shouldStop: boolean; stopReason?: string } {
  if (!contentType) return { shouldStop: false };

  switch (contentType) {
    case 'LIFESTYLE':
    case 'PRODUCT_IN_USE': {
      if (detectContextPreservationFailure(verification)) {
        tightenedPreserve.push(
          'Scene composition, background environment, and lighting',
          'Person/hand positioning and use-context',
        );
        tightenedProhibited.push(
          'DO NOT alter background scene or environment',
          'DO NOT remove or reposition people, hands, or contextual elements',
        );
        additionalInstructions.push(
          'CRITICAL: Previous attempt altered the scene context. Preserve the lifestyle/use-context scene EXACTLY.',
        );
        rationale.push('Context preservation failure — tightening scene constraints.');

        if (hasRepeatedFailure(previousDecisions, 'context') || hasRepeatedFailure(previousDecisions, 'scene')) {
          return { shouldStop: true, stopReason: 'repeated context preservation failure on lifestyle image' };
        }
      }
      break;
    }

    case 'INFOGRAPHIC': {
      if (detectLayoutPreservationFailure(verification)) {
        tightenedPreserve.push(
          'All informational text, callouts, and annotations',
          'Layout structure and text positioning',
        );
        tightenedProhibited.push(
          'DO NOT modify, move, or remove any informational text or callout',
          'DO NOT rearrange layout elements',
        );
        additionalInstructions.push(
          'CRITICAL: Previous attempt altered infographic text/layout. Preserve ALL text and layout EXACTLY.',
        );
        rationale.push('Layout/text preservation failure — tightening infographic constraints.');

        if (hasRepeatedFailure(previousDecisions, 'layout') || hasRepeatedFailure(previousDecisions, 'text')) {
          return { shouldStop: true, stopReason: 'repeated layout/text preservation failure on infographic' };
        }
      }
      break;
    }

    case 'PACKAGING': {
      if (detectLabelFidelityFailure(verification)) {
        tightenedPreserve.push(
          'All printed label text, ingredients, and brand markings',
          'Packaging structure and label positioning',
        );
        tightenedProhibited.push(
          'DO NOT alter, hallucinate, or rewrite any printed text on packaging',
          'DO NOT change label colors, fonts, or placement',
        );
        additionalInstructions.push(
          'CRITICAL: Previous attempt introduced label text drift. Preserve ALL packaging text EXACTLY as printed.',
        );
        rationale.push('Label fidelity failure — tightening packaging constraints.');

        if (hasRepeatedFailure(previousDecisions, 'label') || hasRepeatedFailure(previousDecisions, 'text drift')) {
          return { shouldStop: true, stopReason: 'repeated label fidelity failure on packaging image' };
        }
      }
      break;
    }

    case 'DETAIL': {
      const overEdited = verification.failedChecks?.some(c =>
        c.toLowerCase().includes('over-edit') || c.toLowerCase().includes('detail')
      );
      if (overEdited) {
        tightenedPreserve.push('Product texture, surface details, and close-up features');
        tightenedProhibited.push('DO NOT smooth, blur, or alter product surface details');
        additionalInstructions.push(
          'Previous attempt over-edited product details. Make MINIMAL changes only.',
        );
        rationale.push('Detail over-editing detected — constraining edits.');
      }
      break;
    }

    // PRODUCT_SHOT secondary — normal compliance retries, no special constraints
    default:
      break;
  }

  return { shouldStop: false };
}

export function planRetry(input: RetryPlannerInput): RetryDecision {
  const {
    imageType, currentStrategy, attempt, maxAttempts,
    verification, targetRuleIds, previousDecisions, contentType,
  } = input;

  const isMain = imageType === 'MAIN';
  const identityDrift = detectIdentityDrift(verification);
  const newViolations = detectNewViolations(verification);
  const targetRuleFailed = detectTargetRuleFailure(verification);
  const complianceFailed = detectComplianceFailure(verification);

  const tightenedPreserve: string[] = [];
  const tightenedProhibited: string[] = [];
  const additionalInstructions: string[] = [];
  let nextStrategy = currentStrategy;
  let shouldContinue = attempt < maxAttempts;
  let stopReason: string | undefined;
  const rationale: string[] = [];

  // ── Identity drift ────────────────────────────────────────────
  if (identityDrift) {
    const priorDrifts = countIdentityDrifts(previousDecisions) + 1; // +1 for current
    if (isMain && priorDrifts >= 2) {
      return {
        shouldContinue: false,
        nextStrategy: currentStrategy,
        rationale: 'Repeated identity drift on MAIN image — stopping to prevent further product distortion.',
        tightenedPreserve: [],
        tightenedProhibited: [],
        additionalInstructions: [],
        stopReason: 'repeated identity drift on MAIN image',
      };
    }
    tightenedPreserve.push(
      'Product shape, silhouette, and proportions',
      'Product color palette and surface textures',
      'All text, labels, and branding on the product',
    );
    tightenedProhibited.push(
      'DO NOT alter product shape, color, or text',
      'DO NOT change any printed or embossed content',
    );
    additionalInstructions.push(
      'CRITICAL: The previous attempt changed the product identity. You MUST preserve the exact product appearance.',
    );
    rationale.push('Identity drift detected — tightening preservation constraints.');
  }

  // ── New violations introduced ─────────────────────────────────
  if (newViolations) {
    if (hasRepeatedFailure(previousDecisions, 'new violation') || hasRepeatedFailure(previousDecisions, 'new issue')) {
      if (isMain) {
        return {
          shouldContinue: false,
          nextStrategy: currentStrategy,
          rationale: 'Repeated new violations introduced on MAIN image — stopping.',
          tightenedPreserve: [],
          tightenedProhibited: [],
          additionalInstructions: [],
          stopReason: 'repeated new violations introduced on MAIN image',
        };
      }
    }
    tightenedProhibited.push(
      'MUST NOT introduce any new text, badges, or overlays',
      'MUST NOT add elements not present in the original image',
    );
    additionalInstructions.push(
      'WARNING: The previous attempt introduced new violations. Only modify what is explicitly listed in MUST REMOVE. Do not add anything new.',
    );
    rationale.push('New violations detected — tightening prohibited list.');
  }

  // ── Content-type-specific constraints (SECONDARY only) ────────
  if (!isMain && contentType) {
    const ctResult = applyContentTypeConstraints(
      contentType, verification, previousDecisions,
      tightenedPreserve, tightenedProhibited, additionalInstructions, rationale,
    );
    if (ctResult.shouldStop) {
      return {
        shouldContinue: false,
        nextStrategy: currentStrategy,
        rationale: rationale.join(' ') || ctResult.stopReason || 'Content-type safety stop.',
        tightenedPreserve: [],
        tightenedProhibited: [],
        additionalInstructions: [],
        stopReason: ctResult.stopReason,
      };
    }
  }

  // ── Target rules still failing ────────────────────────────────
  if (targetRuleFailed) {
    if (hasRepeatedFailure(previousDecisions, 'target rule')) {
      if (isMain) {
        // Escalate strategy if possible
        const next = getNextStrategy(currentStrategy, MAIN_STRATEGY_ORDER);
        if (next) {
          nextStrategy = next;
          rationale.push(`Target rules still failing after repeated attempts — escalating from ${currentStrategy} to ${next}.`);
        } else {
          return {
            shouldContinue: false,
            nextStrategy: currentStrategy,
            rationale: 'Target rules keep failing and no safer strategy available for MAIN — stopping.',
            tightenedPreserve: [],
            tightenedProhibited: [],
            additionalInstructions: [],
            stopReason: 'target rules keep failing with no improvement on MAIN image',
          };
        }
      }
    }
    const ruleInstructions = targetRuleIds.map(r => `Focus specifically on fixing rule: ${r}`);
    additionalInstructions.push(...ruleInstructions);
    additionalInstructions.push(
      'The previous attempt did NOT fix the target compliance rules. Address them directly this time.',
    );
    rationale.push('Target rules still failing — adding rule-specific instructions.');
  }

  // ── Compliance failure with identity OK ───────────────────────
  if (complianceFailed && !identityDrift) {
    additionalInstructions.push(
      'Background MUST be pure white RGB(255,255,255) — not off-white, not grey, not cream.',
      'Product MUST occupy at least 85% of the frame area.',
    );
    rationale.push('Compliance failed but identity preserved — adding stricter compliance language.');
  }

  // ── MAIN image escalation guard ───────────────────────────────
  if (isMain && nextStrategy === 'full-regeneration') {
    // Never allow full-regeneration for MAIN via retry
    nextStrategy = 'inpaint-edit';
    rationale.push('Blocked full-regeneration for MAIN image — capped at inpaint-edit.');
  }

  // ── SECONDARY escalation ──────────────────────────────────────
  if (!isMain && !identityDrift && !newViolations && targetRuleFailed) {
    const next = getNextStrategy(currentStrategy, SECONDARY_STRATEGY_ORDER);
    if (next && next !== nextStrategy) {
      nextStrategy = next;
      rationale.push(`Escalating SECONDARY strategy from ${currentStrategy} to ${next}.`);
    }
  }

  // ── Last attempt with no improvement → stop ───────────────────
  if (attempt >= maxAttempts) {
    shouldContinue = false;
    stopReason = 'maximum retry attempts reached';
    rationale.push('Max attempts reached.');
  }

  return {
    shouldContinue,
    nextStrategy,
    rationale: rationale.join(' '),
    tightenedPreserve,
    tightenedProhibited,
    additionalInstructions,
    stopReason,
  };
}
