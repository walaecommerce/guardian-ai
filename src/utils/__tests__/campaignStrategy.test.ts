import { describe, it, expect } from 'vitest';
import { deriveCampaignStrategy } from '../campaignStrategy';
import type { ProductKnowledge } from '../productKnowledge';
import type { ImageAsset } from '@/types';

const makePK = (overrides: Partial<ProductKnowledge> = {}): ProductKnowledge => ({
  identitySummary: 'TestBrand — Whey Protein Powder',
  brand: 'TestBrand',
  productTypeHint: 'supplement',
  allowedTextCues: ['TestBrand', 'Whey Protein'],
  supportedClaims: ['non-gmo', 'third party tested'],
  attributeHints: ['Flavor: Chocolate'],
  completeness: 70,
  isActionable: true,
  ...overrides,
});

const makeAsset = (name: string, overrides: Partial<ImageAsset> = {}): ImageAsset => ({
  id: name,
  file: new File([], name),
  preview: '',
  type: name.startsWith('MAIN') ? 'MAIN' : 'SECONDARY',
  name,
  ...overrides,
});

describe('deriveCampaignStrategy', () => {
  it('returns non-actionable strategy for null knowledge', () => {
    const strategy = deriveCampaignStrategy(null, []);
    expect(strategy.isActionable).toBe(false);
    expect(strategy.recommendations).toEqual([]);
    expect(strategy.roleCoverage).toEqual([]);
  });

  it('returns non-actionable for low-completeness knowledge', () => {
    const pk = makePK({ completeness: 10, isActionable: false });
    const strategy = deriveCampaignStrategy(pk, []);
    expect(strategy.isActionable).toBe(false);
  });

  it('detects hero coverage from MAIN image', () => {
    const pk = makePK();
    const assets = [makeAsset('MAIN_product.jpg')];
    const strategy = deriveCampaignStrategy(pk, assets);
    expect(strategy.isActionable).toBe(true);
    const hero = strategy.roleCoverage.find(r => r.role === 'hero');
    expect(hero?.status).toBe('covered');
    expect(hero?.coveredBy).toContain('MAIN_product.jpg');
  });

  it('detects missing infographic role', () => {
    const pk = makePK();
    const assets = [makeAsset('MAIN_product.jpg')];
    const strategy = deriveCampaignStrategy(pk, assets);
    const infographic = strategy.roleCoverage.find(r => r.role === 'benefits_infographic');
    expect(infographic?.status).toBe('missing');
  });

  it('detects covered infographic from INFOGRAPHIC_ prefix', () => {
    const pk = makePK();
    const assets = [
      makeAsset('MAIN_product.jpg'),
      makeAsset('INFOGRAPHIC_benefits.jpg'),
    ];
    const strategy = deriveCampaignStrategy(pk, assets);
    const infographic = strategy.roleCoverage.find(r => r.role === 'benefits_infographic');
    expect(infographic?.status).toBe('covered');
  });

  it('generates recommendations for missing essential roles', () => {
    const pk = makePK();
    const assets = [makeAsset('MAIN_product.jpg')];
    const strategy = deriveCampaignStrategy(pk, assets);
    expect(strategy.recommendations.length).toBeGreaterThan(0);
    // Supplement should recommend ingredients/specs as essential
    const ingredientRec = strategy.recommendations.find(r => r.role === 'ingredients_specs');
    expect(ingredientRec).toBeDefined();
    expect(ingredientRec!.priority).toBe('essential');
  });

  it('uses product type for role priorities (apparel)', () => {
    const pk = makePK({ productTypeHint: 'apparel' });
    const assets = [makeAsset('MAIN_product.jpg')];
    const strategy = deriveCampaignStrategy(pk, assets);
    // Apparel should have dimensions/size as essential
    const sizeRole = strategy.roleCoverage.find(r => r.role === 'dimensions_size');
    expect(sizeRole?.priority).toBe('essential');
    expect(sizeRole?.status).toBe('missing');
  });

  it('detects weak coverage when asset has low score', () => {
    const pk = makePK();
    const assets = [
      makeAsset('MAIN_product.jpg', {
        analysisResult: {
          overallScore: 30,
          status: 'FAIL',
          violations: [{ severity: 'critical', category: 'bg', message: 'bad', recommendation: 'fix' }],
          fixRecommendations: [],
        },
      }),
    ];
    const strategy = deriveCampaignStrategy(pk, assets);
    const hero = strategy.roleCoverage.find(r => r.role === 'hero');
    expect(hero?.status).toBe('weak');
    expect(hero?.weakReason).toContain('critical');
  });

  it('sets high confidence with complete knowledge and multiple assets', () => {
    const pk = makePK({ completeness: 80 });
    const assets = [
      makeAsset('MAIN_product.jpg'),
      makeAsset('INFOGRAPHIC_benefits.jpg'),
      makeAsset('LIFESTYLE_shot.jpg'),
    ];
    const strategy = deriveCampaignStrategy(pk, assets);
    expect(strategy.confidence).toBe('high');
  });

  it('sets low confidence with sparse knowledge', () => {
    const pk = makePK({ completeness: 25 });
    const assets = [makeAsset('MAIN_product.jpg')];
    const strategy = deriveCampaignStrategy(pk, assets);
    expect(strategy.confidence).toBe('low');
  });

  it('caps recommendations at 5', () => {
    const pk = makePK();
    const assets: ImageAsset[] = []; // no images = all roles missing
    const strategy = deriveCampaignStrategy(pk, assets);
    expect(strategy.recommendations.length).toBeLessThanOrEqual(5);
  });

  it('includes claim-aware rationale in recommendations', () => {
    const pk = makePK({ supportedClaims: ['organic', 'non-gmo'] });
    const assets = [makeAsset('MAIN_product.jpg')];
    const strategy = deriveCampaignStrategy(pk, assets);
    const infoRec = strategy.recommendations.find(r => r.role === 'benefits_infographic');
    expect(infoRec?.rationale).toContain('organic');
  });

  it('returns positioning summary with brand and type', () => {
    const pk = makePK();
    const strategy = deriveCampaignStrategy(pk, []);
    expect(strategy.productPositioning).toContain('TestBrand');
    expect(strategy.productPositioning).toContain('supplement');
  });
});
