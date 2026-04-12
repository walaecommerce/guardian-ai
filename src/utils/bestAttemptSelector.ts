import type { FixAttempt } from '@/types';

export interface AttemptScore {
  attemptIndex: number;
  rawScore: number;
  identityScore: number;
  complianceScore: number;
  noNewIssuesScore: number;
  qualityScore: number;
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

function scoreAttempt(attempt: FixAttempt, index: number, imageType: 'MAIN' | 'SECONDARY'): AttemptScore {
  const v = attempt.verification;
  const rawScore = v?.score ?? 0;
  const identityScore = v?.componentScores?.identity ?? (v?.productMatch ? 90 : 30);
  const complianceScore = v?.componentScores?.compliance ?? rawScore;
  const noNewIssuesScore = v?.componentScores?.noNewIssues ?? 80;
  const qualityScore = v?.componentScores?.quality ?? rawScore;

  const targetRulesFixed = !(v?.failedChecks?.some(c =>
    c.toLowerCase().includes('target_rules_fixed') || c.toLowerCase().includes('target rule')
  ) ?? false);

  const noNewViolations = !(v?.failedChecks?.some(c =>
    c.toLowerCase().includes('no_new_violations') || c.toLowerCase().includes('no new')
  ) ?? false);

  const identityPreserved = v?.productMatch !== false;

  // Weighted composite — MAIN heavily weights identity + compliance
  const weights = imageType === 'MAIN'
    ? { identity: 0.35, compliance: 0.30, noNew: 0.15, quality: 0.10, raw: 0.10 }
    : { identity: 0.25, compliance: 0.20, noNew: 0.15, quality: 0.15, raw: 0.25 };

  const compositeScore =
    identityScore * weights.identity +
    complianceScore * weights.compliance +
    noNewIssuesScore * weights.noNew +
    qualityScore * weights.quality +
    rawScore * weights.raw;

  return {
    attemptIndex: index,
    rawScore,
    identityScore,
    complianceScore,
    noNewIssuesScore,
    qualityScore,
    targetRulesFixed,
    noNewViolations,
    identityPreserved,
    compositeScore,
  };
}

export function selectBestAttempt(
  attempts: FixAttempt[],
  imageType: 'MAIN' | 'SECONDARY' = 'MAIN',
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
    .map((a, i) => ({ attempt: a, score: scoreAttempt(a, i, imageType) }))
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

  // Safety-first: for MAIN, any attempt with identity preserved + target rules fixed
  // is preferred over a higher-score attempt with identity drift
  const isMain = imageType === 'MAIN';

  if (isMain) {
    const safeCandidates = scored.filter(s =>
      s.score.identityPreserved && s.score.noNewViolations
    );
    if (safeCandidates.length > 0) {
      // Among safe candidates, pick highest composite
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
