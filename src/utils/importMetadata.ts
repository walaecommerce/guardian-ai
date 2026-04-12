import { ImageAsset } from '@/types';

/**
 * Structured import metadata tracking the provenance and state of an import.
 */
export interface ImportMetadata {
  sourceUrl: string;
  resolvedAsin: string | null;
  variantSignals: string[];        // e.g. "child ASIN detected", "color variant"
  importedImageUrls: string[];
  coverageNotes: string[];         // e.g. "only 7 of 9 images downloaded"
  heroConfirmed: boolean;
  confirmedHeroAssetId: string | null;
  importedAt: string;              // ISO timestamp
}

export function buildImportMetadata(
  sourceUrl: string,
  resolvedAsin: string | null,
  importedImageUrls: string[],
  coverageNotes: string[] = [],
  variantSignals: string[] = [],
): ImportMetadata {
  return {
    sourceUrl,
    resolvedAsin,
    variantSignals,
    importedImageUrls,
    coverageNotes,
    heroConfirmed: false,
    confirmedHeroAssetId: null,
    importedAt: new Date().toISOString(),
  };
}

/**
 * Returns true if hero confirmation is needed.
 * Single-image imports and confident Amazon imports are auto-confirmed.
 */
export function needsHeroConfirmation(assets: ImageAsset[], meta: ImportMetadata | null): boolean {
  if (!meta) return false;
  if (meta.heroConfirmed) return false;
  // Single image → auto-confirm
  if (assets.length <= 1) return false;
  return true;
}

/**
 * Auto-confirm hero for single-image imports.
 * Returns updated metadata or null if no change needed.
 */
export function autoConfirmSingleImage(
  assets: ImageAsset[],
  meta: ImportMetadata,
): ImportMetadata | null {
  if (assets.length === 1 && !meta.heroConfirmed) {
    return {
      ...meta,
      heroConfirmed: true,
      confirmedHeroAssetId: assets[0].id,
    };
  }
  return null;
}

/**
 * Auto-confirm hero for Amazon imports where the first image is confidently
 * identified as the hero (it was the first image from the listing).
 * Returns updated metadata or null if no change needed.
 */
export function autoConfirmAmazonHero(
  assets: ImageAsset[],
  meta: ImportMetadata,
): ImportMetadata | null {
  if (meta.heroConfirmed) return null;
  if (assets.length === 0) return null;
  // Amazon imports: first image is the listing hero — auto-confirm
  const heroAsset = assets.find(a => a.type === 'MAIN') || assets[0];
  return {
    ...meta,
    heroConfirmed: true,
    confirmedHeroAssetId: heroAsset.id,
  };
}

/**
 * Confirm a specific asset as the hero/main image.
 */
export function confirmHeroImage(
  meta: ImportMetadata,
  assetId: string,
): ImportMetadata {
  return {
    ...meta,
    heroConfirmed: true,
    confirmedHeroAssetId: assetId,
  };
}

/**
 * Apply hero confirmation to asset list: set the confirmed asset as MAIN,
 * all others as SECONDARY. Returns reordered assets with hero first.
 */
export function applyHeroSelection(
  assets: ImageAsset[],
  heroAssetId: string,
): ImageAsset[] {
  const hero = assets.find(a => a.id === heroAssetId);
  if (!hero) return assets;

  const rest = assets.filter(a => a.id !== heroAssetId);
  return [
    { ...hero, type: 'MAIN' as const },
    ...rest.map(a => ({ ...a, type: 'SECONDARY' as const })),
  ];
}

/**
 * Check whether audit should be gated (blocked) pending hero confirmation.
 */
export function isAuditGated(assets: ImageAsset[], meta: ImportMetadata | null): boolean {
  if (!meta) return false;
  return needsHeroConfirmation(assets, meta);
}
