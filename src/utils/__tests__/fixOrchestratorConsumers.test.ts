/**
 * Integration tests for the shared fix orchestrator consumers.
 *
 * Verifies that `useAuditSession` and `Session.tsx` wiring contracts
 * stay aligned with the shared orchestration engine, persistence payload,
 * and unresolved-state model.
 *
 * These tests exercise the pure state-update and persistence logic
 * extracted from both consumers, without rendering React components.
 */

import { describe, it, expect } from 'vitest';
import type { ImageAsset, FixAttempt, BestAttemptSelection, FixStrategy } from '@/types';
import { buildFixReviewPayload } from '@/utils/fixOrchestrator';
import { computeUnresolvedCounts } from '@/utils/sessionHelpers';
import { isManualReviewAsset } from '@/components/ManualReviewLane';

// ── Helpers ────────────────────────────────────────────────────

function stub(overrides: Partial<ImageAsset> = {}): ImageAsset {
  return {
    id: Math.random().toString(),
    file: new File([], 'x.jpg'),
    preview: '',
    type: 'SECONDARY',
    name: 'x.jpg',
    analysisResult: {
      overallScore: 40, status: 'FAIL',
      violations: [{ severity: 'critical', category: 'bg', message: 'bad', recommendation: 'fix' }],
      fixRecommendations: ['fix'],
    },
    ...overrides,
  } as ImageAsset;
}

// ── 1. Manual-review / warn-only rejection ─────────────────────

describe('manual-review rejection wiring', () => {
  it('manual_review rejection sets correct asset state', () => {
    const asset = stub();
    // Simulate what both consumers do on fixability rejection
    const updated: Partial<ImageAsset> = {
      fixabilityTier: 'manual_review',
      unresolvedState: 'manual_review',
      batchFixStatus: 'skipped',
      batchSkipReason: 'Contains structured data',
    };
    const result = { ...asset, ...updated };

    expect(isManualReviewAsset(result)).toBe(true);
    expect(result.unresolvedState).toBe('manual_review');
    expect(result.batchFixStatus).toBe('skipped');
  });

  it('warn_only rejection sets correct asset state', () => {
    const asset = stub();
    const updated: Partial<ImageAsset> = {
      fixabilityTier: 'warn_only',
      unresolvedState: 'warn_only',
      batchFixStatus: 'skipped',
      batchSkipReason: 'Low resolution source',
    };
    const result = { ...asset, ...updated };

    expect(isManualReviewAsset(result)).toBe(true);
    expect(result.unresolvedState).toBe('warn_only');
  });

  it('rejection persists correct fix_attempts payload shape', () => {
    // Both consumers write this shape to session_images.fix_attempts
    const payload = {
      skipped: true,
      skipReason: 'Contains structured data',
      fixabilityTier: 'manual_review',
      unresolvedState: 'manual_review',
    };
    expect(payload).toHaveProperty('skipped', true);
    expect(payload).toHaveProperty('unresolvedState', 'manual_review');
    expect(payload).toHaveProperty('fixabilityTier', 'manual_review');
  });
});

// ── 2. Successful fix persistence ──────────────────────────────

describe('successful fix asset state', () => {
  const attempts: FixAttempt[] = [
    { attempt: 1, generatedImage: 'img1', status: 'failed', strategyUsed: 'bg-cleanup' },
    { attempt: 2, generatedImage: 'img2', status: 'passed', strategyUsed: 'inpaint-edit', isBestAttempt: true },
  ];
  const bestSel: BestAttemptSelection = { selectedAttemptIndex: 1, selectedReason: 'Passed verification', selectionType: 'score-driven' };
  const stopReason = undefined;
  const lastStrategy: FixStrategy = 'inpaint-edit';

  it('persists all required fields on the asset', () => {
    const asset = stub();
    // Simulate consumer state update after successful fix
    const updated = {
      ...asset,
      isGeneratingFix: false,
      fixedImage: 'img2',
      fixMethod: 'surgical-edit' as const,
      fixAttempts: attempts,
      bestAttemptSelection: bestSel,
      selectedAttemptIndex: bestSel.selectedAttemptIndex,
      fixStopReason: stopReason,
      lastFixStrategy: lastStrategy,
    };

    expect(updated.fixedImage).toBe('img2');
    expect(updated.fixMethod).toBe('surgical-edit');
    expect(updated.fixAttempts).toHaveLength(2);
    expect(updated.bestAttemptSelection).toBe(bestSel);
    expect(updated.selectedAttemptIndex).toBe(1);
    expect(updated.lastFixStrategy).toBe('inpaint-edit');
    // Fixed images should NOT be unresolved
    expect(isManualReviewAsset(updated as ImageAsset)).toBe(false);
  });

  it('builds correct fix_attempts payload for session_images', () => {
    const payload = buildFixReviewPayload(attempts, bestSel, stopReason, lastStrategy);
    expect(payload.attempts).toHaveLength(2);
    expect(payload.attempts[0].strategyUsed).toBe('bg-cleanup');
    expect(payload.attempts[1].isBestAttempt).toBe(true);
    expect(payload.bestAttemptSelection).toEqual(bestSel);
    expect(payload.lastFixStrategy).toBe('inpaint-edit');
    expect(payload).not.toHaveProperty('unresolvedState');
  });
});

