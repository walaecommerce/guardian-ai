import { describe, it, expect } from 'vitest';
import { classifyAssetFixability, partitionBatchFixTargets } from '@/utils/fixability';
import { isManualReviewAsset } from '@/components/ManualReviewLane';
import type { ImageAsset, Violation } from '@/types';

function makeAsset(overrides: Partial<ImageAsset> & { imageCategory?: string } = {}): ImageAsset {
  const { imageCategory, ...rest } = overrides;
  const analysisResult = rest.analysisResult ? {
    ...rest.analysisResult,
    ...(imageCategory ? { imageCategory } : {}),
  } : rest.analysisResult;
  return {
    id: '1',
    file: new File([''], 'test.jpg'),
    preview: 'test.jpg',
    type: 'SECONDARY',
    name: 'test.jpg',
    ...rest,
    ...(analysisResult ? { analysisResult } : {}),
  } as ImageAsset;
}

function makeViolation(message: string): Violation {
  return { severity: 'critical', category: 'test', message, recommendation: '' };
}

describe('Manual Review Lane - fixability classification', () => {
  it('SIZE_CHART classified as manual_review', () => {
    const asset = makeAsset({
      imageCategory: 'SIZE_CHART',
      analysisResult: {
        overallScore: 40, status: 'FAIL',
        violations: [makeViolation('text overlay')], fixRecommendations: [],
      },
    });
    const result = classifyAssetFixability(asset);
    expect(result.tier).toBe('manual_review');
    expect(result.skipInBatch).toBe(true);
  });

  it('COMPARISON classified as manual_review', () => {
    const asset = makeAsset({
      imageCategory: 'COMPARISON',
      analysisResult: {
        overallScore: 40, status: 'FAIL',
        violations: [makeViolation('some issue')], fixRecommendations: [],
      },
    });
    const result = classifyAssetFixability(asset);
    expect(result.tier).toBe('manual_review');
    expect(result.skipInBatch).toBe(true);
  });

  it('blur-only violations classified as warn_only', () => {
    const asset = makeAsset({
      analysisResult: {
        overallScore: 50, status: 'FAIL',
        violations: [makeViolation('image is blurry and out of focus')], fixRecommendations: [],
      },
    });
    const result = classifyAssetFixability(asset);
    expect(result.tier).toBe('warn_only');
    expect(result.skipInBatch).toBe(true);
  });

  it('LIFESTYLE with safe violations classified as auto_fixable', () => {
    const asset = makeAsset({
      imageCategory: 'LIFESTYLE',
      analysisResult: {
        overallScore: 60, status: 'FAIL',
        violations: [makeViolation('promotional overlay detected')], fixRecommendations: [],
      },
    });
    const result = classifyAssetFixability(asset);
    expect(result.tier).toBe('auto_fixable');
    expect(result.skipInBatch).toBe(false);
  });

  it('partitionBatchFixTargets separates fixable from skipped', () => {
    const fixableAsset = makeAsset({
      id: 'fixable',
      analysisResult: {
        overallScore: 60, status: 'FAIL',
        violations: [makeViolation('background issue')], fixRecommendations: [],
      },
    });
    const skippedAsset = makeAsset({
      id: 'skipped',
      analysisResult: {
        overallScore: 40, status: 'FAIL',
        violations: [makeViolation('blurry image')], fixRecommendations: [],
      },
    });
    const { fixable, skipped } = partitionBatchFixTargets([fixableAsset, skippedAsset]);
    expect(fixable).toHaveLength(1);
    expect(fixable[0].id).toBe('fixable');
    expect(skipped).toHaveLength(1);
    expect(skipped[0].asset.id).toBe('skipped');
  });
});

