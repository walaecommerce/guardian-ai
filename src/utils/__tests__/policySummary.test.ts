import { describe, it, expect } from 'vitest';
import { getPolicySummary, getCheckTypeLabel, getCheckTypeBadgeClass, getRuleScopeLabel } from '../policySummary';
import { POLICY_VERSION } from '@/config/policyRegistry';

describe('getPolicySummary', () => {
  it('returns correct policy version', () => {
    const summary = getPolicySummary('main', 'GENERAL_MERCHANDISE');
    expect(summary.policyVersion).toBe(POLICY_VERSION);
  });

  it('returns category metadata', () => {
    const summary = getPolicySummary('main', 'FOOD_BEVERAGE');
    expect(summary.categoryLabel).toBe('Food & Beverage');
    expect(summary.categoryIcon).toBe('🍎');
  });

  it('counts applicable rules correctly', () => {
    const summary = getPolicySummary('main', 'GENERAL_MERCHANDISE');
    expect(summary.totalApplicableRules).toBeGreaterThan(0);
    expect(summary.deterministicRuleCount + summary.hybridRuleCount + summary.llmRuleCount).toBe(summary.totalApplicableRules);
  });

  it('includes category-specific rules for non-general categories', () => {
    const general = getPolicySummary('main', 'GENERAL_MERCHANDISE');
    const apparel = getPolicySummary('main', 'APPAREL');
    expect(apparel.categorySpecificRuleCount).toBeGreaterThan(general.categorySpecificRuleCount);
  });

  it('aggregates unique sources', () => {
    const summary = getPolicySummary('main', 'FOOD_BEVERAGE');
    expect(summary.sources.length).toBeGreaterThan(0);
    for (const s of summary.sources) {
      expect(s.label).toBeTruthy();
      expect(s.ruleCount).toBeGreaterThan(0);
    }
  });

  it('separates universal and category-specific counts', () => {
    const summary = getPolicySummary('main', 'APPAREL');
    expect(summary.universalRuleCount).toBeGreaterThan(0);
    expect(summary.universalRuleCount + summary.categorySpecificRuleCount).toBe(summary.totalApplicableRules);
  });
});

describe('getCheckTypeLabel', () => {
  it('returns correct labels', () => {
    expect(getCheckTypeLabel('deterministic')).toBe('Pre-check');
    expect(getCheckTypeLabel('hybrid')).toBe('Hybrid');
    expect(getCheckTypeLabel('llm')).toBe('AI Analysis');
  });
});

describe('getCheckTypeBadgeClass', () => {
  it('returns non-empty class strings', () => {
    expect(getCheckTypeBadgeClass('deterministic')).toContain('bg-blue');
    expect(getCheckTypeBadgeClass('hybrid')).toContain('bg-cyan');
    expect(getCheckTypeBadgeClass('llm')).toContain('bg-purple');
  });
});

describe('getRuleScopeLabel', () => {
  it('returns Universal for universal rules', () => {
    expect(getRuleScopeLabel({ category: 'universal' } as any)).toBe('Universal');
  });

  it('returns category name for category-specific rules', () => {
    expect(getRuleScopeLabel({ category: 'APPAREL' } as any)).toBe('APPAREL');
  });
});
