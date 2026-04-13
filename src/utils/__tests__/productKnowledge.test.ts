import { describe, it, expect } from 'vitest';
import { deriveProductKnowledge, buildKnowledgePromptSection, buildKnowledgePreservationSection } from '../productKnowledge';
import { ListingContext } from '../listingContext';

const fullContext: ListingContext = {
  title: 'Nature Valley Protein Granola Bars, Peanut Butter Dark Chocolate, 5 ct, 7.1 oz',
  brand: 'Nature Valley',
  bullets: [
    '10g of protein per bar',
    'Made with roasted peanuts and dark chocolate',
    'No artificial flavors, colors, or sweeteners',
    'Great for on-the-go snacking',
  ],
  description: 'Nature Valley Protein Granola Bars are made with roasted peanuts and real dark chocolate.',
  category: 'Grocery & Gourmet Food',
  attributes: { Brand: 'Nature Valley', Flavor: 'Peanut Butter Dark Chocolate', Size: '5 Count' },
  claims: ['no artificial flavors', 'non-gmo', 'gluten free'],
  keywords: ['protein', 'granola', 'peanut', 'chocolate', 'snack'],
  asin: 'B08ABCDEF0',
  sourceUrl: null,
};

const sparseContext: ListingContext = {
  title: 'Widget 3000',
  brand: null,
  bullets: [],
  description: null,
  category: null,
  attributes: {},
  claims: [],
  keywords: [],
  asin: null,
  sourceUrl: null,
};

describe('deriveProductKnowledge', () => {
  it('derives complete knowledge from full context', () => {
    const pk = deriveProductKnowledge(fullContext);
    expect(pk.isActionable).toBe(true);
    expect(pk.completeness).toBeGreaterThanOrEqual(80);
    expect(pk.brand).toBe('Nature Valley');
    expect(pk.productTypeHint).toBe('food_beverage');
    expect(pk.identitySummary).toContain('Nature Valley');
    expect(pk.allowedTextCues).toContain('Nature Valley');
    expect(pk.supportedClaims).toContain('non-gmo');
    expect(pk.attributeHints.length).toBeGreaterThan(0);
  });

  it('returns non-actionable for null/undefined input', () => {
    expect(deriveProductKnowledge(null).isActionable).toBe(false);
    expect(deriveProductKnowledge(undefined).isActionable).toBe(false);
    expect(deriveProductKnowledge({ ...sparseContext, title: '' }).isActionable).toBe(false);
  });

  it('handles sparse context gracefully', () => {
    const pk = deriveProductKnowledge(sparseContext);
    expect(pk.isActionable).toBe(true); // title alone gives 25
    expect(pk.completeness).toBe(25);
    expect(pk.brand).toBeNull();
    expect(pk.supportedClaims).toEqual([]);
    expect(pk.attributeHints).toEqual([]);
  });

  it('detects supplement product type', () => {
    const ctx: ListingContext = {
      ...sparseContext,
      title: 'Garden of Life Vitamin D3 5000 IU Supplement, 60 Capsules',
    };
    const pk = deriveProductKnowledge(ctx);
    expect(pk.productTypeHint).toBe('supplement');
  });

  it('detects pet supply product type', () => {
    const ctx: ListingContext = {
      ...sparseContext,
      title: 'Blue Buffalo Wilderness Dog Treats, Duck Recipe',
    };
    const pk = deriveProductKnowledge(ctx);
    expect(pk.productTypeHint).toBe('pet_supply');
  });

  it('extracts size/weight cues from title', () => {
    const pk = deriveProductKnowledge(fullContext);
    expect(pk.allowedTextCues.some(c => c.includes('oz'))).toBe(true);
  });

  it('deduplicates brand from identity summary', () => {
    const pk = deriveProductKnowledge(fullContext);
    // Should not repeat brand twice
    const parts = pk.identitySummary.split(' — ');
    expect(parts[0]).toBe('Nature Valley');
    expect(parts[1]).not.toMatch(/^Nature Valley/i);
  });
});

describe('buildKnowledgePromptSection', () => {
  it('returns empty string for non-actionable knowledge', () => {
    const pk = deriveProductKnowledge(null);
    expect(buildKnowledgePromptSection(pk)).toBe('');
  });

  it('includes reasoning rules for actionable knowledge', () => {
    const pk = deriveProductKnowledge(fullContext);
    const section = buildKnowledgePromptSection(pk);
    expect(section).toContain('PRODUCT KNOWLEDGE');
    expect(section).toContain('Nature Valley');
    expect(section).toContain('LEGITIMATE');
    expect(section).toContain('UNVERIFIED');
    expect(section).toContain('non-gmo');
    expect(section).not.toContain('add bullet text into the image');
  });

  it('does not instruct model to add bullet text into image', () => {
    const pk = deriveProductKnowledge(fullContext);
    const section = buildKnowledgePromptSection(pk);
    expect(section).not.toContain('add bullet');
    expect(section).not.toContain('insert text');
  });
});

describe('buildKnowledgePreservationSection', () => {
  it('returns empty for non-actionable knowledge', () => {
    const pk = deriveProductKnowledge(null);
    expect(buildKnowledgePreservationSection(pk)).toBe('');
  });

  it('includes preservation rules and brand', () => {
    const pk = deriveProductKnowledge(fullContext);
    const section = buildKnowledgePreservationSection(pk);
    expect(section).toContain('PRESERVATION');
    expect(section).toContain('Nature Valley');
    expect(section).toContain('Do NOT invent');
    expect(section).toContain('Do NOT modify');
  });

  it('does not include unsupported claim instructions', () => {
    const pk = deriveProductKnowledge(fullContext);
    const section = buildKnowledgePreservationSection(pk);
    expect(section).not.toContain('add new claims');
  });
});
