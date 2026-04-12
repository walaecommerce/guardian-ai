import type { FixAttempt, ImageCategory } from '@/types';

export interface AttemptScore {
  attemptIndex: number;
  rawScore: number;
  identityScore: number;
  complianceScore: number;
  noNewIssuesScore: number;
  qualityScore: number;
  contextPreservationScore: number;
  labelFidelityScore: number;
  layoutPreservationScore: number;
  targetRulesFixed: boolean;
  noNewViolations: boolean;
  identityPreserved: boolean;
  compositeScore: number;
}

export interface BestAttemptSelection {
  selectedAttemptIndex: number;
  selectedReason: string;
  selectionType: 'score-driven' | 'safety-driven';
  comparison: AttemptScore[];
}

type WeightSet = {
  identity: number;
  compliance: number;
  noNew: number;
  quality: number;
  raw: number;
  contextPreservation: number;
  labelFidelity: number;
  layoutPreservation: number;
};

function getWeights(imageType: 'MAIN' | 'SECONDARY', contentType?: ImageCategory): WeightSet {
  if (imageType === 'MAIN') {
    return { identity: 0.35, compliance: 0.30, noNew: 0.15, quality: 0.10, raw: 0.10, contextPreservation: 0, labelFidelity: 0, layoutPreservation: 0 };
  }

  switch (contentType) {
    case 'LIFESTYLE':
    case 'PRODUCT_IN_USE':
      return { identity: 0.20, compliance: 0.10, noNew: 0.15, quality: 0.10, raw: 0.10, contextPreservation: 0.30, labelFidelity: 0, layoutPreservation: 0.05 };
    case 'INFOGRAPHIC':
      return { identity: 0.15, compliance: 0.10, noNew: 0.15, quality: 0.10, raw: 0.10, contextPreservation: 0.05, labelFidelity: 0, layoutPreservation: 0.35 };
    case 'PACKAGING':
      return { identity: 0.25, compliance: 0.10, noNew: 0.10, quality: 0.10, raw: 0.10, contextPreservation: 0, labelFidelity: 0.30, layoutPreservation: 0.05 };
    case 'DETAIL':
      return { identity: 0.20, compliance: 0.10, noNew: 0.10, quality: 0.25, raw: 0.15, contextPreservation: 0.10, labelFidelity: 0, layoutPreservation: 0.10 };
    case 'PRODUCT_SHOT':
      return { identity: 0.30, compliance: 0.25, noNew: 0.15, quality: 0.15, raw: 0.15, contextPreservation: 0, labelFidelity: 0, layoutPreservation: 0 };
    default:
      // Generic secondary fallback
      return { identity: 0.25, compliance: 0.20, noNew: 0.15, quality: 0.15, raw: 0.25, contextPreservation: 0, labelFidelity: 0, layoutPreservation: 0 };
  }
}

function scoreAttempt(attempt: FixAttempt, index: number, imageType: 'MAIN' | 'SECONDARY', contentType?: ImageCategory): AttemptScore {
  const v = attempt.verification;
  const rawScore = v?.score ?? 0;
  const identityScore = v?.componentScores?.identity ?? (v?.productMatch ? 90 : 30);
  const complianceScore = v?.componentScores?.compliance ?? rawScore;
  const noNewIssuesScore = v?.componentScores?.noNewIssues ?? 80;
  const qualityScore = v?.componentScores?.quality ?? rawScore;
  const contextPreservationScore = v?.componentScores?.contextPreservation ?? 80;
  const labelFidelityScore = v?.componentScores?.labelFidelity ?? 80;
  const layoutPreservationScore = v?.componentScores?.layoutPreservation ?? 80;

  const targetRulesFixed = !(v?.failedChecks?.some(c =>
    c.toLowerCase().includes('target_rules_fixed') || c.toLowerCase().includes('target rule')
  ) ?? false);

  const noNewViolations = !(v?.failedChecks?.some(c =>
    c.toLowerCase().includes('no_new_violations') || c.toLowerCase().includes('no new')
  ) ?? false);

  const identityPreserved = v?.productMatch !== false;

  const weights = getWeights(imageType, contentType);

  const compositeScore =
    identityScore * weights.identity +
    complianceScore * weights.compliance +
    noNewIssuesScore * weights.noNew +
    qualityScore * weights.quality +
    rawScore * weights.raw +
    contextPreservationScore * weights.contextPreservation +
    labelFidelityScore * weights.labelFidelity +
    layoutPreservationScore * weights.layoutPreservation;

  return {
    attemptIndex: index,
    rawScore,
    identityScore,
    complianceScore,
    noNewIssuesScore,
    qualityScore,
    contextPreservationScore,
    labelFidelityScore,
    layoutPreservationScore,
    targetRulesFixed,
    noNewViolations,
    identityPreserved,
    compositeScore,
  };
}

