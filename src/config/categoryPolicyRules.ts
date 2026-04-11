// ── Category-Specific Policy Rules ──────────────────────────────
// Layered on top of universal rules from policyRegistry.ts.
// Each rule includes fix_guidance for category-aware recommendations.

import type { PolicyRule } from './policyRegistry';
import type { ProductCategory } from './categoryRules';

// Duplicated here to break circular dependency with policyRegistry.ts
const CATEGORY_POLICY_VERSION = '1.1.0';

type CategoryPolicyRule = PolicyRule & { fix_guidance: string };

// ── APPAREL ─────────────────────────────────────────────────────

export const APPAREL_RULES: CategoryPolicyRule[] = [
  {
    rule_id: 'APPAREL_MAIN_MODEL',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'main',
    category: 'APPAREL',
    severity: 'warning',
    check_type: 'llm',
    source: 'Amazon Apparel Image Requirements',
    source_url: 'https://sellercentral.amazon.com/help/hub/reference/G1881',
    description: 'Adult apparel main image should show the product on a human model or ghost mannequin (not flat lay).',
    fix_guidance: 'Re-shoot on a model or use ghost mannequin photography. Flat lay is acceptable for kids/baby apparel only.',
  },
  {
    rule_id: 'APPAREL_KIDS_OFF_MODEL',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'main',
    category: 'APPAREL',
    severity: 'info',
    check_type: 'llm',
    source: 'Amazon Apparel Image Requirements',
    description: 'Kids/baby apparel should be presented flat lay or off-model (no child models required).',
    fix_guidance: 'Use flat lay or hanger presentation for children\'s clothing. Ghost mannequin is also acceptable.',
  },
  {
    rule_id: 'APPAREL_NO_CROP',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'main',
    category: 'APPAREL',
    severity: 'critical',
    check_type: 'hybrid',
    source: 'Amazon Apparel Image Requirements',
    source_url: 'https://sellercentral.amazon.com/help/hub/reference/G1881',
    description: 'Full garment must be visible — no cropping at sleeves, hem, collar, or any edge.',
    fix_guidance: 'Zoom out or re-frame so the entire garment is visible with white space on all edges.',
  },
  {
    rule_id: 'APPAREL_NO_HANGER',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'main',
    category: 'APPAREL',
    severity: 'warning',
    check_type: 'llm',
    source: 'Amazon Apparel Image Requirements',
    description: 'Main image should not show the product on a visible hanger (ghost mannequin or model preferred).',
    fix_guidance: 'Remove the hanger and use ghost mannequin editing, or re-shoot on a model.',
  },
];

// ── FOOTWEAR ────────────────────────────────────────────────────

export const FOOTWEAR_RULES: CategoryPolicyRule[] = [
  {
    rule_id: 'FOOTWEAR_SINGLE_SHOE',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'main',
    category: 'FOOTWEAR',
    severity: 'warning',
    check_type: 'llm',
    source: 'Amazon Footwear Image Requirements',
    source_url: 'https://sellercentral.amazon.com/help/hub/reference/G1881',
    description: 'Main image should show a single left shoe at approximately 45-degree angle, facing left.',
    fix_guidance: 'Photograph a single left shoe at a 45° angle facing left on a pure white background.',
  },
  {
    rule_id: 'FOOTWEAR_SOLE_VISIBLE',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'secondary',
    category: 'FOOTWEAR',
    severity: 'info',
    check_type: 'llm',
    source: 'Amazon Footwear Image Requirements',
    description: 'Secondary images should include a sole/bottom view for traction and construction detail.',
    fix_guidance: 'Add a secondary image showing the sole from below to display tread pattern and construction.',
  },
  {
    rule_id: 'FOOTWEAR_NO_BOX',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'main',
    category: 'FOOTWEAR',
    severity: 'warning',
    check_type: 'llm',
    source: 'Amazon Footwear Image Requirements',
    description: 'Main image must not include the shoe box or any packaging.',
    fix_guidance: 'Remove shoe box from main image. Show only the shoe on white background.',
  },
];

// ── JEWELRY ─────────────────────────────────────────────────────

