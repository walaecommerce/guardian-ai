/**
 * Fixability Classification Layer
 *
 * Classifies violations and image assets into fixability tiers:
 * - auto_fixable: Safe for AI generation pipeline
 * - warn_only: Flag to user, do not auto-fix
 * - manual_review: Skip in batch, require human decision
 */

import type { Violation, ImageAsset, ImageCategory } from '@/types';
import { extractImageCategory } from '@/utils/imageCategory';

export type FixabilityTier = 'auto_fixable' | 'warn_only' | 'manual_review';

export interface FixabilityResult {
  tier: FixabilityTier;
  reason: string;
  /** If true, this asset should be skipped in batch Fix All */
  skipInBatch: boolean;
}

// ── Content types that should never be auto-fixed ──

const NEVER_AUTO_FIX_CONTENT_TYPES: Set<string> = new Set([
  'SIZE_CHART',
  'COMPARISON',
]);

// ── Content types where only narrow/safe fixes are allowed ──

const NARROW_FIX_ONLY_CONTENT_TYPES: Set<string> = new Set([
  'INFOGRAPHIC',
]);

// ── Violation patterns that are warn-only (not generatively fixable) ──

const WARN_ONLY_PATTERNS = [
  'blur',
  'blurry',
  'low resolution',
  'low-resolution',
  'pixelat',
  'sharpness',
  'out of focus',
  'unfocused',
  'jagged',
  'upscal',
];

function matchesWarnOnlyPattern(violation: Violation): boolean {
  const text = `${violation.category} ${violation.message} ${violation.recommendation}`.toLowerCase();
  return WARN_ONLY_PATTERNS.some(p => text.includes(p));
}

// ── Violation patterns that are safely auto-fixable ──

const SAFE_FIX_PATTERNS = [
  'background',
  'white bg',
  'rgb(255',
  'overlay',
  'badge',
  'watermark',
  'promotional',
  'occupancy',
  'occupies',
  'crop',
  'frame',
  'logo',
  'text overlay',
];

function isSafeFixViolation(violation: Violation): boolean {
  const text = `${violation.category} ${violation.message} ${violation.recommendation}`.toLowerCase();
  return SAFE_FIX_PATTERNS.some(p => text.includes(p));
}

/**
 * Classify a single violation's fixability.
 */
export function classifyViolationFixability(violation: Violation): FixabilityTier {
  if (matchesWarnOnlyPattern(violation)) return 'warn_only';
  if (isSafeFixViolation(violation)) return 'auto_fixable';
  // Default: assume auto_fixable for unrecognized patterns
  return 'auto_fixable';
}

/**
 * Classify an asset's overall fixability based on its content type and violations.
 */
export function classifyAssetFixability(asset: ImageAsset): FixabilityResult {
  const contentType = extractImageCategory(asset);

  // Content types that should never be auto-fixed
  if (NEVER_AUTO_FIX_CONTENT_TYPES.has(contentType)) {
    return {
      tier: 'manual_review',
      reason: `${formatContentType(contentType)} images contain structured data that AI cannot safely regenerate.`,
      skipInBatch: true,
    };
  }

  const violations = asset.analysisResult?.violations || [];

  // Infographics: only allow narrow safe fixes (overlays/badges)
  if (NARROW_FIX_ONLY_CONTENT_TYPES.has(contentType)) {
    const hasOnlySafeFixes = violations.every(v => isSafeFixViolation(v));
    const hasOverlayOnly = violations.every(v => {
      const text = `${v.category} ${v.message}`.toLowerCase();
      return text.includes('overlay') || text.includes('badge') || text.includes('watermark') || text.includes('promotional');
    });
    if (violations.length === 0) {
      return { tier: 'auto_fixable', reason: 'No violations found.', skipInBatch: false };
    }
    if (!hasOnlySafeFixes || !hasOverlayOnly) {
      return {
        tier: 'manual_review',
        reason: `${formatContentType(contentType)} images contain text/layout that could be corrupted by AI editing. Only overlay removal is safe.`,
        skipInBatch: true,
      };
    }
  }

  // Check if ALL violations are warn-only (not generatively fixable)
  if (violations.length > 0 && violations.every(v => matchesWarnOnlyPattern(v))) {
    return {
      tier: 'warn_only',
      reason: 'Issues like blur or low resolution cannot be fixed by AI generation. Consider re-shooting or using a higher-resolution source.',
      skipInBatch: true,
    };
  }

  // Mixed: some fixable, some warn-only → still allow fix but note limitations
  const fixableViolations = violations.filter(v => !matchesWarnOnlyPattern(v));
  if (fixableViolations.length === 0 && violations.length > 0) {
    return {
      tier: 'warn_only',
      reason: 'No auto-fixable issues detected. Remaining issues require manual attention.',
      skipInBatch: true,
    };
  }

  return {
    tier: 'auto_fixable',
    reason: '',
    skipInBatch: false,
  };
}

/**
 * Filter assets that are safe for batch Fix All.
 * Returns { fixable, skipped } with reasons for skipped items.
 */
export function partitionBatchFixTargets(assets: ImageAsset[]): {
  fixable: ImageAsset[];
  skipped: Array<{ asset: ImageAsset; reason: string }>;
} {
  const fixable: ImageAsset[] = [];
  const skipped: Array<{ asset: ImageAsset; reason: string }> = [];

  for (const asset of assets) {
    const classification = classifyAssetFixability(asset);
    if (classification.skipInBatch) {
      skipped.push({ asset, reason: classification.reason });
    } else {
      fixable.push(asset);
    }
  }

  return { fixable, skipped };
}

function formatContentType(ct: string): string {
  return ct.replace(/_/g, ' ').split(' ').map(w =>
    w.charAt(0) + w.slice(1).toLowerCase()
  ).join(' ');
}
