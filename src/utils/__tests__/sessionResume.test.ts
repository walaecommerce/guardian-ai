import { describe, it, expect } from 'vitest';
import { inferCurrentStep, formatContentType } from '../sessionResume';

describe('inferCurrentStep', () => {
  it('returns import when no images', () => {
    expect(inferCurrentStep({ total_images: 0, passed_count: 0, failed_count: 0, fixed_count: 0, status: 'in_progress' }))
      .toBe('import');
  });

  it('returns import when images exist but no audit results', () => {
    expect(inferCurrentStep({ total_images: 5, passed_count: 0, failed_count: 0, fixed_count: 0, status: 'in_progress' }))
      .toBe('import');
  });

  it('returns audit when results exist but no failures', () => {
    expect(inferCurrentStep({ total_images: 5, passed_count: 5, failed_count: 0, fixed_count: 0, status: 'in_progress' }))
      .toBe('audit');
  });

  it('returns fix when there are unfixed failures', () => {
    expect(inferCurrentStep({ total_images: 5, passed_count: 2, failed_count: 3, fixed_count: 1, status: 'in_progress' }))
      .toBe('fix');
  });

  it('returns review when all failures are fixed', () => {
    expect(inferCurrentStep({ total_images: 5, passed_count: 2, failed_count: 3, fixed_count: 3, status: 'in_progress' }))
      .toBe('review');
  });

  it('returns review for completed sessions', () => {
    expect(inferCurrentStep({ total_images: 5, passed_count: 5, failed_count: 0, fixed_count: 0, status: 'completed' }))
      .toBe('review');
  });

  it('uses stored lastStep when present', () => {
    expect(inferCurrentStep({
      total_images: 5, passed_count: 0, failed_count: 0, fixed_count: 0, status: 'in_progress',
      product_identity: { lastStep: 'audit' },
    })).toBe('audit');
  });

  it('ignores invalid stored lastStep', () => {
    expect(inferCurrentStep({
      total_images: 5, passed_count: 5, failed_count: 0, fixed_count: 0, status: 'completed',
      product_identity: { lastStep: 'bogus' },
    })).toBe('review');
  });

  it('returns review when remaining failures are all skipped/unresolved', () => {
    // 3 failed, 1 fixed, 2 skipped → no fixable remaining → review
    expect(inferCurrentStep({
      total_images: 5, passed_count: 2, failed_count: 3, fixed_count: 1, skipped_count: 2, status: 'in_progress',
    })).toBe('review');
  });

  it('returns fix when fixable items remain after skipped', () => {
    // 3 failed, 0 fixed, 1 skipped → 2 fixable remaining → fix
    expect(inferCurrentStep({
      total_images: 5, passed_count: 2, failed_count: 3, fixed_count: 0, skipped_count: 1, status: 'in_progress',
    })).toBe('fix');
  });

  it('returns review for completed session with unresolved items', () => {
    expect(inferCurrentStep({
      total_images: 5, passed_count: 2, failed_count: 3, fixed_count: 1, skipped_count: 2, status: 'completed',
    })).toBe('review');
  });

  it('falls back gracefully when skipped_count is missing (backward compat)', () => {
    // No skipped_count → treated as 0, so 3 failed - 1 fixed = 2 fixable → fix
    expect(inferCurrentStep({
      total_images: 5, passed_count: 2, failed_count: 3, fixed_count: 1, status: 'in_progress',
    })).toBe('fix');
  });

  it('returns review when fixed + skipped exactly covers failed', () => {
    expect(inferCurrentStep({
      total_images: 6, passed_count: 2, failed_count: 4, fixed_count: 2, skipped_count: 2, status: 'in_progress',
    })).toBe('review');
  });

  it('returns fix when fixed + skipped do not fully cover failed', () => {
    expect(inferCurrentStep({
      total_images: 6, passed_count: 2, failed_count: 4, fixed_count: 1, skipped_count: 2, status: 'in_progress',
    })).toBe('fix');
  });
});

describe('formatContentType', () => {
  it('maps PRODUCT_SHOT', () => {
    expect(formatContentType('PRODUCT_SHOT')).toBe('Product Shot');
  });
  it('maps LIFESTYLE', () => {
    expect(formatContentType('LIFESTYLE')).toBe('Lifestyle');
  });
  it('maps null', () => {
    expect(formatContentType(null)).toBe('Unknown');
  });
  it('title-cases unknown categories', () => {
    expect(formatContentType('CUSTOM_TYPE')).toBe('Custom Type');
  });
});
