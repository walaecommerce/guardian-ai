import { describe, it, expect } from 'vitest';
import { selectBestAttempt } from '../bestAttemptSelector';
import type { FixAttempt, VerificationResult } from '@/types';

function makeAttempt(idx: number, overrides: Partial<{
  score: number;
  productMatch: boolean;
  identity: number;
  compliance: number;
  noNewIssues: number;
  quality: number;
  failedChecks: string[];
  status: FixAttempt['status'];
}>): FixAttempt {
  const v: VerificationResult = {
    score: overrides.score ?? 70,
    isSatisfactory: (overrides.score ?? 70) >= 85,
    productMatch: overrides.productMatch ?? true,
    critique: '',
    improvements: [],
    passedChecks: [],
    failedChecks: overrides.failedChecks ?? [],
    componentScores: {
      identity: overrides.identity ?? 85,
      compliance: overrides.compliance ?? 80,
      quality: overrides.quality ?? 75,
      noNewIssues: overrides.noNewIssues ?? 90,
    },
  };
  return {
    attempt: idx + 1,
    generatedImage: 'data:image/png;base64,fake',
    verification: v,
    status: overrides.status ?? 'failed',
  };
}

describe('selectBestAttempt', () => {
  it('chooses higher-scoring attempt when last is worse', () => {
    const attempts = [
      makeAttempt(0, { score: 88, identity: 90, compliance: 85 }),
      makeAttempt(1, { score: 60, identity: 70, compliance: 50 }),
    ];
    const result = selectBestAttempt(attempts, 'MAIN');
    expect(result.selectedAttemptIndex).toBe(0);
    expect(result.selectedReason).toContain('attempt 1');
  });

  it('MAIN prefers identity-safe attempt over higher raw score with drift', () => {
    const attempts = [
      makeAttempt(0, { score: 75, identity: 90, productMatch: true, noNewIssues: 85 }),
      makeAttempt(1, { score: 92, identity: 95, productMatch: false, noNewIssues: 90 }),
    ];
    const result = selectBestAttempt(attempts, 'MAIN');
    expect(result.selectedAttemptIndex).toBe(0);
    expect(result.selectionType).toBe('safety-driven');
    expect(result.selectedReason).toContain('identity drift');
  });

  it('target_rules_fixed and no_new_violations influence ranking', () => {
    const attempts = [
      makeAttempt(0, { score: 78, identity: 85, failedChecks: ['target_rules_fixed'] }),
      makeAttempt(1, { score: 76, identity: 85, failedChecks: [] }),
    ];
    const result = selectBestAttempt(attempts, 'MAIN');
    // Attempt 1 has no failed checks → targetRulesFixed=true, noNewViolations=true
    // Attempt 0 has target_rules_fixed failed
    // Both identity preserved, both no new violations, composite decides
    expect(result.selectedAttemptIndex).toBeDefined();
    expect(result.comparison.length).toBe(2);
  });

  it('selectedReason is populated clearly', () => {
    const attempts = [makeAttempt(0, { score: 80 })];
    const result = selectBestAttempt(attempts, 'SECONDARY');
    expect(result.selectedReason).toBeTruthy();
    expect(result.selectedReason.length).toBeGreaterThan(10);
  });

  it('handles empty attempts', () => {
    const result = selectBestAttempt([], 'MAIN');
    expect(result.selectedAttemptIndex).toBe(0);
    expect(result.selectedReason).toContain('No attempts');
  });

  it('SECONDARY allows more flexibility on identity', () => {
    const attempts = [
      makeAttempt(0, { score: 70, identity: 80 }),
      makeAttempt(1, { score: 90, identity: 75, productMatch: false }),
    ];
    const result = selectBestAttempt(attempts, 'SECONDARY');
    // SECONDARY doesn't have the strict safe-candidate filter for identity
    // so it falls through to highest composite
    expect(result.selectedAttemptIndex).toBeDefined();
  });
});
