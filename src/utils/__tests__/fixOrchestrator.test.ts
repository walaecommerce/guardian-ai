import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ImageAsset, FixAttempt, FixProgressState, BestAttemptSelection, FixPlan } from '@/types';

// ── Mocks ──────────────────────────────────────────────────────

const mockInvoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: any[]) => mockInvoke(...args) } },
}));

const mockBuildFixPlan = vi.fn();
vi.mock('@/utils/fixPlanEngine', () => ({
  buildFixPlan: (...args: any[]) => mockBuildFixPlan(...args),
}));

const mockPlanRetry = vi.fn();
vi.mock('@/utils/retryPlanner', () => ({
  planRetry: (...args: any[]) => mockPlanRetry(...args),
}));

const mockSelectBestAttempt = vi.fn();
vi.mock('@/utils/bestAttemptSelector', () => ({
  selectBestAttempt: (...args: any[]) => mockSelectBestAttempt(...args),
}));

vi.mock('@/utils/imageCategory', () => ({
  extractImageCategory: () => 'PRODUCT_SHOT',
}));

import { runFixOrchestration, buildFixReviewPayload, FixOrchestratorCallbacks } from '@/utils/fixOrchestrator';

// ── Helpers ────────────────────────────────────────────────────

function makeAsset(overrides: Partial<ImageAsset> = {}): ImageAsset {
  return {
    id: 'a1',
    file: new File([], 'test.jpg'),
    preview: '',
    type: 'MAIN',
    name: 'test.jpg',
    analysisResult: {
      overallScore: 40,
      status: 'FAIL',
      violations: [{ severity: 'critical', category: 'bg', message: 'bad bg', recommendation: 'fix' }],
      fixRecommendations: ['fix bg'],
      deterministicFindings: [],
    },
    ...overrides,
  } as ImageAsset;
}

function makeCallbacks(): FixOrchestratorCallbacks & { state: FixProgressState } {
  const state: FixProgressState = {
    attempt: 0,
    maxAttempts: 3,
    currentStep: 'generating',
    attempts: [],
    thinkingSteps: [],
  };
  return {
    state,
    onProgress: (updater) => {
      const next = updater(state);
      if (next) Object.assign(state, next);
    },
    onLog: vi.fn(),
  };
}

function basePlan(strategy = 'bg-cleanup' as const): FixPlan {
  return {
    strategy,
    targetRuleIds: ['R1'],
    category: 'GENERAL',
    imageType: 'MAIN',
    preserve: [],
    permitted: [],
    remove: [],
    prohibited: [],
    categoryConstraints: [],
  };
}

const passVerification = {
  score: 95,
  isSatisfactory: true,
  productMatch: true,
  critique: '',
  improvements: [],
  passedChecks: ['bg'],
  failedChecks: [],
  componentScores: { identity: 95, compliance: 95, quality: 95, noNewIssues: 95 },
};

const failVerification = {
  score: 50,
  isSatisfactory: false,
  productMatch: true,
  critique: 'bg still dirty',
  improvements: ['clean bg'],
  passedChecks: [],
  failedChecks: ['bg'],
  componentScores: { identity: 80, compliance: 40, quality: 60, noNewIssues: 70 },
};

// ── Tests: runFixOrchestration ─────────────────────────────────

