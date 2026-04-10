import { ImageAsset } from '@/types';

const CATEGORY_REGEX = /^(PRODUCT_SHOT|INFOGRAPHIC|LIFESTYLE|PRODUCT_IN_USE|SIZE_CHART|COMPARISON|PACKAGING|DETAIL|APLUS|MAIN|UNKNOWN)_/;

export type ImageCategory = 'PRODUCT_SHOT' | 'INFOGRAPHIC' | 'LIFESTYLE' | 'PRODUCT_IN_USE' | 'SIZE_CHART' | 'COMPARISON' | 'PACKAGING' | 'DETAIL' | 'APLUS' | 'MAIN' | 'UNKNOWN';

/**
 * Extract the image type category from an asset (for coverage logic).
 * Uses analysisResult.imageCategory or filename prefix.
 */
export function extractImageCategory(asset: ImageAsset): ImageCategory {
  const result = asset.analysisResult as any;
  if (result?.imageCategory && typeof result.imageCategory === 'string') {
    const upper = result.imageCategory.toUpperCase();
    if (CATEGORY_REGEX.source.includes(upper)) return upper as ImageCategory;
  }
  const match = asset.name.match(CATEGORY_REGEX);
  return (match ? match[1] : 'UNKNOWN') as ImageCategory;
}

/**
 * Extract the product category from an asset's analysis result.
 * This is the product vertical (e.g. FOOD_BEVERAGE, SUPPLEMENTS, APPAREL),
 * NOT the image type (LIFESTYLE, INFOGRAPHIC, etc.).
 */
export function extractProductCategory(asset: ImageAsset): string | null {
  const result = asset.analysisResult as any;
  return result?.productCategory || null;
}

/**
 * Returns the most common product category from analyzed assets.
 * Falls back to 'GENERAL' if no product category is available.
 */
export function getDominantProductCategory(assets: ImageAsset[]): string {
  const counts: Record<string, number> = {};
  for (const asset of assets) {
    const cat = extractProductCategory(asset);
    if (cat) {
      counts[cat] = (counts[cat] || 0) + 1;
    }
  }
  const entries = Object.entries(counts);
  if (entries.length === 0) return 'GENERAL';
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}
