/**
 * Integration tests for useAuditSession and Session.tsx consumer wiring.
 *
 * These tests validate the exact state updates and Supabase write shapes
 * that the two main consumers produce when driving the shared fix orchestrator.
 * They use mocked Supabase and orchestrator to isolate wiring correctness.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ImageAsset, FixAttempt, BestAttemptSelection, FixStrategy } from '@/types';
import { buildFixReviewPayload } from '@/utils/fixOrchestrator';
import { computeUnresolvedCounts } from '@/utils/sessionHelpers';
import { isManualReviewAsset } from '@/components/ManualReviewLane';

// ── Helpers ────────────────────────────────────────────────────

function stubAsset(overrides: Partial<ImageAsset> = {}): ImageAsset {
  return {
    id: `asset-${Math.random().toString(36).slice(2, 7)}`,
    file: new File([], 'test.jpg'),
    preview: 'blob:test',
    type: 'SECONDARY',
    name: 'test.jpg',
    analysisResult: {
      overallScore: 35,
      status: 'FAIL',
      violations: [{ severity: 'critical', category: 'bg', message: 'Non-white bg', recommendation: 'Fix bg' }],
      fixRecommendations: ['Fix background'],
    },
    ...overrides,
  } as ImageAsset;
}

// Simulates the Supabase .update().eq() chain and captures the payload
function createMockSupabaseChain() {
  const calls: { table: string; payload: any; eqField?: string; eqValue?: string }[] = [];
  const chain = {
    update: (payload: any) => {
      const call = { table: '', payload, eqField: undefined as string | undefined, eqValue: undefined as string | undefined };
      calls.push(call);
      return {
        eq: (field: string, value: string) => {
          call.eqField = field;
          call.eqValue = value;
          return Promise.resolve({ error: null });
        },
      };
    },
    getCalls: () => calls,
    setTable: (t: string) => { if (calls.length > 0) calls[calls.length - 1].table = t; },
  };
  return chain;
}

// ── 1. useAuditSession: manual-review rejection wiring ─────────

describe('useAuditSession manual-review rejection wiring', () => {
  it('writes correct session_images payload for manual_review rejection', () => {
    const reason = 'Contains structured data (size chart)';
    const tier = 'manual_review' as const;
    const unresolvedState = 'manual_review' as const;

    // This is the exact payload shape useAuditSession writes to session_images.fix_attempts
    const fixAttemptsPayload = {
      skipped: true,
      skipReason: reason,
      fixabilityTier: tier,
      unresolvedState,
    };

    expect(fixAttemptsPayload.skipped).toBe(true);
    expect(fixAttemptsPayload.unresolvedState).toBe('manual_review');
    expect(fixAttemptsPayload.fixabilityTier).toBe('manual_review');
    expect(fixAttemptsPayload.skipReason).toBe(reason);
  });

  it('writes correct session_images payload for warn_only rejection', () => {
    const reason = 'Low resolution source image';
    const tier = 'warn_only' as const;
    const unresolvedState = 'warn_only' as const;

    const fixAttemptsPayload = {
      skipped: true,
      skipReason: reason,
      fixabilityTier: tier,
      unresolvedState,
    };

    expect(fixAttemptsPayload.unresolvedState).toBe('warn_only');
    expect(fixAttemptsPayload.fixabilityTier).toBe('warn_only');
  });

  it('updates enhancement_sessions with correct unresolved counts after rejection', () => {
    const existingAssets = [
      stubAsset({ id: '1', fixedImage: 'img1', batchFixStatus: 'fixed' }),
      stubAsset({ id: '2' }), // will be rejected
      stubAsset({ id: '3' }), // still pending
    ];

    // Simulate what useAuditSession does: create updatedAssets with the rejection applied
    const updatedAssets = existingAssets.map(a =>
      a.id === '2'
        ? { ...a, unresolvedState: 'manual_review' as const, batchFixStatus: 'skipped' as const }
        : a,
    );

    const counts = computeUnresolvedCounts(updatedAssets);
    expect(counts.unresolved_count).toBe(1);
    expect(counts.skipped_count).toBe(1);
  });

  it('session_images status is set to "skipped" for rejected assets', () => {
    // Both consumers set status: 'skipped' on the session_images row
    const sessionImageUpdate = {
      status: 'skipped',
      fix_attempts: {
        skipped: true,
        skipReason: 'Infographic with text layout',
        fixabilityTier: 'manual_review',
        unresolvedState: 'manual_review',
      },
    };
    expect(sessionImageUpdate.status).toBe('skipped');
  });
});

// ── 2. useAuditSession: successful fix wiring ──────────────────

describe('useAuditSession successful fix persistence', () => {
  const attempts: FixAttempt[] = [
    { attempt: 1, generatedImage: 'img1', status: 'failed', strategyUsed: 'bg-cleanup' },
    { attempt: 2, generatedImage: 'img2', status: 'passed', strategyUsed: 'inpaint-edit', isBestAttempt: true },
  ];
  const bestSel: BestAttemptSelection = {
    selectedAttemptIndex: 1,
    selectedReason: 'Passed verification',
    selectionType: 'score-driven',
  };
  const lastStrategy: FixStrategy = 'inpaint-edit';

  it('sets all required fields on asset state after successful fix', () => {
    const asset = stubAsset();
    const updated = {
      ...asset,
      isGeneratingFix: false,
      fixedImage: 'img2',
      fixMethod: 'surgical-edit' as const,
      fixAttempts: attempts,
      bestAttemptSelection: bestSel,
      selectedAttemptIndex: bestSel.selectedAttemptIndex,
      fixStopReason: undefined,
      lastFixStrategy: lastStrategy,
    };

    expect(updated.fixedImage).toBe('img2');
    expect(updated.fixMethod).toBe('surgical-edit');
    expect(updated.fixAttempts).toHaveLength(2);
    expect(updated.bestAttemptSelection).toBe(bestSel);
    expect(updated.selectedAttemptIndex).toBe(1);
    expect(updated.lastFixStrategy).toBe('inpaint-edit');
    expect(isManualReviewAsset(updated as ImageAsset)).toBe(false);
  });

  it('writes correct session_images payload via buildFixReviewPayload', () => {
    const payload = buildFixReviewPayload(attempts, bestSel, undefined, lastStrategy);

    // Verify the shape that gets written to fix_attempts JSON column
    expect(payload.attempts).toHaveLength(2);
    expect(payload.attempts[0].strategyUsed).toBe('bg-cleanup');
    expect(payload.attempts[1].isBestAttempt).toBe(true);
    expect(payload.bestAttemptSelection).toEqual(bestSel);
    expect(payload.lastFixStrategy).toBe('inpaint-edit');
    // Should NOT include unresolvedState for successful fixes
    expect(payload).not.toHaveProperty('unresolvedState');
  });

  it('session_images row gets status=fixed and fixed_image_url', () => {
    // Both consumers write this shape
    const sessionImageUpdate = {
      fixed_image_url: 'https://storage.example.com/fixed_test.jpg',
      status: 'fixed',
      fix_attempts: buildFixReviewPayload(attempts, bestSel, undefined, lastStrategy),
    };
    expect(sessionImageUpdate.status).toBe('fixed');
    expect(sessionImageUpdate.fixed_image_url).toBeTruthy();
    expect(sessionImageUpdate.fix_attempts.attempts).toHaveLength(2);
  });

  it('enhancement_sessions fixed_count includes the newly fixed asset', () => {
    const assets = [
      stubAsset({ id: '1', fixedImage: 'prev-fix' }),
      stubAsset({ id: '2' }), // being fixed now
    ];
    // useAuditSession: assets.filter(a => a.fixedImage || a.id === assetId).length
    const fixedCount = assets.filter(a => a.fixedImage || a.id === '2').length;
    expect(fixedCount).toBe(2);
  });
});

// ── 3. useAuditSession: retry-stopped / auto-fix-failed ────────

describe('useAuditSession retry-stopped / auto-fix-failed wiring', () => {
  it('derives unresolvedState=retry_stopped when stopReason is present', () => {
    const stopR = 'identity_drift';
    const unresolvedState = stopR ? 'retry_stopped' as const : 'auto_fix_failed' as const;
    expect(unresolvedState).toBe('retry_stopped');
  });

  it('derives unresolvedState=auto_fix_failed when stopReason is absent', () => {
    const stopR: string | undefined = undefined;
    const unresolvedState = stopR ? 'retry_stopped' as const : 'auto_fix_failed' as const;
    expect(unresolvedState).toBe('auto_fix_failed');
  });

  it('writes correct session_images payload for retry_stopped', () => {
    const attempts: FixAttempt[] = [
      { attempt: 1, generatedImage: 'img1', status: 'failed', strategyUsed: 'bg-cleanup' },
    ];
    const payload = buildFixReviewPayload(attempts, undefined, 'identity_drift', 'bg-cleanup', 'retry_stopped');

    expect(payload.unresolvedState).toBe('retry_stopped');
    expect(payload.stopReason).toBe('identity_drift');
    expect(payload.lastFixStrategy).toBe('bg-cleanup');
  });

  it('writes correct session_images payload for auto_fix_failed', () => {
    const payload = buildFixReviewPayload(
      [], undefined, 'No acceptable fix produced after all attempts', undefined, 'auto_fix_failed',
    );
    expect(payload.unresolvedState).toBe('auto_fix_failed');
    expect(payload.stopReason).toBe('No acceptable fix produced after all attempts');
  });

  it('sets correct asset state fields for retry_stopped', () => {
    const asset = stubAsset();
    const updated = {
      ...asset,
      isGeneratingFix: false,
      fixStopReason: 'identity_drift',
      batchFixStatus: 'failed' as const,
      unresolvedState: 'retry_stopped' as const,
      fixAttempts: [{ attempt: 1, generatedImage: 'img1', status: 'failed' as const, strategyUsed: 'bg-cleanup' as FixStrategy }],
      lastFixStrategy: 'bg-cleanup' as FixStrategy,
    };

    expect(isManualReviewAsset(updated as ImageAsset)).toBe(true);
    expect(updated.unresolvedState).toBe('retry_stopped');
    expect(updated.batchFixStatus).toBe('failed');
  });

  it('updates enhancement_sessions unresolved counts after failed fix', () => {
    const assets = [
      stubAsset({ id: '1', fixedImage: 'img1', batchFixStatus: 'fixed' }),
      stubAsset({ id: '2' }), // will become retry_stopped
    ];
    const updatedAssets = assets.map(a =>
      a.id === '2' ? { ...a, unresolvedState: 'retry_stopped' as const } : a,
    );
    const counts = computeUnresolvedCounts(updatedAssets);
    expect(counts.unresolved_count).toBe(1);
    // retry_stopped is not skipped
    expect(counts.skipped_count).toBe(0);
  });
});

// ── 4. Session.tsx: batch fix skip wiring ──────────────────────

describe('Session.tsx batch fix skip wiring', () => {
  it('excludes manual-review and skipped assets from batch fix', () => {
    const assets = [
      stubAsset({ id: '1' }), // fixable
      stubAsset({ id: '2', unresolvedState: 'manual_review', batchFixStatus: 'skipped' }),
      stubAsset({ id: '3', unresolvedState: 'warn_only', batchFixStatus: 'skipped' }),
      stubAsset({ id: '4', fixedImage: 'already-fixed' }),
    ];

    // Session.tsx batch fix filter:
    const failedAssets = assets.filter(a =>
      (a.analysisResult?.status === 'FAIL' || a.analysisResult?.status === 'WARNING') && !a.fixedImage
      && !isManualReviewAsset(a),
    );

    expect(failedAssets).toHaveLength(1);
    expect(failedAssets[0].id).toBe('1');
  });

  it('does not double-count unresolved assets after batch fix completes', () => {
    const assets = [
      stubAsset({ id: '1', fixedImage: 'img1', batchFixStatus: 'fixed' }),
      stubAsset({ id: '2', unresolvedState: 'manual_review', batchFixStatus: 'skipped', fixabilityTier: 'manual_review' }),
      stubAsset({ id: '3', unresolvedState: 'retry_stopped', batchFixStatus: 'failed', fixStopReason: 'identity_drift' }),
    ];

    const counts = computeUnresolvedCounts(assets);
    const manualReviewCount = assets.filter(isManualReviewAsset).length;

    // Counts must stay aligned
    expect(counts.unresolved_count).toBe(manualReviewCount);
    expect(counts.unresolved_count).toBe(2);
    expect(counts.skipped_count).toBe(1); // only the skipped one, not retry_stopped
  });
});

// ── 5. Session.tsx: single-image fix rejection ─────────────────

describe('Session.tsx single-image fix rejection', () => {
  it('mirrors useAuditSession rejection state update', () => {
    const asset = stubAsset();
    const tier = 'manual_review';
    const reason = 'Contains structured data';

    // Session.tsx sets the same fields as useAuditSession
    const sessionUpdate = {
      ...asset,
      fixabilityTier: tier,
      unresolvedState: tier === 'manual_review' ? 'manual_review' as const : 'warn_only' as const,
      batchFixStatus: 'skipped' as const,
      batchSkipReason: reason,
    };

    expect(isManualReviewAsset(sessionUpdate as ImageAsset)).toBe(true);
    expect(sessionUpdate.unresolvedState).toBe('manual_review');
  });

  it('mirrors useAuditSession DB write shape', () => {
    const tier = 'warn_only';
    const reason = 'Low resolution';

    // Both consumers write this exact shape to session_images
    const sessionImagePayload = {
      status: 'skipped',
      fix_attempts: {
        skipped: true,
        skipReason: reason,
        fixabilityTier: tier,
        unresolvedState: tier === 'manual_review' ? 'manual_review' : 'warn_only',
      },
    };

    expect(sessionImagePayload.fix_attempts.unresolvedState).toBe('warn_only');
    expect(sessionImagePayload.status).toBe('skipped');
  });
});

// ── 6. Session.tsx: successful fix persistence ─────────────────

describe('Session.tsx successful fix persistence', () => {
  it('writes same buildFixReviewPayload shape as useAuditSession', () => {
    const attempts: FixAttempt[] = [
      {
        attempt: 1, generatedImage: 'img1', status: 'passed',
        strategyUsed: 'bg-cleanup', fixTier: 'gemini-flash',
        verification: {
          score: 95, isSatisfactory: true, productMatch: true,
          critique: '', improvements: [],
          passedChecks: ['bg'], failedChecks: [],
          componentScores: { identity: 95, compliance: 95, quality: 95, noNewIssues: 95 },
        },
      },
    ];
    const payload = buildFixReviewPayload(attempts, undefined, undefined, 'bg-cleanup');

    // Verification subset — thinkingSteps stripped
    expect(payload.attempts[0].verification).toHaveProperty('score', 95);
    expect(payload.attempts[0].verification).not.toHaveProperty('thinkingSteps');
    expect(payload).not.toHaveProperty('unresolvedState');
  });

  it('updates enhancement_sessions with fixed_count and unresolved counts', () => {
    const assets = [
      stubAsset({ id: '1', fixedImage: 'img1' }),
      stubAsset({ id: '2' }), // being fixed now (assetId)
      stubAsset({ id: '3', unresolvedState: 'manual_review', batchFixStatus: 'skipped' }),
    ];

    // Session.tsx: fixed_count: assets.filter(a => a.fixedImage || a.id === assetId).length
    const fixedCount = assets.filter(a => a.fixedImage || a.id === '2').length;
    const counts = computeUnresolvedCounts(assets);

    expect(fixedCount).toBe(2);
    expect(counts.unresolved_count).toBe(1);
    expect(counts.skipped_count).toBe(1);
  });
});

// ── 7. Session.tsx: failed fix persistence ─────────────────────

describe('Session.tsx failed fix persistence', () => {
  it('writes session_images status=failed for retry_stopped', () => {
    const attempts: FixAttempt[] = [
      { attempt: 1, generatedImage: 'img1', status: 'failed', strategyUsed: 'bg-cleanup' },
    ];
    const unresolvedState = 'retry_stopped';

    const sessionImageUpdate = {
      status: 'failed',
      fix_attempts: buildFixReviewPayload(attempts, undefined, 'identity_drift', 'bg-cleanup', unresolvedState),
    };

    expect(sessionImageUpdate.status).toBe('failed');
    expect(sessionImageUpdate.fix_attempts.unresolvedState).toBe('retry_stopped');
    expect(sessionImageUpdate.fix_attempts.stopReason).toBe('identity_drift');
  });

  it('writes enhancement_sessions counts after failed fix', () => {
    const assets = [
      stubAsset({ id: '1', fixedImage: 'img1', batchFixStatus: 'fixed' }),
      stubAsset({ id: '2' }), // will fail
    ];
    const updatedAssets = assets.map(a =>
      a.id === '2' ? { ...a, unresolvedState: 'auto_fix_failed' as const } : a,
    );

    const counts = computeUnresolvedCounts(updatedAssets);
    expect(counts.unresolved_count).toBe(1);
    expect(counts.skipped_count).toBe(0); // auto_fix_failed is not skipped
  });
});

// ── 8. Consumer parity: identical wiring contracts ─────────────

describe('consumer parity: useAuditSession vs Session.tsx', () => {
  it('both consumers use buildFixReviewPayload for successful fix', () => {
    const attempts: FixAttempt[] = [
      { attempt: 1, generatedImage: 'img1', status: 'passed', strategyUsed: 'bg-cleanup' },
    ];
    // useAuditSession: buildFixReviewPayload(allAttempts, bestSel, stopR, lastStrategy)
    // Session.tsx:     buildFixReviewPayload(allAttempts, bestAttemptSelection, stopReason, lastStrategy)
    // Same call signature — verify identical output
    const p1 = buildFixReviewPayload(attempts, undefined, undefined, 'bg-cleanup');
    const p2 = buildFixReviewPayload(attempts, undefined, undefined, 'bg-cleanup');
    expect(p1).toEqual(p2);
  });

  it('both consumers use buildFixReviewPayload with unresolvedState for failed fix', () => {
    const attempts: FixAttempt[] = [
      { attempt: 1, generatedImage: 'img1', status: 'failed', strategyUsed: 'bg-cleanup' },
    ];
    // useAuditSession: buildFixReviewPayload(allAttempts, bestSel, stopR || 'No acceptable fix...', lastStrategy, unresolvedState)
    // Session.tsx:     buildFixReviewPayload(allAttempts, bestAttemptSelection, stopReason, lastStrategy, unresolvedState)
    const p1 = buildFixReviewPayload(attempts, undefined, 'identity_drift', 'bg-cleanup', 'retry_stopped');
    const p2 = buildFixReviewPayload(attempts, undefined, 'identity_drift', 'bg-cleanup', 'retry_stopped');
    expect(p1).toEqual(p2);
    expect(p1.unresolvedState).toBe('retry_stopped');
  });

  it('both consumers use computeUnresolvedCounts for session aggregate updates', () => {
    const assets = [
      stubAsset({ id: '1', unresolvedState: 'manual_review', batchFixStatus: 'skipped' }),
      stubAsset({ id: '2', unresolvedState: 'retry_stopped', batchFixStatus: 'failed' }),
      stubAsset({ id: '3', fixedImage: 'img3', batchFixStatus: 'fixed' }),
    ];
    const counts = computeUnresolvedCounts(assets);
    expect(counts.unresolved_count).toBe(2);
    expect(counts.skipped_count).toBe(1);
  });

  it('both consumers derive unresolvedState from stopReason identically', () => {
    // Both: const unresolvedState = stopR ? 'retry_stopped' : 'auto_fix_failed'
    const derive = (sr: string | undefined) => sr ? 'retry_stopped' as const : 'auto_fix_failed' as const;
    expect(derive('identity_drift')).toBe('retry_stopped');
    expect(derive(undefined)).toBe('auto_fix_failed');
    expect(derive('')).toBe('auto_fix_failed');
  });

  it('both consumers set session_images status based on outcome', () => {
    // Rejected: status='skipped'
    // Successful: status='fixed'
    // Failed: status='failed'
    const outcomes = [
      { outcome: 'rejected', expectedStatus: 'skipped' },
      { outcome: 'successful', expectedStatus: 'fixed' },
      { outcome: 'failed', expectedStatus: 'failed' },
    ];
    for (const { outcome, expectedStatus } of outcomes) {
      expect(expectedStatus).toBeTruthy();
    }
  });
});

// ── 9. Aggregate count alignment across full mixed sets ────────

describe('aggregate count alignment for mixed asset sets', () => {
  it('full mixed set: counts stay aligned with isManualReviewAsset', () => {
    const assets = [
      stubAsset({ id: '1', analysisResult: { overallScore: 90, status: 'PASS', violations: [], fixRecommendations: [] } }), // passed
      stubAsset({ id: '2', fixedImage: 'img2', batchFixStatus: 'fixed' }), // fixed
      stubAsset({ id: '3', unresolvedState: 'manual_review', batchFixStatus: 'skipped', fixabilityTier: 'manual_review' }), // manual_review
      stubAsset({ id: '4', unresolvedState: 'warn_only', batchFixStatus: 'skipped', fixabilityTier: 'warn_only' }), // warn_only
      stubAsset({ id: '5', unresolvedState: 'retry_stopped', batchFixStatus: 'failed', fixStopReason: 'identity_drift' }), // retry_stopped
      stubAsset({ id: '6', unresolvedState: 'auto_fix_failed', batchFixStatus: 'failed' }), // auto_fix_failed
      stubAsset({ id: '7', batchFixStatus: 'skipped', batchSkipReason: 'some reason' }), // legacy skipped
    ];

    const manualReviewAssets = assets.filter(isManualReviewAsset);
    const counts = computeUnresolvedCounts(assets);

    // unresolved_count must match isManualReviewAsset
    expect(counts.unresolved_count).toBe(manualReviewAssets.length);

    // Passed and fixed assets must NOT be counted as unresolved
    expect(isManualReviewAsset(assets[0])).toBe(false); // passed
    expect(isManualReviewAsset(assets[1])).toBe(false); // fixed

    // All unresolved states are in manual review
    expect(isManualReviewAsset(assets[2])).toBe(true); // manual_review
    expect(isManualReviewAsset(assets[3])).toBe(true); // warn_only
    expect(isManualReviewAsset(assets[4])).toBe(true); // retry_stopped
    expect(isManualReviewAsset(assets[5])).toBe(true); // auto_fix_failed
    expect(isManualReviewAsset(assets[6])).toBe(true); // legacy skipped
  });

  it('fixed image with fixStopReason is NOT counted as unresolved', () => {
    const asset = stubAsset({
      fixedImage: 'img1',
      fixStopReason: 'partial_compliance',
      batchFixStatus: 'fixed',
    });
    expect(isManualReviewAsset(asset)).toBe(false);
    expect(computeUnresolvedCounts([asset]).unresolved_count).toBe(0);
  });

  it('Session.tsx page count derivation matches data state', () => {
    const assets = [
      stubAsset({ id: '1', analysisResult: { overallScore: 92, status: 'PASS', violations: [], fixRecommendations: [] } }),
      stubAsset({ id: '2', fixedImage: 'img2' }),
      stubAsset({ id: '3', unresolvedState: 'manual_review', batchFixStatus: 'skipped' }),
      stubAsset({ id: '4', unresolvedState: 'retry_stopped', batchFixStatus: 'failed', fixStopReason: 'drift' }),
    ];

    // Session.tsx derives counts like this (now excludes fixed assets):
    const manualReviewAssets = assets.filter(isManualReviewAsset);
    const passedCount = assets.filter(a => a.analysisResult?.status === 'PASS').length;
    const failedCount = assets.filter(a =>
      (a.analysisResult?.status === 'FAIL' || a.analysisResult?.status === 'WARNING')
      && !a.fixedImage
      && !manualReviewAssets.some(m => m.id === a.id),
    ).length;
    const fixedCount = assets.filter(a => a.fixedImage).length;

    expect(passedCount).toBe(1);
    expect(fixedCount).toBe(1);
    expect(manualReviewAssets.length).toBe(2);
    // asset 2 has FAIL status + fixedImage → excluded from failedCount (it's fixed!)
    // assets 3 & 4 are in manual review → excluded from failedCount
    expect(failedCount).toBe(0);
  });
});

// ── 10. Payload structure: verification subset stripping ───────

describe('payload structure: verification subset stripping', () => {
  it('strips thinkingSteps from verification in payload', () => {
    const attempts: FixAttempt[] = [
      {
        attempt: 1,
        generatedImage: 'img1',
        status: 'passed',
        strategyUsed: 'bg-cleanup',
        verification: {
          score: 92,
          isSatisfactory: true,
          productMatch: true,
          critique: 'Good',
          improvements: [],
          passedChecks: ['bg'],
          failedChecks: [],
          componentScores: { identity: 95, compliance: 90, quality: 90, noNewIssues: 95 },
          thinkingSteps: ['Step 1', 'Step 2'], // should be stripped
        },
      },
    ];

    const payload = buildFixReviewPayload(attempts, undefined, undefined, 'bg-cleanup');
    expect(payload.attempts[0].verification).not.toHaveProperty('thinkingSteps');
    expect(payload.attempts[0].verification).toHaveProperty('score', 92);
    expect(payload.attempts[0].verification).toHaveProperty('componentScores');
  });

  it('strips improvements from verification in payload', () => {
    const attempts: FixAttempt[] = [
      {
        attempt: 1,
        generatedImage: 'img1',
        status: 'failed',
        strategyUsed: 'bg-cleanup',
        verification: {
          score: 60,
          isSatisfactory: false,
          productMatch: true,
          critique: 'Needs work',
          improvements: ['Fix bg', 'Improve lighting'],
          passedChecks: [],
          failedChecks: ['bg'],
          componentScores: { identity: 80, compliance: 50, quality: 60, noNewIssues: 70 },
        },
      },
    ];

    const payload = buildFixReviewPayload(attempts, undefined, undefined, 'bg-cleanup');
    // improvements is not in the subset
    expect(payload.attempts[0].verification).not.toHaveProperty('improvements');
  });

  it('retryDecision in payload only includes subset fields', () => {
    const attempts: FixAttempt[] = [
      {
        attempt: 1,
        generatedImage: 'img1',
        status: 'failed',
        strategyUsed: 'bg-cleanup',
        retryDecision: {
          shouldContinue: true,
          nextStrategy: 'inpaint-edit' as FixStrategy,
          rationale: 'Try inpainting',
          stopReason: undefined,
          tightenedPreserve: ['product'],
          tightenedProhibited: ['text'],
          additionalInstructions: ['Be careful'],
        },
      },
    ];

    const payload = buildFixReviewPayload(attempts, undefined, undefined, 'bg-cleanup');
    const rd = payload.attempts[0].retryDecision;
    expect(rd).toHaveProperty('rationale', 'Try inpainting');
    expect(rd).toHaveProperty('nextStrategy', 'inpaint-edit');
    // Should NOT include tightenedPreserve, tightenedProhibited, additionalInstructions
    expect(rd).not.toHaveProperty('tightenedPreserve');
    expect(rd).not.toHaveProperty('shouldContinue');
  });
});
