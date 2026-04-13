import { describe, it, expect } from 'vitest';
import { generateExportData } from '@/utils/exportReport';
import { ImageAsset } from '@/types';

function makeAsset(overrides: Partial<ImageAsset> = {}): ImageAsset {
  return {
    id: 'a1',
    file: new File([], 'test.jpg'),
    preview: '',
    type: 'SECONDARY',
    name: 'test.jpg',
    ...overrides,
  } as ImageAsset;
}

describe('exportReport unresolved states', () => {
  it('includes unresolved count and summary in export data', () => {
    const assets: ImageAsset[] = [
      makeAsset({
        id: '1',
        analysisResult: { status: 'PASS', overallScore: 95, violations: [] } as any,
      }),
      makeAsset({
        id: '2',
        analysisResult: { status: 'FAIL', overallScore: 40, violations: [{ severity: 'critical', category: 'bg', message: 'bad bg', recommendation: '' }] } as any,
        unresolvedState: 'manual_review',
        batchFixStatus: 'skipped',
        batchSkipReason: 'Size chart — not safe to auto-edit',
        fixabilityTier: 'manual_review',
      }),
      makeAsset({
        id: '3',
        analysisResult: { status: 'FAIL', overallScore: 50, violations: [] } as any,
        unresolvedState: 'retry_stopped',
        fixStopReason: 'Repeated identity drift',
        fixAttempts: [{ attempt: 1, generatedImage: '', status: 'failed' }] as any,
        lastFixStrategy: 'inpaint-edit',
      }),
      makeAsset({
        id: '4',
        analysisResult: { status: 'FAIL', overallScore: 60, violations: [] } as any,
        fixedImage: 'data:image/png;base64,abc',
        fixMethod: 'surgical-edit',
      }),
    ];

    const data = generateExportData(assets, 'Test Listing');

    // Counts
    expect(data.passed).toBe(1);
    expect(data.fixed).toBe(1);
    expect(data.unresolved).toBe(2);
    // Fixed items should NOT count as "failed" — they are resolved
    expect(data.failed).toBe(0);
    expect(data.overall_status).toBe('FAIL'); // has unresolved

    // Unresolved summary
    expect(data.unresolved_summary).toBeDefined();
    expect(data.unresolved_summary!.manual_review).toBe(1);
    expect(data.unresolved_summary!.retry_stopped).toBe(1);

    // Asset-level unresolved fields
    const unresolvedAsset = data.assets.find(a => a.filename === 'test.jpg' && a.unresolved_state);
    expect(unresolvedAsset).toBeDefined();

    // Check retry-stopped asset has fix trace
    const retryAsset = data.assets[2];
    expect(retryAsset.unresolved_state).toContain('Retry Stopped');
    expect(retryAsset.fix_stop_reason).toBe('Repeated identity drift');
    expect(retryAsset.fix_attempts_count).toBe(1);
    expect(retryAsset.last_fix_strategy).toBe('inpaint-edit');
  });

  it('distinguishes skipped vs warn_only vs auto_fix_failed', () => {
    const assets: ImageAsset[] = [
      makeAsset({ id: '1', unresolvedState: 'skipped', batchFixStatus: 'skipped', batchSkipReason: 'Comparison image', analysisResult: { status: 'FAIL', overallScore: 30, violations: [] } as any }),
      makeAsset({ id: '2', unresolvedState: 'warn_only', fixabilityTier: 'warn_only', batchSkipReason: 'Low resolution', analysisResult: { status: 'WARNING', overallScore: 55, violations: [] } as any }),
      makeAsset({ id: '3', unresolvedState: 'auto_fix_failed', batchFixStatus: 'failed', fixStopReason: 'No acceptable fix', analysisResult: { status: 'FAIL', overallScore: 35, violations: [] } as any }),
    ];

    const data = generateExportData(assets, 'Test');
    expect(data.unresolved).toBe(3);
    expect(data.unresolved_summary!.skipped).toBe(1);
    expect(data.unresolved_summary!.warn_only).toBe(1);
    expect(data.unresolved_summary!.auto_fix_failed).toBe(1);

    // Each asset has distinct labels
    const states = data.assets.map(a => a.unresolved_state);
    expect(states).toContain('Skipped — Safety Rules');
    expect(states).toContain('Warning — Better Source Needed');
    expect(states).toContain('Auto-fix Failed After Attempts');
  });

  it('passed/fixed assets have no unresolved fields', () => {
    const assets: ImageAsset[] = [
      makeAsset({ id: '1', analysisResult: { status: 'PASS', overallScore: 90, violations: [] } as any }),
      makeAsset({ id: '2', analysisResult: { status: 'FAIL', overallScore: 60, violations: [] } as any, fixedImage: 'data:abc' }),
    ];

    const data = generateExportData(assets, 'Clean');
    expect(data.unresolved).toBe(0);
    expect(data.unresolved_summary).toBeUndefined();
    data.assets.forEach(a => {
      expect(a.unresolved_state).toBeUndefined();
      expect(a.unresolved_reason).toBeUndefined();
    });
  });
});
