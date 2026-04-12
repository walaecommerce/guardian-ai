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
