import { describe, it, expect } from 'vitest';
import { humanizeSessionStatus, getSessionActionLabel, isStudioSession, computeUnresolvedCounts } from '../sessionHelpers';
import { isManualReviewAsset } from '@/components/ManualReviewLane';
import type { ImageAsset } from '@/types';

function stub(overrides: Partial<ImageAsset> = {}): ImageAsset {
  return {
    id: Math.random().toString(),
    file: new File([], 'x.jpg'),
    preview: '',
    type: 'SECONDARY',
    name: 'x.jpg',
    ...overrides,
  } as ImageAsset;
}

describe('humanizeSessionStatus', () => {
  it('converts in_progress to In Progress', () => {
    expect(humanizeSessionStatus('in_progress')).toBe('In Progress');
  });
  it('converts completed to Completed', () => {
    expect(humanizeSessionStatus('completed')).toBe('Completed');
  });
  it('title-cases unknown statuses', () => {
    expect(humanizeSessionStatus('needs_review')).toBe('Needs Review');
  });
});

describe('getSessionActionLabel', () => {
  it('returns Continue Fixing for in-progress with unfixed failures', () => {
    expect(getSessionActionLabel({ status: 'in_progress', failed_count: 3, fixed_count: 1, total_images: 5 }))
      .toBe('Continue Fixing');
  });
  it('returns Continue Working for in-progress with no failures', () => {
    expect(getSessionActionLabel({ status: 'in_progress', failed_count: 0, fixed_count: 0, total_images: 5 }))
      .toBe('Continue Working');
  });
  it('returns Review & Fix Issues for completed with unfixed failures', () => {
    expect(getSessionActionLabel({ status: 'completed', failed_count: 2, fixed_count: 0, total_images: 5 }))
      .toBe('Review & Fix Issues');
  });
  it('returns Review Session for completed with all fixed', () => {
    expect(getSessionActionLabel({ status: 'completed', failed_count: 2, fixed_count: 2, total_images: 5 }))
      .toBe('Review Session');
  });
});

describe('isStudioSession', () => {
  it('returns true for studio origin', () => {
    expect(isStudioSession({ origin: 'studio', template: 'hero' })).toBe(true);
  });
  it('returns false for null', () => {
    expect(isStudioSession(null)).toBe(false);
  });
  it('returns false for non-studio identity', () => {
    expect(isStudioSession({ productName: 'Test' })).toBe(false);
  });
});

// ── computeUnresolvedCounts consistency with isManualReviewAsset ──

describe('computeUnresolvedCounts', () => {
  const cases: { label: string; asset: Partial<ImageAsset>; expectUnresolved: boolean }[] = [
    { label: 'unresolvedState=manual_review', asset: { unresolvedState: 'manual_review' }, expectUnresolved: true },
    { label: 'unresolvedState=warn_only', asset: { unresolvedState: 'warn_only' }, expectUnresolved: true },
    { label: 'unresolvedState=retry_stopped', asset: { unresolvedState: 'retry_stopped' }, expectUnresolved: true },
    { label: 'unresolvedState=auto_fix_failed', asset: { unresolvedState: 'auto_fix_failed' }, expectUnresolved: true },
    { label: 'unresolvedState=skipped', asset: { unresolvedState: 'skipped' }, expectUnresolved: true },
    { label: 'batchFixStatus=failed without fix', asset: { batchFixStatus: 'failed' }, expectUnresolved: true },
    { label: 'fixStopReason without fix', asset: { fixStopReason: 'identity_drift' }, expectUnresolved: true },
    { label: 'fixabilityTier=manual_review', asset: { fixabilityTier: 'manual_review' }, expectUnresolved: true },
    { label: 'fixabilityTier=warn_only', asset: { fixabilityTier: 'warn_only' }, expectUnresolved: true },
    { label: 'batchFixStatus=skipped', asset: { batchFixStatus: 'skipped' }, expectUnresolved: true },
    { label: 'fixed image is not unresolved', asset: { fixedImage: 'data:img', batchFixStatus: 'fixed' }, expectUnresolved: false },
    { label: 'passed image is not unresolved', asset: { analysisResult: { overallScore: 95, status: 'PASS', violations: [], fixRecommendations: [] } }, expectUnresolved: false },
    { label: 'batchFixStatus=failed WITH fix is not unresolved', asset: { batchFixStatus: 'failed', fixedImage: 'data:img' }, expectUnresolved: false },
    { label: 'fixStopReason WITH fix is not unresolved', asset: { fixStopReason: 'drift', fixedImage: 'data:img' }, expectUnresolved: false },
  ];

  cases.forEach(({ label, asset, expectUnresolved }) => {
    it(`${label} → isManualReviewAsset=${expectUnresolved}, computeUnresolvedCounts agrees`, () => {
      const a = stub(asset);
      const predicate = isManualReviewAsset(a);
      expect(predicate).toBe(expectUnresolved);
      const { unresolved_count } = computeUnresolvedCounts([a]);
      expect(unresolved_count).toBe(expectUnresolved ? 1 : 0);
    });
  });

  it('counts a mixed asset set correctly', () => {
    const assets = [
      stub({ analysisResult: { overallScore: 95, status: 'PASS', violations: [], fixRecommendations: [] } }), // passed
      stub({ fixedImage: 'data:img', batchFixStatus: 'fixed' }), // fixed
      stub({ unresolvedState: 'skipped', batchFixStatus: 'skipped' }), // skipped
      stub({ unresolvedState: 'retry_stopped', fixStopReason: 'drift' }), // retry stopped
      stub({ batchFixStatus: 'failed' }), // auto-fix failed (no unresolvedState)
    ];
    const { unresolved_count, skipped_count } = computeUnresolvedCounts(assets);
    expect(unresolved_count).toBe(3); // skipped + retry_stopped + failed
    expect(skipped_count).toBe(1);    // only the batchFixStatus=skipped one
    // Verify matches isManualReviewAsset count
    expect(assets.filter(isManualReviewAsset).length).toBe(unresolved_count);
  });

  it('does not count fixed images as unresolved even with fixStopReason', () => {
    const assets = [
      stub({ fixedImage: 'data:img', fixStopReason: 'partial', batchFixStatus: 'fixed' }),
      stub({ fixedImage: 'data:img', unresolvedState: undefined }),
    ];
    const { unresolved_count } = computeUnresolvedCounts(assets);
    expect(unresolved_count).toBe(0);
  });
});
