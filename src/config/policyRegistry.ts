// ── Versioned Amazon Image Policy Registry ──────────────────────
// Each rule is a structured, auditable policy entry.
// check_type: 'deterministic' = runs client-side before LLM
//             'llm'           = requires AI vision
//             'hybrid'        = deterministic pre-check + LLM confirmation

export interface PolicyRule {
  rule_id: string;
  version: string;
  applies_to: 'main' | 'secondary' | 'all';
  category: 'universal';  // Phase 1: universal only; expand later
  severity: 'critical' | 'warning' | 'info';
  check_type: 'deterministic' | 'llm' | 'hybrid';
  source: string;
  source_url?: string;
  description: string;
}

export const POLICY_VERSION = '1.0.0';

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
  },
];

/** Look up a policy rule by ID */
export function getPolicyRule(ruleId: string): PolicyRule | undefined {
  return POLICY_REGISTRY.find(r => r.rule_id === ruleId);
}

/** Get all rules applicable to a given image type */
export function getRulesForImageType(imageType: 'main' | 'secondary'): PolicyRule[] {
  return POLICY_REGISTRY.filter(
    r => r.applies_to === 'all' || r.applies_to === imageType
  );
}
