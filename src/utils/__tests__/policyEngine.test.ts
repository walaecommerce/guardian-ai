import { describe, it, expect } from 'vitest';
import { POLICY_REGISTRY, POLICY_VERSION, getPolicyRule, getRulesForImageType, getRulesForCategory, getApplicableRules } from '@/config/policyRegistry';
import { CATEGORY_POLICY_RULES } from '@/config/categoryPolicyRules';
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

    expect(mainRules.every(r => r.applies_to === 'main' || r.applies_to === 'all')).toBe(true);
    expect(secondaryRules.every(r => r.applies_to === 'secondary' || r.applies_to === 'all')).toBe(true);
    expect(mainRules.length).toBeGreaterThan(secondaryRules.length);
  });

  it('should have source_url on key Amazon rules', () => {
    const keyRules = ['MAIN_WHITE_BG', 'MAIN_OCCUPANCY', 'MAIN_NO_TEXT_OVERLAY', 'IMAGE_DIMENSIONS'];
    for (const id of keyRules) {
      const rule = getPolicyRule(id);
      expect(rule?.source_url).toBeTruthy();
    }
  });

  it('should have fix_guidance on universal rules', () => {
    for (const rule of POLICY_REGISTRY) {
      expect(rule.fix_guidance).toBeTruthy();
    }
  });
});

// ── Category Policy Rules ──────────────────────────────────────