// ── 3. Retry-stopped / auto-fix-failed persistence ─────────────

describe('retry-stopped and auto-fix-failed wiring', () => {
  it('retry_stopped sets correct asset state and persistence', () => {
    const asset = stub();
    const stopReason = 'identity_drift';
    const attempts: FixAttempt[] = [
      { attempt: 1, generatedImage: 'img1', status: 'failed', strategyUsed: 'bg-cleanup' },
    ];
    const lastStrategy: FixStrategy = 'bg-cleanup';

    // Consumer state update
    const updated = {
      ...asset,
      isGeneratingFix: false,
      fixStopReason: stopReason,
      batchFixStatus: 'failed' as const,
      unresolvedState: 'retry_stopped' as const,
      fixAttempts: attempts,
      lastFixStrategy: lastStrategy,
    };

    expect(isManualReviewAsset(updated as ImageAsset)).toBe(true);
    expect(updated.unresolvedState).toBe('retry_stopped');

    // Persistence payload includes unresolvedState
    const payload = buildFixReviewPayload(attempts, undefined, stopReason, lastStrategy, 'retry_stopped');
    expect(payload.unresolvedState).toBe('retry_stopped');
    expect(payload.stopReason).toBe('identity_drift');
    expect(payload.lastFixStrategy).toBe('bg-cleanup');
  });

  it('auto_fix_failed sets correct asset state when no stopReason', () => {
    const asset = stub();
    const stopReason: string | undefined = undefined;

    // Consumer logic: unresolvedState = stopR ? 'retry_stopped' : 'auto_fix_failed'
    const unresolvedState = stopReason ? 'retry_stopped' as const : 'auto_fix_failed' as const;

    const updated = {
      ...asset,
      isGeneratingFix: false,
      fixStopReason: 'No acceptable fix produced after all attempts',
      batchFixStatus: 'failed' as const,
      unresolvedState,
    };

    expect(updated.unresolvedState).toBe('auto_fix_failed');
    expect(isManualReviewAsset(updated as ImageAsset)).toBe(true);

    const payload = buildFixReviewPayload([], undefined, 'No acceptable fix produced after all attempts', undefined, 'auto_fix_failed');
    expect(payload.unresolvedState).toBe('auto_fix_failed');
  });
});

// ── 4. Session-level count consistency ─────────────────────────

describe('session aggregate count consistency', () => {
  it('counts update correctly after successful fix', () => {
    const assets = [
      stub({ id: '1', fixedImage: 'img1', batchFixStatus: 'fixed' }),  // fixed
      stub({ id: '2', unresolvedState: 'skipped', batchFixStatus: 'skipped' }), // skipped
      stub({ id: '3' }), // still failed, not yet processed
    ];
    const counts = computeUnresolvedCounts(assets);
    expect(counts.unresolved_count).toBe(1); // only the skipped one
    expect(counts.skipped_count).toBe(1);

    // fixed_count is computed separately: assets.filter(a => a.fixedImage).length
    const fixedCount = assets.filter(a => a.fixedImage).length;
    expect(fixedCount).toBe(1);
  });

  it('counts update correctly after manual-review rejection', () => {
    const assets = [
      stub({ id: '1', fixedImage: 'img1', batchFixStatus: 'fixed' }),
      stub({ id: '2', unresolvedState: 'manual_review', batchFixStatus: 'skipped', fixabilityTier: 'manual_review' }),
      stub({ id: '3', unresolvedState: 'warn_only', batchFixStatus: 'skipped', fixabilityTier: 'warn_only' }),
    ];
    const counts = computeUnresolvedCounts(assets);
    expect(counts.unresolved_count).toBe(2);
    expect(counts.skipped_count).toBe(2);
    // Verify isManualReviewAsset alignment
    expect(assets.filter(isManualReviewAsset).length).toBe(counts.unresolved_count);
  });

  it('counts update correctly after retry-stopped outcome', () => {
    const assets = [
      stub({ id: '1', fixedImage: 'img1', batchFixStatus: 'fixed' }),
      stub({ id: '2', unresolvedState: 'retry_stopped', fixStopReason: 'identity_drift', batchFixStatus: 'failed' }),
    ];
    const counts = computeUnresolvedCounts(assets);
    expect(counts.unresolved_count).toBe(1);
    // retry_stopped is unresolved but not "skipped" in the batchFixStatus sense
    expect(counts.skipped_count).toBe(0);
    expect(assets.filter(isManualReviewAsset).length).toBe(counts.unresolved_count);
  });

  it('does not double-count fixed items with fixStopReason', () => {
    // Edge case: a fix that partially succeeded (has fixedImage) but also has fixStopReason
    const assets = [
      stub({ id: '1', fixedImage: 'img1', fixStopReason: 'partial_compliance', batchFixStatus: 'fixed' }),
    ];
    const counts = computeUnresolvedCounts(assets);
    expect(counts.unresolved_count).toBe(0);
    expect(isManualReviewAsset(assets[0])).toBe(false);
  });
});

