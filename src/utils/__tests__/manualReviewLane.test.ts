import { describe, it, expect } from 'vitest';
import { classifyAssetFixability, partitionBatchFixTargets } from '@/utils/fixability';
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
      analysisResult: {
        overallScore: 40,
        status: 'FAIL',
        violations: [makeViolation('text overlay')],
        fixRecommendations: [],
        productCategory: 'SIZE_CHART',
      },
    });
    const result = classifyAssetFixability(asset);
    expect(result.tier).toBe('manual_review');
    expect(result.skipInBatch).toBe(true);
  });

  it('COMPARISON classified as manual_review', () => {
    const asset = makeAsset({
      analysisResult: {
        overallScore: 40,
        status: 'FAIL',
        violations: [makeViolation('some issue')],
        fixRecommendations: [],
        productCategory: 'COMPARISON',
      },
    });
    const result = classifyAssetFixability(asset);
    expect(result.tier).toBe('manual_review');
    expect(result.skipInBatch).toBe(true);
  });

  it('blur-only violations classified as warn_only', () => {
    const asset = makeAsset({
      analysisResult: {
        overallScore: 50,
        status: 'FAIL',
        violations: [makeViolation('image is blurry and out of focus')],
        fixRecommendations: [],
      },
    });
    const result = classifyAssetFixability(asset);
    expect(result.tier).toBe('warn_only');
    expect(result.skipInBatch).toBe(true);
  });

  it('LIFESTYLE with safe violations classified as auto_fixable', () => {
    const asset = makeAsset({
      analysisResult: {
        overallScore: 60,
        status: 'FAIL',
        violations: [makeViolation('promotional overlay detected')],
        fixRecommendations: [],
        productCategory: 'LIFESTYLE',
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
        overallScore: 60,
        status: 'FAIL',
        violations: [makeViolation('background issue')],
        fixRecommendations: [],
      },
    });
    const skippedAsset = makeAsset({
      id: 'skipped',
      analysisResult: {
        overallScore: 40,
        status: 'FAIL',
        violations: [makeViolation('blurry image')],
        fixRecommendations: [],
      },
    });
    const { fixable, skipped } = partitionBatchFixTargets([fixableAsset, skippedAsset]);
    expect(fixable).toHaveLength(1);
    expect(fixable[0].id).toBe('fixable');
    expect(skipped).toHaveLength(1);
    expect(skipped[0].asset.id).toBe('skipped');
    expect(skipped[0].reason).toContain('blur');
  });
});

describe('Session hydration preserves skip state', () => {
  it('hydrateFixReview restores skipped state from fix_attempts JSON', async () => {
    const { buildAssetFromSessionImage } = await import('@/utils/sessionAssetHelpers');
    const file = new File([''], 'test.jpg');
    const { asset } = buildAssetFromSessionImage(
      {
        id: 'img-1',
        image_name: 'test.jpg',
        image_type: 'SECONDARY',
        analysis_result: null,
        fix_attempts: { skipped: true, skipReason: 'Size Chart images contain structured data', fixabilityTier: 'manual_review' },
      },
      file,
      'http://example.com/test.jpg',
    );
    expect(asset.batchFixStatus).toBe('skipped');
    expect(asset.batchSkipReason).toBe('Size Chart images contain structured data');
    expect(asset.fixabilityTier).toBe('manual_review');
  });

  it('hydrateFixReview restores stop reason from fix_attempts JSON', async () => {
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
        },
      },
      file,
      'http://example.com/test.jpg',
    );
    expect(asset.fixStopReason).toBe('repeated context preservation failure');
    expect(asset.lastFixStrategy).toBe('inpaint-edit');
  });
});

describe('Skipped images not treated as fixed', () => {
  it('skipped assets are excluded from fixable partition', () => {
    const sizeChart = makeAsset({
      id: 'sc-1',
      analysisResult: {
        overallScore: 40,
        status: 'FAIL',
        violations: [makeViolation('text overlay')],
        fixRecommendations: [],
        productCategory: 'SIZE_CHART',
      },
    });
    const { fixable, skipped } = partitionBatchFixTargets([sizeChart]);
    expect(fixable).toHaveLength(0);
    expect(skipped).toHaveLength(1);
  });
});