describe('runFixOrchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it('exits safely when fix plan strategy is skip', async () => {
    mockBuildFixPlan.mockReturnValue(basePlan('skip'));
    const cb = makeCallbacks();
    const result = await runFixOrchestration({ asset: makeAsset(), originalBase64: 'abc' }, cb);
    expect(result.stopReason).toBe('skip');
    expect(result.lastStrategy).toBe('skip');
    expect(result.allAttempts).toEqual([]);
    expect(result.finalImage).toBeUndefined();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('returns final image when first attempt passes verification', async () => {
    mockBuildFixPlan.mockReturnValue(basePlan());
    mockInvoke
      .mockResolvedValueOnce({ data: { fixedImage: 'img1' }, error: null })
      .mockResolvedValueOnce({ data: passVerification, error: null });

    const cb = makeCallbacks();
    const result = await runFixOrchestration({ asset: makeAsset(), originalBase64: 'abc' }, cb);
    expect(result.finalImage).toBe('img1');
    expect(result.allAttempts.length).toBe(1);
    expect(mockPlanRetry).not.toHaveBeenCalled();
  });

  it('retries when verification fails then passes on attempt 2', async () => {
    mockBuildFixPlan.mockReturnValue(basePlan());
    mockPlanRetry.mockReturnValue({
      shouldContinue: true,
      nextStrategy: 'inpaint-edit',
      rationale: 'try harder',
      tightenedPreserve: ['label'],
      tightenedProhibited: ['text'],
      additionalInstructions: ['be careful'],
    });
    mockInvoke
      .mockResolvedValueOnce({ data: { fixedImage: 'img1' }, error: null }) // gen 1
      .mockResolvedValueOnce({ data: failVerification, error: null })       // verify 1
      .mockResolvedValueOnce({ data: { fixedImage: 'img2' }, error: null }) // gen 2
      .mockResolvedValueOnce({ data: passVerification, error: null });      // verify 2

    const cb = makeCallbacks();
    const promise = runFixOrchestration({ asset: makeAsset(), originalBase64: 'abc' }, cb);
    await vi.advanceTimersByTimeAsync(10000);
    const result = await promise;

    expect(result.finalImage).toBe('img2');
    expect(result.allAttempts.length).toBe(2);
    expect(mockPlanRetry).toHaveBeenCalledTimes(1);
  });

  it('stops when retry planner says stop, then selects best attempt', async () => {
    mockBuildFixPlan.mockReturnValue(basePlan());
    mockPlanRetry.mockReturnValue({
      shouldContinue: false,
      nextStrategy: 'bg-cleanup',
      rationale: 'identity drift',
      tightenedPreserve: [],
      tightenedProhibited: [],
      additionalInstructions: [],
      stopReason: 'identity_drift',
    });
    mockSelectBestAttempt.mockReturnValue({
      selectedAttemptIndex: 0,
      selectedReason: 'Best score',
      selectionType: 'score-driven',
    });
    mockInvoke
      .mockResolvedValueOnce({ data: { fixedImage: 'img1' }, error: null })
      .mockResolvedValueOnce({ data: failVerification, error: null });

    const cb = makeCallbacks();
    const result = await runFixOrchestration({ asset: makeAsset(), originalBase64: 'abc' }, cb);

    expect(result.finalImage).toBe('img1');
    expect(result.bestAttemptSelection).toBeDefined();
    expect(result.bestAttemptSelection!.selectedReason).toBe('Best score');
    expect(result.stopReason).toBe('identity_drift');
  });

  it('falls back to generated image when verification service fails', async () => {
    mockBuildFixPlan.mockReturnValue(basePlan());
    mockInvoke
      .mockResolvedValueOnce({ data: { fixedImage: 'img1' }, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('verify down') });

    const cb = makeCallbacks();
    const result = await runFixOrchestration({ asset: makeAsset(), originalBase64: 'abc' }, cb);
    expect(result.finalImage).toBe('img1');
  });

  it('propagates payment-required error with isPayment flag', async () => {
    mockBuildFixPlan.mockReturnValue(basePlan());
    const paymentError = Object.assign(new Error('edge fn error'), {
      context: { status: 402, body: JSON.stringify({ error: 'No credits', errorType: 'payment_required' }) },
    });
    mockInvoke.mockResolvedValueOnce({ data: null, error: paymentError });

    const cb = makeCallbacks();
    await expect(runFixOrchestration({ asset: makeAsset(), originalBase64: 'abc' }, cb))
      .rejects.toMatchObject({ isPayment: true });
  });

  it('propagates payment_required from response body', async () => {
    mockBuildFixPlan.mockReturnValue(basePlan());
    mockInvoke.mockResolvedValueOnce({
      data: { error: 'Out of credits', errorType: 'payment_required' },
      error: null,
    });

    const cb = makeCallbacks();
    await expect(runFixOrchestration({ asset: makeAsset(), originalBase64: 'abc' }, cb))
      .rejects.toMatchObject({ isPayment: true });
  });

  it('passes SECONDARY content type through to generate-fix', async () => {
    mockBuildFixPlan.mockReturnValue(basePlan());
    mockInvoke
      .mockResolvedValueOnce({ data: { fixedImage: 'img1' }, error: null })
      .mockResolvedValueOnce({ data: passVerification, error: null });

    const asset = makeAsset({ type: 'SECONDARY' });
    const cb = makeCallbacks();
    await runFixOrchestration({ asset, originalBase64: 'abc' }, cb);

    const genBody = mockInvoke.mock.calls[0][1].body;
    expect(genBody.imageType).toBe('SECONDARY');
  });

  it('carries retry instructions forward to next generation call', async () => {
    mockBuildFixPlan.mockReturnValue(basePlan());
    mockPlanRetry.mockReturnValue({
      shouldContinue: true,
      nextStrategy: 'inpaint-edit',
      rationale: 'retry',
      tightenedPreserve: [],
      tightenedProhibited: [],
      additionalInstructions: ['fix the label'],
    });
    mockInvoke
      .mockResolvedValueOnce({ data: { fixedImage: 'img1' }, error: null })
      .mockResolvedValueOnce({ data: failVerification, error: null })
      .mockResolvedValueOnce({ data: { fixedImage: 'img2' }, error: null })
      .mockResolvedValueOnce({ data: passVerification, error: null });

    const cb = makeCallbacks();
    const promise = runFixOrchestration({ asset: makeAsset(), originalBase64: 'abc' }, cb);
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    const secondGenBody = mockInvoke.mock.calls[2][1].body;
    expect(secondGenBody.retryInstructions).toEqual(['fix the label']);
  });

  // ── Edge-case layer 2 ────────────────────────────────────────

  describe('progress-state accumulation', () => {
    it('advances attempt number and records attempts with correct status', async () => {
      mockBuildFixPlan.mockReturnValue(basePlan());
      mockPlanRetry.mockReturnValue({
        shouldContinue: true, nextStrategy: 'inpaint-edit', rationale: 'r',
        tightenedPreserve: [], tightenedProhibited: [], additionalInstructions: [],
      });
      mockInvoke
        .mockResolvedValueOnce({ data: { fixedImage: 'img1' }, error: null })
        .mockResolvedValueOnce({ data: failVerification, error: null })
        .mockResolvedValueOnce({ data: { fixedImage: 'img2' }, error: null })
        .mockResolvedValueOnce({ data: passVerification, error: null });

      const cb = makeCallbacks();
      const promise = runFixOrchestration({ asset: makeAsset(), originalBase64: 'x' }, cb);
      await vi.advanceTimersByTimeAsync(10000);
      await promise;

      expect(cb.state.attempts).toHaveLength(2);
      expect(cb.state.attempts[0].status).toBe('failed');
      expect(cb.state.attempts[1].status).toBe('passed');
      expect(cb.state.currentStep).toBe('complete');
    });

    it('stores stopReason in progress state when retries stop', async () => {
      mockBuildFixPlan.mockReturnValue(basePlan());
      mockPlanRetry.mockReturnValue({
        shouldContinue: false, nextStrategy: 'bg-cleanup', rationale: 'drift',
        tightenedPreserve: [], tightenedProhibited: [], additionalInstructions: [],
        stopReason: 'identity_drift',
      });
      mockSelectBestAttempt.mockReturnValue({
        selectedAttemptIndex: 0, selectedReason: 'Only option', selectionType: 'score-driven',
      });
      mockInvoke
        .mockResolvedValueOnce({ data: { fixedImage: 'img1' }, error: null })
        .mockResolvedValueOnce({ data: failVerification, error: null });

      const cb = makeCallbacks();
      await runFixOrchestration({ asset: makeAsset(), originalBase64: 'x' }, cb);

      expect(cb.state.stopReason).toBe('identity_drift');
    });

    it('stores retryDecision on the failed attempt in progress state', async () => {
      mockBuildFixPlan.mockReturnValue(basePlan());
      const decision = {
        shouldContinue: true, nextStrategy: 'inpaint-edit' as const, rationale: 'try',
        tightenedPreserve: ['a'], tightenedProhibited: ['b'], additionalInstructions: [],
      };
      mockPlanRetry.mockReturnValue(decision);
      mockInvoke
        .mockResolvedValueOnce({ data: { fixedImage: 'img1' }, error: null })
        .mockResolvedValueOnce({ data: failVerification, error: null })
        .mockResolvedValueOnce({ data: { fixedImage: 'img2' }, error: null })
        .mockResolvedValueOnce({ data: passVerification, error: null });

      const cb = makeCallbacks();
      const promise = runFixOrchestration({ asset: makeAsset(), originalBase64: 'x' }, cb);
      await vi.advanceTimersByTimeAsync(10000);
      await promise;

      expect(cb.state.attempts[0].retryDecision).toBeDefined();
      expect(cb.state.attempts[0].retryDecision!.rationale).toBe('try');
  });

  it('preserves isBestAttempt, strategyUsed, and status per attempt', () => {
    const attempts: FixAttempt[] = [
      { attempt: 1, generatedImage: 'a', status: 'failed', strategyUsed: 'bg-cleanup', isBestAttempt: false },
      { attempt: 2, generatedImage: 'b', status: 'failed', strategyUsed: 'inpaint-edit', isBestAttempt: true },
    ];
    const payload = buildFixReviewPayload(attempts, undefined, 'max_retries', 'inpaint-edit');
    expect(payload.attempts[0]).toMatchObject({ attempt: 1, status: 'failed', strategyUsed: 'bg-cleanup', isBestAttempt: false });
    expect(payload.attempts[1]).toMatchObject({ attempt: 2, status: 'failed', strategyUsed: 'inpaint-edit', isBestAttempt: true });
    expect(payload.stopReason).toBe('max_retries');
  });
});
  });

  describe('critique and improvement carry-forward', () => {
    it('combines critique and improvements into previousCritique for next attempt', async () => {
      mockBuildFixPlan.mockReturnValue(basePlan());
      const failWithImprovements = {
        ...failVerification,
        critique: 'Background not white',
        improvements: ['Remove shadow', 'Increase brightness'],
      };
      mockPlanRetry.mockReturnValue({
        shouldContinue: true, nextStrategy: 'inpaint-edit', rationale: 'r',
        tightenedPreserve: [], tightenedProhibited: [], additionalInstructions: [],
      });
      mockInvoke
        .mockResolvedValueOnce({ data: { fixedImage: 'img1' }, error: null })
        .mockResolvedValueOnce({ data: failWithImprovements, error: null })
        .mockResolvedValueOnce({ data: { fixedImage: 'img2' }, error: null })
        .mockResolvedValueOnce({ data: passVerification, error: null });

      const cb = makeCallbacks();
      const promise = runFixOrchestration({ asset: makeAsset(), originalBase64: 'x' }, cb);
      await vi.advanceTimersByTimeAsync(10000);
      await promise;

      const secondGenBody = mockInvoke.mock.calls[2][1].body;
      expect(secondGenBody.previousCritique).toContain('Background not white');
      expect(secondGenBody.previousCritique).toContain('- Remove shadow');
      expect(secondGenBody.previousCritique).toContain('- Increase brightness');
    });
  });

  describe('previous generated image carry-forward', () => {
    it('passes last generated image to next generate-fix call', async () => {
      mockBuildFixPlan.mockReturnValue(basePlan());
      mockPlanRetry.mockReturnValue({
        shouldContinue: true, nextStrategy: 'inpaint-edit', rationale: 'r',
        tightenedPreserve: [], tightenedProhibited: [], additionalInstructions: [],
      });
      mockInvoke
        .mockResolvedValueOnce({ data: { fixedImage: 'generated-v1' }, error: null })
        .mockResolvedValueOnce({ data: failVerification, error: null })
        .mockResolvedValueOnce({ data: { fixedImage: 'generated-v2' }, error: null })
        .mockResolvedValueOnce({ data: passVerification, error: null });

      const cb = makeCallbacks();
      const promise = runFixOrchestration({ asset: makeAsset(), originalBase64: 'x' }, cb);
      await vi.advanceTimersByTimeAsync(10000);
      await promise;

      const secondGenBody = mockInvoke.mock.calls[2][1].body;
      expect(secondGenBody.previousGeneratedImage).toBe('generated-v1');
    });

    it('uses input previousGeneratedImage for first attempt', async () => {
      mockBuildFixPlan.mockReturnValue(basePlan());
      mockInvoke
        .mockResolvedValueOnce({ data: { fixedImage: 'img1' }, error: null })
        .mockResolvedValueOnce({ data: passVerification, error: null });

      const cb = makeCallbacks();
      await runFixOrchestration({
        asset: makeAsset(), originalBase64: 'x', previousGeneratedImage: 'prev-img',
      }, cb);

      const firstGenBody = mockInvoke.mock.calls[0][1].body;
      expect(firstGenBody.previousGeneratedImage).toBe('prev-img');
    });
  });

  describe('fix-method mapping', () => {
    it('maps usedBackgroundSegmentation to bg-segmentation', async () => {
      mockBuildFixPlan.mockReturnValue(basePlan());
      mockInvoke
        .mockResolvedValueOnce({ data: { fixedImage: 'img1', usedBackgroundSegmentation: true }, error: null })
        .mockResolvedValueOnce({ data: passVerification, error: null });

      const cb = makeCallbacks();
      const result = await runFixOrchestration({ asset: makeAsset(), originalBase64: 'x' }, cb);
      expect(result.lastFixMethod).toBe('bg-segmentation');
    });

    it('maps MAIN without segmentation to full-regeneration', async () => {
      mockBuildFixPlan.mockReturnValue(basePlan());
      mockInvoke
        .mockResolvedValueOnce({ data: { fixedImage: 'img1' }, error: null })
        .mockResolvedValueOnce({ data: passVerification, error: null });

      const cb = makeCallbacks();
      const result = await runFixOrchestration({ asset: makeAsset({ type: 'MAIN' }), originalBase64: 'x' }, cb);
      expect(result.lastFixMethod).toBe('full-regeneration');
    });

    it('maps SECONDARY without segmentation to surgical-edit', async () => {
      mockBuildFixPlan.mockReturnValue(basePlan());
      mockInvoke
        .mockResolvedValueOnce({ data: { fixedImage: 'img1' }, error: null })
        .mockResolvedValueOnce({ data: passVerification, error: null });

      const cb = makeCallbacks();
      const result = await runFixOrchestration({ asset: makeAsset({ type: 'SECONDARY' }), originalBase64: 'x' }, cb);
      expect(result.lastFixMethod).toBe('surgical-edit');
    });
  });

  describe('verify-call payload correctness', () => {
    it('sends expected fields to verify-image', async () => {
      const plan = basePlan();
      plan.targetRuleIds = ['R1', 'R2'];
      plan.category = 'ELECTRONICS';
      mockBuildFixPlan.mockReturnValue(plan);
      mockInvoke
        .mockResolvedValueOnce({ data: { fixedImage: 'gen-img' }, error: null })
        .mockResolvedValueOnce({ data: passVerification, error: null });

      const cb = makeCallbacks();
      await runFixOrchestration({ asset: makeAsset(), originalBase64: 'orig64' }, cb);

      expect(mockInvoke.mock.calls[1][0]).toBe('verify-image');
      const verifyBody = mockInvoke.mock.calls[1][1].body;
      expect(verifyBody.originalImageBase64).toBe('orig64');
      expect(verifyBody.generatedImageBase64).toBe('gen-img');
      expect(verifyBody.imageType).toBe('MAIN');
      expect(verifyBody.imageContentType).toBe('PRODUCT_SHOT');
      expect(verifyBody.targetRuleIds).toEqual(['R1', 'R2']);
      expect(verifyBody.fixCategory).toBe('ELECTRONICS');
    });
  });

  describe('best-attempt fallback edge cases', () => {
    it('does not call selectBestAttempt when there are zero attempts', async () => {
      mockBuildFixPlan.mockReturnValue(basePlan('skip'));
      const cb = makeCallbacks();
      await runFixOrchestration({ asset: makeAsset(), originalBase64: 'x' }, cb);
      expect(mockSelectBestAttempt).not.toHaveBeenCalled();
    });

    it('preserves stopReason even when best attempt is selected', async () => {
      mockBuildFixPlan.mockReturnValue(basePlan());
      mockPlanRetry.mockReturnValue({
        shouldContinue: false, nextStrategy: 'bg-cleanup', rationale: 'drift',
        tightenedPreserve: [], tightenedProhibited: [], additionalInstructions: [],
        stopReason: 'repeated_identity_drift',
      });
      mockSelectBestAttempt.mockReturnValue({
        selectedAttemptIndex: 0, selectedReason: 'Highest score', selectionType: 'safety-driven',
      });
      mockInvoke
        .mockResolvedValueOnce({ data: { fixedImage: 'img1' }, error: null })
        .mockResolvedValueOnce({ data: failVerification, error: null });

      const cb = makeCallbacks();
      const result = await runFixOrchestration({ asset: makeAsset(), originalBase64: 'x' }, cb);

      expect(result.stopReason).toBe('repeated_identity_drift');
      expect(result.finalImage).toBe('img1');
      expect(result.bestAttemptSelection).toBeDefined();
    });

    it('returns no final image when best-attempt has no generated image', async () => {
      mockBuildFixPlan.mockReturnValue(basePlan());
      mockPlanRetry.mockReturnValue({
        shouldContinue: false, nextStrategy: 'bg-cleanup', rationale: 'stop',
        tightenedPreserve: [], tightenedProhibited: [], additionalInstructions: [],
        stopReason: 'gave_up',
      });
      mockSelectBestAttempt.mockReturnValue({
        selectedAttemptIndex: 0, selectedReason: 'Only', selectionType: 'score-driven',
      });
      // Simulate an attempt that somehow has no generatedImage
      mockInvoke
        .mockResolvedValueOnce({ data: { fixedImage: 'img1' }, error: null })
        .mockResolvedValueOnce({ data: failVerification, error: null });

      const cb = makeCallbacks();
      // Manually corrupt the attempt to have no image to test the guard
      const origOnProgress = cb.onProgress;
      cb.onProgress = (updater) => {
        origOnProgress(updater);
        // After the stop, remove image from attempts to simulate edge case
        if (cb.state.currentStep === 'complete' && cb.state.attempts.length > 0) {
          cb.state.attempts = cb.state.attempts.map(a => ({ ...a, generatedImage: '' }));
        }
      };
      const result = await runFixOrchestration({ asset: makeAsset(), originalBase64: 'x' }, cb);
      // Empty string is falsy so selectBestAttempt guard should fail
      expect(result.finalImage).toBeFalsy();
    });
  });

  describe('strategy and preserve/prohibited carry-forward', () => {
    it('applies tightened preserve/prohibited from retry planner to next fix plan', async () => {
      mockBuildFixPlan.mockReturnValue(basePlan());
      mockPlanRetry.mockReturnValue({
        shouldContinue: true, nextStrategy: 'overlay-removal',
        rationale: 'escalate', tightenedPreserve: ['logo', 'label'],
        tightenedProhibited: ['watermark'], additionalInstructions: [],
      });
      mockInvoke
        .mockResolvedValueOnce({ data: { fixedImage: 'img1' }, error: null })
        .mockResolvedValueOnce({ data: failVerification, error: null })
        .mockResolvedValueOnce({ data: { fixedImage: 'img2' }, error: null })
        .mockResolvedValueOnce({ data: passVerification, error: null });

      const cb = makeCallbacks();
      const promise = runFixOrchestration({ asset: makeAsset(), originalBase64: 'x' }, cb);
      await vi.advanceTimersByTimeAsync(10000);
      const result = await promise;

      // Second gen call should have the updated fix plan
      const secondGenBody = mockInvoke.mock.calls[2][1].body;
      expect(secondGenBody.fixPlan.strategy).toBe('overlay-removal');
      expect(secondGenBody.fixPlan.preserve).toContain('logo');
      expect(secondGenBody.fixPlan.preserve).toContain('label');
      expect(secondGenBody.fixPlan.prohibited).toContain('watermark');

      expect(result.lastStrategy).toBe('overlay-removal');
    });
  });

  describe('non-payment generation failure', () => {
    it('retries on generic failure and throws after max attempts', async () => {
      mockBuildFixPlan.mockReturnValue(basePlan());
      mockInvoke
        .mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })
        .mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })
        .mockResolvedValueOnce({ data: null, error: { message: 'timeout' } });

      const cb = makeCallbacks();
      const promise = runFixOrchestration({ asset: makeAsset(), originalBase64: 'x' }, cb);
      await vi.advanceTimersByTimeAsync(30000);

      await expect(promise).rejects.toThrow();
      // Should NOT have isPayment
      try { await promise; } catch (e: any) {
        expect(e.isPayment).toBeUndefined();
      }
    });

    it('does not mislabel non-payment error as payment', async () => {
      mockBuildFixPlan.mockReturnValue(basePlan());
      const nonPaymentError = Object.assign(new Error('server error'), {
        context: { status: 500, body: JSON.stringify({ error: 'Internal error' }) },
      });
      mockInvoke
        .mockResolvedValueOnce({ data: null, error: nonPaymentError })
        .mockResolvedValueOnce({ data: null, error: nonPaymentError })
        .mockResolvedValueOnce({ data: null, error: nonPaymentError });

      const cb = makeCallbacks();
      const promise = runFixOrchestration({ asset: makeAsset(), originalBase64: 'x' }, cb);
      await vi.advanceTimersByTimeAsync(30000);

      await expect(promise).rejects.toThrow('Internal error');
    });
  });
});

