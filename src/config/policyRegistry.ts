// ── Versioned Amazon Image Policy Registry ──────────────────────
// Each rule is a structured, auditable policy entry.
// check_type: 'deterministic' = runs client-side before LLM
//             'llm'           = requires AI vision
//             'hybrid'        = deterministic pre-check + LLM confirmation

import type { ProductCategory } from './categoryRules';
import { getCategoryPolicyRules } from './categoryPolicyRules';

export type PolicyCategory = 'universal' | ProductCategory;

/** Source credibility tier for provenance display */
export type SourceTier = 'official' | 'internal_sop' | 'optimization_playbook';

/** Image surface a rule applies to */
export type PolicySurface =
  | 'LISTING_MAIN'
  | 'LISTING_SECONDARY'
  | 'APLUS'
  | 'BRAND_STORY'
  | 'BRAND_STORE'
  | 'VIDEO'
  | '360';

export interface PolicyRule {
  rule_id: string;
  version: string;
  applies_to: 'main' | 'secondary' | 'all';
  category: PolicyCategory;
  severity: 'critical' | 'warning' | 'info';
  check_type: 'deterministic' | 'llm' | 'hybrid';
  source: string;
  source_url?: string;
  /** Source credibility tier — defaults to 'official' for backward compat */
  source_tier?: SourceTier;
  /** Surfaces this rule applies to. Defaults to listing gallery if omitted. */
  surfaces?: PolicySurface[];
  description: string;
  fix_guidance?: string;
}

export const POLICY_VERSION = '1.2.0';

// ── Hard compliance rules (official) ────────────────────────────