export const JEWELRY_RULES: CategoryPolicyRule[] = [
  {
    rule_id: 'JEWELRY_NO_MANNEQUIN',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'main',
    category: 'JEWELRY',
    severity: 'critical',
    check_type: 'llm',
    source: 'Amazon Jewelry Image Requirements',
    source_url: 'https://sellercentral.amazon.com/help/hub/reference/G1881',
    description: 'Main image must not show product on a mannequin, model, or body part.',
    fix_guidance: 'Photograph the jewelry piece alone on a pure white background. Use a jewelry stand if needed, but it must be invisible or minimal.',
  },
  {
    rule_id: 'JEWELRY_NO_PACKAGING',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'main',
    category: 'JEWELRY',
    severity: 'warning',
    check_type: 'llm',
    source: 'Amazon Jewelry Image Requirements',
    description: 'Main image must not show gift boxes, pouches, or packaging materials.',
    fix_guidance: 'Remove all packaging from the main image. Show only the jewelry piece on white background.',
  },
  {
    rule_id: 'JEWELRY_OCCUPANCY',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'main',
    category: 'JEWELRY',
    severity: 'warning',
    check_type: 'hybrid',
    source: 'Amazon Jewelry Image Requirements',
    description: 'Jewelry items are small — product should still fill at least 80% of the frame with appropriate close-up framing.',
    fix_guidance: 'Use macro photography to fill the frame. The jewelry piece should dominate the image despite its small physical size.',
  },
  {
    rule_id: 'JEWELRY_DETAIL_SHOT',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'secondary',
    category: 'JEWELRY',
    severity: 'info',
    check_type: 'llm',
    source: 'Amazon Jewelry Image Requirements',
    description: 'Secondary images should include close-up detail shots showing craftsmanship, stone settings, and clasp mechanisms.',
    fix_guidance: 'Add macro detail shots of key features: stone settings, engravings, clasp types, and material finish.',
  },
];

// ── HANDBAGS & LUGGAGE ──────────────────────────────────────────

export const HANDBAGS_LUGGAGE_RULES: CategoryPolicyRule[] = [
  {
    rule_id: 'HANDBAGS_FULL_PRODUCT',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'main',
    category: 'HANDBAGS_LUGGAGE',
    severity: 'critical',
    check_type: 'llm',
    source: 'Amazon Handbags Image Requirements',
    source_url: 'https://sellercentral.amazon.com/help/hub/reference/G1881',
    description: 'Full product must be visible — no cropping of handles, zippers, straps, or base.',
    fix_guidance: 'Re-frame to show the entire bag including handles, straps, and base. Ensure white space on all sides.',
  },
  {
    rule_id: 'HANDBAGS_NO_PROPS',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'main',
    category: 'HANDBAGS_LUGGAGE',
    severity: 'warning',
    check_type: 'llm',
    source: 'Amazon Handbags Image Requirements',
    description: 'Main image should not include distracting props, styling accessories, or items inside/around the bag.',
    fix_guidance: 'Remove all props and accessories. Show only the bag/luggage piece on white background.',
  },
  {
    rule_id: 'HANDBAGS_MAIN_PRESENTATION',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'main',
    category: 'HANDBAGS_LUGGAGE',
    severity: 'warning',
    check_type: 'llm',
    source: 'Amazon Handbags Image Requirements',
    description: 'Bag should be upright, front-facing, with handles/straps visible and naturally positioned.',
    fix_guidance: 'Position the bag upright with the front panel facing the camera. Handles should be up and naturally shaped.',
  },
  {
    rule_id: 'HANDBAGS_INTERIOR_SHOT',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'secondary',
    category: 'HANDBAGS_LUGGAGE',
    severity: 'info',
    check_type: 'llm',
    source: 'Amazon Handbags Image Requirements',
    description: 'Secondary images should show interior compartments, pockets, and organization features.',
    fix_guidance: 'Add a secondary image showing the bag opened with interior layout visible.',
  },
];

// ── HARDLINES ───────────────────────────────────────────────────