// ── Tests: buildFixReviewPayload ──────────────────────────────

describe('buildFixReviewPayload', () => {
  it('serializes attempts with verification and retry decision subsets', () => {
    const attempts: FixAttempt[] = [
      {
        attempt: 1,
        generatedImage: 'img1',
        status: 'failed',
        strategyUsed: 'bg-cleanup',
        verification: { ...failVerification, thinkingSteps: ['step1'] },
        retryDecision: {
          shouldContinue: true,
          nextStrategy: 'inpaint-edit',
          rationale: 'try again',
          tightenedPreserve: ['x'],
          tightenedProhibited: ['y'],
          additionalInstructions: ['z'],
          stopReason: undefined,
        },
      },
      {
        attempt: 2,
        generatedImage: 'img2',
        status: 'passed',
        strategyUsed: 'inpaint-edit',
        isBestAttempt: true,
      },
    ];
    const selection: BestAttemptSelection = {
      selectedAttemptIndex: 1,
      selectedReason: 'Passed',
      selectionType: 'score-driven',
    };

    const payload = buildFixReviewPayload(attempts, selection, 'identity_drift', 'inpaint-edit', 'retry_stopped');

    expect(payload.attempts).toHaveLength(2);
    // Verification subset should not include thinkingSteps
    expect(payload.attempts[0].verification).toBeDefined();
    expect((payload.attempts[0].verification as any).thinkingSteps).toBeUndefined();
    // Retry decision subset should not include tightenedPreserve
    expect(payload.attempts[0].retryDecision).toBeDefined();
    expect((payload.attempts[0].retryDecision as any).tightenedPreserve).toBeUndefined();
    // Top-level fields
    expect(payload.bestAttemptSelection).toEqual(selection);
    expect(payload.stopReason).toBe('identity_drift');
    expect(payload.lastFixStrategy).toBe('inpaint-edit');
    expect(payload.unresolvedState).toBe('retry_stopped');
  });

  it('omits unresolvedState when not provided', () => {
    const payload = buildFixReviewPayload([], undefined, undefined, undefined);
    expect(payload).not.toHaveProperty('unresolvedState');
  });

  it('handles attempts with no verification or retry decision', () => {
    const attempts: FixAttempt[] = [
      { attempt: 1, generatedImage: 'img1', status: 'passed' },
    ];
    const payload = buildFixReviewPayload(attempts, undefined, undefined, 'bg-cleanup');
    expect(payload.attempts[0].verification).toBeUndefined();
    expect(payload.attempts[0].retryDecision).toBeUndefined();
    expect(payload.lastFixStrategy).toBe('bg-cleanup');
  });
});
