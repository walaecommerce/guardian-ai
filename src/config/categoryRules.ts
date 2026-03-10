// ── Category Rule Sets ───────────────────────────────────────
// Defines Amazon compliance rules per product category.
// Used by analyze-image edge function and client report generator.

export type ProductCategory =
  | 'FOOD_BEVERAGE'
  | 'SUPPLEMENTS'
  | 'PET_SUPPLIES'
  | 'BEAUTY_PERSONAL_CARE'
  | 'ELECTRONICS'
  | 'GENERAL_MERCHANDISE';

export interface CategoryRuleSet {
  name: string;
  icon: string;
  keywords: string[];
  main_image_rules: string[];
  secondary_rules: string[];
  ocr_fields: string[];
  prohibited: string[];
  report_notes: string[];
}

export const CATEGORY_RULES: Record<ProductCategory, CategoryRuleSet> = {
  FOOD_BEVERAGE: {
    name: 'Food & Beverage',
    icon: '🍎',
    keywords: ['food', 'snack', 'beverage', 'drink', 'eat', 'nutrition', 'cereal', 'sauce', 'spice', 'candy', 'chocolate', 'coffee', 'tea', 'juice', 'bar', 'chip', 'cracker', 'cookie'],
    main_image_rules: [
      'No hands holding the product',
      'No props (bowls, plates, utensils, serving suggestions)',
      'Product label must face forward and be fully readable',
      'No environmental backgrounds (countertops, tables, kitchens)',
      'Expiry dates or lot codes should not be visible',
      'Pure white background with product filling 85%+ of frame',
    ],
    secondary_rules: [
      'Lifestyle food photography showing product in use is ALLOWED',
      'Infographic callouts with macros, ingredients, claims ALLOWED',
      'Nutrition facts panel must be legible if shown',
      'Multiple flavor variants shown together ALLOWED',
      'Size/scale reference images ALLOWED',
    ],
    ocr_fields: ['flavor', 'weight', 'servings', 'claims', 'allergens', 'pack_count'],
    prohibited: [
      'Raw meat imagery on main image',
      'Visible expiry dates on main image',
      'Unsubstantiated health claims',
      'Competitor brand names or logos',
    ],
    report_notes: [
      'FDA food labeling requirements cross-checked.',
      'Allergen visibility verified on packaging imagery.',
      'Nutritional claims consistency validated against listing title.',
      'Pack count and net weight consistency confirmed.',
    ],
  },

  SUPPLEMENTS: {
    name: 'Health & Supplements',
    icon: '💊',
    keywords: ['supplement', 'vitamin', 'protein', 'capsule', 'tablet', 'probiotic', 'collagen', 'omega', 'multivitamin', 'powder', 'amino', 'creatine', 'whey'],
    main_image_rules: [
      'No hands holding the product',
      'Product label must face forward (supplement facts panel should NOT be primary visible face)',
      'No scattered pills, spilled powder, or loose capsules',
      'No props or accessories not included in sale',
      'Pure white background with product filling 85%+ of frame',
    ],
    secondary_rules: [
      'Supplement facts panel shown clearly is POSITIVE',
      'Before/after imagery is PROHIBITED (Amazon policy)',
      'Dosage and usage instructions visible ALLOWED',
      'Ingredient callouts and benefit highlights ALLOWED',
    ],
    ocr_fields: ['serving_size', 'active_ingredients', 'warnings', 'certifications', 'count', 'supplement_type'],
    prohibited: [
      'Medical claims without disclaimer',
      'Before/after imagery',
      'Disease treatment or cure claims',
      'Unverified third-party testing claims',
    ],
    report_notes: [
      'FDA dietary supplement labeling compliance checked.',
      'Medical/health claim restrictions validated.',
      'Before/after imagery prohibition enforced.',
      'Supplement facts panel legibility verified.',
    ],
  },

  PET_SUPPLIES: {
    name: 'Pet Supplies',
    icon: '🐾',
    keywords: ['dog', 'cat', 'pet', 'treat', 'kibble', 'paw', 'puppy', 'kitten', 'chew', 'leash', 'collar', 'aquarium', 'bird', 'hamster'],
    main_image_rules: [
      'No hands holding the product',
      'Product label must face forward and be readable',
      'No raw meat imagery on main image',
      'No environmental backgrounds',
      'Pure white background with product filling 85%+ of frame',
    ],
    secondary_rules: [
      'Pet shown eating/enjoying product is ALLOWED and POSITIVE',
      'Feeding guidelines visible is POSITIVE',
      'Ingredient callouts and nutritional info ALLOWED',
      'Size comparison for pet toys/accessories ALLOWED',
    ],
    ocr_fields: ['protein_source', 'weight', 'breed_size', 'age_range', 'country_of_origin', 'claims'],
    prohibited: [
      'Raw meat on main image',
      'Unverified health claims for pets',
      'Competitor brand comparisons',
      'Misleading breed/size compatibility claims',
    ],
    report_notes: [
      'AAFCO compliance indicators checked where applicable.',
      'Protein source consistency validated against title.',
      'Life stage and breed size claims verified.',
      'Country of origin claim consistency confirmed.',
    ],
  },

  BEAUTY_PERSONAL_CARE: {
    name: 'Beauty & Personal Care',
    icon: '✨',
    keywords: ['skin', 'hair', 'beauty', 'cream', 'serum', 'shampoo', 'conditioner', 'moisturizer', 'sunscreen', 'makeup', 'lipstick', 'foundation', 'lotion', 'cleanser', 'toner'],
    main_image_rules: [
      'Product must be clearly visible and centered',
      'No model wearing/using the product on main image',
      'No before/after imagery on main image',
      'Product label must face forward',
      'Pure white background with product filling 85%+ of frame',
    ],
    secondary_rules: [
      'Model demonstrating product usage ALLOWED',
      'Ingredient spotlight callouts ALLOWED',
      'Skin type compatibility information ALLOWED',
      'Texture/consistency closeup shots ALLOWED',
    ],
    ocr_fields: ['volume', 'ingredients', 'skin_type', 'certifications', 'spf_rating', 'usage_instructions'],
    prohibited: [
      'Before/after medical claims',
      'SPF claims without proper testing documentation',
      'Dermatologist-tested claims without verification',
      'Drug claims for cosmetic products',
    ],
    report_notes: [
      'FDA cosmetic labeling guidelines cross-checked.',
      'SPF and sun protection claim validity assessed.',
      'Before/after imagery restrictions enforced.',
      'Ingredient list visibility and accuracy reviewed.',
    ],
  },

  ELECTRONICS: {
    name: 'Electronics',
    icon: '🔌',
    keywords: ['device', 'electronic', 'battery', 'wireless', 'bluetooth', 'charger', 'cable', 'speaker', 'headphone', 'phone', 'laptop', 'tablet', 'usb', 'hdmi', 'adapter', 'camera'],
    main_image_rules: [
      'Product must be shown without packaging (out of box)',
      'No accessories not included in the listing',
      'All ports and features visible from primary angle',
      'Product label or branding must be visible',
      'Pure white background with product filling 85%+ of frame',
    ],
    secondary_rules: [
      'Product in use / lifestyle context ALLOWED',
      'Compatibility diagrams ALLOWED',
      'Feature callout infographics ALLOWED',
      'Size/dimension reference images ALLOWED',
      'What\'s in the box layout ALLOWED',
    ],
    ocr_fields: ['model_number', 'compatibility', 'certifications', 'voltage', 'connectivity', 'specs'],
    prohibited: [
      'Compatibility claims without verification',
      'Missing safety certifications (UL, CE, FCC)',
      'Misleading wireless range claims',
      'Fake certification badges',
    ],
    report_notes: [
      'Safety certification visibility verified (UL, CE, FCC).',
      'Compatibility claims cross-checked against specifications.',
      'Voltage and power specification accuracy reviewed.',
      'Accessory inclusion accuracy validated against listing.',
    ],
  },

  GENERAL_MERCHANDISE: {
    name: 'General Merchandise',
    icon: '📦',
    keywords: [],
    main_image_rules: [
      'No hands holding the product',
      'No props or accessories not included in the sale',
      'Product must face forward showing primary features',
      'Pure white background with product filling 85%+ of frame',
    ],
    secondary_rules: [
      'Dimensions and size reference images ALLOWED',
      'Product in use / lifestyle context ALLOWED',
      'Feature callout infographics ALLOWED',
      'Material and construction details ALLOWED',
    ],
    ocr_fields: ['dimensions', 'material', 'quantity', 'model', 'country_of_origin'],
    prohibited: [
      'Misleading size or scale representations',
      'Competitor brand comparisons with logos',
    ],
    report_notes: [
      'Standard Amazon image compliance requirements verified.',
      'Product dimensions and material claims reviewed.',
      'Listing title consistency with visible product attributes confirmed.',
    ],
  },
};

