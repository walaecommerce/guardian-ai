import { describe, it, expect } from 'vitest';
import { extractImageCategory, extractProductCategory, getDominantProductCategory } from '../imageCategory';
import { ImageAsset } from '@/types';

function makeAsset(overrides: Partial<ImageAsset> = {}): ImageAsset {
  return {
    id: '1',
    file: new File([], 'test.jpg'),
    preview: '',
    type: 'SECONDARY',
    name: 'test.jpg',
    ...overrides,
  };
}

describe('extractImageCategory', () => {
  it('extracts from analysisResult.imageCategory', () => {
    const asset = makeAsset({ analysisResult: { imageCategory: 'LIFESTYLE' } as any });
    expect(extractImageCategory(asset)).toBe('LIFESTYLE');
  });

  it('extracts from filename prefix', () => {
    const asset = makeAsset({ name: 'INFOGRAPHIC_hero.jpg' });
    expect(extractImageCategory(asset)).toBe('INFOGRAPHIC');
  });

  it('returns UNKNOWN for unrecognized prefix', () => {
    const asset = makeAsset({ name: 'random_image.jpg' });
    expect(extractImageCategory(asset)).toBe('UNKNOWN');
  });

  it('handles case-insensitive analysisResult', () => {
    const asset = makeAsset({ analysisResult: { imageCategory: 'lifestyle' } as any });
    expect(extractImageCategory(asset)).toBe('LIFESTYLE');
  });

  it('falls back to filename when analysisResult category is empty', () => {
    const asset = makeAsset({
      name: 'MAIN_product.jpg',
      analysisResult: { imageCategory: '' } as any,
    });
    expect(extractImageCategory(asset)).toBe('MAIN');
  });
});

describe('extractProductCategory', () => {
  it('returns product category from analysis', () => {
    const asset = makeAsset({ analysisResult: { productCategory: 'FOOD_BEVERAGE' } as any });
    expect(extractProductCategory(asset)).toBe('FOOD_BEVERAGE');
  });

  it('returns null when not available', () => {
    const asset = makeAsset();
    expect(extractProductCategory(asset)).toBeNull();
  });
});

describe('getDominantProductCategory', () => {
  it('returns most common category', () => {
    const assets = [
      makeAsset({ analysisResult: { productCategory: 'FOOD_BEVERAGE' } as any }),
      makeAsset({ analysisResult: { productCategory: 'FOOD_BEVERAGE' } as any }),
      makeAsset({ analysisResult: { productCategory: 'SUPPLEMENTS' } as any }),
    ];
    expect(getDominantProductCategory(assets)).toBe('FOOD_BEVERAGE');
  });

  it('returns GENERAL when no product categories', () => {
    expect(getDominantProductCategory([makeAsset()])).toBe('GENERAL');
  });
});