export const HARDLINES_RULES: CategoryPolicyRule[] = [
  {
    rule_id: 'HARDLINES_WHITE_BG',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'main',
    category: 'HARDLINES',
    severity: 'critical',
    check_type: 'hybrid',
    source: 'Amazon Product Image Requirements',
    source_url: 'https://sellercentral.amazon.com/help/hub/reference/G1881',
    description: 'Hardline products require strict pure white background — no environmental or styled backgrounds on main image.',
    fix_guidance: 'Use professional product photography on pure white (255,255,255) seamless background.',
  },
  {
    rule_id: 'HARDLINES_IMAGE_MIX',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'secondary',
    category: 'HARDLINES',
    severity: 'info',
    check_type: 'llm',
    source: 'Amazon Product Image Requirements',
    description: 'Secondary image set should include a mix of environment/lifestyle shots and size-fit reference images.',
    fix_guidance: 'Add lifestyle images showing the product in context, plus at least one image with size/dimension references.',
  },
  {
    rule_id: 'HARDLINES_OUT_OF_BOX',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'main',
    category: 'HARDLINES',
    severity: 'warning',
    check_type: 'llm',
    source: 'Amazon Product Image Requirements',
    description: 'Main image should show the product out of packaging, fully assembled if applicable.',
    fix_guidance: 'Remove all packaging and show the assembled product. If the product comes unassembled, show the primary assembled view.',
  },
];

// ── FOOD_BEVERAGE category-specific rules ───────────────────────

export const FOOD_BEVERAGE_RULES: CategoryPolicyRule[] = [
  {
    rule_id: 'FOOD_NO_SERVING_SUGGESTION',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'main',
    category: 'FOOD_BEVERAGE',
    severity: 'warning',
    check_type: 'llm',
    source: 'Amazon Food Image Requirements',
    description: 'Main image must not show serving suggestions, prepared food, or the product being consumed.',
    fix_guidance: 'Show only the sealed package on white background. Move serving suggestion images to secondary slots.',
  },
  {
    rule_id: 'FOOD_NO_HANDS',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'main',
    category: 'FOOD_BEVERAGE',
    severity: 'warning',
    check_type: 'llm',
    source: 'Amazon Food Image Requirements',
    description: 'Main image must not show hands holding the product.',
    fix_guidance: 'Remove hands from the main image. Place the product directly on white background.',
  },
  {
    rule_id: 'FOOD_LABEL_FORWARD',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'main',
    category: 'FOOD_BEVERAGE',
    severity: 'critical',
    check_type: 'llm',
    source: 'Amazon Food Image Requirements',
    source_url: 'https://sellercentral.amazon.com/help/hub/reference/G1881',
    description: 'Product label must face forward and be fully readable on the main image.',
    fix_guidance: 'Rotate the product so the front label faces the camera directly and is fully legible.',
  },
  {
    rule_id: 'FOOD_NO_EXPIRY_VISIBLE',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'main',
    category: 'FOOD_BEVERAGE',
    severity: 'info',
    check_type: 'llm',
    source: 'Amazon Food Image Requirements',
    description: 'Expiry dates, lot codes, or date stamps should not be visible on the main image.',
    fix_guidance: 'Angle the product or obscure date stamps. These should not be readable in the hero shot.',
  },
  {
    rule_id: 'FOOD_NUTRITION_LEGIBLE',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'secondary',
    category: 'FOOD_BEVERAGE',
    severity: 'warning',
    check_type: 'llm',
    source: 'Amazon Food Image Requirements',
    description: 'If nutrition facts panel is shown in secondary images, it must be legible at thumbnail size.',
    fix_guidance: 'Enlarge the nutrition facts panel or use a dedicated close-up secondary image for it.',
  },
];

// ── SUPPLEMENTS rules ───────────────────────────────────────────

