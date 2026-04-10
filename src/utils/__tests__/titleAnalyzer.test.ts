import { describe, it, expect } from 'vitest';
import { analyzeTitleCompliance } from '../titleAnalyzer';

describe('analyzeTitleCompliance', () => {
  it('returns score 0 for empty title', () => {
    const result = analyzeTitleCompliance('');
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it('passes a clean, short title', () => {
    const result = analyzeTitleCompliance('BrandX - Organic Green Tea, 20 Count');
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThan(70);
  });

  it('fails titles over 200 characters', () => {
    const longTitle = 'A'.repeat(201);
    const result = analyzeTitleCompliance(longTitle);
    const charFinding = result.findings.find(f => f.ruleId === 'char_limit');
    expect(charFinding?.passed).toBe(false);
    expect(result.criticalCount).toBeGreaterThanOrEqual(1);
  });

  it('flags prohibited special characters', () => {
    const result = analyzeTitleCompliance('BrandX ~ Premium Coffee $9.99');
    const finding = result.findings.find(f => f.ruleId === 'special_chars');
    expect(finding?.passed).toBe(false);
  });

  it('flags promotional language', () => {
    const result = analyzeTitleCompliance('BrandX Best Seller Protein Bar');
    const finding = result.findings.find(f => f.ruleId === 'promotional_language');
    expect(finding?.passed).toBe(false);
    expect(finding?.severity).toBe('critical');
  });

  it('flags ALL CAPS words (excluding acronyms)', () => {
    const result = analyzeTitleCompliance('AMAZING PRODUCT By BrandX USB Cable');
    const finding = result.findings.find(f => f.ruleId === 'all_caps');
    expect(finding?.passed).toBe(false);
  });

  it('allows common acronyms in caps', () => {
    const result = analyzeTitleCompliance('BrandX USB LED Light, 5W');
    const finding = result.findings.find(f => f.ruleId === 'all_caps');
    expect(finding?.passed).toBe(true);
  });

  it('flags keyword stuffing (3+ repeats)', () => {
    const result = analyzeTitleCompliance('Coffee Coffee Coffee Maker by BrandX');
    const finding = result.findings.find(f => f.ruleId === 'keyword_stuffing');
    expect(finding?.passed).toBe(false);
  });

  it('flags subjective claims', () => {
    const result = analyzeTitleCompliance('BrandX Amazing Best Quality Shoes');
    const finding = result.findings.find(f => f.ruleId === 'subjective_claims');
    expect(finding?.passed).toBe(false);
  });

  it('score reflects number of failures', () => {
    const clean = analyzeTitleCompliance('BrandX - Organic Tea');
    const dirty = analyzeTitleCompliance('AMAZING best seller ~ FREE SHIPPING coffee coffee coffee');
    expect(clean.score).toBeGreaterThan(dirty.score);
  });
});
