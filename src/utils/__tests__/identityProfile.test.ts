import { describe, it, expect } from 'vitest';
import {
  buildIdentityProfile,
  fromSingleIdentity,
  IdentityObservation,
} from '../identityProfile';

describe('buildIdentityProfile', () => {
  const mainObs: IdentityObservation = {
    sourceImageId: 'img-1',
    sourceImageType: 'MAIN',
    identity: {
      brandName: 'Acme',
      productName: 'Widget Pro',
      dominantColors: ['#FF0000', '#FFFFFF'],
      packagingType: 'box',
      shapeDescription: 'rectangular box',
      labelText: ['Acme Widget Pro', '500mg'],
      keyVisualFeatures: ['red cap', 'glossy finish'],
      productDescriptor: 'Acme Widget Pro in red box',
    },
  };

  const secondaryObs: IdentityObservation = {
    sourceImageId: 'img-2',
    sourceImageType: 'SECONDARY',
    identity: {
      brandName: 'Acme',
      productName: 'Widget Pro',
      dominantColors: ['#FF0000', '#000000'],
      packagingType: 'box',
      shapeDescription: 'rectangular box',
      labelText: ['Acme Widget Pro', 'Premium Quality'],
      keyVisualFeatures: ['glossy finish', 'gold trim'],
      productDescriptor: 'Acme Widget Pro side view',
    },
  };

  it('merges identity from multiple images with recurring attributes winning', () => {
    const profile = buildIdentityProfile([mainObs, secondaryObs]);
    expect(profile.identity.brandName).toBe('Acme');
    expect(profile.identity.packagingType).toBe('box');
    expect(profile.identity.shapeDescription).toBe('rectangular box');
    // Recurring colors should appear
    expect(profile.identity.dominantColors).toContain('#FF0000');
    // Recurring features
    expect(profile.identity.keyVisualFeatures).toContain('glossy finish');
    expect(profile.sourceImageIds).toContain('img-1');
    expect(profile.sourceImageIds).toContain('img-2');
    expect(profile.isSingleSourceFallback).toBe(false);
  });

  it('detects conflicts between images', () => {
    const conflicting: IdentityObservation = {
      sourceImageId: 'img-3',
      sourceImageType: 'SECONDARY',
      identity: {
        brandName: 'BrandX',
        productName: 'Different Product',
        dominantColors: [],
        packagingType: 'bottle',
        shapeDescription: 'tall cylinder',
        labelText: [],
        keyVisualFeatures: [],
        productDescriptor: '',
      },
    };
    const profile = buildIdentityProfile([mainObs, conflicting]);
    expect(profile.conflicts.length).toBeGreaterThan(0);
    // Brand conflict detected
    const brandConf = profile.fieldConfidence.find(f => f.field === 'brandName');
    expect(brandConf?.conflict).toBe(true);
  });

  it('handles single-image fallback gracefully', () => {
    const profile = buildIdentityProfile([mainObs]);
    expect(profile.isSingleSourceFallback).toBe(true);
    expect(profile.identity.brandName).toBe('Acme');
    expect(profile.completeness).toBeGreaterThan(0);
  });

  it('handles empty observations', () => {
    const profile = buildIdentityProfile([]);
    expect(profile.identity.brandName).toBe('Unknown');
    expect(profile.completeness).toBe(0);
    expect(profile.isSingleSourceFallback).toBe(true);
  });

  it('prefers MAIN image values over SECONDARY when conflicting', () => {
    const secondary: IdentityObservation = {
      sourceImageId: 'img-2',
      sourceImageType: 'SECONDARY',
      identity: {
        brandName: 'OtherBrand',
        productName: 'Widget Pro',
        dominantColors: [],
        packagingType: 'box',
        shapeDescription: '',
        labelText: [],
        keyVisualFeatures: [],
        productDescriptor: '',
      },
    };
    // Two secondaries with 'OtherBrand' vs one MAIN with 'Acme'
    // But mostCommon should pick recurring over one-off
    const profile = buildIdentityProfile([mainObs, secondary, { ...secondary, sourceImageId: 'img-3' }]);
    // Two 'OtherBrand' vs one 'Acme' — recurring wins
    expect(profile.identity.brandName).toBe('OtherBrand');
    expect(profile.fieldConfidence.find(f => f.field === 'brandName')?.conflict).toBe(true);
  });

  it('recurring attributes win over noisy one-offs', () => {
    const obs1: IdentityObservation = {
      sourceImageId: 'a', sourceImageType: 'MAIN',
      identity: { brandName: 'Acme', productName: '', dominantColors: ['#FF0000'], packagingType: 'box', shapeDescription: 'cube', labelText: ['Acme'], keyVisualFeatures: ['red cap'], productDescriptor: '' },
    };
    const obs2: IdentityObservation = {
      sourceImageId: 'b', sourceImageType: 'SECONDARY',
      identity: { brandName: 'Acme', productName: '', dominantColors: ['#FF0000', '#00FF00'], packagingType: 'box', shapeDescription: 'cube', labelText: ['Acme'], keyVisualFeatures: ['red cap', 'noise'], productDescriptor: '' },
    };
    const obs3: IdentityObservation = {
      sourceImageId: 'c', sourceImageType: 'SECONDARY',
      identity: { brandName: 'Acme', productName: '', dominantColors: ['#FF0000'], packagingType: 'box', shapeDescription: 'cube', labelText: ['Acme'], keyVisualFeatures: ['red cap'], productDescriptor: '' },
    };
    const profile = buildIdentityProfile([obs1, obs2, obs3]);
    // '#FF0000' appears 3x, should be first
    expect(profile.identity.dominantColors[0]).toBe('#FF0000');
    // 'red cap' appears 3x, 'noise' 1x — red cap should be first
    expect(profile.identity.keyVisualFeatures[0]).toBe('red cap');
    // No conflicts since brand is consistent
    expect(profile.fieldConfidence.find(f => f.field === 'brandName')?.conflict).toBe(false);
    expect(profile.fieldConfidence.find(f => f.field === 'brandName')?.confidence).toBe('high');
  });

  it('calculates completeness correctly', () => {
    const profile = buildIdentityProfile([mainObs]);
    expect(profile.completeness).toBe(100); // All fields filled
  });
});

describe('fromSingleIdentity', () => {
  it('wraps a legacy identity card into a profile', () => {
    const card = {
      brandName: 'Acme',
      productName: 'Widget',
      dominantColors: ['#FFF'],
      packagingType: 'box',
      shapeDescription: 'square',
      labelText: ['Acme'],
      keyVisualFeatures: ['logo'],
      productDescriptor: 'Acme Widget',
    };
    const profile = fromSingleIdentity(card, 'img-1');
    expect(profile.isSingleSourceFallback).toBe(true);
    expect(profile.identity.brandName).toBe('Acme');
    expect(profile.sourceImageIds).toEqual(['img-1']);
  });
});
