import { describe, it, expect } from 'vitest';
import { deriveCampaignStrategy } from '../campaignStrategy';
import { buildGenerationBrief } from '../strategyBriefBuilder';
import type { ProductKnowledge } from '../productKnowledge';
import type { ImageAsset, AnalysisResult } from '@/types';

const makePK = (overrides: Partial<ProductKnowledge> = {}): ProductKnowledge => ({
  identitySummary: 'TestBrand — Protein Powder',
  brand: 'TestBrand',
  productTypeHint: 'supplement',
  allowedTextCues: ['TestBrand'],
  supportedClaims: ['organic'],
  attributeHints: [],
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

const passAnalysis: AnalysisResult = {
  status: 'PASS',
  overallScore: 92,
  violations: [],
  recommendations: [],
  productCategory: 'SUPPLEMENTS',
  imageType: 'SECONDARY',
};

describe('Studio → Session → Strategy coverage round-trip', () => {
  it('strategy shows missing role before studio image is added', () => {
    const pk = makePK();
    const assets = [makeAsset('MAIN_hero.jpg')];
    const strategy = deriveCampaignStrategy(pk, assets);

    const infographic = strategy.roleCoverage.find(r => r.role === 'benefits_infographic');
    expect(infographic?.status).not.toBe('covered');

    const rec = strategy.recommendations.find(r => r.role === 'benefits_infographic');
    expect(rec).toBeDefined();
  });

  it('strategy updates to covered after studio image with matching category is added', () => {
    const pk = makePK();
    // Existing: hero only
    const assets = [makeAsset('MAIN_hero.jpg')];
    const strategyBefore = deriveCampaignStrategy(pk, assets);
    const infoBefore = strategyBefore.roleCoverage.find(r => r.role === 'benefits_infographic');
    expect(infoBefore?.status).not.toBe('covered');

    // After studio image added with INFOGRAPHIC category and analysis
    const studioAsset = makeAsset('INFOGRAPHIC_studio_benefits', {
      type: 'SECONDARY',
      analysisResult: passAnalysis,
    });
    const updatedAssets = [...assets, studioAsset];
    const strategyAfter = deriveCampaignStrategy(pk, updatedAssets);
    const infoAfter = strategyAfter.roleCoverage.find(r => r.role === 'benefits_infographic');
    expect(infoAfter?.status).toBe('covered');
  });

  it('brief includes sourceSessionId for round-trip tracking', () => {
    const pk = makePK();
    const rec = { role: 'benefits_infographic' as const, label: 'Benefits Infographic', rationale: 'test', priority: 'essential' as const };
    const brief = buildGenerationBrief(rec, pk, null, 'session-123');
    expect(brief.sourceSessionId).toBe('session-123');
  });

  it('strategy still works without analysis results on new asset', () => {
    const pk = makePK();
    // Studio asset attached but not yet analyzed (pending)
    const assets = [
      makeAsset('MAIN_hero.jpg'),
      makeAsset('INFOGRAPHIC_studio_pending', { type: 'SECONDARY' }),
    ];
    const strategy = deriveCampaignStrategy(pk, assets);
    // Should still detect coverage from category name match
    const info = strategy.roleCoverage.find(r => r.role === 'benefits_infographic');
    expect(info?.status).toBe('covered');
  });

  it('normal studio flow works without session attachment', () => {
    const brief = buildGenerationBrief(
      { role: 'hero', label: 'Hero Shot', rationale: '', priority: 'essential' },
      null, null,
    );
    expect(brief.sourceSessionId).toBeUndefined();
    expect(brief.templateId).toBe('hero');
  });

  it('handles insufficient credits gracefully (image still attached without analysis)', () => {
    const pk = makePK();
    // Simulate: studio image attached but with no analysis (credits exhausted)
    const pendingAsset = makeAsset('LIFESTYLE_CONTEXT_studio_noCreds', {
      type: 'SECONDARY',
      // no analysisResult — simulates credit exhaustion
    });
    const assets = [makeAsset('MAIN_hero.jpg'), pendingAsset];
    const strategy = deriveCampaignStrategy(pk, assets);
    // Coverage detection still works from name/category
    const lifestyle = strategy.roleCoverage.find(r => r.role === 'lifestyle_context');
    expect(lifestyle?.status).toBe('covered');
    // Strategy is still functional
    expect(strategy.isActionable).toBe(true);
  });
});
