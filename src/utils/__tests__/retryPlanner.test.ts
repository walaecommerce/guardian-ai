import { describe, it, expect } from 'vitest';
import { planRetry, type RetryDecision, type RetryPlannerInput } from '../retryPlanner';
import type { VerificationResult } from '@/types';

function makeVerification(overrides: Partial<VerificationResult> = {}): VerificationResult {
  return {
    score: 60,
    isSatisfactory: false,
    productMatch: true,
    critique: 'Some issues found',
    improvements: [],
    passedChecks: [],
    failedChecks: [],
    ...overrides,
  };
}

function makeInput(overrides: Partial<RetryPlannerInput> = {}): RetryPlannerInput {
  return {
    imageType: 'MAIN',
    category: 'GENERAL',
    currentStrategy: 'bg-cleanup',
    attempt: 1,
    maxAttempts: 3,
    verification: makeVerification(),
    targetRuleIds: ['MAIN_BG_WHITE'],
    previousDecisions: [],
    ...overrides,
  };
}

describe('retryPlanner', () => {
  describe('identity drift', () => {
    it('tightens preservation on first identity drift for MAIN', () => {
      const result = planRetry(makeInput({
        verification: makeVerification({ productMatch: false }),
      }));
      expect(result.shouldContinue).toBe(true);
      expect(result.tightenedPreserve.length).toBeGreaterThan(0);
      expect(result.tightenedProhibited).toContain('DO NOT alter product shape, color, or text');
      expect(result.additionalInstructions.some(i => i.includes('identity'))).toBe(true);
      expect(result.nextStrategy).not.toBe('full-regeneration');
    });

    it('stops on repeated identity drift for MAIN', () => {
      const priorDecision: RetryDecision = {
        shouldContinue: true,
        nextStrategy: 'bg-cleanup',
        rationale: 'identity drift',
        tightenedPreserve: ['Product shape'],
        tightenedProhibited: [],
        additionalInstructions: ['preserve identity'],
      };
      const result = planRetry(makeInput({
        verification: makeVerification({ productMatch: false }),
        previousDecisions: [priorDecision],
        attempt: 2,
      }));
      expect(result.shouldContinue).toBe(false);
      expect(result.stopReason).toContain('repeated identity drift');
    });

    it('MAIN image never reaches full-regeneration', () => {
      const result = planRetry(makeInput({
        currentStrategy: 'inpaint-edit',
        verification: makeVerification({
          failedChecks: ['target_rules_fixed'],
        }),
      }));
      expect(result.nextStrategy).not.toBe('full-regeneration');
    });
  });

  describe('target rule failure', () => {
    it('adds rule-specific instructions on target rule failure', () => {
      const result = planRetry(makeInput({
        verification: makeVerification({
          failedChecks: ['target_rules_fixed'],
        }),
        targetRuleIds: ['MAIN_BG_WHITE', 'MAIN_OCCUPANCY'],
      }));
      expect(result.shouldContinue).toBe(true);
      expect(result.additionalInstructions.some(i => i.includes('MAIN_BG_WHITE'))).toBe(true);
      expect(result.additionalInstructions.some(i => i.includes('MAIN_OCCUPANCY'))).toBe(true);
    });

    it('stops MAIN on repeated target rule failure with no strategy left', () => {
      const priorDecisions: RetryDecision[] = [
        {
          shouldContinue: true, nextStrategy: 'bg-cleanup', rationale: '',
          tightenedPreserve: [], tightenedProhibited: [],
          additionalInstructions: ['target rule still failing', 'target rule focus'],
        },
        {
          shouldContinue: true, nextStrategy: 'crop-reframe', rationale: '',
          tightenedPreserve: [], tightenedProhibited: [],
          additionalInstructions: ['target rule still failing', 'target rule focus'],
        },
      ];
      const result = planRetry(makeInput({
        currentStrategy: 'inpaint-edit',
        attempt: 3,
        maxAttempts: 3,
        verification: makeVerification({ failedChecks: ['target_rules_fixed'] }),
        previousDecisions: priorDecisions,
      }));
      expect(result.shouldContinue).toBe(false);
      expect(result.stopReason).toContain('target rules keep failing');
    });
  });

  describe('new violations', () => {
    it('tightens prohibited on new violations', () => {
      const result = planRetry(makeInput({
        verification: makeVerification({
          failedChecks: ['no_new_violations'],
        }),
      }));
      expect(result.shouldContinue).toBe(true);
      expect(result.tightenedProhibited.some(p => p.includes('MUST NOT introduce'))).toBe(true);
    });

    it('tightens on low noNewIssues score', () => {
      const result = planRetry(makeInput({
        verification: makeVerification({
          componentScores: { identity: 90, compliance: 80, quality: 85, noNewIssues: 50 },
        }),
      }));
      expect(result.tightenedProhibited.some(p => p.includes('MUST NOT introduce'))).toBe(true);
    });

    it('stops MAIN on repeated new violations', () => {
      const priorDecisions: RetryDecision[] = [
        {
          shouldContinue: true, nextStrategy: 'bg-cleanup', rationale: '',
          tightenedPreserve: [], tightenedProhibited: [],
          additionalInstructions: ['new violation warning', 'new issue detected'],
        },
        {
          shouldContinue: true, nextStrategy: 'bg-cleanup', rationale: '',
          tightenedPreserve: [], tightenedProhibited: [],
          additionalInstructions: ['new violation introduced', 'new issue found'],
        },
      ];
      const result = planRetry(makeInput({
        verification: makeVerification({ failedChecks: ['no_new_violations'] }),
        previousDecisions: priorDecisions,
        attempt: 3,
      }));
      expect(result.shouldContinue).toBe(false);
      expect(result.stopReason).toContain('repeated new violations');
    });
  });

  describe('compliance failure with identity OK', () => {
    it('adds stricter compliance language', () => {
      const result = planRetry(makeInput({
        verification: makeVerification({
          productMatch: true,
          failedChecks: ['background compliance'],
        }),
      }));
      expect(result.additionalInstructions.some(i => i.includes('RGB(255,255,255)'))).toBe(true);
    });
  });

  describe('SECONDARY image', () => {
    it('may escalate from overlay-removal to inpaint-edit', () => {
      const result = planRetry(makeInput({
        imageType: 'SECONDARY',
        currentStrategy: 'overlay-removal',
        verification: makeVerification({
          failedChecks: ['target_rules_fixed'],
        }),
      }));
      expect(result.shouldContinue).toBe(true);
      expect(result.nextStrategy).toBe('inpaint-edit');
    });

    it('does not stop on identity drift as aggressively', () => {
      const result = planRetry(makeInput({
        imageType: 'SECONDARY',
        currentStrategy: 'overlay-removal',
        verification: makeVerification({ productMatch: false }),
        previousDecisions: [{
          shouldContinue: true, nextStrategy: 'overlay-removal', rationale: '',
          tightenedPreserve: ['something'], tightenedProhibited: [],
          additionalInstructions: ['identity concern'],
        }],
        attempt: 2,
      }));
      // SECONDARY should still continue even with 2 identity issues
      expect(result.shouldContinue).toBe(true);
    });
  });

  describe('content-type-aware retries', () => {
    it('LIFESTYLE: tightens scene constraints on context preservation failure', () => {
      const result = planRetry(makeInput({
        imageType: 'SECONDARY',
        currentStrategy: 'overlay-removal',
        contentType: 'LIFESTYLE',
        verification: makeVerification({
          componentScores: { identity: 85, compliance: 80, quality: 75, noNewIssues: 85, contextPreservation: 50 },
        }),
      }));
      expect(result.shouldContinue).toBe(true);
      expect(result.tightenedPreserve.some(p => p.toLowerCase().includes('scene'))).toBe(true);
      expect(result.additionalInstructions.some(i => i.includes('scene context'))).toBe(true);
    });

    it('LIFESTYLE: stops on repeated context preservation failure', () => {
      const result = planRetry(makeInput({
        imageType: 'SECONDARY',
        currentStrategy: 'overlay-removal',
        contentType: 'LIFESTYLE',
        verification: makeVerification({
          componentScores: { identity: 85, compliance: 80, quality: 75, noNewIssues: 85, contextPreservation: 40 },
        }),
        previousDecisions: [
          { shouldContinue: true, nextStrategy: 'overlay-removal', rationale: '', tightenedPreserve: [], tightenedProhibited: [], additionalInstructions: ['scene context preservation'] },
          { shouldContinue: true, nextStrategy: 'overlay-removal', rationale: '', tightenedPreserve: [], tightenedProhibited: [], additionalInstructions: ['context preservation failure'] },
        ],
        attempt: 3,
      }));
      expect(result.shouldContinue).toBe(false);
      expect(result.stopReason).toContain('context preservation');
    });

    it('INFOGRAPHIC: tightens layout constraints on layout failure', () => {
      const result = planRetry(makeInput({
        imageType: 'SECONDARY',
        currentStrategy: 'overlay-removal',
        contentType: 'INFOGRAPHIC',
        verification: makeVerification({
          componentScores: { identity: 85, compliance: 80, quality: 75, noNewIssues: 85, layoutPreservation: 45 },
        }),
      }));
      expect(result.shouldContinue).toBe(true);
      expect(result.tightenedPreserve.some(p => p.toLowerCase().includes('text'))).toBe(true);
      expect(result.additionalInstructions.some(i => i.includes('infographic'))).toBe(true);
    });

    it('INFOGRAPHIC: stops on repeated layout failure', () => {
      const result = planRetry(makeInput({
        imageType: 'SECONDARY',
        currentStrategy: 'overlay-removal',
        contentType: 'INFOGRAPHIC',
        verification: makeVerification({
          componentScores: { identity: 85, compliance: 80, quality: 75, noNewIssues: 85, layoutPreservation: 40 },
        }),
        previousDecisions: [
          { shouldContinue: true, nextStrategy: 'overlay-removal', rationale: '', tightenedPreserve: [], tightenedProhibited: [], additionalInstructions: ['layout changed again'] },
          { shouldContinue: true, nextStrategy: 'overlay-removal', rationale: '', tightenedPreserve: [], tightenedProhibited: [], additionalInstructions: ['layout still broken'] },
        ],
        attempt: 2,
        maxAttempts: 3,
      }));
      expect(result.shouldContinue).toBe(false);
      expect(result.stopReason).toContain('layout');
    });

    it('PACKAGING: tightens label constraints on label fidelity failure', () => {
      const result = planRetry(makeInput({
        imageType: 'SECONDARY',
        currentStrategy: 'overlay-removal',
        contentType: 'PACKAGING',
        verification: makeVerification({
          componentScores: { identity: 85, compliance: 80, quality: 75, noNewIssues: 85, labelFidelity: 50 },
        }),
      }));
      expect(result.shouldContinue).toBe(true);
      expect(result.tightenedPreserve.some(p => p.toLowerCase().includes('label'))).toBe(true);
      expect(result.additionalInstructions.some(i => i.includes('label text drift'))).toBe(true);
    });

    it('PACKAGING: stops on repeated label failure', () => {
      const result = planRetry(makeInput({
        imageType: 'SECONDARY',
        currentStrategy: 'overlay-removal',
        contentType: 'PACKAGING',
        verification: makeVerification({
          componentScores: { identity: 85, compliance: 80, quality: 75, noNewIssues: 85, labelFidelity: 40 },
        }),
        previousDecisions: [
          { shouldContinue: true, nextStrategy: 'overlay-removal', rationale: '', tightenedPreserve: [], tightenedProhibited: [], additionalInstructions: ['label text drift detected'] },
          { shouldContinue: true, nextStrategy: 'overlay-removal', rationale: '', tightenedPreserve: [], tightenedProhibited: [], additionalInstructions: ['label drift persists'] },
        ],
        attempt: 2,
        maxAttempts: 3,
      }));
      expect(result.shouldContinue).toBe(false);
      expect(result.stopReason).toContain('label fidelity');
    });

    it('PRODUCT_SHOT secondary: normal compliance retries, no extra constraints', () => {
      const result = planRetry(makeInput({
        imageType: 'SECONDARY',
        currentStrategy: 'bg-cleanup',
        contentType: 'PRODUCT_SHOT',
        verification: makeVerification({
          failedChecks: ['background compliance'],
        }),
      }));
      expect(result.shouldContinue).toBe(true);
      expect(result.additionalInstructions.some(i => i.includes('RGB(255,255,255)'))).toBe(true);
    });

    it('MAIN: contentType does not affect MAIN behavior', () => {
      const result = planRetry(makeInput({
        imageType: 'MAIN',
        contentType: 'LIFESTYLE',
        verification: makeVerification({
          failedChecks: ['background compliance'],
        }),
      }));
      // Should still add compliance language, not scene preservation
      expect(result.additionalInstructions.some(i => i.includes('RGB(255,255,255)'))).toBe(true);
      expect(result.tightenedPreserve.some(p => p.toLowerCase().includes('scene'))).toBe(false);
    });
  });

  describe('max attempts', () => {
    it('stops when attempt >= maxAttempts', () => {
      const result = planRetry(makeInput({
        attempt: 3,
        maxAttempts: 3,
      }));
      expect(result.shouldContinue).toBe(false);
      expect(result.stopReason).toContain('maximum retry attempts');
    });
  });
});
