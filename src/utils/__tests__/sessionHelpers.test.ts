import { describe, it, expect } from 'vitest';
import { humanizeSessionStatus, getSessionActionLabel, isStudioSession } from '../sessionHelpers';

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
