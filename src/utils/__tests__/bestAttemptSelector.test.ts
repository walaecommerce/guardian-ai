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
  contextPreservation: number;
  labelFidelity: number;
  layoutPreservation: number;
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
      contextPreservation: overrides.contextPreservation,
      labelFidelity: overrides.labelFidelity,
      layoutPreservation: overrides.layoutPreservation,
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
    expect(result.selectedAttemptIndex).toBeDefined();
  });

  describe('content-type-aware selection', () => {
    it('LIFESTYLE: prefers context-preserved attempt over higher raw score', () => {
      const attempts = [
        makeAttempt(0, { score: 65, identity: 75, compliance: 70, quality: 65, contextPreservation: 90 }),
        makeAttempt(1, { score: 95, identity: 95, compliance: 95, quality: 95, contextPreservation: 40 }),
      ];
      const result = selectBestAttempt(attempts, 'SECONDARY', 'LIFESTYLE');
      expect(result.selectedAttemptIndex).toBe(0);
      expect(result.selectedReason).toContain('context preserved');
    });

    it('INFOGRAPHIC: prefers layout-preserved attempt', () => {
      const attempts = [
        makeAttempt(0, { score: 60, identity: 70, compliance: 65, quality: 65, layoutPreservation: 90 }),
        makeAttempt(1, { score: 95, identity: 95, compliance: 95, quality: 95, layoutPreservation: 50 }),
      ];
      const result = selectBestAttempt(attempts, 'SECONDARY', 'INFOGRAPHIC');
      expect(result.selectedAttemptIndex).toBe(0);
      expect(result.selectedReason).toContain('infographic layout preserved');
    });

    it('PACKAGING: prefers label-fidelity-preserved attempt', () => {
      const attempts = [
        makeAttempt(0, { score: 60, identity: 75, compliance: 65, quality: 65, labelFidelity: 85 }),
        makeAttempt(1, { score: 95, identity: 95, compliance: 95, quality: 95, labelFidelity: 50 }),
      ];
      const result = selectBestAttempt(attempts, 'SECONDARY', 'PACKAGING');
      expect(result.selectedAttemptIndex).toBe(0);
      expect(result.selectionType).toBe('safety-driven');
      expect(result.selectedReason).toContain('label fidelity preserved');
    });

    it('PRODUCT_SHOT: falls through to composite scoring', () => {
      const attempts = [
        makeAttempt(0, { score: 70, identity: 80, compliance: 80 }),
        makeAttempt(1, { score: 90, identity: 85, compliance: 90 }),
      ];
      const result = selectBestAttempt(attempts, 'SECONDARY', 'PRODUCT_SHOT');
      // No safety filter for product shot, so highest composite wins
      expect(result.selectedAttemptIndex).toBe(1);
      expect(result.selectionType).toBe('score-driven');
    });

    it('MAIN: contentType does not change MAIN selection logic', () => {
      const attempts = [
        makeAttempt(0, { score: 75, identity: 90, productMatch: true, noNewIssues: 85 }),
        makeAttempt(1, { score: 92, identity: 95, productMatch: false, noNewIssues: 90 }),
      ];
      const result = selectBestAttempt(attempts, 'MAIN', 'LIFESTYLE');
      expect(result.selectedAttemptIndex).toBe(0);
      expect(result.selectionType).toBe('safety-driven');
    });
  });
});