export const SUPPLEMENTS_RULES: CategoryPolicyRule[] = [
  {
    rule_id: 'SUPPLEMENTS_NO_LOOSE_PILLS',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'main',
    category: 'SUPPLEMENTS',
    severity: 'warning',
    check_type: 'llm',
    source: 'Amazon Supplement Image Requirements',
    description: 'Main image must not show loose pills, scattered capsules, or spilled powder outside packaging.',
    fix_guidance: 'Show only the sealed container/bottle. Move ingredient display images to secondary slots.',
  },
  {
    rule_id: 'SUPPLEMENTS_NO_BEFORE_AFTER',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'all',
    category: 'SUPPLEMENTS',
    severity: 'critical',
    check_type: 'llm',
    source: 'Amazon Supplement Image Requirements',
    source_url: 'https://sellercentral.amazon.com/help/hub/reference/G1881',
    description: 'Before/after imagery is prohibited on all supplement images (Amazon policy).',
    fix_guidance: 'Remove all before/after comparisons. Use ingredient callouts and benefit highlights instead.',
  },
  {
    rule_id: 'SUPPLEMENTS_FACTS_PANEL',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'main',
    category: 'SUPPLEMENTS',
    severity: 'info',
    check_type: 'llm',
    source: 'Amazon Supplement Image Requirements',
    description: 'Supplement facts panel should NOT be the primary visible face on the main image — front label preferred.',
    fix_guidance: 'Rotate the bottle/container so the brand and product name face the camera. Show supplement facts in secondary images.',
  },
  {
    rule_id: 'SUPPLEMENTS_NO_MEDICAL_CLAIMS',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'all',
    category: 'SUPPLEMENTS',
    severity: 'critical',
    check_type: 'llm',
    source: 'Amazon Supplement Image Requirements',
    description: 'Images must not contain medical claims, disease treatment references, or cure claims without proper disclaimers.',
    fix_guidance: 'Remove all medical/disease claims from image overlays. Use structure/function claims only with appropriate disclaimers.',
  },
];

// ── BEAUTY_PERSONAL_CARE rules ──────────────────────────────────

export const BEAUTY_PERSONAL_CARE_RULES: CategoryPolicyRule[] = [
  {
    rule_id: 'BEAUTY_NO_BEFORE_AFTER',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'all',
    category: 'BEAUTY_PERSONAL_CARE',
    severity: 'critical',
    check_type: 'llm',
    source: 'Amazon Beauty Image Requirements',
    description: 'Before/after imagery is prohibited on all images for beauty products.',
    fix_guidance: 'Remove all before/after comparisons. Use ingredient callouts or texture shots instead.',
  },
  {
    rule_id: 'BEAUTY_NO_MODEL_MAIN',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'main',
    category: 'BEAUTY_PERSONAL_CARE',
    severity: 'warning',
    check_type: 'llm',
    source: 'Amazon Beauty Image Requirements',
    description: 'Main image should not show a model wearing or using the product.',
    fix_guidance: 'Show only the product (bottle, tube, jar) on white background. Model usage goes in secondary images.',
  },
  {
    rule_id: 'BEAUTY_LABEL_FORWARD',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'main',
    category: 'BEAUTY_PERSONAL_CARE',
    severity: 'critical',
    check_type: 'llm',
    source: 'Amazon Beauty Image Requirements',
    source_url: 'https://sellercentral.amazon.com/help/hub/reference/G1881',
    description: 'Product label must face forward and be readable on the main image.',
    fix_guidance: 'Rotate the product so the brand name and product name face the camera directly.',
  },
  {
    rule_id: 'BEAUTY_SPF_CLAIMS',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'all',
    category: 'BEAUTY_PERSONAL_CARE',
    severity: 'critical',
    check_type: 'llm',
    source: 'Amazon Beauty Image Requirements',
    description: 'SPF or sun protection claims must match the packaging and listing. Unverifiable SPF claims are a critical violation.',
    fix_guidance: 'Ensure SPF rating on the image matches the listing title and packaging exactly. Remove unsubstantiated SPF claims.',
  },
];

// ── ELECTRONICS rules ───────────────────────────────────────────

