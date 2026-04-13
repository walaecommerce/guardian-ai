import { describe, it, expect } from 'vitest';
import { reconcileSessionCounts, isSessionStale } from '../sessionReconcile';

describe('reconcileSessionCounts', () => {
  it('computes correct counts from image rows', () => {
    const images = [
      { status: 'fixed', fixed_image_url: 'url1', fix_attempts: { fixMethod: 'enhancement' }, analysis_result: { status: 'FAIL' }, image_type: 'SECONDARY' },
      { status: 'fixed', fixed_image_url: 'url2', fix_attempts: [], analysis_result: { status: 'FAIL' }, image_type: 'SECONDARY' },
      { status: 'passed', fixed_image_url: null, fix_attempts: [], analysis_result: { status: 'PASS' }, image_type: 'MAIN' },
      { status: 'failed', fixed_image_url: null, fix_attempts: [], analysis_result: { status: 'FAIL' }, image_type: 'SECONDARY' },
    ];
    const counts = reconcileSessionCounts(images);
    expect(counts.total_images).toBe(4);
    expect(counts.passed_count).toBe(1);
    expect(counts.failed_count).toBe(3);
    expect(counts.fixed_count).toBe(2);
    expect(counts.skipped_count).toBe(0);
    expect(counts.unresolved_count).toBe(0);
  });

  it('counts skipped images correctly', () => {
    const images = [
      { status: 'failed', fixed_image_url: null, fix_attempts: { skipped: true, skipReason: 'test' }, analysis_result: { status: 'FAIL' }, image_type: 'SECONDARY' },
      { status: 'fixed', fixed_image_url: 'url', fix_attempts: [], analysis_result: { status: 'FAIL' }, image_type: 'SECONDARY' },
    ];
    const counts = reconcileSessionCounts(images);
    expect(counts.failed_count).toBe(2);
    expect(counts.fixed_count).toBe(1);
    expect(counts.skipped_count).toBe(1);
    expect(counts.unresolved_count).toBe(1);
  });

  it('counts unresolved (retry_stopped) images correctly', () => {
    const images = [
      { status: 'failed', fixed_image_url: null, fix_attempts: { stopReason: 'max_retries', unresolvedState: 'retry_stopped' }, analysis_result: { status: 'FAIL' }, image_type: 'SECONDARY' },
    ];
    const counts = reconcileSessionCounts(images);
    expect(counts.unresolved_count).toBe(1);
    expect(counts.skipped_count).toBe(0);
  });

  it('handles images with no analysis result (pending)', () => {
    const images = [
      { status: 'pending', fixed_image_url: null, fix_attempts: [], analysis_result: null, image_type: 'SECONDARY' },
    ];
    const counts = reconcileSessionCounts(images);
    expect(counts.total_images).toBe(1);
    expect(counts.passed_count).toBe(0);
    expect(counts.failed_count).toBe(0);
    expect(counts.fixed_count).toBe(0);
  });

  it('handles empty image list', () => {
    const counts = reconcileSessionCounts([]);
    expect(counts.total_images).toBe(0);
    expect(counts.fixed_count).toBe(0);
  });

  it('handles stale session with fixed_image_url but empty fix_attempts', () => {
    // Pre-fix session: images were fixed but fix_attempts was never populated
    const images = [
      { status: 'fixed', fixed_image_url: 'url1', fix_attempts: [], analysis_result: { status: 'FAIL' }, image_type: 'MAIN' },
      { status: 'fixed', fixed_image_url: 'url2', fix_attempts: [], analysis_result: { status: 'FAIL' }, image_type: 'SECONDARY' },
      { status: 'failed', fixed_image_url: null, fix_attempts: [], analysis_result: { status: 'FAIL' }, image_type: 'SECONDARY' },
      { status: 'passed', fixed_image_url: null, fix_attempts: [], analysis_result: { status: 'PASS' }, image_type: 'SECONDARY' },
    ];
    const counts = reconcileSessionCounts(images);
    expect(counts.fixed_count).toBe(2); // Both with fixed_image_url
    expect(counts.failed_count).toBe(3);
    expect(counts.passed_count).toBe(1);
  });

  it('newer sessions with proper metadata are unchanged', () => {
    const images = [
      { status: 'fixed', fixed_image_url: 'url1', fix_attempts: { fixMethod: 'enhancement' }, analysis_result: { status: 'FAIL' }, image_type: 'SECONDARY' },
      { status: 'fixed', fixed_image_url: 'url2', fix_attempts: { attempts: [{ attempt: 1, status: 'passed' }] }, analysis_result: { status: 'FAIL' }, image_type: 'SECONDARY' },
      { status: 'passed', fixed_image_url: null, fix_attempts: [], analysis_result: { status: 'PASS' }, image_type: 'MAIN' },
    ];
    const counts = reconcileSessionCounts(images);
    expect(counts.fixed_count).toBe(2);
    expect(counts.failed_count).toBe(2);
    expect(counts.passed_count).toBe(1);
  });
});

describe('isSessionStale', () => {
  it('returns false when counts match', () => {
    const counts = { total_images: 5, passed_count: 2, failed_count: 3, fixed_count: 2, skipped_count: 0, unresolved_count: 0 };
    expect(isSessionStale(counts, { ...counts })).toBe(false);
  });

  it('returns true when fixed_count differs', () => {
    const stored = { total_images: 5, passed_count: 2, failed_count: 3, fixed_count: 1, skipped_count: 0, unresolved_count: 0 };
    const reconciled = { ...stored, fixed_count: 3 };
    expect(isSessionStale(stored, reconciled)).toBe(true);
  });

  it('returns true when skipped_count differs', () => {
    const stored = { total_images: 5, passed_count: 2, failed_count: 3, fixed_count: 2, skipped_count: 0, unresolved_count: 0 };
    const reconciled = { ...stored, skipped_count: 1 };
    expect(isSessionStale(stored, reconciled)).toBe(true);
  });

  it('detects stale session where fixed_count was never updated', () => {
    // Older session: DB says fixed_count=1, but images show 6 fixed
    const stored = { total_images: 8, passed_count: 0, failed_count: 8, fixed_count: 1, skipped_count: 1, unresolved_count: 1 };
    const reconciled = { total_images: 8, passed_count: 0, failed_count: 8, fixed_count: 6, skipped_count: 1, unresolved_count: 1 };
    expect(isSessionStale(stored, reconciled)).toBe(true);
  });
});
