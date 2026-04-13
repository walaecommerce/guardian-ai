/**
 * renderHook-level integration tests for useAuditSession.
 *
 * Validates the real React state updates produced by handleRequestFix
 * and handleBatchFix with mocked Supabase, orchestrator, and fixability.
 *
 * These tests fill the gap between pure helper tests and runtime wiring:
 * they exercise React's state batching and verify that the hook's returned
 * `assets` array reflects the correct state after each action.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ImageAsset, FixAttempt, FixStrategy, BestAttemptSelection } from '@/types';

// ── Module mocks ───────────────────────────────────────────────
// Must be hoisted before any imports that touch these modules.

const mockSupabaseFrom = vi.fn();
const mockSupabaseFunctionsInvoke = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: any[]) => mockSupabaseFrom(...args),
    functions: { invoke: (...args: any[]) => mockSupabaseFunctionsInvoke(...args) },
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'test-user' } } }) },
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user' }, isAdmin: false, session: null, profile: null, isLoading: false, signOut: vi.fn(), refreshProfile: vi.fn(), markOnboardingComplete: vi.fn() }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'test-user' }, isAdmin: false, session: null, profile: null, isLoading: false, signOut: vi.fn(), refreshProfile: vi.fn(), markOnboardingComplete: vi.fn() }),
  AuthProvider: ({ children }: any) => children,
}));

vi.mock('@/hooks/useCredits', () => ({
  useCredits: () => ({ credits: [], loading: false, hasCredits: () => true, refresh: vi.fn(), remaining: () => 99, plan: () => 'pro' }),
}));

vi.mock('@/hooks/useCreditGate', () => ({
  useCreditGate: () => ({ guard: () => true, hasCredits: () => true }),
}));

vi.mock('@/hooks/useSessionLoader', () => ({
  useSessionLoader: () => ({ loadSession: vi.fn().mockResolvedValue(null), isLoading: false, error: null }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/services/imageStorage', () => ({
  uploadImage: vi.fn().mockResolvedValue({ url: 'https://storage.test/uploaded.jpg' }),
}));

vi.mock('@/services/eventLog', () => ({
  logEvent: vi.fn(),
}));

vi.mock('@/components/ComplianceHistory', () => ({
  saveAuditToHistory: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// Mock fixability — controlled per-test
const mockClassifyAssetFixability = vi.fn();
const mockPartitionBatchFixTargets = vi.fn();
vi.mock('@/utils/fixability', () => ({
  classifyAssetFixability: (...args: any[]) => mockClassifyAssetFixability(...args),
  partitionBatchFixTargets: (...args: any[]) => mockPartitionBatchFixTargets(...args),
}));

// Mock fixOrchestrator — controlled per-test
const mockRunFixOrchestration = vi.fn();
vi.mock('@/utils/fixOrchestrator', () => ({
  runFixOrchestration: (...args: any[]) => mockRunFixOrchestration(...args),
  buildFixReviewPayload: vi.fn((...args: any[]) => {
    // Use the real implementation
    const [allAttempts, bestSel, stopReason, lastStrategy, unresolvedState] = args;
    return {
      attempts: (allAttempts || []).map((a: any) => ({
        attempt: a.attempt,
        status: a.status,
        strategyUsed: a.strategyUsed,
        isBestAttempt: a.isBestAttempt,
      })),
      bestAttemptSelection: bestSel,
      stopReason,
      lastFixStrategy: lastStrategy,
      ...(unresolvedState ? { unresolvedState } : {}),
    };
  }),
}));

// Mock deterministicAudit
vi.mock('@/utils/deterministicAudit', () => ({
  runDeterministicAudit: vi.fn().mockResolvedValue({ findings: [] }),
}));

// Mock imageClassifier
vi.mock('@/services/imageClassifier', () => ({
  classifyImage: vi.fn().mockResolvedValue({ category: 'UNKNOWN', confidence: 0, reasoning: 'mock' }),
}));

// Mock amazonScraper
vi.mock('@/services/amazonScraper', () => ({
  scrapeAmazonProduct: vi.fn(),
  downloadImage: vi.fn(),
  getImageId: vi.fn(),
  extractAsin: vi.fn().mockReturnValue(null),
  getCanonicalImageKey: vi.fn((url: string) => url),
}));

// ── Import hook after mocks ───────────────────────────────────

import { useAuditSession } from '@/hooks/useAuditSession';

// ── Test helpers ──────────────────────────────────────────────

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
      violations: [{ severity: 'critical', category: 'bg', message: 'Bad bg', recommendation: 'Fix' }],
      fixRecommendations: ['Fix bg'],
    },
    ...overrides,
  } as ImageAsset;
}

function setupSupabaseMock() {
  mockSupabaseFrom.mockReturnValue({
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue(Promise.resolve({ error: null })),
    }),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'session-1' }, error: null }),
      }),
    }),
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }),
  });
}

// ── Tests ─────────────────────────────────────────────────────

describe('useAuditSession renderHook: manual-review rejection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSupabaseMock();
  });

  it('updates asset state with manual_review rejection fields', async () => {
    const asset = stubAsset({ id: 'mr-1' });
    mockClassifyAssetFixability.mockReturnValue({
      tier: 'manual_review',
      reason: 'Contains structured data (size chart)',
    });

    const { result } = renderHook(() => useAuditSession());

    // Seed asset into state
    act(() => {
      result.current.setAssets([asset]);
    });

    expect(result.current.assets).toHaveLength(1);

    // Call handleRequestFix — will hit fixability rejection
    await act(async () => {
      await result.current.handleRequestFix('mr-1');
    });

    const updated = result.current.assets.find(a => a.id === 'mr-1');
    expect(updated).toBeDefined();
    expect(updated!.fixabilityTier).toBe('manual_review');
    expect(updated!.unresolvedState).toBe('manual_review');
    expect(updated!.batchFixStatus).toBe('skipped');
    expect(updated!.batchSkipReason).toBe('Contains structured data (size chart)');
  });

  it('updates asset state with warn_only rejection fields', async () => {
    const asset = stubAsset({ id: 'wo-1' });
    mockClassifyAssetFixability.mockReturnValue({
      tier: 'warn_only',
      reason: 'Low resolution source image',
    });

    const { result } = renderHook(() => useAuditSession());

    act(() => {
      result.current.setAssets([asset]);
    });

    await act(async () => {
      await result.current.handleRequestFix('wo-1');
    });

    const updated = result.current.assets.find(a => a.id === 'wo-1');
    expect(updated!.fixabilityTier).toBe('warn_only');
    expect(updated!.unresolvedState).toBe('warn_only');
    expect(updated!.batchFixStatus).toBe('skipped');
    expect(updated!.batchSkipReason).toBe('Low resolution source image');
  });

  it('does not call runFixOrchestration for rejected assets', async () => {
    const asset = stubAsset({ id: 'skip-1' });
    mockClassifyAssetFixability.mockReturnValue({
      tier: 'manual_review',
      reason: 'Infographic',
    });

    const { result } = renderHook(() => useAuditSession());
    act(() => { result.current.setAssets([asset]); });

    await act(async () => {
      await result.current.handleRequestFix('skip-1');
    });

    expect(mockRunFixOrchestration).not.toHaveBeenCalled();
  });
});

describe('useAuditSession renderHook: successful fix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSupabaseMock();
  });

  it('updates asset with all fix result fields after successful orchestration', async () => {
    const asset = stubAsset({ id: 'fix-1' });

    mockClassifyAssetFixability.mockReturnValue({
      tier: 'auto_fixable',
      reason: 'Fixable',
    });

    const mockAttempts: FixAttempt[] = [
      { attempt: 1, generatedImage: 'gen-img-1', status: 'passed', strategyUsed: 'bg-cleanup' },
    ];
    const mockBestSel: BestAttemptSelection = {
      selectedAttemptIndex: 0,
      selectedReason: 'Passed verification',
      selectionType: 'score-driven',
    };

    mockRunFixOrchestration.mockResolvedValue({
      finalImage: 'gen-img-1',
      allAttempts: mockAttempts,
      bestAttemptSelection: mockBestSel,
      stopReason: undefined,
      lastStrategy: 'bg-cleanup' as FixStrategy,
      lastFixMethod: 'surgical-edit' as const,
    });

    const { result } = renderHook(() => useAuditSession());
    act(() => { result.current.setAssets([asset]); });

    await act(async () => {
      await result.current.handleRequestFix('fix-1');
    });

    const updated = result.current.assets.find(a => a.id === 'fix-1');
    expect(updated).toBeDefined();
    expect(updated!.fixedImage).toBe('gen-img-1');
    expect(updated!.fixMethod).toBe('surgical-edit');
    expect(updated!.fixAttempts).toHaveLength(1);
    expect(updated!.bestAttemptSelection).toEqual(mockBestSel);
    expect(updated!.selectedAttemptIndex).toBe(0);
    expect(updated!.lastFixStrategy).toBe('bg-cleanup');
    expect(updated!.isGeneratingFix).toBe(false);
    // Fixed asset should NOT be marked as unresolved
    expect(updated!.unresolvedState).toBeUndefined();
  });

  it('clears fixProgress after successful fix', async () => {
    const asset = stubAsset({ id: 'fix-2' });
    mockClassifyAssetFixability.mockReturnValue({ tier: 'auto_fixable', reason: 'Fixable' });
    mockRunFixOrchestration.mockResolvedValue({
      finalImage: 'img',
      allAttempts: [{ attempt: 1, generatedImage: 'img', status: 'passed', strategyUsed: 'bg-cleanup' }],
      bestAttemptSelection: undefined,
      stopReason: undefined,
      lastStrategy: 'bg-cleanup',
      lastFixMethod: 'surgical-edit',
    });

    const { result } = renderHook(() => useAuditSession());
    act(() => { result.current.setAssets([asset]); });

    await act(async () => {
      await result.current.handleRequestFix('fix-2');
    });

    expect(result.current.fixProgress).toBeNull();
  });
});

describe('useAuditSession renderHook: retry-stopped / auto-fix-failed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSupabaseMock();
  });

  it('sets retry_stopped state when orchestration returns stopReason without finalImage', async () => {
    const asset = stubAsset({ id: 'rs-1' });
    mockClassifyAssetFixability.mockReturnValue({ tier: 'auto_fixable', reason: 'Fixable' });

    mockRunFixOrchestration.mockResolvedValue({
      finalImage: undefined,
      allAttempts: [{ attempt: 1, generatedImage: 'img1', status: 'failed', strategyUsed: 'bg-cleanup' }],
      bestAttemptSelection: undefined,
      stopReason: 'identity_drift',
      lastStrategy: 'bg-cleanup' as FixStrategy,
      lastFixMethod: undefined,
    });

    const { result } = renderHook(() => useAuditSession());
    act(() => { result.current.setAssets([asset]); });

    await act(async () => {
      await result.current.handleRequestFix('rs-1');
    });

    const updated = result.current.assets.find(a => a.id === 'rs-1');
    expect(updated!.unresolvedState).toBe('retry_stopped');
    expect(updated!.fixStopReason).toBe('identity_drift');
    expect(updated!.batchFixStatus).toBe('failed');
    expect(updated!.isGeneratingFix).toBe(false);
    expect(updated!.fixedImage).toBeUndefined();
  });

  it('sets auto_fix_failed state when no stopReason and no finalImage', async () => {
    const asset = stubAsset({ id: 'af-1' });
    mockClassifyAssetFixability.mockReturnValue({ tier: 'auto_fixable', reason: 'Fixable' });

    mockRunFixOrchestration.mockResolvedValue({
      finalImage: undefined,
      allAttempts: [],
      bestAttemptSelection: undefined,
      stopReason: undefined,
      lastStrategy: undefined,
      lastFixMethod: undefined,
    });

    const { result } = renderHook(() => useAuditSession());
    act(() => { result.current.setAssets([asset]); });

    await act(async () => {
      await result.current.handleRequestFix('af-1');
    });

    const updated = result.current.assets.find(a => a.id === 'af-1');
    expect(updated!.unresolvedState).toBe('auto_fix_failed');
    expect(updated!.fixStopReason).toBe('No acceptable fix produced after all attempts');
    expect(updated!.batchFixStatus).toBe('failed');
  });
});

describe('useAuditSession renderHook: payment error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSupabaseMock();
  });

  it('clears isGeneratingFix on payment error without setting unresolved state', async () => {
    const asset = stubAsset({ id: 'pe-1' });
    mockClassifyAssetFixability.mockReturnValue({ tier: 'auto_fixable', reason: 'Fixable' });

    mockRunFixOrchestration.mockRejectedValue(
      Object.assign(new Error('No fix credits remaining'), { isPayment: true }),
    );

    const { result } = renderHook(() => useAuditSession());
    act(() => { result.current.setAssets([asset]); });

    await act(async () => {
      await result.current.handleRequestFix('pe-1');
    });

    const updated = result.current.assets.find(a => a.id === 'pe-1');
    expect(updated!.isGeneratingFix).toBe(false);
    // Payment errors don't set unresolved state — asset stays as-is
    expect(updated!.unresolvedState).toBeUndefined();
    expect(updated!.fixedImage).toBeUndefined();
  });
});

describe('useAuditSession renderHook: batch fix skip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSupabaseMock();
  });

  it('marks skipped assets and only processes fixable ones', async () => {
    const fixable = stubAsset({ id: 'b-1' });
    const manualReview = stubAsset({ id: 'b-2' });
    const warnOnly = stubAsset({ id: 'b-3' });

    // partitionBatchFixTargets returns fixable vs skipped
    mockPartitionBatchFixTargets.mockReturnValue({
      fixable: [fixable],
      skipped: [
        { asset: manualReview, reason: 'Infographic' },
        { asset: warnOnly, reason: 'Low resolution' },
      ],
    });

    // classifyAssetFixability for the skipped items
    mockClassifyAssetFixability.mockImplementation((a: ImageAsset) => {
      if (a.id === 'b-2') return { tier: 'manual_review', reason: 'Infographic' };
      if (a.id === 'b-3') return { tier: 'warn_only', reason: 'Low resolution' };
      return { tier: 'auto_fixable', reason: 'Fixable' };
    });

    // Mock the orchestrator for the fixable asset
    mockRunFixOrchestration.mockResolvedValue({
      finalImage: 'fixed-b1',
      allAttempts: [{ attempt: 1, generatedImage: 'fixed-b1', status: 'passed', strategyUsed: 'bg-cleanup' }],
      bestAttemptSelection: undefined,
      stopReason: undefined,
      lastStrategy: 'bg-cleanup',
      lastFixMethod: 'surgical-edit',
    });

    const { result } = renderHook(() => useAuditSession());
    act(() => { result.current.setAssets([fixable, manualReview, warnOnly]); });

    await act(async () => {
      await result.current.handleBatchFix();
    });

    const assets = result.current.assets;

    // Skipped assets should have unresolvedState set
    const mr = assets.find(a => a.id === 'b-2');
    expect(mr!.unresolvedState).toBe('manual_review');
    expect(mr!.batchFixStatus).toBe('skipped');

    const wo = assets.find(a => a.id === 'b-3');
    expect(wo!.unresolvedState).toBe('warn_only');
    expect(wo!.batchFixStatus).toBe('skipped');

    // Fixable asset should have been fixed
    const fixed = assets.find(a => a.id === 'b-1');
    expect(fixed!.fixedImage).toBe('fixed-b1');
  });
});

// ── Smoke QA: mixed state coherence ────────────────────────────

describe('smoke QA: mixed asset state coherence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSupabaseMock();
  });

  it('three assets (fixed, manual_review, retry_stopped) produce coherent state', async () => {
    const fixableAsset = stubAsset({ id: 's-1' });
    const mrAsset = stubAsset({ id: 's-2' });
    const retryAsset = stubAsset({ id: 's-3' });

    // Process each sequentially
    const { result } = renderHook(() => useAuditSession());
    act(() => { result.current.setAssets([fixableAsset, mrAsset, retryAsset]); });

    // 1. Fix s-1 successfully
    mockClassifyAssetFixability.mockReturnValue({ tier: 'auto_fixable', reason: 'Fixable' });
    mockRunFixOrchestration.mockResolvedValue({
      finalImage: 'fixed-s1',
      allAttempts: [{ attempt: 1, generatedImage: 'fixed-s1', status: 'passed', strategyUsed: 'bg-cleanup' }],
      bestAttemptSelection: undefined,
      stopReason: undefined,
      lastStrategy: 'bg-cleanup',
      lastFixMethod: 'surgical-edit',
    });

    await act(async () => { await result.current.handleRequestFix('s-1'); });

    // 2. Reject s-2 as manual_review
    mockClassifyAssetFixability.mockReturnValue({ tier: 'manual_review', reason: 'Size chart' });
    await act(async () => { await result.current.handleRequestFix('s-2'); });

    // 3. Fail s-3 with retry_stopped
    mockClassifyAssetFixability.mockReturnValue({ tier: 'auto_fixable', reason: 'Fixable' });
    mockRunFixOrchestration.mockResolvedValue({
      finalImage: undefined,
      allAttempts: [{ attempt: 1, generatedImage: 'img', status: 'failed', strategyUsed: 'bg-cleanup' }],
      bestAttemptSelection: undefined,
      stopReason: 'identity_drift',
      lastStrategy: 'bg-cleanup',
      lastFixMethod: undefined,
    });

    await act(async () => { await result.current.handleRequestFix('s-3'); });

    // Verify final state coherence
    const assets = result.current.assets;

    const s1 = assets.find(a => a.id === 's-1')!;
    expect(s1.fixedImage).toBe('fixed-s1');
    expect(s1.unresolvedState).toBeUndefined();

    const s2 = assets.find(a => a.id === 's-2')!;
    expect(s2.unresolvedState).toBe('manual_review');
    expect(s2.batchFixStatus).toBe('skipped');
    expect(s2.fixedImage).toBeUndefined();

    const s3 = assets.find(a => a.id === 's-3')!;
    expect(s3.unresolvedState).toBe('retry_stopped');
    expect(s3.batchFixStatus).toBe('failed');
    expect(s3.fixStopReason).toBe('identity_drift');
    expect(s3.fixedImage).toBeUndefined();

    // Import the counting helpers to verify consistency
    const { computeUnresolvedCounts } = await import('@/utils/sessionHelpers');
    const { isManualReviewAsset } = await import('@/components/ManualReviewLane');

    const counts = computeUnresolvedCounts(assets);
    const mrCount = assets.filter(isManualReviewAsset).length;

    // Unresolved count = isManualReviewAsset count
    expect(counts.unresolved_count).toBe(mrCount);
    expect(counts.unresolved_count).toBe(2); // s-2 + s-3
    expect(counts.skipped_count).toBe(1); // only s-2

    // Fixed count
    expect(assets.filter(a => a.fixedImage).length).toBe(1);
  });
});
