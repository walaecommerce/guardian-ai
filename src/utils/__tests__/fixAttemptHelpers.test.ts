import { describe, it, expect } from 'vitest';
import { getRetryReasonLabel, getSelectionLabel, getStrategyLabel, getScoreDelta } from '../fixAttemptHelpers';
import type { FixAttempt, BestAttemptSelection } from '@/types';

function makeAttempt(overrides: Partial<FixAttempt> = {}): FixAttempt {
  return {
    attempt: 1,
    generatedImage: 'data:image/png;base64,abc',
    status: 'passed',
    ...overrides,
  };
}

describe('fixAttemptHelpers', () => {
  describe('getRetryReasonLabel', () => {
    it('returns null when no retry decision', () => {
      expect(getRetryReasonLabel(makeAttempt())).toBeNull();
    });

    it('detects identity drift', () => {
      const attempt = makeAttempt({
        retryDecision: {
          shouldContinue: true,
          nextStrategy: 'inpaint-edit',
          rationale: 'Identity drift detected',
          tightenedPreserve: [],
          tightenedProhibited: [],
          additionalInstructions: ['CRITICAL: The previous attempt changed the product identity.'],
        },
      });
      expect(getRetryReasonLabel(attempt)).toContain('Identity drift');
    });

    it('detects new violations', () => {
      const attempt = makeAttempt({
        retryDecision: {
          shouldContinue: true,
          nextStrategy: 'inpaint-edit',
          rationale: 'New violations found',
          tightenedPreserve: [],
          tightenedProhibited: [],
          additionalInstructions: ['WARNING: The previous attempt introduced new violations.'],
        },
      });
      expect(getRetryReasonLabel(attempt)).toContain('New violations');
    });

    it('falls back to rationale when no keyword match', () => {
      const attempt = makeAttempt({
        retryDecision: {
          shouldContinue: true,
          nextStrategy: 'inpaint-edit',
          rationale: 'Score too low',
          tightenedPreserve: [],
          tightenedProhibited: [],
          additionalInstructions: ['Try harder'],
        },
      });
      expect(getRetryReasonLabel(attempt)).toBe('Score too low');
    });
  });

  describe('getSelectionLabel', () => {
    it('returns selection reason when available', () => {
      const sel: BestAttemptSelection = {
        selectedAttemptIndex: 0,
        selectedReason: 'Best composite score',
        selectionType: 'score-driven',
      };
      expect(getSelectionLabel(sel, [])).toBe('Best composite score');
    });

    it('returns first-try message for single passing attempt', () => {
      const attempts = [makeAttempt({ attempt: 1, status: 'passed' })];
      expect(getSelectionLabel(undefined, attempts)).toContain('first try');
    });

    it('returns single attempt message', () => {
      const attempts = [makeAttempt({ attempt: 1, status: 'failed' })];
      expect(getSelectionLabel(undefined, attempts)).toContain('Single attempt');
    });
  });

  describe('getStrategyLabel', () => {
    it('returns human-readable labels', () => {
      expect(getStrategyLabel('bg-cleanup')).toBe('Background Cleanup');
      expect(getStrategyLabel('inpaint-edit')).toBe('Inpaint Edit');
      expect(getStrategyLabel('overlay-removal')).toBe('Overlay Removal');
    });

    it('returns empty string for undefined', () => {
      expect(getStrategyLabel(undefined)).toBe('');
    });

    it('handles unknown strategies gracefully', () => {
      expect(getStrategyLabel('custom-new-thing')).toBe('Custom New Thing');
    });
  });

  describe('getScoreDelta', () => {
    it('returns null for first attempt', () => {
      const attempts = [makeAttempt({ verification: { score: 80, isSatisfactory: true, productMatch: true, critique: '', improvements: [], passedChecks: [], failedChecks: [] } })];
      expect(getScoreDelta(attempts, 0)).toBeNull();
    });

    it('returns positive delta for improvement', () => {
      const attempts = [
        makeAttempt({ verification: { score: 60, isSatisfactory: false, productMatch: true, critique: '', improvements: [], passedChecks: [], failedChecks: [] } }),
        makeAttempt({ attempt: 2, verification: { score: 85, isSatisfactory: true, productMatch: true, critique: '', improvements: [], passedChecks: [], failedChecks: [] } }),
      ];
      expect(getScoreDelta(attempts, 1)).toBe(25);
    });

    it('returns negative delta for regression', () => {
      const attempts = [
        makeAttempt({ verification: { score: 80, isSatisfactory: true, productMatch: true, critique: '', improvements: [], passedChecks: [], failedChecks: [] } }),
        makeAttempt({ attempt: 2, verification: { score: 65, isSatisfactory: false, productMatch: false, critique: '', improvements: [], passedChecks: [], failedChecks: [] } }),
      ];
      expect(getScoreDelta(attempts, 1)).toBe(-15);
    });

    it('returns null when scores are missing', () => {
      const attempts = [makeAttempt(), makeAttempt({ attempt: 2 })];
      expect(getScoreDelta(attempts, 1)).toBeNull();
    });
  });

  describe('ImageAsset fix persistence', () => {
    it('type allows fixAttempts and bestAttemptSelection', () => {
      // This is a compile-time test — if types are wrong, this file won't compile
      const asset: import('@/types').ImageAsset = {
        id: '1',
        file: new File([], 'test.jpg'),
        preview: 'blob:',
        type: 'MAIN',
        name: 'test.jpg',
        fixedImage: 'data:image/png;base64,abc',
        fixAttempts: [makeAttempt()],
        bestAttemptSelection: { selectedAttemptIndex: 0, selectedReason: 'Best', selectionType: 'score-driven' },
        selectedAttemptIndex: 0,
        fixStopReason: 'max retries',
        lastFixStrategy: 'bg-cleanup',
        batchFixStatus: 'fixed',
      };
      expect(asset.fixAttempts).toHaveLength(1);
      expect(asset.bestAttemptSelection?.selectedReason).toBe('Best');
      expect(asset.batchFixStatus).toBe('fixed');
    });
  });
});
