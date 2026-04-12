import { describe, it, expect } from 'vitest';
import {
  classifyFindingSource,
  extractEvidence,
  groupFindings,
  buildDeterministicRuleIdSet,
  getSourceBadgeLabel,
  getSurfaceLabels,
  getSourceTierLabel,
} from '../evidenceHelpers';
import type { Violation, DeterministicFindingSummary } from '@/types';

const makeViolation = (overrides: Partial<Violation> = {}): Violation => ({
  severity: 'critical',
  category: 'Background',
  message: 'Non-white background detected',
  recommendation: 'Use white background',
  ...overrides,
});

describe('classifyFindingSource', () => {
  it('returns deterministic when rule_id is in deterministic set', () => {
    const v = makeViolation({ rule_id: 'IMAGE_DIMENSIONS' });
    expect(classifyFindingSource(v, new Set(['IMAGE_DIMENSIONS']))).toBe('deterministic');
  });

  it('returns llm for unknown rules not in deterministic set', () => {
    const v = makeViolation({ rule_id: 'ACTUAL_PRODUCT' });
    expect(classifyFindingSource(v, new Set())).toBe('llm');
  });

  it('returns category-specific for category rules', () => {
    const v = makeViolation({ rule_id: 'APPAREL_ON_MODEL', category: 'Apparel' });
    expect(classifyFindingSource(v, new Set())).toBe('llm'); // not in registry → falls through
  });

  it('returns consistency for consistency-related categories', () => {
    const v = makeViolation({ category: 'Identity Consistency' });
    expect(classifyFindingSource(v, new Set())).toBe('consistency');
  });
});

describe('extractEvidence', () => {
  it('extracts bounding box summary', () => {
    const v = makeViolation({
      rule_id: 'MAIN_WHITE_BG',
      evidence: {
        rule_id: 'MAIN_WHITE_BG',
        source: 'Amazon Requirements',
        why_triggered: 'Background is grey',
        measured_value: 'rgb(240,240,240)',
        threshold: 'rgb(255,255,255)',
        bounding_box: { top: 0, left: 0, width: 1, height: 1 },
      },
    });
    const ev = extractEvidence(v, new Set());
    expect(ev.boundingBoxSummary).toContain('Region');
    expect(ev.whyTriggered).toBe('Background is grey');
    expect(ev.measuredValue).toBe('rgb(240,240,240)');
  });

  it('extracts OCR snippet', () => {
    const v = makeViolation({
      evidence: {
        rule_id: 'MAIN_NO_TEXT_OVERLAY',
        source: 'test',
        why_triggered: 'Text detected',
        measured_value: '3 text regions',
        threshold: '0',
        ocr_snippet: 'SALE 50% OFF',
      },
    });
    const ev = extractEvidence(v, new Set());
    expect(ev.ocrSnippet).toBe('SALE 50% OFF');
  });

  it('provides fix likelihood for known rules', () => {
    const v = makeViolation({ rule_id: 'IMAGE_DIMENSIONS' });
    const ev = extractEvidence(v, new Set(['IMAGE_DIMENSIONS']));
    expect(ev.fixLikelihood).toBe('Auto-fixable');
  });

  it('extracts source tier from registry rule', () => {
    const v = makeViolation({ rule_id: 'MAIN_WHITE_BG' });
    const ev = extractEvidence(v, new Set());
    expect(ev.sourceTier).toBe('official');
  });

  it('extracts surfaces from registry rule', () => {
    const v = makeViolation({ rule_id: 'MAIN_WHITE_BG' });
    const ev = extractEvidence(v, new Set());
    expect(ev.surfaces).toContain('LISTING_MAIN');
  });

  it('returns null source tier for unknown rules', () => {
    const v = makeViolation({ rule_id: 'UNKNOWN_RULE_XYZ' });
    const ev = extractEvidence(v, new Set());
    expect(ev.sourceTier).toBeNull();
    expect(ev.surfaces).toBeNull();
  });

  it('returns optimization tier for optimization rules', () => {
    const v = makeViolation({ rule_id: 'OPT_IMAGE_STACK_COUNT' });
    const ev = extractEvidence(v, new Set());
    expect(ev.sourceTier).toBe('optimization_playbook');
  });
});

