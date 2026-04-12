/**
 * Fix Plan Engine — Phase 3
 *
 * Builds a structured FixPlan based on image role, category, violations,
 * and deterministic findings. MAIN images default to edit-preserving
 * strategies; full-regeneration is only an explicit fallback.
 */

import type {
  FixPlan,
  FixStrategy,
  Violation,
  DeterministicFindingSummary,
  ProductIdentityCard,
} from '@/types';

// ── Category-specific preservation / prohibition maps ──────────

const CATEGORY_PRESERVE: Record<string, string[]> = {
  APPAREL: ['garment shape', 'cut', 'fabric texture', 'color', 'stitching', 'print/pattern'],
  FOOTWEAR: ['shoe shape', 'material', 'color', 'sole pattern', 'lace/strap detail'],
  JEWELRY: ['metal/stone arrangement', 'settings', 'finish', 'clasp detail'],
  HANDBAGS_LUGGAGE: ['handles', 'straps', 'hardware', 'silhouette', 'zipper detail'],
  HARDLINES: ['ports', 'controls', 'safety labels', 'dimensions', 'assembly detail'],
  ELECTRONICS: ['ports', 'controls', 'screen', 'safety labels', 'dimensions', 'LED indicators'],
  FOOD_BEVERAGE: ['all packaging text', 'label claims', 'nutrition info', 'flavor name', 'brand logo', 'seal/cap'],
  SUPPLEMENTS: ['all packaging text', 'label claims', 'dosage info', 'supplement facts', 'brand logo', 'seal'],
  BEAUTY_PERSONAL_CARE: ['label text', 'ingredient claims', 'brand logo', 'pump/cap detail', 'surface finish'],
  PET_SUPPLIES: ['packaging text', 'label claims', 'brand logo', 'sizing info'],
  GENERAL_MERCHANDISE: ['product surface details', 'printed elements', 'brand markings'],
  GENERAL: ['product surface details', 'printed elements', 'brand markings'],
};

const CATEGORY_PROHIBITED: Record<string, string[]> = {
  APPAREL: ['do not alter fabric texture', 'do not change garment color', 'do not reshape garment'],
  FOOTWEAR: ['do not change shoe geometry', 'do not invent different pair', 'do not alter material'],
  JEWELRY: ['do not move stones/settings', 'do not change metal finish', 'do not redesign piece'],
  HANDBAGS_LUGGAGE: ['do not remove hardware', 'do not change strap configuration', 'do not alter silhouette'],
  HARDLINES: ['do not remove safety labels', 'do not obscure ports/controls'],
  ELECTRONICS: ['do not remove safety labels', 'do not obscure ports/controls', 'do not flatten screen reflection'],
  FOOD_BEVERAGE: ['do not change label text', 'do not alter packaging colors', 'do not hallucinate ingredient claims'],
  SUPPLEMENTS: ['do not change label text', 'do not alter health claims', 'do not hallucinate dosage info'],
  BEAUTY_PERSONAL_CARE: ['do not change label text', 'do not alter ingredient claims', 'do not change surface finish'],
  PET_SUPPLIES: ['do not change label text', 'do not alter packaging imagery'],
  GENERAL_MERCHANDISE: ['do not change printed elements'],
  GENERAL: ['do not change printed elements'],
};

const CATEGORY_CONSTRAINTS: Record<string, string[]> = {
  APPAREL: ['prefer reframe/background cleanup over generative restyling', 'ghost mannequin or flat lay preferred for main'],
  FOOTWEAR: ['single left shoe at 45° facing left for main', 'preserve shoe material texture exactly'],
  JEWELRY: ['prefer macro cleanup/reframe over redesign', 'no mannequin or model on main'],
  HANDBAGS_LUGGAGE: ['upright front-facing with handles visible for main', 'full product visible, no cropping'],
  HARDLINES: ['white background strictly enforced', 'include environment/size-fit for secondary'],
  ELECTRONICS: ['3/4 angle showing depth for main', 'visible ports and screens required'],
  FOOD_BEVERAGE: ['front label is the hero element', 'packaging text must be fully legible'],
  SUPPLEMENTS: ['clinical clarity required', 'front label must be crisp and readable'],
  BEAUTY_PERSONAL_CARE: ['luxurious lighting with accurate surface reflections', 'label text must be legible'],
  PET_SUPPLIES: ['treats front-facing for main', 'label prominently visible'],
  GENERAL_MERCHANDISE: [],
  GENERAL: [],
};

// ── Strategy selection helpers ──────────────────────────────────

function hasViolationCategory(violations: Violation[], ...keywords: string[]): boolean {
  return violations.some(v => {
    const text = `${v.category} ${v.message} ${v.recommendation}`.toLowerCase();
    return keywords.some(kw => text.includes(kw));
  });
}

function hasDeterministicIssue(findings: DeterministicFindingSummary[], ...ruleFragments: string[]): boolean {
  return findings.some(f =>
    !f.passed && ruleFragments.some(frag => f.rule_id.toLowerCase().includes(frag))
  );
}

