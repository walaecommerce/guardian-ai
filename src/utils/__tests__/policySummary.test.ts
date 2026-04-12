import { describe, it, expect } from 'vitest';
import { getPolicySummary, getCheckTypeLabel, getCheckTypeBadgeClass, getRuleScopeLabel } from '../policySummary';
import { POLICY_VERSION } from '@/config/policyRegistry';
import { getCategoryPolicyRules } from '@/config/categoryPolicyRules';

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

  it('separates compliance and optimization counts', () => {
    const summary = getPolicySummary('main', 'GENERAL_MERCHANDISE');
    expect(summary.complianceRuleCount).toBeGreaterThan(0);
    expect(summary.complianceRuleCount + summary.optimizationRuleCount).toBe(summary.totalApplicableRules);
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

describe('category rule provenance completeness', () => {
  const categories = ['APPAREL', 'FOOTWEAR', 'JEWELRY', 'HANDBAGS_LUGGAGE', 'HARDLINES',
    'FOOD_BEVERAGE', 'SUPPLEMENTS', 'BEAUTY_PERSONAL_CARE', 'ELECTRONICS', 'PET_SUPPLIES'] as const;

  for (const cat of categories) {
    it(`${cat} rules all have explicit source_tier`, () => {
      const rules = getCategoryPolicyRules(cat);
      expect(rules.length).toBeGreaterThan(0);
      for (const r of rules) {
        expect(r.source_tier, `${r.rule_id} missing source_tier`).toBeDefined();
        expect(['official', 'internal_sop', 'optimization_playbook']).toContain(r.source_tier);
      }
    });

    it(`${cat} rules all have explicit surfaces`, () => {
      const rules = getCategoryPolicyRules(cat);
      for (const r of rules) {
        expect(r.surfaces, `${r.rule_id} missing surfaces`).toBeDefined();
        expect(r.surfaces!.length).toBeGreaterThan(0);
      }
    });
  }
});