export const POLICY_REGISTRY: PolicyRule[] = [
  // ── MAIN image hard compliance ─────────────────────────────────
  {
    rule_id: 'MAIN_WHITE_BG',
    version: POLICY_VERSION,
    applies_to: 'main',
    category: 'universal',
    severity: 'critical',
    check_type: 'hybrid',
    source: 'Amazon Product Image Requirements',
    source_url: 'https://sellercentral.amazon.com/help/hub/reference/G1881',
    source_tier: 'official',
    surfaces: ['LISTING_MAIN'],
    description: 'Main image must have a pure white background (RGB 255,255,255).',
    fix_guidance: 'Replace background with pure white (255,255,255). Use professional product photography on seamless white.',
  },
  {
    rule_id: 'MAIN_OCCUPANCY',
    version: POLICY_VERSION,
    applies_to: 'main',
    category: 'universal',
    severity: 'critical',
    check_type: 'hybrid',
    source: 'Amazon Product Image Requirements',
    source_url: 'https://sellercentral.amazon.com/help/hub/reference/G1881',
    source_tier: 'official',
    surfaces: ['LISTING_MAIN'],
    description: 'Product must occupy at least 85% of the image frame.',
    fix_guidance: 'Crop or re-frame so the product fills at least 85% of the image area.',
  },
  {
    rule_id: 'MAIN_NO_TEXT_OVERLAY',
    version: POLICY_VERSION,
    applies_to: 'main',
    category: 'universal',
    severity: 'critical',
    check_type: 'hybrid',
    source: 'Amazon Product Image Requirements',
    source_url: 'https://sellercentral.amazon.com/help/hub/reference/G1881',
    source_tier: 'official',
    surfaces: ['LISTING_MAIN'],
    description: 'Main image must contain no text overlays, logos, watermarks, or promotional badges.',
    fix_guidance: 'Remove all overlays, badges, and watermarks. Only the product and its packaging text are allowed.',
  },
  {
    rule_id: 'MAIN_SINGLE_VIEW',
    version: POLICY_VERSION,
    applies_to: 'main',
    category: 'universal',
    severity: 'critical',
    check_type: 'llm',
    source: 'Amazon Product Image Requirements',
    source_url: 'https://sellercentral.amazon.com/help/hub/reference/G1881',
    source_tier: 'official',
    surfaces: ['LISTING_MAIN'],
    description: 'Main image must show a single view of the product — no inset images, multi-angle composites, or collages.',
    fix_guidance: 'Remove any inset or multi-view composites. Show one clean angle of the product.',
  },
  {
    rule_id: 'MAIN_FULL_PRODUCT',
    version: POLICY_VERSION,
    applies_to: 'main',
    category: 'universal',
    severity: 'critical',
    check_type: 'hybrid',
    source: 'Amazon Product Image Requirements',
    source_url: 'https://sellercentral.amazon.com/help/hub/reference/G1881',
    source_tier: 'official',
    surfaces: ['LISTING_MAIN'],
    description: 'Full product must be visible — no cropping at any edge.',
    fix_guidance: 'Zoom out or re-frame to show the entire product with white space on all sides.',
  },
  {
    rule_id: 'MAIN_NO_LOGOS_WATERMARKS',
    version: POLICY_VERSION,
    applies_to: 'main',
    category: 'universal',
    severity: 'critical',
    check_type: 'llm',
    source: 'Amazon Product Image Requirements',
    source_url: 'https://sellercentral.amazon.com/help/hub/reference/G1881',
    source_tier: 'official',
    surfaces: ['LISTING_MAIN'],
    description: 'Main image must not contain seller logos, watermarks, or any brand overlays not on the physical packaging.',
    fix_guidance: 'Remove all digital logos and watermarks. Only text physically printed on the product/packaging is allowed.',
  },
  {
    rule_id: 'MAIN_OUT_OF_PACKAGING',
    version: POLICY_VERSION,
    applies_to: 'main',
    category: 'universal',
    severity: 'warning',
    check_type: 'llm',
    source: 'Amazon Product Image Requirements',
    source_url: 'https://sellercentral.amazon.com/help/hub/reference/G1881',
    source_tier: 'official',
    surfaces: ['LISTING_MAIN'],
    description: 'Main image should show the product outside packaging, unless packaging is the product (e.g., boxed sets, gift boxes).',
    fix_guidance: 'Remove retail packaging and show the product itself. Exception: if the packaging IS the product.',
  },
  {
    rule_id: 'ACTUAL_PRODUCT',
    version: POLICY_VERSION,
    applies_to: 'main',
    category: 'universal',
    severity: 'critical',
    check_type: 'llm',
    source: 'Amazon Product Image Requirements',
    source_url: 'https://sellercentral.amazon.com/help/hub/reference/G1881',
    source_tier: 'official',
    surfaces: ['LISTING_MAIN'],
    description: 'Main image must show the actual product, not a placeholder, illustration, or rendering.',
    fix_guidance: 'Use actual product photography. Renderings, illustrations, and stock photos are not allowed for main images.',
  },

  // ── Secondary image rules ──────────────────────────────────────
  {
    rule_id: 'SECONDARY_NO_WATERMARKS',
    version: POLICY_VERSION,
    applies_to: 'secondary',
    category: 'universal',
    severity: 'critical',
    check_type: 'llm',
    source: 'Amazon Product Image Requirements',
    source_url: 'https://sellercentral.amazon.com/help/hub/reference/G1881',
    source_tier: 'official',
    surfaces: ['LISTING_SECONDARY'],
    description: 'Secondary images must not contain watermarks or seller logos not on the product.',
    fix_guidance: 'Remove all watermarks and digital overlays. Feature callouts and infographics are allowed.',
  },
  {
    rule_id: 'SECONDARY_NO_OFFENSIVE',
    version: POLICY_VERSION,
    applies_to: 'secondary',
    category: 'universal',
    severity: 'critical',
    check_type: 'llm',
    source: 'Amazon Product Image Requirements',
    source_tier: 'official',
    surfaces: ['LISTING_SECONDARY'],
    description: 'Secondary images must not contain offensive, violent, or sexually explicit content.',
    fix_guidance: 'Replace any content that could be considered offensive.',
  },

  // ── Technical / quality rules (all surfaces) ──────────────────
  {
    rule_id: 'IMAGE_DIMENSIONS',
    version: POLICY_VERSION,
    applies_to: 'all',
    category: 'universal',
    severity: 'warning',
    check_type: 'deterministic',
    source: 'Amazon Product Image Requirements',
    source_url: 'https://sellercentral.amazon.com/help/hub/reference/G1881',
    source_tier: 'official',
    surfaces: ['LISTING_MAIN', 'LISTING_SECONDARY'],
    description: 'Image should be at least 1000px on the longest side for zoom eligibility, and at least 500px minimum.',
    fix_guidance: 'Re-export or re-shoot at higher resolution. Minimum 1000px on longest side recommended.',
  },
  {
    rule_id: 'IMAGE_MIN_UPLOAD',
    version: POLICY_VERSION,
    applies_to: 'all',
    category: 'universal',
    severity: 'critical',
    check_type: 'deterministic',
    source: 'Amazon Product Image Requirements',
    source_url: 'https://sellercentral.amazon.com/help/hub/reference/G1881',
    source_tier: 'official',
    surfaces: ['LISTING_MAIN', 'LISTING_SECONDARY'],
    description: 'Image must be at least 500px on the longest side to be accepted by Amazon.',
    fix_guidance: 'Re-export at a minimum of 500px. Images below this threshold will be rejected.',
  },
  {
    rule_id: 'IMAGE_SHARPNESS',
    version: POLICY_VERSION,
    applies_to: 'all',
    category: 'universal',
    severity: 'warning',
    check_type: 'deterministic',
    source: 'Amazon Product Image Requirements',
    source_tier: 'internal_sop',
    surfaces: ['LISTING_MAIN', 'LISTING_SECONDARY'],
    description: 'Image must be sharp and not blurry.',
    fix_guidance: 'Re-shoot with proper focus or apply sharpening. Use a tripod to avoid motion blur.',
  },
  {
    rule_id: 'IMAGE_EDGE_CROP',
    version: POLICY_VERSION,
    applies_to: 'all',
    category: 'universal',
    severity: 'info',
    check_type: 'deterministic',
    source: 'Amazon Product Image Requirements',
    source_tier: 'internal_sop',
    surfaces: ['LISTING_MAIN', 'LISTING_SECONDARY'],
    description: 'Product should not be clipped or cropped at the image edges.',
    fix_guidance: 'Zoom out or re-frame to show the full product with white space on all edges.',
  },
  {
    rule_id: 'IMAGE_TITLE_MATCH',
    version: POLICY_VERSION,
    applies_to: 'all',
    category: 'universal',
    severity: 'warning',
    check_type: 'llm',
    source: 'Amazon Product Image Requirements',
    source_tier: 'official',
    surfaces: ['LISTING_MAIN', 'LISTING_SECONDARY'],
    description: 'Image content should match the listing title.',
    fix_guidance: 'Ensure the product shown matches the listing title exactly. Update image or title to align.',
  },

  // ── Optimization / best-practice guidance (non-blocking) ──────
  {
    rule_id: 'OPT_IMAGE_STACK_COUNT',
    version: POLICY_VERSION,
    applies_to: 'all',
    category: 'universal',
    severity: 'info',
    check_type: 'deterministic',
    source: 'Amazon Seller Best Practices',
    source_tier: 'optimization_playbook',
    surfaces: ['LISTING_MAIN', 'LISTING_SECONDARY'],
    description: 'Listings with 7+ high-quality images tend to perform better in search and conversion.',
    fix_guidance: 'Add images to reach 7+ total. Include lifestyle, infographic, size chart, and detail shots.',
  },
  {
    rule_id: 'OPT_ZOOM_ELIGIBLE',
    version: POLICY_VERSION,
    applies_to: 'all',
    category: 'universal',
    severity: 'info',
    check_type: 'deterministic',
    source: 'Amazon Seller Best Practices',
    source_tier: 'optimization_playbook',
    surfaces: ['LISTING_MAIN', 'LISTING_SECONDARY'],
    description: 'Images at 1600px+ on the longest side enable the hover-zoom feature, improving conversion.',
    fix_guidance: 'Re-export at 1600px+ resolution to enable Amazon hover-zoom.',
  },
  {
    rule_id: 'OPT_SECONDARY_MIX',
    version: POLICY_VERSION,
    applies_to: 'secondary',
    category: 'universal',
    severity: 'info',
    check_type: 'llm',
    source: 'Amazon Seller Best Practices',
    source_tier: 'optimization_playbook',
    surfaces: ['LISTING_SECONDARY'],
    description: 'Secondary image stack should include a mix of lifestyle, infographic, and detail shots for maximum conversion.',
    fix_guidance: 'Diversify your image stack: include at least one lifestyle, one infographic, and one detail/dimension shot.',
  },
];