describe('isManualReviewAsset - unified check', () => {
  it('returns true for unresolvedState = manual_review', () => {
    expect(isManualReviewAsset(makeAsset({ unresolvedState: 'manual_review' }))).toBe(true);
  });

  it('returns true for unresolvedState = warn_only', () => {
    expect(isManualReviewAsset(makeAsset({ unresolvedState: 'warn_only' }))).toBe(true);
  });

  it('returns true for unresolvedState = retry_stopped', () => {
    expect(isManualReviewAsset(makeAsset({ unresolvedState: 'retry_stopped' }))).toBe(true);
  });

  it('returns true for unresolvedState = auto_fix_failed', () => {
    expect(isManualReviewAsset(makeAsset({ unresolvedState: 'auto_fix_failed' }))).toBe(true);
  });

  it('returns true for batchFixStatus = skipped (legacy)', () => {
    expect(isManualReviewAsset(makeAsset({ batchFixStatus: 'skipped' }))).toBe(true);
  });

  it('returns true for fixStopReason without fixedImage', () => {
    expect(isManualReviewAsset(makeAsset({ fixStopReason: 'repeated identity drift' }))).toBe(true);
  });

  it('returns false for fixStopReason WITH fixedImage', () => {
    expect(isManualReviewAsset(makeAsset({ fixStopReason: 'stopped', fixedImage: 'url' }))).toBe(false);
  });

  it('returns true for batchFixStatus = failed without fixedImage', () => {
    expect(isManualReviewAsset(makeAsset({ batchFixStatus: 'failed' }))).toBe(true);
  });

  it('returns false for normal asset with no issues', () => {
    expect(isManualReviewAsset(makeAsset({}))).toBe(false);
  });

  it('returns false for fixed asset', () => {
    expect(isManualReviewAsset(makeAsset({ fixedImage: 'url', batchFixStatus: 'fixed' }))).toBe(false);
  });
});

describe('Session hydration preserves unresolved state', () => {
  it('hydrateFixReview restores skipped state with unresolvedState', async () => {
    const { buildAssetFromSessionImage } = await import('@/utils/sessionAssetHelpers');
    const file = new File([''], 'test.jpg');
    const { asset } = buildAssetFromSessionImage(
      {
        id: 'img-1',
        image_name: 'test.jpg',
        image_type: 'SECONDARY',
        analysis_result: null,
        fix_attempts: { skipped: true, skipReason: 'Size Chart images contain structured data', fixabilityTier: 'manual_review', unresolvedState: 'manual_review' },
      },
      file,
      'http://example.com/test.jpg',
    );
    expect(asset.batchFixStatus).toBe('skipped');
    expect(asset.batchSkipReason).toBe('Size Chart images contain structured data');
    expect(asset.fixabilityTier).toBe('manual_review');
    expect(asset.unresolvedState).toBe('manual_review');
    expect(isManualReviewAsset(asset)).toBe(true);
  });

  it('hydrateFixReview restores retry_stopped state', async () => {
    const { buildAssetFromSessionImage } = await import('@/utils/sessionAssetHelpers');
    const file = new File([''], 'test.jpg');
    const { asset } = buildAssetFromSessionImage(
      {
        id: 'img-2',
        image_name: 'test.jpg',
        image_type: 'SECONDARY',
        analysis_result: null,
        fix_attempts: {
          attempts: [{ attempt: 1, status: 'failed', verification: { score: 40, critique: 'test' } }],
          stopReason: 'repeated context preservation failure',
          lastFixStrategy: 'inpaint-edit',
          unresolvedState: 'retry_stopped',
        },
      },
      file,
      'http://example.com/test.jpg',
    );
    expect(asset.fixStopReason).toBe('repeated context preservation failure');
    expect(asset.unresolvedState).toBe('retry_stopped');
    expect(isManualReviewAsset(asset)).toBe(true);
  });

  it('hydrateFixReview restores auto_fix_failed state', async () => {
    const { buildAssetFromSessionImage } = await import('@/utils/sessionAssetHelpers');
    const file = new File([''], 'test.jpg');
    const { asset } = buildAssetFromSessionImage(
      {
        id: 'img-3',
        image_name: 'test.jpg',
        image_type: 'SECONDARY',
        analysis_result: null,
        fix_attempts: {
          attempts: [{ attempt: 1, status: 'failed' }, { attempt: 2, status: 'failed' }],
          stopReason: 'No acceptable fix produced after all attempts',
          unresolvedState: 'auto_fix_failed',
        },
      },
      file,
      'http://example.com/test.jpg',
    );
    expect(asset.unresolvedState).toBe('auto_fix_failed');
    expect(asset.batchFixStatus).toBe('failed');
    expect(isManualReviewAsset(asset)).toBe(true);
  });

  it('legacy data without unresolvedState still inferred from stopReason', async () => {
    const { buildAssetFromSessionImage } = await import('@/utils/sessionAssetHelpers');
    const file = new File([''], 'test.jpg');
    const { asset } = buildAssetFromSessionImage(
      {
        id: 'img-4',
        image_name: 'test.jpg',
        image_type: 'SECONDARY',
        analysis_result: null,
        fix_attempts: {
          attempts: [{ attempt: 1, status: 'failed' }],
          stopReason: 'repeated identity drift on MAIN image',
        },
      },
      file,
      'http://example.com/test.jpg',
    );
    expect(asset.fixStopReason).toBe('repeated identity drift on MAIN image');
    expect(asset.unresolvedState).toBe('retry_stopped');
    expect(isManualReviewAsset(asset)).toBe(true);
  });
});