describe('Category Policy Rules', () => {
  const requiredCategories = [
    'APPAREL', 'FOOTWEAR', 'JEWELRY', 'HANDBAGS_LUGGAGE', 'HARDLINES',
    'FOOD_BEVERAGE', 'SUPPLEMENTS', 'BEAUTY_PERSONAL_CARE', 'ELECTRONICS', 'PET_SUPPLIES',
  ] as const;

  it('should have at least one rule per new category', () => {
    for (const cat of requiredCategories) {
      const rules = CATEGORY_POLICY_RULES[cat];
      expect(rules, `Missing rules for ${cat}`).toBeDefined();
      expect(rules!.length, `No rules for ${cat}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('should have fix_guidance on every category rule', () => {
    for (const [cat, rules] of Object.entries(CATEGORY_POLICY_RULES)) {
      for (const rule of rules!) {
        expect(rule.fix_guidance, `Missing fix_guidance on ${rule.rule_id} (${cat})`).toBeTruthy();
      }
    }
  });

  it('should have valid category field matching the key', () => {
    for (const [cat, rules] of Object.entries(CATEGORY_POLICY_RULES)) {
      for (const rule of rules!) {
        expect(rule.category).toBe(cat);
      }
    }
  });

  it('should have valid severity and check_type on all category rules', () => {
    for (const rules of Object.values(CATEGORY_POLICY_RULES)) {
      for (const rule of rules!) {
        expect(['critical', 'warning', 'info']).toContain(rule.severity);
        expect(['deterministic', 'llm', 'hybrid']).toContain(rule.check_type);
      }
    }
  });
});

// ── getRulesForCategory ────────────────────────────────────────

describe('getRulesForCategory', () => {
  it('should return universal + category-specific rules', () => {
    const rules = getRulesForCategory('APPAREL');
    const universalCount = POLICY_REGISTRY.length;
    const apparelCount = CATEGORY_POLICY_RULES['APPAREL']!.length;
    expect(rules.length).toBe(universalCount + apparelCount);
  });

  it('should include universal rules for any category', () => {
    const rules = getRulesForCategory('JEWELRY');
    const universalIds = POLICY_REGISTRY.map(r => r.rule_id);
    for (const id of universalIds) {
      expect(rules.some(r => r.rule_id === id)).toBe(true);
    }
  });

  it('should include category-specific rules', () => {
    const rules = getRulesForCategory('FOOTWEAR');
    expect(rules.some(r => r.rule_id === 'FOOTWEAR_SINGLE_SHOE')).toBe(true);
  });

  it('should return only universal rules for GENERAL_MERCHANDISE (no extras)', () => {
    const rules = getRulesForCategory('GENERAL_MERCHANDISE');
    // GENERAL_MERCHANDISE has no category-specific policy rules
    expect(rules.length).toBe(POLICY_REGISTRY.length);
  });
});

// ── getApplicableRules ─────────────────────────────────────────

describe('getApplicableRules', () => {
  it('should filter by image type AND category', () => {
    const rules = getApplicableRules('main', 'JEWELRY');
    // Should include universal main+all rules AND jewelry main+all rules
    expect(rules.every(r => r.applies_to === 'main' || r.applies_to === 'all')).toBe(true);
    // Should include JEWELRY_NO_MANNEQUIN (main)
    expect(rules.some(r => r.rule_id === 'JEWELRY_NO_MANNEQUIN')).toBe(true);
    // Should NOT include JEWELRY_DETAIL_SHOT (secondary)
    expect(rules.some(r => r.rule_id === 'JEWELRY_DETAIL_SHOT')).toBe(false);
  });

  it('should include secondary-only rules for secondary type', () => {
    const rules = getApplicableRules('secondary', 'FOOTWEAR');
    expect(rules.some(r => r.rule_id === 'FOOTWEAR_SOLE_VISIBLE')).toBe(true);
    // Should NOT include main-only rules
    expect(rules.some(r => r.rule_id === 'FOOTWEAR_SINGLE_SHOE')).toBe(false);
  });

  it('should not break universal rule selection', () => {
    const universalMain = getRulesForImageType('main');
    const categoryMain = getApplicableRules('main', 'APPAREL');
    // Category-aware should have >= universal count
    expect(categoryMain.length).toBeGreaterThanOrEqual(universalMain.length);
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

  it('should work with category-tagged findings', () => {
    const findings = [
      makeFinding('APPAREL_NO_CROP', 'critical', false),
      makeFinding('IMAGE_DIMENSIONS', 'warning', true),
    ];
    expect(computePolicyStatus(findings)).toBe('fail');
  });
});

// ── Category Detection ─────────────────────────────────────────

describe('Category Detection', () => {
  it('should detect APPAREL from title keywords', async () => {
    const { detectCategoryFromTitle } = await import('@/config/categoryRules');
    expect(detectCategoryFromTitle('Men\'s Cotton T-Shirt Crew Neck')).toBe('APPAREL');
    expect(detectCategoryFromTitle('Women\'s Summer Dress Floral')).toBe('APPAREL');
  });

  it('should detect FOOTWEAR from title keywords', async () => {
    const { detectCategoryFromTitle } = await import('@/config/categoryRules');
    expect(detectCategoryFromTitle('Nike Running Sneaker Men Size 10')).toBe('FOOTWEAR');
    expect(detectCategoryFromTitle('Women Leather Boot Ankle')).toBe('FOOTWEAR');
  });

  it('should detect JEWELRY from title keywords', async () => {
    const { detectCategoryFromTitle } = await import('@/config/categoryRules');
    expect(detectCategoryFromTitle('Sterling Silver Necklace Pendant')).toBe('JEWELRY');
    expect(detectCategoryFromTitle('14K Gold Diamond Ring')).toBe('JEWELRY');
  });

  it('should detect HANDBAGS_LUGGAGE from title keywords', async () => {
    const { detectCategoryFromTitle } = await import('@/config/categoryRules');
    expect(detectCategoryFromTitle('Leather Crossbody Purse Women')).toBe('HANDBAGS_LUGGAGE');
    expect(detectCategoryFromTitle('Travel Carry-On Suitcase 22 inch')).toBe('HANDBAGS_LUGGAGE');
  });

  it('should detect HARDLINES from title keywords', async () => {
    const { detectCategoryFromTitle } = await import('@/config/categoryRules');
    expect(detectCategoryFromTitle('Cordless Power Drill 20V')).toBe('HARDLINES');
    expect(detectCategoryFromTitle('Kitchen Blender 1000W')).toBe('HARDLINES');
  });

  it('should fall back to GENERAL_MERCHANDISE for unknown titles', async () => {
    const { detectCategoryFromTitle } = await import('@/config/categoryRules');
    expect(detectCategoryFromTitle('Some Random Product ABC123')).toBe('GENERAL_MERCHANDISE');
  });

  it('should prioritize more specific categories over general ones', async () => {
    const { detectCategoryFromTitle } = await import('@/config/categoryRules');
    // "shoe" should match FOOTWEAR, not APPAREL or GENERAL
    expect(detectCategoryFromTitle('Running Shoe Athletic')).toBe('FOOTWEAR');
  });
});
