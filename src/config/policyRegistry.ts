// ── Versioned Amazon Image Policy Registry ──────────────────────
// Each rule is a structured, auditable policy entry.
// check_type: 'deterministic' = runs client-side before LLM
//             'llm'           = requires AI vision
//             'hybrid'        = deterministic pre-check + LLM confirmation

import type { ProductCategory } from './categoryRules';
import { getCategoryPolicyRules } from './categoryPolicyRules';

export type PolicyCategory = 'universal' | ProductCategory;

export interface PolicyRule {
  rule_id: string;
  version: string;
  applies_to: 'main' | 'secondary' | 'all';
  category: PolicyCategory;
  severity: 'critical' | 'warning' | 'info';
  check_type: 'deterministic' | 'llm' | 'hybrid';
  source: string;
  source_url?: string;
  description: string;
  fix_guidance?: string;
}

export const POLICY_VERSION = '1.1.0';

export const POLICY_REGISTRY: PolicyRule[] = [
  {
    rule_id: 'MAIN_WHITE_BG',
    version: POLICY_VERSION,
    applies_to: 'main',
    category: 'universal',
    severity: 'critical',
    check_type: 'hybrid',
    source: 'Amazon Product Image Requirements',
    source_url: 'https://sellercentral.amazon.com/help/hub/reference/G1881',
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
    description: 'Main image must contain no text overlays, logos, watermarks, or promotional badges.',
    fix_guidance: 'Remove all overlays, badges, and watermarks. Only the product and its packaging text are allowed.',
  },
  {
    rule_id: 'IMAGE_DIMENSIONS',
    version: POLICY_VERSION,
    applies_to: 'all',
    category: 'universal',
    severity: 'warning',
    check_type: 'deterministic',
    source: 'Amazon Product Image Requirements',
    source_url: 'https://sellercentral.amazon.com/help/hub/reference/G1881',
    description: 'Image should be at least 1000px on the longest side for zoom eligibility, and at least 500px minimum.',
    fix_guidance: 'Re-export or re-shoot at higher resolution. Minimum 1000px on longest side recommended.',
  },
  {
    rule_id: 'IMAGE_SHARPNESS',
    version: POLICY_VERSION,
    applies_to: 'all',
    category: 'universal',
    severity: 'warning',
    check_type: 'deterministic',
    source: 'Amazon Product Image Requirements',
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
    description: 'Image content should match the listing title.',
    fix_guidance: 'Ensure the product shown matches the listing title exactly. Update image or title to align.',
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
    description: 'Main image must show the actual product, not a placeholder, illustration, or rendering.',
    fix_guidance: 'Use actual product photography. Renderings, illustrations, and stock photos are not allowed for main images.',
  },
];

/** Look up a policy rule by ID */
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
