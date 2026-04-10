import { ImageAsset } from '@/types';

const CATEGORY_REGEX = /^(PRODUCT_SHOT|INFOGRAPHIC|LIFESTYLE|PRODUCT_IN_USE|SIZE_CHART|COMPARISON|PACKAGING|DETAIL|APLUS|MAIN|UNKNOWN)_/;

export type ImageCategory = 'PRODUCT_SHOT' | 'INFOGRAPHIC' | 'LIFESTYLE' | 'PRODUCT_IN_USE' | 'SIZE_CHART' | 'COMPARISON' | 'PACKAGING' | 'DETAIL' | 'APLUS' | 'MAIN' | 'UNKNOWN';

export function extractImageCategory(asset: ImageAsset): ImageCategory {
  // Prefer analysisResult.imageCategory if the backend set it
  const result = asset.analysisResult as any;
  if (result?.imageCategory && typeof result.imageCategory === 'string') {
    const upper = result.imageCategory.toUpperCase();
    if (CATEGORY_REGEX.source.includes(upper)) return upper as ImageCategory;
  }
  // Extract from prefixed filename
  const match = asset.name.match(CATEGORY_REGEX);
  return (match ? match[1] : 'UNKNOWN') as ImageCategory;
}

/**
 * Returns the most common non-UNKNOWN category from a set of assets.
 */
export function getDominantCategory(assets: ImageAsset[]): string {
  const counts: Record<string, number> = {};
  for (const asset of assets) {
    const cat = extractImageCategory(asset);
    if (cat !== 'UNKNOWN') {
      counts[cat] = (counts[cat] || 0) + 1;
    }
  }
  const entries = Object.entries(counts);
  if (entries.length === 0) return 'UNKNOWN';
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}