function selectMainStrategy(
  violations: Violation[],
  findings: DeterministicFindingSummary[],
): FixStrategy {
  const hasBg = hasViolationCategory(violations, 'background', 'white bg', 'rgb(255')
    || hasDeterministicIssue(findings, 'white_bg', 'background');

  const hasOccupancy = hasViolationCategory(violations, 'occupancy', 'occupies', 'frame', 'crop')
    || hasDeterministicIssue(findings, 'occupancy');

  const hasOverlay = hasViolationCategory(violations, 'badge', 'overlay', 'watermark', 'promotional', 'text overlay')
    || hasDeterministicIssue(findings, 'overlay', 'badge');

  // Single-issue fast paths
  if (hasBg && !hasOccupancy && !hasOverlay) return 'bg-cleanup';
  if (hasOccupancy && !hasBg && !hasOverlay) return 'crop-reframe';
  if (hasOverlay && !hasBg && !hasOccupancy) return 'overlay-removal';

  // Multiple issues → surgical inpaint
  if (hasBg || hasOccupancy || hasOverlay) return 'inpaint-edit';

  // Default safest for MAIN when no specific issues detected
  return 'bg-cleanup';
}

function selectSecondaryStrategy(
  violations: Violation[],
  contentType?: string,
): FixStrategy {
  // Content types that should never be auto-fixed
  if (contentType === 'SIZE_CHART' || contentType === 'COMPARISON') {
    return 'skip';
  }

  const hasOverlay = hasViolationCategory(violations, 'badge', 'overlay', 'watermark', 'promotional');

  // Infographics: only allow overlay removal, nothing else
  if (contentType === 'INFOGRAPHIC') {
    return hasOverlay ? 'overlay-removal' : 'skip';
  }

  if (hasOverlay) return 'overlay-removal';

  // For lifestyle/product-in-use, prefer lighter edits
  const hasBg = hasViolationCategory(violations, 'background', 'white bg', 'rgb(255');
  const hasOccupancy = hasViolationCategory(violations, 'occupancy', 'occupies', 'frame', 'crop');

  if (hasBg && !hasOccupancy) return 'bg-cleanup';
  if (hasOccupancy && !hasBg) return 'crop-reframe';
  if (hasBg || hasOccupancy) return 'inpaint-edit';

  return 'inpaint-edit';
}

// ── Remove list builder ──

function buildRemoveList(violations: Violation[]): string[] {
  const items: string[] = [];
  for (const v of violations) {
    const msg = `${v.message} ${v.recommendation}`.toLowerCase();
    if (msg.includes('badge') || msg.includes('overlay') || msg.includes('watermark')) {
      items.push(`Remove: ${v.message}`);
    }
    if (msg.includes('background') && msg.includes('white')) {
      items.push('Replace non-white background pixels with pure white RGB(255,255,255)');
    }
  }
  return [...new Set(items)];
}

// ── Permitted list builder ──

function buildPermittedList(strategy: FixStrategy, imageType: 'MAIN' | 'SECONDARY'): string[] {
  const base: string[] = [];
  if (strategy === 'bg-cleanup') {
    base.push('Background pixels only', 'Soft drop shadow beneath product');
  } else if (strategy === 'crop-reframe') {
    base.push('Framing and crop boundaries', 'Background fill for expanded canvas');
  } else if (strategy === 'overlay-removal') {
    base.push('Promotional badge/overlay areas (inpaint with surrounding content)');
  } else if (strategy === 'inpaint-edit') {
    base.push('Background pixels', 'Promotional overlays', 'Framing adjustments');
  }
  if (imageType === 'SECONDARY') {
    base.push('Lifestyle context may be adjusted slightly for composition');
  }
  return base;
}

// ── Public API ──

export function buildFixPlan(
  imageType: 'MAIN' | 'SECONDARY',
  category: string,
  violations: Violation[],
  deterministicFindings: DeterministicFindingSummary[],
  productIdentity?: ProductIdentityCard | null,
  contentType?: string,
): FixPlan {
  const cat = category || 'GENERAL';

  const strategy = imageType === 'MAIN'
    ? selectMainStrategy(violations, deterministicFindings)
    : selectSecondaryStrategy(violations, contentType);

  // Collect target rule_ids from violations + failed deterministic findings
  const targetRuleIds = [
    ...violations.filter(v => v.rule_id).map(v => v.rule_id!),
    ...deterministicFindings.filter(f => !f.passed).map(f => f.rule_id),
  ].filter(Boolean);

  // Base preservation from category
  const preserve = [...(CATEGORY_PRESERVE[cat] || CATEGORY_PRESERVE.GENERAL)];
  // Add identity-specific preservation
  if (productIdentity) {
    if (productIdentity.brandName) preserve.push(`brand name: ${productIdentity.brandName}`);
    if (productIdentity.labelText?.length) preserve.push(`label text: ${productIdentity.labelText.join(', ')}`);
    if (productIdentity.dominantColors?.length) preserve.push(`dominant colors: ${productIdentity.dominantColors.join(', ')}`);
    if (productIdentity.shapeDescription) preserve.push(`product shape: ${productIdentity.shapeDescription}`);
  }

  return {
    strategy,
    targetRuleIds: [...new Set(targetRuleIds)],
    category: cat,
    imageType,
    preserve,
    permitted: buildPermittedList(strategy, imageType),
    remove: buildRemoveList(violations),
    prohibited: [...(CATEGORY_PROHIBITED[cat] || CATEGORY_PROHIBITED.GENERAL)],
    categoryConstraints: [...(CATEGORY_CONSTRAINTS[cat] || CATEGORY_CONSTRAINTS.GENERAL)],
  };
}