describe('Skipped images not treated as fixed', () => {
  it('skipped assets are excluded from fixable partition', () => {
    const sizeChart = makeAsset({
      id: 'sc-1',
      imageCategory: 'SIZE_CHART',
      analysisResult: {
        overallScore: 40, status: 'FAIL',
        violations: [makeViolation('text overlay')], fixRecommendations: [],
      },
    });
    const { fixable, skipped } = partitionBatchFixTargets([sizeChart]);
    expect(fixable).toHaveLength(0);
    expect(skipped).toHaveLength(1);
  });
});

describe('Enhancement hydration', () => {
  it('hydrateFixReview restores fixMethod: enhancement from persisted data', async () => {
    const { buildAssetFromSessionImage } = await import('@/utils/sessionAssetHelpers');
    const file = new File([''], 'test.jpg');
    const { asset } = buildAssetFromSessionImage(
      {
        id: 'img-enh',
        image_name: 'LIFESTYLE_test.jpg',
        image_type: 'SECONDARY',
        analysis_result: { status: 'PASS', overallScore: 80 },
        fix_attempts: { fixMethod: 'enhancement' },
        fixed_image_url: 'http://example.com/enhanced.jpg',
      },
      file,
      'http://example.com/original.jpg',
      'http://example.com/enhanced.jpg',
    );
    expect(asset.fixMethod).toBe('enhancement');
    expect(asset.fixedImage).toBe('http://example.com/enhanced.jpg');
  });

  it('enhanced assets are excluded from enhanceable count', async () => {
    const enhanced: ImageAsset = {
      ...makeAsset({ id: 'enh-1' }),
      fixedImage: 'http://example.com/enhanced.jpg',
      fixMethod: 'enhancement',
      analysisResult: { status: 'PASS', overallScore: 80 } as any,
    };
    const notEnhanced: ImageAsset = {
      ...makeAsset({ id: 'enh-2' }),
      fixedImage: 'http://example.com/fixed.jpg',
      fixMethod: 'bg-segmentation',
      analysisResult: { status: 'PASS', overallScore: 80 } as any,
    };
    const mainImage: ImageAsset = {
      ...makeAsset({ id: 'main-1' }),
      type: 'MAIN',
      analysisResult: { status: 'PASS', overallScore: 80 } as any,
    };
    const all = [enhanced, notEnhanced, mainImage];
    // Same filter used in FixStep and useAuditSession
    const enhanceable = all.filter(a => a.type !== 'MAIN' && a.analysisResult && (!a.fixedImage || a.fixMethod !== 'enhancement'));
    expect(enhanceable).toHaveLength(1);
    expect(enhanceable[0].id).toBe('enh-2');
  });
});
