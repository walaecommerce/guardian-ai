import { describe, it, expect } from 'vitest';

/**
 * Tests that listing context is shaped correctly for edge function consumption
 * and that prompt-building logic handles present/missing context gracefully.
 */

// Simulate the listing context shape sent to edge functions
interface ListingContextPayload {
  title: string;
  brand: string | null;
  bullets: string[];
  claims: string[];
  description?: string | null;
}

function buildAnalyzeListingSection(ctx: ListingContextPayload | null | undefined): string {
  if (!ctx || typeof ctx !== 'object') return '';
  const parts: string[] = [];
  if (ctx.brand) parts.push(`Brand: ${ctx.brand}`);
  if (ctx.title) parts.push(`Product: ${ctx.title}`);
  if (Array.isArray(ctx.bullets) && ctx.bullets.length > 0) {
    parts.push(`Key bullets:\n${ctx.bullets.slice(0, 5).map(b => `  - ${b}`).join('\n')}`);
  }
  if (Array.isArray(ctx.claims) && ctx.claims.length > 0) {
    parts.push(`Known claims: ${ctx.claims.slice(0, 8).join(', ')}`);
  }
  if (ctx.description) {
    parts.push(`Description excerpt: ${String(ctx.description).substring(0, 200)}`);
  }
  if (parts.length === 0) return '';
  return `\n\nLISTING CONTEXT (use to understand the product — do NOT require every claim to appear visually):\n${parts.join('\n')}`;
}

function buildFixGuardrails(ctx: ListingContextPayload | null | undefined): string {
  if (!ctx || typeof ctx !== 'object') return '';
  const parts: string[] = [];
  if (ctx.brand) parts.push(`Brand: ${ctx.brand}`);
  if (ctx.title) parts.push(`Product: ${ctx.title}`);
  if (Array.isArray(ctx.claims) && ctx.claims.length > 0) {
    parts.push(`Valid claims on packaging: ${ctx.claims.slice(0, 6).join(', ')}`);
  }
  if (parts.length === 0) return '';
  return `\n\nLISTING CONTEXT GUARDRAILS:\n${parts.join('\n')}`;
}

describe('Listing context in audit prompts', () => {
  it('includes brand, title, bullets, and claims when present', () => {
    const ctx: ListingContextPayload = {
      title: 'Acme Vitamin D3 5000 IU',
      brand: 'Acme',
      bullets: ['Made in USA', '100% organic'],
      claims: ['organic', 'made in usa'],
    };
    const section = buildAnalyzeListingSection(ctx);
    expect(section).toContain('Brand: Acme');
    expect(section).toContain('Product: Acme Vitamin D3 5000 IU');
    expect(section).toContain('Made in USA');
    expect(section).toContain('organic, made in usa');
    expect(section).toContain('do NOT require every claim to appear visually');
  });

  it('returns empty string when context is null', () => {
    expect(buildAnalyzeListingSection(null)).toBe('');
    expect(buildAnalyzeListingSection(undefined)).toBe('');
  });

  it('returns empty string when context has no useful fields', () => {
    const ctx: ListingContextPayload = { title: '', brand: null, bullets: [], claims: [] };
    expect(buildAnalyzeListingSection(ctx)).toBe('');
  });

  it('truncates description to 200 chars', () => {
    const longDesc = 'A'.repeat(300);
    const ctx: ListingContextPayload = { title: 'Product', brand: null, bullets: [], claims: [], description: longDesc };
    const section = buildAnalyzeListingSection(ctx);
    expect(section).toContain('A'.repeat(200));
    expect(section).not.toContain('A'.repeat(201));
  });

  it('limits bullets to 5', () => {
    const ctx: ListingContextPayload = {
      title: 'Product', brand: null,
      bullets: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7'], claims: [],
    };
    const section = buildAnalyzeListingSection(ctx);
    expect(section).toContain('b5');
    expect(section).not.toContain('b6');
  });
});

describe('Listing context in fix guardrails', () => {
  it('includes brand and claims for fix prompts', () => {
    const ctx: ListingContextPayload = {
      title: 'NatureMade Fish Oil',
      brand: 'NatureMade',
      bullets: [],
      claims: ['non-gmo', 'gluten-free'],
    };
    const section = buildFixGuardrails(ctx);
    expect(section).toContain('Brand: NatureMade');
    expect(section).toContain('non-gmo, gluten-free');
    expect(section).toContain('GUARDRAILS');
  });

  it('does not instruct model to add bullet text into image', () => {
    const ctx: ListingContextPayload = {
      title: 'Product', brand: 'TestBrand',
      bullets: ['Feature 1', 'Feature 2'], claims: [],
    };
    const section = buildFixGuardrails(ctx);
    // Should NOT contain bullet text since we only include claims and brand
    expect(section).not.toContain('Feature 1');
    expect(section).not.toContain('Feature 2');
  });

  it('returns empty for null context', () => {
    expect(buildFixGuardrails(null)).toBe('');
  });

  it('limits claims to 6', () => {
    const ctx: ListingContextPayload = {
      title: 'Product', brand: null, bullets: [],
      claims: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'],
    };
    const section = buildFixGuardrails(ctx);
    expect(section).toContain('c6');
    expect(section).not.toContain('c7');
  });
});
