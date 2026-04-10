import { describe, it, expect } from 'vitest';
import { POLICY_REGISTRY, POLICY_VERSION, getPolicyRule, getRulesForImageType } from '@/config/policyRegistry';
import { computePolicyStatus } from '@/utils/deterministicAudit';
import type { DeterministicFinding } from '@/utils/deterministicAudit';

// ── Policy Registry Structure ──────────────────────────────────

describe('Policy Registry', () => {
  it('should have required fields on every rule', () => {
    for (const rule of POLICY_REGISTRY) {
      expect(rule.rule_id).toBeTruthy();
      expect(rule.version).toBe(POLICY_VERSION);
      expect(['main', 'secondary', 'all']).toContain(rule.applies_to);
      expect(rule.category).toBe('universal');
      expect(['critical', 'warning', 'info']).toContain(rule.severity);
      expect(['deterministic', 'llm', 'hybrid']).toContain(rule.check_type);
      expect(rule.source).toBeTruthy();
      expect(rule.description).toBeTruthy();
    }
  });

  it('should contain at least 7 universal rules', () => {
    expect(POLICY_REGISTRY.length).toBeGreaterThanOrEqual(7);
  });

  it('should look up rules by ID', () => {
    const rule = getPolicyRule('MAIN_WHITE_BG');
    expect(rule).toBeDefined();
    expect(rule!.check_type).toBe('hybrid');
    expect(rule!.severity).toBe('critical');
  });

  it('should return undefined for unknown rule_id', () => {
    expect(getPolicyRule('NONEXISTENT')).toBeUndefined();
  });

  it('should filter rules by image type', () => {
    const mainRules = getRulesForImageType('main');
    const secondaryRules = getRulesForImageType('secondary');

    // Main rules include 'main' + 'all'
    expect(mainRules.every(r => r.applies_to === 'main' || r.applies_to === 'all')).toBe(true);
    // Secondary rules include 'secondary' + 'all'
    expect(secondaryRules.every(r => r.applies_to === 'secondary' || r.applies_to === 'all')).toBe(true);

    // Main should have more rules than secondary (main-specific checks)
    expect(mainRules.length).toBeGreaterThan(secondaryRules.length);
  });

  it('should have source_url on key Amazon rules', () => {
    const keyRules = ['MAIN_WHITE_BG', 'MAIN_OCCUPANCY', 'MAIN_NO_TEXT_OVERLAY', 'IMAGE_DIMENSIONS'];
    for (const id of keyRules) {
      const rule = getPolicyRule(id);
      expect(rule?.source_url).toBeTruthy();
    }
  });
});

// ── Policy Status Computation ──────────────────────────────────

describe('computePolicyStatus', () => {
  const makeFinding = (rule_id: string, severity: 'critical' | 'warning' | 'info', passed: boolean): DeterministicFinding => ({
    rule_id,
    severity,
    passed,
    message: 'test',
    evidence: {
      rule_id,
      source: 'test',
      why_triggered: 'test',
      measured_value: 0,
      threshold: 0,
    },
  });

  it('should return pass when all findings pass', () => {
    const findings = [
      makeFinding('A', 'critical', true),
      makeFinding('B', 'warning', true),
      makeFinding('C', 'info', true),
    ];
    expect(computePolicyStatus(findings)).toBe('pass');
  });

  it('should hard-fail on any critical failure', () => {
    const findings = [
      makeFinding('A', 'critical', false),
      makeFinding('B', 'warning', true),
      makeFinding('C', 'info', true),
    ];
    expect(computePolicyStatus(findings)).toBe('fail');
  });

  it('should return warning on warning-severity failure without critical', () => {
    const findings = [
      makeFinding('A', 'critical', true),
      makeFinding('B', 'warning', false),
    ];
    expect(computePolicyStatus(findings)).toBe('warning');
  });

  it('should return pass when only info-severity findings fail', () => {
    const findings = [
      makeFinding('A', 'critical', true),
      makeFinding('B', 'info', false),
    ];
    expect(computePolicyStatus(findings)).toBe('pass');
  });

  it('should hard-fail even if quality score would be high', () => {
    // This tests the key requirement: critical policy failures override quality
    const findings = [
      makeFinding('MAIN_WHITE_BG', 'critical', false),
      makeFinding('IMAGE_DIMENSIONS', 'warning', true),
      makeFinding('IMAGE_SHARPNESS', 'warning', true),
    ];
    expect(computePolicyStatus(findings)).toBe('fail');
  });

  it('should handle empty findings as pass', () => {
    expect(computePolicyStatus([])).toBe('pass');
  });
});