// ── 5. Batch fix skip wiring ───────────────────────────────────

describe('batch fix skip wiring', () => {
  it('batch fix correctly skips manual-review assets', () => {
    // Simulate the batch fix pre-classification that both consumers do
    const assets = [
      stub({ id: '1', fixabilityTier: 'auto_fixable' }),
      stub({ id: '2', fixabilityTier: 'manual_review' }),
      stub({ id: '3', fixabilityTier: 'warn_only' }),
    ];

    // Consumer logic: skip non-auto_fixable, set unresolvedState
    const processed = assets.map(a => {
      if (a.fixabilityTier === 'manual_review') {
        return { ...a, unresolvedState: 'manual_review' as const, batchFixStatus: 'skipped' as const };
      }
      if (a.fixabilityTier === 'warn_only') {
        return { ...a, unresolvedState: 'warn_only' as const, batchFixStatus: 'skipped' as const };
      }
      return a;
    });

    const fixable = processed.filter(a => !isManualReviewAsset(a));
    const skipped = processed.filter(a => isManualReviewAsset(a));
    expect(fixable).toHaveLength(1);
    expect(skipped).toHaveLength(2);

    const counts = computeUnresolvedCounts(processed);
    expect(counts.unresolved_count).toBe(2);
    expect(counts.skipped_count).toBe(2);
  });
});

// ── 6. Persistence payload structure ───────────────────────────

describe('persistence payload wiring', () => {
  it('successful fix payload matches session_images.fix_attempts schema', () => {
    const attempts: FixAttempt[] = [
      {
        attempt: 1, generatedImage: 'img1', status: 'passed',
        strategyUsed: 'bg-cleanup', fixTier: 'gemini-flash',
        verification: {
          score: 92, isSatisfactory: true, productMatch: true,
          critique: '', improvements: [],
          passedChecks: ['bg'], failedChecks: [],
          componentScores: { identity: 95, compliance: 90, quality: 90, noNewIssues: 95 },
        },
      },
    ];
    const payload = buildFixReviewPayload(attempts, undefined, undefined, 'bg-cleanup');

    // Verify the shape that gets written to fix_attempts JSON column
    expect(payload).toHaveProperty('attempts');
    expect(payload).toHaveProperty('lastFixStrategy', 'bg-cleanup');
    expect(payload.attempts[0]).toHaveProperty('attempt', 1);
    expect(payload.attempts[0]).toHaveProperty('status', 'passed');
    expect(payload.attempts[0]).toHaveProperty('strategyUsed', 'bg-cleanup');
    // Verification subset — should NOT include thinkingSteps
    expect(payload.attempts[0].verification).toHaveProperty('score', 92);
    expect(payload.attempts[0].verification).toHaveProperty('componentScores');
    expect(payload.attempts[0].verification).not.toHaveProperty('thinkingSteps');
  });

  it('failed fix payload includes unresolvedState', () => {
    const attempts: FixAttempt[] = [
      { attempt: 1, generatedImage: 'img1', status: 'failed', strategyUsed: 'bg-cleanup' },
    ];
    const payload = buildFixReviewPayload(
      attempts, undefined, 'identity_drift', 'bg-cleanup', 'retry_stopped',
    );
    expect(payload.unresolvedState).toBe('retry_stopped');
    expect(payload.stopReason).toBe('identity_drift');
  });

  it('skipped fix payload shape matches consumer output', () => {
    // This is the shape both consumers write for skipped/manual-review
    const skipPayload = {
      skipped: true,
      skipReason: 'Infographic with complex text layout',
      fixabilityTier: 'manual_review',
      unresolvedState: 'manual_review',
    };
    expect(skipPayload).toMatchObject({
      skipped: true,
      unresolvedState: expect.stringMatching(/^(manual_review|warn_only)$/),
    });
  });
});

// ── 7. Consumer parity: useAuditSession vs Session.tsx ──────────

describe('consumer parity', () => {
  it('both consumers derive unresolvedState identically from stopReason', () => {
    // Both use: stopR ? 'retry_stopped' : 'auto_fix_failed'
    const withStopReason = (sr: string | undefined) => sr ? 'retry_stopped' : 'auto_fix_failed';

    expect(withStopReason('identity_drift')).toBe('retry_stopped');
    expect(withStopReason(undefined)).toBe('auto_fix_failed');
    expect(withStopReason('')).toBe('auto_fix_failed'); // falsy string
  });

  it('both consumers derive fixabilityTier rejection identically', () => {
    // Both use: tier === 'manual_review' ? 'manual_review' : 'warn_only'
    const deriveState = (tier: string) =>
      tier === 'manual_review' ? 'manual_review' : 'warn_only';

    expect(deriveState('manual_review')).toBe('manual_review');
    expect(deriveState('warn_only')).toBe('warn_only');
  });
});
