import { ImageAsset, AnalysisResult, FixAttempt } from '@/types';

/**
 * Canonical helper for building ImageAsset from a session_images DB row.
 * Used by useSessionLoader for rehydration.
 */
export function buildAssetFromSessionImage(
  img: {
    id: string;
    image_name: string;
    image_type: string;
    analysis_result: unknown;
    fix_attempts?: unknown;
    fixed_image_url?: string | null;
  },
  file: File,
  signedOriginalUrl: string,
  signedFixedUrl?: string,
): { asset: ImageAsset; assetId: string } {
  const assetId = Math.random().toString(36).substring(2, 9);

  const asset: ImageAsset = {
    id: assetId,
    file,
    preview: signedOriginalUrl,
    type: img.image_type as 'MAIN' | 'SECONDARY',
    name: img.image_name,
    sourceUrl: signedOriginalUrl,
    analysisResult: img.analysis_result as unknown as AnalysisResult | undefined,
    fixedImage: signedFixedUrl,
  };

  return { asset, assetId };
}

/**
 * Canonical helper for building ImageAsset from a freshly downloaded file.
 * Used by useAuditSession import flows.
 */
export function buildAssetFromDownload(
  file: File,
  category: string,
  sourceUrl: string,
  contentHash: string,
  isMain: boolean,
): ImageAsset {
  const assetId = Math.random().toString(36).substring(2, 9);

  return {
    id: assetId,
    file,
    preview: URL.createObjectURL(file),
    type: isMain ? 'MAIN' : 'SECONDARY',
    name: `${category}_${file.name}`,
    sourceUrl,
    contentHash,
  };
}