// ── A+ Content Policy Rules ─────────────────────────────────────
// Separate from listing gallery rules. Only applied when auditing A+ assets.

export const APLUS_POLICY_RULES: PolicyRule[] = [
  {
    rule_id: 'APLUS_ALT_TEXT',
    version: POLICY_VERSION,
    applies_to: 'all',
    category: 'universal',
    severity: 'warning',
    check_type: 'llm',
    source: 'Amazon A+ Content Requirements',
    source_url: 'https://sellercentral.amazon.com/help/hub/reference/G202102950',
    source_tier: 'official',
    surfaces: ['APLUS'],
    description: 'All A+ content images must include descriptive alt text for accessibility and SEO.',
    fix_guidance: 'Add alt text describing the image content. Include product name and key visible features.',
  },
  {
    rule_id: 'APLUS_NO_PRICING',
    version: POLICY_VERSION,
    applies_to: 'all',
    category: 'universal',
    severity: 'critical',
    check_type: 'llm',
    source: 'Amazon A+ Content Requirements',
    source_url: 'https://sellercentral.amazon.com/help/hub/reference/G202102950',
    source_tier: 'official',
    surfaces: ['APLUS'],
    description: 'A+ content must not include pricing, promotional language, shipping info, or time-sensitive claims.',
    fix_guidance: 'Remove all pricing, "sale", "limited time", shipping speed, or promotional text from A+ images.',
  },
  {
    rule_id: 'APLUS_NO_COMPETITOR_REFS',
    version: POLICY_VERSION,
    applies_to: 'all',
    category: 'universal',
    severity: 'critical',
    check_type: 'llm',
    source: 'Amazon A+ Content Requirements',
    source_tier: 'official',
    surfaces: ['APLUS'],
    description: 'A+ content must not reference competitors by name, logo, or product.',
    fix_guidance: 'Remove all competitor brand names, logos, and direct comparisons.',
  },
  {
    rule_id: 'APLUS_MODULE_DIMENSIONS',
    version: POLICY_VERSION,
    applies_to: 'all',
    category: 'universal',
    severity: 'warning',
    check_type: 'deterministic',
    source: 'Amazon A+ Content Specs',
    source_tier: 'internal_sop',
    surfaces: ['APLUS'],
    description: 'A+ module images should match standard module pixel dimensions (e.g., 970×600 for hero, 300×300 for comparison).',
    fix_guidance: 'Resize images to match the target A+ module dimensions. Check Seller Central for current specs.',
  },
  {
    rule_id: 'APLUS_NO_BLURRY',
    version: POLICY_VERSION,
    applies_to: 'all',
    category: 'universal',
    severity: 'warning',
    check_type: 'deterministic',
    source: 'Amazon A+ Content Requirements',
    source_tier: 'official',
    surfaces: ['APLUS'],
    description: 'A+ content images must be high-resolution and not pixelated or blurry.',
    fix_guidance: 'Re-export at higher resolution. A+ images are displayed large and must look crisp.',
  },
];