// ── Category detection helper ────────────────────────────────

export function detectCategoryFromTitle(title: string): ProductCategory {
  const lower = title.toLowerCase();
  for (const [key, rules] of Object.entries(CATEGORY_RULES)) {
    if (rules.keywords.length === 0) continue;
    if (rules.keywords.some(kw => lower.includes(kw))) {
      return key as ProductCategory;
    }
  }
  return 'GENERAL_MERCHANDISE';
}

// All categories for UI dropdown
export const CATEGORY_OPTIONS: { value: ProductCategory | 'AUTO'; label: string; icon: string }[] = [
  { value: 'AUTO', label: 'Auto-Detect', icon: '🤖' },
  { value: 'FOOD_BEVERAGE', label: 'Food & Beverage', icon: '🍎' },
  { value: 'SUPPLEMENTS', label: 'Health & Supplements', icon: '💊' },
  { value: 'PET_SUPPLIES', label: 'Pet Supplies', icon: '🐾' },
  { value: 'BEAUTY_PERSONAL_CARE', label: 'Beauty & Personal Care', icon: '✨' },
  { value: 'ELECTRONICS', label: 'Electronics', icon: '🔌' },
  { value: 'GENERAL_MERCHANDISE', label: 'General Merchandise', icon: '📦' },
];

// Map from edge function category names to our keys
export const GEMINI_CATEGORY_MAP: Record<string, ProductCategory> = {
  'FOOD': 'FOOD_BEVERAGE',
  'FOOD_BEVERAGE': 'FOOD_BEVERAGE',
  'PET': 'PET_SUPPLIES',
  'PET_SUPPLIES': 'PET_SUPPLIES',
  'SUPPLEMENT': 'SUPPLEMENTS',
  'SUPPLEMENTS': 'SUPPLEMENTS',
  'BEAUTY': 'BEAUTY_PERSONAL_CARE',
  'BEAUTY_PERSONAL_CARE': 'BEAUTY_PERSONAL_CARE',
  'ELECTRONICS': 'ELECTRONICS',
  'GENERAL': 'GENERAL_MERCHANDISE',
  'GENERAL_MERCHANDISE': 'GENERAL_MERCHANDISE',
};