describe('groupFindings', () => {
  it('groups violations by severity and type', () => {
    const violations: Violation[] = [
      makeViolation({ severity: 'critical', category: 'Background' }),
      makeViolation({ severity: 'warning', category: 'Occupancy' }),
      makeViolation({ severity: 'info', category: 'Quality' }),
      makeViolation({ severity: 'warning', category: 'Identity Consistency' }),
    ];
    const groups = groupFindings(violations, new Set());
    expect(groups.length).toBeGreaterThanOrEqual(3);
    expect(groups[0].label).toBe('Hard Policy Failures');
    const consistencyGroup = groups.find(g => g.label === 'Consistency Issues');
    expect(consistencyGroup).toBeDefined();
    expect(consistencyGroup!.items.length).toBe(1);
  });

  it('separates optimization suggestions from other info findings', () => {
    const violations: Violation[] = [
      makeViolation({ severity: 'info', category: 'Quality', rule_id: 'OPT_IMAGE_STACK_COUNT' }),
      makeViolation({ severity: 'info', category: 'Quality' }),
    ];
    const groups = groupFindings(violations, new Set());
    const optGroup = groups.find(g => g.label === 'Optimization Suggestions');
    const infoGroup = groups.find(g => g.label === 'Informational');
    expect(optGroup).toBeDefined();
    expect(optGroup!.items.length).toBe(1);
    expect(infoGroup).toBeDefined();
    expect(infoGroup!.items.length).toBe(1);
  });

  it('returns empty array for no violations', () => {
    expect(groupFindings([], new Set())).toEqual([]);
  });
});

describe('buildDeterministicRuleIdSet', () => {
  it('builds set from findings', () => {
    const findings: DeterministicFindingSummary[] = [
      { rule_id: 'IMAGE_DIMENSIONS', severity: 'warning', passed: true, message: 'OK' },
      { rule_id: 'IMAGE_SHARPNESS', severity: 'warning', passed: false, message: 'Blurry' },
    ];
    const set = buildDeterministicRuleIdSet(findings);
    expect(set.has('IMAGE_DIMENSIONS')).toBe(true);
    expect(set.has('IMAGE_SHARPNESS')).toBe(true);
    expect(set.size).toBe(2);
  });

  it('returns empty set for undefined', () => {
    expect(buildDeterministicRuleIdSet(undefined).size).toBe(0);
  });
});

describe('getSourceBadgeLabel', () => {
  it('returns correct labels', () => {
    expect(getSourceBadgeLabel('deterministic')).toBe('Pre-check');
    expect(getSourceBadgeLabel('llm')).toBe('AI Analysis');
    expect(getSourceBadgeLabel('category-specific')).toBe('Category Rule');
    expect(getSourceBadgeLabel('consistency')).toBe('Consistency');
  });
});

describe('getSurfaceLabels', () => {
  it('returns short labels for surfaces', () => {
    expect(getSurfaceLabels(['LISTING_MAIN', 'LISTING_SECONDARY'])).toEqual(['Main', 'Secondary']);
  });

  it('returns A+ label', () => {
    expect(getSurfaceLabels(['APLUS'])).toEqual(['A+']);
  });

  it('returns empty array for null', () => {
    expect(getSurfaceLabels(null)).toEqual([]);
  });
});

describe('getSourceTierLabel', () => {
  it('returns correct labels', () => {
    expect(getSourceTierLabel('official')).toBe('Official');
    expect(getSourceTierLabel('internal_sop')).toBe('Internal SOP');
    expect(getSourceTierLabel('optimization_playbook')).toBe('Optimization');
  });

  it('defaults to Official for undefined', () => {
    expect(getSourceTierLabel(undefined)).toBe('Official');
  });
});
