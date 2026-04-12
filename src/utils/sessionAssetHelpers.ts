import { ImageAsset, AnalysisResult, FixAttempt, BestAttemptSelection, FixStrategy } from '@/types';

/**
 * Hydrate fix review data from the persisted fix_attempts JSONB column.
 * Returns partial ImageAsset fields for fix history display.
 */
function hydrateFixReview(fixAttemptsJson: unknown): Partial<ImageAsset> {
  if (!fixAttemptsJson || typeof fixAttemptsJson !== 'object') return {};

  const data = fixAttemptsJson as Record<string, unknown>;

  // New structured format: { attempts, bestAttemptSelection, stopReason, lastFixStrategy }
  if (Array.isArray(data.attempts)) {
    const attempts: FixAttempt[] = (data.attempts as any[]).map(a => ({
      attempt: a.attempt ?? 1,
      generatedImage: '', // Not persisted to save storage — only metadata
      status: a.status ?? 'passed',
      strategyUsed: a.strategyUsed,
      isBestAttempt: a.isBestAttempt,
      verification: a.verification,
      retryDecision: a.retryDecision,
    }));

    const bestAttemptSelection = data.bestAttemptSelection as BestAttemptSelection | undefined;

    return {
      fixAttempts: attempts,
      bestAttemptSelection: bestAttemptSelection,
      selectedAttemptIndex: bestAttemptSelection?.selectedAttemptIndex,
      fixStopReason: data.stopReason as string | undefined,
      lastFixStrategy: data.lastFixStrategy as FixStrategy | undefined,
    };
  }

  // Legacy: fix_attempts was an array directly (old format, no review data)
  if (Array.isArray(fixAttemptsJson)) {
    return {};
  }

  return {};
}

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

  const fixReview = hydrateFixReview(img.fix_attempts);

  const asset: ImageAsset = {
    id: assetId,
    file,
    preview: signedOriginalUrl,
    type: img.image_type as 'MAIN' | 'SECONDARY',
    name: img.image_name,
    sourceUrl: signedOriginalUrl,
    analysisResult: img.analysis_result as unknown as AnalysisResult | undefined,
    fixedImage: signedFixedUrl,
    ...fixReview,
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