function getContentTypeReasonSuffix(contentType?: ImageCategory): string {
  switch (contentType) {
    case 'LIFESTYLE':
    case 'PRODUCT_IN_USE':
      return 'with context preserved';
    case 'INFOGRAPHIC':
      return 'with infographic layout preserved';
    case 'PACKAGING':
      return 'with label fidelity preserved';
    case 'DETAIL':
      return 'with detail preservation';
    default:
      return 'with identity preserved';
  }
}

export function selectBestAttempt(
  attempts: FixAttempt[],
  imageType: 'MAIN' | 'SECONDARY' = 'MAIN',
  contentType?: ImageCategory,
): BestAttemptSelection {
  if (attempts.length === 0) {
    return {
      selectedAttemptIndex: 0,
      selectedReason: 'No attempts available',
      selectionType: 'score-driven',
      comparison: [],
    };
  }

  // Only consider attempts that have a generated image
  const scored = attempts
    .map((a, i) => ({ attempt: a, score: scoreAttempt(a, i, imageType, contentType) }))
    .filter(s => s.attempt.generatedImage);

  if (scored.length === 0) {
    return {
      selectedAttemptIndex: 0,
      selectedReason: 'No generated images available',
      selectionType: 'score-driven',
      comparison: [],
    };
  }

  const comparison = scored.map(s => s.score);

  // Safety-first: for MAIN, any attempt with identity preserved + no new violations
  // is preferred over a higher-score attempt with identity drift
  const isMain = imageType === 'MAIN';

  if (isMain) {
    const safeCandidates = scored.filter(s =>
      s.score.identityPreserved && s.score.noNewViolations
    );
    if (safeCandidates.length > 0) {
      safeCandidates.sort((a, b) => b.score.compositeScore - a.score.compositeScore);
      const best = safeCandidates[0];
      const wasSafetyDriven = scored.some(s =>
        s.score.compositeScore > best.score.compositeScore && !s.score.identityPreserved
      );
      return {
        selectedAttemptIndex: best.score.attemptIndex,
        selectedReason: wasSafetyDriven
          ? `Selected attempt ${best.score.attemptIndex + 1} (score ${Math.round(best.score.compositeScore)}%) — safer than higher-scoring attempts that had identity drift`
          : `Selected attempt ${best.score.attemptIndex + 1} (score ${Math.round(best.score.compositeScore)}%) — best score with identity preserved`,
        selectionType: wasSafetyDriven ? 'safety-driven' : 'score-driven',
        comparison,
      };
    }
  }

  // For secondary content types, apply content-type-specific safety checks
  if (!isMain && contentType) {
    const safeFilter = getSafetyFilter(contentType);
    if (safeFilter) {
      const safeCandidates = scored.filter(safeFilter);
      if (safeCandidates.length > 0) {
        safeCandidates.sort((a, b) => b.score.compositeScore - a.score.compositeScore);
        const best = safeCandidates[0];
        const wasSafetyDriven = scored.some(s =>
          s.score.compositeScore > best.score.compositeScore && !safeFilter(s)
        );
        const suffix = getContentTypeReasonSuffix(contentType);
        return {
          selectedAttemptIndex: best.score.attemptIndex,
          selectedReason: wasSafetyDriven
            ? `Selected attempt ${best.score.attemptIndex + 1} (score ${Math.round(best.score.compositeScore)}%) — safer attempt ${suffix}`
            : `Selected attempt ${best.score.attemptIndex + 1} (score ${Math.round(best.score.compositeScore)}%) — best score ${suffix}`,
          selectionType: wasSafetyDriven ? 'safety-driven' : 'score-driven',
          comparison,
        };
      }
    }
  }

  // Fallback: pick highest composite score
  scored.sort((a, b) => b.score.compositeScore - a.score.compositeScore);
  const best = scored[0];

  return {
    selectedAttemptIndex: best.score.attemptIndex,
    selectedReason: `Selected attempt ${best.score.attemptIndex + 1} (score ${Math.round(best.score.compositeScore)}%) — highest composite score`,
    selectionType: 'score-driven',
    comparison,
  };
}

// Content-type-specific safety filters for secondary images
function getSafetyFilter(contentType: ImageCategory): ((s: { score: AttemptScore }) => boolean) | null {
  switch (contentType) {
    case 'LIFESTYLE':
    case 'PRODUCT_IN_USE':
      return (s) => s.score.identityPreserved && s.score.contextPreservationScore >= 65;
    case 'INFOGRAPHIC':
      return (s) => s.score.layoutPreservationScore >= 65;
    case 'PACKAGING':
      return (s) => s.score.identityPreserved && s.score.labelFidelityScore >= 65;
    default:
      return null;
  }
}