export const ELECTRONICS_RULES: CategoryPolicyRule[] = [
  {
    rule_id: 'ELECTRONICS_SHOW_PORTS',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'secondary',
    category: 'ELECTRONICS',
    severity: 'info',
    check_type: 'llm',
    source: 'Amazon Electronics Image Requirements',
    description: 'Secondary images should show all ports, buttons, and connectivity features.',
    fix_guidance: 'Add secondary images showing each side of the product with ports and controls visible.',
  },
  {
    rule_id: 'ELECTRONICS_OUT_OF_BOX',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'main',
    category: 'ELECTRONICS',
    severity: 'warning',
    check_type: 'llm',
    source: 'Amazon Electronics Image Requirements',
    description: 'Main image should show the product out of box/packaging.',
    fix_guidance: 'Remove the product from its retail packaging for the main image. Show the device only.',
  },
  {
    rule_id: 'ELECTRONICS_NO_EXTRA_ACCESSORIES',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'main',
    category: 'ELECTRONICS',
    severity: 'warning',
    check_type: 'llm',
    source: 'Amazon Electronics Image Requirements',
    description: 'Main image must not show accessories not included in the listing.',
    fix_guidance: 'Remove any accessories that are not included in the purchase. Show only what the customer receives.',
  },
  {
    rule_id: 'ELECTRONICS_BRANDING_VISIBLE',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'main',
    category: 'ELECTRONICS',
    severity: 'warning',
    check_type: 'llm',
    source: 'Amazon Electronics Image Requirements',
    description: 'Product branding and model identifier should be visible on the main image.',
    fix_guidance: 'Angle the product so the brand name and model number are visible to the camera.',
  },
  {
    rule_id: 'ELECTRONICS_FAKE_CERTS',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'all',
    category: 'ELECTRONICS',
    severity: 'critical',
    check_type: 'llm',
    source: 'Amazon Electronics Image Requirements',
    description: 'Safety certification badges (UL, CE, FCC) shown in images must be legitimate and not fabricated.',
    fix_guidance: 'Remove any certification badges that are not officially held. Only display verified certifications.',
  },
];

// ── PET_SUPPLIES rules ──────────────────────────────────────────

export const PET_SUPPLIES_RULES: CategoryPolicyRule[] = [
  {
    rule_id: 'PET_NO_RAW_MEAT_MAIN',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'main',
    category: 'PET_SUPPLIES',
    severity: 'warning',
    check_type: 'llm',
    source: 'Amazon Pet Supplies Image Requirements',
    description: 'Main image must not show raw meat or unprocessed ingredients.',
    fix_guidance: 'Show the sealed product package only. Move ingredient/content images to secondary slots.',
  },
  {
    rule_id: 'PET_NO_HANDS',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'main',
    category: 'PET_SUPPLIES',
    severity: 'warning',
    check_type: 'llm',
    source: 'Amazon Pet Supplies Image Requirements',
    description: 'Main image must not show hands holding the pet product.',
    fix_guidance: 'Remove hands from the main image. Place the product directly on white background.',
  },
  {
    rule_id: 'PET_LABEL_FORWARD',
    version: CATEGORY_POLICY_VERSION,
    applies_to: 'main',
    category: 'PET_SUPPLIES',
    severity: 'critical',
    check_type: 'llm',
    source: 'Amazon Pet Supplies Image Requirements',
    description: 'Product label must face forward and be readable on the main image.',
    fix_guidance: 'Rotate the product so the brand name and product info face the camera directly.',
  },
];

// ── Master map: category → rules ────────────────────────────────

export const CATEGORY_POLICY_RULES: Partial<Record<ProductCategory, CategoryPolicyRule[]>> = {
  APPAREL: APPAREL_RULES,
  FOOTWEAR: FOOTWEAR_RULES,
  JEWELRY: JEWELRY_RULES,
  HANDBAGS_LUGGAGE: HANDBAGS_LUGGAGE_RULES,
  HARDLINES: HARDLINES_RULES,
  FOOD_BEVERAGE: FOOD_BEVERAGE_RULES,
  SUPPLEMENTS: SUPPLEMENTS_RULES,
  BEAUTY_PERSONAL_CARE: BEAUTY_PERSONAL_CARE_RULES,
  ELECTRONICS: ELECTRONICS_RULES,
  PET_SUPPLIES: PET_SUPPLIES_RULES,
};

/** Get all category-specific policy rules for a given product category */
export function getCategoryPolicyRules(category: ProductCategory): CategoryPolicyRule[] {
  return CATEGORY_POLICY_RULES[category] || [];
}
