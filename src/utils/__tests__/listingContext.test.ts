import { describe, it, expect } from 'vitest';
import {
  normalizeListingContext,
  minimalListingContext,
  serializeListingContext,
  deserializeListingContext,
  extractBulletsFromHtml,
  extractDescriptionFromHtml,
  extractBrandFromHtml,
  ListingContext,
  RawListingData,
} from '@/utils/listingContext';

describe('normalizeListingContext', () => {
  it('normalizes complete raw data', () => {
    const raw: RawListingData = {
      title: 'Acme Widget - Premium Quality Tool',
      asin: 'B00TEST123',
      sourceUrl: 'https://amazon.com/dp/B00TEST123',
      bullets: ['Made in USA', '100% organic', '', '  BPA free design  '],
      description: '<p>A <b>great</b> product &amp; more</p>',
      brand: 'Visit the Acme Store',
      category: 'ELECTRONICS',
      attributes: { Weight: '2 lbs' },
    };
    const ctx = normalizeListingContext(raw);

    expect(ctx.title).toBe('Acme Widget - Premium Quality Tool');
    expect(ctx.brand).toBe('Acme Store');
    expect(ctx.bullets).toEqual(['Made in USA', '100% organic', 'BPA free design']);
    expect(ctx.description).toBe('A great product more');
    expect(ctx.asin).toBe('B00TEST123');
    expect(ctx.category).toBe('ELECTRONICS');
    expect(ctx.attributes).toEqual({ Weight: '2 lbs' });
    expect(ctx.claims).toContain('made in usa');
    expect(ctx.claims).toContain('100% organic');
    expect(ctx.claims).toContain('bpa free');
  });

  it('handles missing fields gracefully', () => {
    const ctx = normalizeListingContext({});
    expect(ctx.title).toBe('');
    expect(ctx.brand).toBeNull();
    expect(ctx.bullets).toEqual([]);
    expect(ctx.description).toBeNull();
    expect(ctx.claims).toEqual([]);
    expect(ctx.keywords).toEqual([]);
    expect(ctx.asin).toBeNull();
  });

  it('extracts brand from title when no explicit brand', () => {
    const ctx = normalizeListingContext({ title: 'NatureMade - Vitamin D3 5000 IU' });
    expect(ctx.brand).toBe('NatureMade');
  });

  it('does not extract brand from long title segment', () => {
    const ctx = normalizeListingContext({ title: 'Some Very Long Brand Name Here - Product' });
    // 5 words before dash — too long for heuristic
    expect(ctx.brand).toBeNull();
  });

  it('extracts claims from bullets and title', () => {
    const ctx = normalizeListingContext({
      title: 'Organic Protein Powder',
      bullets: ['Clinically tested formula', 'Gluten-free and vegan'],
    });
    expect(ctx.claims).toContain('organic');
    expect(ctx.claims).toContain('clinically tested');
    expect(ctx.claims).toContain('gluten-free');
    expect(ctx.claims).toContain('vegan');
  });

  it('extracts keywords from title and bullets', () => {
    const ctx = normalizeListingContext({
      title: 'Premium Stainless Steel Water Bottle',
      bullets: ['Double insulated design', 'Keeps drinks temperature controlled'],
    });
    expect(ctx.keywords.length).toBeGreaterThan(0);
    expect(ctx.keywords).toContain('premium');
    expect(ctx.keywords).toContain('stainless');
  });
});

describe('minimalListingContext', () => {
  it('creates context from just title', () => {
    const ctx = minimalListingContext('Simple Product Name');
    expect(ctx.title).toBe('Simple Product Name');
    expect(ctx.bullets).toEqual([]);
    expect(ctx.asin).toBeNull();
  });

  it('passes ASIN through', () => {
    const ctx = minimalListingContext('Product', 'B00XYZ');
    expect(ctx.asin).toBe('B00XYZ');
  });
});

describe('serialize / deserialize', () => {
  it('round-trips correctly', () => {
    const original: ListingContext = {
      title: 'Test Product',
      brand: 'TestBrand',
      bullets: ['bullet 1', 'bullet 2'],
      description: 'A test product',
      category: 'GENERAL',
      attributes: { Color: 'Red' },
      claims: ['premium'],
      keywords: ['product'],
      asin: 'B00TEST',
      sourceUrl: 'https://amazon.com/dp/B00TEST',
    };

    const serialized = serializeListingContext(original);
    const deserialized = deserializeListingContext(serialized);

    expect(deserialized).toEqual(original);
  });

  it('deserialize returns null for invalid input', () => {
    expect(deserializeListingContext(null)).toBeNull();
    expect(deserializeListingContext(undefined)).toBeNull();
    expect(deserializeListingContext('string')).toBeNull();
    expect(deserializeListingContext({ noTitle: true })).toBeNull();
  });

  it('deserialize handles partial data', () => {
    const ctx = deserializeListingContext({ title: 'Test', bullets: ['a', 123] });
    expect(ctx).not.toBeNull();
    expect(ctx!.title).toBe('Test');
    expect(ctx!.bullets).toEqual(['a']); // filters non-strings
    expect(ctx!.brand).toBeNull();
  });
});

describe('HTML extraction', () => {
  it('extracts bullets from feature-bullets HTML', () => {
    const html = `<div id="feature-bullets"><ul><li><span>First bullet point here</span></li><li><span>Second bullet point here</span></li></ul></div><div id="other">`;
    const bullets = extractBulletsFromHtml(html);
    expect(bullets).toEqual(['First bullet point here', 'Second bullet point here']);
  });

  it('extracts description from productDescription div', () => {
    const html = `<div id="productDescription"><p>This is a great product</p></div><div id="other">`;
    const desc = extractDescriptionFromHtml(html);
    expect(desc).toBe('This is a great product');
  });

  it('extracts brand from bylineInfo', () => {
    const html = `<a id="bylineInfo">Visit the Acme Store</a>`;
    const brand = extractBrandFromHtml(html);
    expect(brand).toBe('Acme Store');
  });

  it('returns empty/null for missing HTML sections', () => {
    expect(extractBulletsFromHtml('<div>no bullets</div>')).toEqual([]);
    expect(extractDescriptionFromHtml('<div>no desc</div>')).toBeNull();
    expect(extractBrandFromHtml('<div>no brand</div>')).toBeNull();
  });
});