/** Look up a policy rule by ID (listing gallery rules only) */
export function getPolicyRule(ruleId: string): PolicyRule | undefined {
  return POLICY_REGISTRY.find(r => r.rule_id === ruleId);
}

/** Get all rules applicable to a given image type (universal only) */
export function getRulesForImageType(imageType: 'main' | 'secondary'): PolicyRule[] {
  return POLICY_REGISTRY.filter(
    r => r.applies_to === 'all' || r.applies_to === imageType
  );
}

/** Get all rules for a given category (universal + category-specific) */
export function getRulesForCategory(category: ProductCategory): PolicyRule[] {
  const categoryRules: PolicyRule[] = getCategoryPolicyRules(category);
  return [...POLICY_REGISTRY, ...categoryRules];
}

/** Get applicable rules filtered by both image type and category */
export function getApplicableRules(
  imageType: 'main' | 'secondary',
  category: ProductCategory
): PolicyRule[] {
  const allRules = getRulesForCategory(category);
  return allRules.filter(
    r => r.applies_to === 'all' || r.applies_to === imageType
  );
}

/** Get listing-gallery compliance rules only (excludes optimization_playbook) */
export function getComplianceRules(
  imageType: 'main' | 'secondary',
  category: ProductCategory
): PolicyRule[] {
  return getApplicableRules(imageType, category).filter(
    r => r.source_tier !== 'optimization_playbook'
  );
}

/** Get optimization-only rules (non-blocking guidance) */
export function getOptimizationRules(): PolicyRule[] {
  return POLICY_REGISTRY.filter(r => r.source_tier === 'optimization_playbook');
}

/** Get A+ content rules */
export function getAplusRules(): PolicyRule[] {
  return APLUS_POLICY_RULES;
}

/** Filter rules by surface */
export function getRulesForSurface(surface: PolicySurface): PolicyRule[] {
  return [...POLICY_REGISTRY, ...APLUS_POLICY_RULES].filter(
    r => !r.surfaces || r.surfaces.includes(surface)
  );
}

/** Human-readable source tier label */
export function getSourceTierLabel(tier?: SourceTier): string {
  switch (tier) {
    case 'official': return 'Official';
    case 'internal_sop': return 'Internal SOP';
    case 'optimization_playbook': return 'Optimization';
    default: return 'Official';
  }
}

/** Badge color class for source tier */
export function getSourceTierBadgeClass(tier?: SourceTier): string {
  switch (tier) {
    case 'official': return 'bg-primary/10 text-primary border-primary/20';
    case 'internal_sop': return 'bg-muted text-muted-foreground border-muted';
    case 'optimization_playbook': return 'bg-accent/10 text-accent-foreground border-accent/20';
    default: return 'bg-primary/10 text-primary border-primary/20';
  }
}
