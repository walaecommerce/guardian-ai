import { describe, it, expect } from 'vitest';
import { classifyViolationFixability, classifyAssetFixability, partitionBatchFixTargets } from '../fixability';
import type { ImageAsset, Violation } from '@/types';

function makeAsset(overrides: Partial<ImageAsset> & { name: string }): ImageAsset {
  return {
    id: '1',
    file: new File([], 'test.jpg'),
    preview: '',
    type: 'SECONDARY',
    ...overrides,
  };
}

function makeViolation(overrides: Partial<Violation>): Violation {
  return {
    severity: 'warning',
    category: 'Test',
    message: 'Test violation',
    recommendation: 'Fix it',
    ...overrides,
  };
}

describe('classifyViolationFixability', () => {
  it('blur → warn_only', () => {
    expect(classifyViolationFixability(makeViolation({ message: 'Image is blurry' }))).toBe('warn_only');
  });

  it('low resolution → warn_only', () => {
    expect(classifyViolationFixability(makeViolation({ message: 'Low resolution detected' }))).toBe('warn_only');
  });

  it('pixelation → warn_only', () => {
    expect(classifyViolationFixability(makeViolation({ message: 'Pixelation artifacts visible' }))).toBe('warn_only');
  });

  it('sharpness → warn_only', () => {
    expect(classifyViolationFixability(makeViolation({ message: 'Poor sharpness quality' }))).toBe('warn_only');
  });

  it('background → auto_fixable', () => {
    expect(classifyViolationFixability(makeViolation({ message: 'Background is not white' }))).toBe('auto_fixable');
  });

  it('overlay → auto_fixable', () => {
    expect(classifyViolationFixability(makeViolation({ message: 'Promotional badge overlay detected' }))).toBe('auto_fixable');
  });

  it('occupancy → auto_fixable', () => {
    expect(classifyViolationFixability(makeViolation({ message: 'Product occupies only 60% of frame' }))).toBe('auto_fixable');
  });
});

describe('classifyAssetFixability', () => {
  it('SIZE_CHART → manual_review, skipInBatch', () => {
    const asset = makeAsset({ name: 'SIZE_CHART_1.jpg', analysisResult: { overallScore: 50, status: 'FAIL', violations: [makeViolation({ message: 'Text overlay' })], fixRecommendations: [] } });
    const result = classifyAssetFixability(asset);
    expect(result.tier).toBe('manual_review');
    expect(result.skipInBatch).toBe(true);
  });

  it('COMPARISON → manual_review, skipInBatch', () => {
    const asset = makeAsset({ name: 'COMPARISON_1.jpg', analysisResult: { overallScore: 50, status: 'FAIL', violations: [makeViolation({ message: 'Background issue' })], fixRecommendations: [] } });
    const result = classifyAssetFixability(asset);
    expect(result.tier).toBe('manual_review');
    expect(result.skipInBatch).toBe(true);
  });

  it('INFOGRAPHIC with overlay-only violations → auto_fixable', () => {
    const asset = makeAsset({ name: 'INFOGRAPHIC_1.jpg', analysisResult: { overallScore: 60, status: 'FAIL', violations: [makeViolation({ message: 'Promotional badge overlay detected' })], fixRecommendations: [] } });
    const result = classifyAssetFixability(asset);
    expect(result.tier).toBe('auto_fixable');
    expect(result.skipInBatch).toBe(false);
  });

  it('INFOGRAPHIC with background violation → manual_review', () => {
    const asset = makeAsset({ name: 'INFOGRAPHIC_1.jpg', analysisResult: { overallScore: 50, status: 'FAIL', violations: [makeViolation({ message: 'Background is not white' })], fixRecommendations: [] } });
    const result = classifyAssetFixability(asset);
    expect(result.tier).toBe('manual_review');
    expect(result.skipInBatch).toBe(true);
  });

  it('LIFESTYLE with background violation → auto_fixable', () => {
    const asset = makeAsset({ name: 'LIFESTYLE_1.jpg', analysisResult: { overallScore: 60, status: 'FAIL', violations: [makeViolation({ message: 'Background is not white' })], fixRecommendations: [] } });
    const result = classifyAssetFixability(asset);
    expect(result.tier).toBe('auto_fixable');
  });

  it('asset with only blur violations → warn_only, skipInBatch', () => {
    const asset = makeAsset({ name: 'PRODUCT_SHOT_1.jpg', analysisResult: { overallScore: 50, status: 'FAIL', violations: [makeViolation({ message: 'Image is blurry and has low resolution' })], fixRecommendations: [] } });
    const result = classifyAssetFixability(asset);
    expect(result.tier).toBe('warn_only');
    expect(result.skipInBatch).toBe(true);
  });

  it('MAIN product shot with background issue → auto_fixable', () => {
    const asset = makeAsset({ name: 'MAIN_1.jpg', type: 'MAIN', analysisResult: { overallScore: 50, status: 'FAIL', violations: [makeViolation({ message: 'Background is not white' })], fixRecommendations: [] } });
    const result = classifyAssetFixability(asset);
    expect(result.tier).toBe('auto_fixable');
    expect(result.skipInBatch).toBe(false);
  });
});

describe('partitionBatchFixTargets', () => {
  it('separates fixable from skipped assets', () => {
    const assets = [
      makeAsset({ id: '1', name: 'MAIN_1.jpg', type: 'MAIN', analysisResult: { overallScore: 50, status: 'FAIL', violations: [makeViolation({ message: 'Background not white' })], fixRecommendations: [] } }),
      makeAsset({ id: '2', name: 'SIZE_CHART_1.jpg', analysisResult: { overallScore: 50, status: 'FAIL', violations: [makeViolation({ message: 'Text issue' })], fixRecommendations: [] } }),
      makeAsset({ id: '3', name: 'LIFESTYLE_1.jpg', analysisResult: { overallScore: 40, status: 'FAIL', violations: [makeViolation({ message: 'Image is blurry' })], fixRecommendations: [] } }),
    ];
    const { fixable, skipped } = partitionBatchFixTargets(assets);
    expect(fixable).toHaveLength(1);
    expect(fixable[0].id).toBe('1');
    expect(skipped).toHaveLength(2);
    expect(skipped.map(s => s.asset.id).sort()).toEqual(['2', '3']);
  });

  it('Fix All skips unsafe images and continues with safe ones', () => {
    const assets = [
      makeAsset({ id: 'a', name: 'MAIN_1.jpg', type: 'MAIN', analysisResult: { overallScore: 40, status: 'FAIL', violations: [makeViolation({ message: 'Overlay badge' })], fixRecommendations: [] } }),
      makeAsset({ id: 'b', name: 'COMPARISON_1.jpg', analysisResult: { overallScore: 40, status: 'FAIL', violations: [makeViolation({ message: 'Background' })], fixRecommendations: [] } }),
      makeAsset({ id: 'c', name: 'DETAIL_1.jpg', analysisResult: { overallScore: 40, status: 'FAIL', violations: [makeViolation({ message: 'Watermark detected' })], fixRecommendations: [] } }),
    ];
    const { fixable, skipped } = partitionBatchFixTargets(assets);
    expect(fixable.map(a => a.id)).toEqual(['a', 'c']);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].asset.id).toBe('b');
  });
});
