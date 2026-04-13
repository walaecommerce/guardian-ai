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
