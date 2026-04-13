import { describe, it, expect } from 'vitest';
import { buildGenerationBrief } from '../strategyBriefBuilder';
import type { StrategyRecommendation } from '../campaignStrategy';
import type { ProductKnowledge } from '../productKnowledge';
import type { ListingContext } from '../listingContext';

const mockPk: ProductKnowledge = {
  identitySummary: 'TestBrand — Organic Protein Powder',
  brand: 'TestBrand',
  productTypeHint: 'supplement',
  allowedTextCues: ['TestBrand', 'organic', 'non-gmo'],
  supportedClaims: ['organic', 'non-gmo', 'gluten free'],
  attributeHints: ['Package Dimensions: 8 x 4 x 4 inches', 'Flavor: Chocolate'],
  completeness: 75,
  isActionable: true,
};

const mockCtx: ListingContext = {
  title: 'TestBrand Organic Protein Powder 2lb',
  brand: 'TestBrand',
  bullets: ['Made with organic ingredients', 'Non-GMO verified'],
  description: null,
  category: null,
  attributes: {},
  claims: ['organic', 'non-gmo'],
  keywords: [],
  asin: null,
  sourceUrl: null,
};

const mockRec: StrategyRecommendation = {
  role: 'benefits_infographic',
  label: 'Benefits / Features Infographic',
  rationale: 'Claims present but not visually supported',
  priority: 'essential',
};

describe('buildGenerationBrief', () => {
  it('maps role to correct template', () => {
    const brief = buildGenerationBrief(mockRec, mockPk, mockCtx);
    expect(brief.templateId).toBe('infographic');
  });

  it('includes only safe supported claims', () => {
    const pkWithUnsafe: ProductKnowledge = {
      ...mockPk,
      supportedClaims: ['organic', 'cures headaches', 'non-gmo', 'FDA approved'],
    };
    const brief = buildGenerationBrief(mockRec, pkWithUnsafe, mockCtx);
    expect(brief.claims).toContain('Organic');
    expect(brief.claims).toContain('Non-gmo');
    expect(brief.claims).not.toContain('Cures headaches');
    expect(brief.claims).not.toContain('FDA approved');
  });

  it('includes strategy source metadata', () => {
    const brief = buildGenerationBrief(mockRec, mockPk, mockCtx);
    expect(brief.strategySource.targetRole).toBe('benefits_infographic');
    expect(brief.strategySource.recommendationLabel).toBe('Benefits / Features Infographic');
    expect(brief.strategySource.priority).toBe('essential');
  });

  it('maps product type to category', () => {
    const brief = buildGenerationBrief(mockRec, mockPk, mockCtx);
    expect(brief.category).toBe('SUPPLEMENTS');
  });

  it('handles null/undefined product knowledge gracefully', () => {
    const brief = buildGenerationBrief(mockRec, null, null);
    expect(brief.productName).toBe('Product');
    expect(brief.claims).toEqual([]);
    expect(brief.category).toBe('GENERAL');
    expect(brief.templateId).toBe('infographic');
  });

  it('handles sparse product knowledge', () => {
    const sparse: ProductKnowledge = {
      identitySummary: 'Some Product',
      brand: null,
      productTypeHint: null,
      allowedTextCues: [],
      supportedClaims: [],
      attributeHints: [],
      completeness: 10,
      isActionable: false,
    };
    const brief = buildGenerationBrief(mockRec, sparse, null);
    expect(brief.productName).toBe('Some Product');
    expect(brief.claims).toEqual([]);
    expect(brief.category).toBe('GENERAL');
  });

  it('builds dimensions description with specs', () => {
    const dimRec: StrategyRecommendation = {
      role: 'dimensions_size',
      label: 'Dimensions / Size Reference',
      rationale: 'Size-sensitive product',
      priority: 'recommended',
    };
    const brief = buildGenerationBrief(dimRec, mockPk, mockCtx);
    expect(brief.templateId).toBe('size_reference');
    expect(brief.description).toContain('dimensions');
    expect(brief.description).toContain('8 x 4 x 4');
  });

  it('uses listing title as product name when available', () => {
    const brief = buildGenerationBrief(mockRec, mockPk, mockCtx);
    expect(brief.productName).toBe('TestBrand Organic Protein Powder 2lb');
  });

  it('truncates very long titles', () => {
    const longCtx = { ...mockCtx, title: 'A'.repeat(120) };
    const brief = buildGenerationBrief(mockRec, mockPk, longCtx);
    expect(brief.productName.length).toBeLessThanOrEqual(82); // 80 + '…'
  });
});
