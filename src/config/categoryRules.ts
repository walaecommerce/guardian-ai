// ── Category Rule Sets ───────────────────────────────────────
// Defines Amazon compliance rules per product category.
// Used by analyze-image edge function and client report generator.

export type ProductCategory =
  | 'FOOD_BEVERAGE'
  | 'SUPPLEMENTS'
  | 'PET_SUPPLIES'
  | 'BEAUTY_PERSONAL_CARE'
  | 'ELECTRONICS'
  | 'GENERAL_MERCHANDISE'
  | 'APPAREL'
  | 'FOOTWEAR'
  | 'JEWELRY'
  | 'HANDBAGS_LUGGAGE'
  | 'HARDLINES';

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

  // ── New Phase 2 categories ──────────────────────────────────

  APPAREL: {
    name: 'Apparel',
    icon: '👕',
    keywords: ['shirt', 'dress', 'jacket', 'pants', 'jeans', 'sweater', 'hoodie', 'blouse', 'skirt', 'coat', 'vest', 'tshirt', 't-shirt', 'polo', 'suit', 'blazer', 'cardigan', 'legging', 'shorts', 'romper', 'jumpsuit', 'underwear', 'socks', 'apparel', 'clothing', 'garment', 'top', 'bottom', 'pajama'],
    main_image_rules: [
      'Adult apparel should be shown on a model or ghost mannequin',
      'Kids/baby apparel may use flat lay presentation',
      'Full garment must be visible — no cropping at sleeves, hem, or collar',
      'No visible hangers on main image',
      'Pure white background with product filling 85%+ of frame',
    ],
    secondary_rules: [
      'Model showing fit from multiple angles ALLOWED',
      'Size chart / measurement guide ALLOWED and POSITIVE',
      'Fabric detail close-ups ALLOWED',
      'Lifestyle / styled outfit shots ALLOWED',
    ],
    ocr_fields: ['size', 'material', 'care_instructions', 'brand', 'style', 'color'],
    prohibited: [
      'Cropped garments on main image',
      'Visible hangers on main image (ghost mannequin preferred)',
      'Misleading fit or sizing claims',
      'Competitor brand references',
    ],
    report_notes: [
      'Garment presentation style validated (model/mannequin/flat lay).',
      'Full garment visibility confirmed — no edge cropping.',
      'Size and fit representation accuracy reviewed.',
      'Material and care claims consistency checked.',
    ],
  },

  FOOTWEAR: {
    name: 'Footwear',
    icon: '👟',
    keywords: ['shoe', 'boot', 'sandal', 'sneaker', 'heel', 'loafer', 'slipper', 'flip-flop', 'mule', 'clog', 'oxford', 'pump', 'flat', 'wedge', 'espadrille', 'footwear', 'moccasin', 'trainer'],
    main_image_rules: [
      'Single left shoe at approximately 45-degree angle, facing left',
      'No shoe box or packaging visible',
      'Pure white background with shoe filling 85%+ of frame',
      'No socks, feet, or leg models on main image',
    ],
    secondary_rules: [
      'Pair of shoes shown together ALLOWED',
      'Sole/bottom view ALLOWED and POSITIVE',
      'On-foot model shots ALLOWED',
      'Size/fit reference images ALLOWED',
    ],
    ocr_fields: ['brand', 'model', 'size_range', 'material', 'sole_type', 'color'],
    prohibited: [
      'Shoe box as main image',
      'Multiple shoe styles in one listing image',
      'Misleading color representation',
    ],
    report_notes: [
      'Single-shoe hero presentation verified.',
      'Shoe angle and orientation checked (left shoe, 45° angle).',
      'Sole visibility in secondary images assessed.',
      'Material and construction claims reviewed.',
    ],
  },

  JEWELRY: {
    name: 'Jewelry',
    icon: '💎',
    keywords: ['ring', 'necklace', 'bracelet', 'earring', 'pendant', 'chain', 'bangle', 'brooch', 'anklet', 'cufflink', 'jewelry', 'jewellery', 'gold', 'silver', 'diamond', 'gemstone', 'pearl', 'watch', 'charm'],
    main_image_rules: [
      'No mannequin, model, or body part on main image',
      'No gift boxes, pouches, or packaging visible',
      'Close-up framing — jewelry should fill at least 80% of frame',
      'Pure white background',
    ],
    secondary_rules: [
      'On-model/on-body shots ALLOWED',
      'Scale reference with common object ALLOWED',
      'Detail/macro shots of craftsmanship ALLOWED and POSITIVE',
      'Gift packaging shots ALLOWED in secondary only',
    ],
    ocr_fields: ['metal_type', 'stone_type', 'carat', 'size', 'certification', 'brand'],
    prohibited: [
      'Mannequin or body part on main image',
      'Gift packaging on main image',
      'Misleading stone or metal claims',
      'Stock photography',
    ],
    report_notes: [
      'Mannequin/model absence on main image verified.',
      'Packaging exclusion from main image confirmed.',
      'Jewelry occupancy and framing assessed (close-up expected).',
      'Material and certification claims reviewed.',
    ],
  },

  HANDBAGS_LUGGAGE: {
    name: 'Handbags & Luggage',
    icon: '👜',
    keywords: ['handbag', 'purse', 'tote', 'clutch', 'wallet', 'luggage', 'suitcase', 'backpack', 'duffel', 'messenger', 'crossbody', 'shoulder bag', 'travel bag', 'carry-on', 'briefcase', 'weekender', 'fanny pack'],
    main_image_rules: [
      'Full product visible — no cropping of handles, zippers, straps, or base',
      'No distracting props or styling accessories',
      'Bag should be upright, front-facing, handles/straps visible',
      'Pure white background with product filling 85%+ of frame',
    ],
    secondary_rules: [
      'Interior compartment shots ALLOWED and POSITIVE',
      'On-model / lifestyle shots ALLOWED',
      'Size comparison images ALLOWED',
      'Multiple angle views ALLOWED and POSITIVE',
    ],
    ocr_fields: ['brand', 'material', 'dimensions', 'capacity', 'color', 'style'],
    prohibited: [
      'Cropped handles or straps on main image',
      'Distracting props inside or around the bag',
      'Misleading size representations',
    ],
    report_notes: [
      'Full product visibility confirmed — handles, straps, base visible.',
      'Prop-free main image presentation verified.',
      'Interior shot availability assessed.',
      'Material and dimension claims reviewed.',
    ],
  },

  HARDLINES: {
    name: 'Hardlines',
    icon: '🔧',
    keywords: ['tool', 'hardware', 'appliance', 'furniture', 'kitchenware', 'cookware', 'storage', 'shelf', 'organizer', 'fixture', 'faucet', 'lock', 'drill', 'wrench', 'screwdriver', 'paint', 'garden', 'outdoor', 'grill', 'lawn', 'mower', 'vacuum', 'iron', 'blender', 'mixer'],
    main_image_rules: [
      'Strict pure white background required',
      'Product must be out of packaging, fully assembled',
      'No environmental or styled backgrounds',
      'Pure white background with product filling 85%+ of frame',
    ],
    secondary_rules: [
      'Environment/lifestyle shots showing product in use ALLOWED',
      'Size-fit reference images ALLOWED and POSITIVE',
      'Feature callout infographics ALLOWED',
      'What\'s in the box / included items layout ALLOWED',
    ],
    ocr_fields: ['brand', 'model', 'dimensions', 'weight', 'material', 'power_specs', 'certifications'],
    prohibited: [
      'Product in packaging on main image',
      'Missing safety certifications where required',
      'Misleading size representations',
    ],
    report_notes: [
      'White background strictness verified for hardline product.',
      'Out-of-box presentation confirmed.',
      'Image mix assessed (lifestyle + size reference expected).',
      'Safety certification visibility checked where applicable.',
    ],
  },
};

// ── Category detection helper ────────────────────────────────
// Order matters: more specific categories are checked first to avoid
// overlap (e.g., "bag" matching HANDBAGS before GENERAL).

const CATEGORY_DETECTION_ORDER: ProductCategory[] = [
  'FOOTWEAR',
  'JEWELRY',
  'HANDBAGS_LUGGAGE',
  'APPAREL',
  'FOOD_BEVERAGE',
  'SUPPLEMENTS',
  'PET_SUPPLIES',
  'BEAUTY_PERSONAL_CARE',
  'ELECTRONICS',
  'HARDLINES',
  'GENERAL_MERCHANDISE',
];

export function detectCategoryFromTitle(title: string): ProductCategory {
  const lower = title.toLowerCase();
  for (const key of CATEGORY_DETECTION_ORDER) {
    const rules = CATEGORY_RULES[key];
    if (rules.keywords.length === 0) continue;
    if (rules.keywords.some(kw => lower.includes(kw))) {
      return key;
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
  { value: 'APPAREL', label: 'Apparel', icon: '👕' },
  { value: 'FOOTWEAR', label: 'Footwear', icon: '👟' },
  { value: 'JEWELRY', label: 'Jewelry', icon: '💎' },
  { value: 'HANDBAGS_LUGGAGE', label: 'Handbags & Luggage', icon: '👜' },
  { value: 'HARDLINES', label: 'Hardlines', icon: '🔧' },
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
  'APPAREL': 'APPAREL',
  'CLOTHING': 'APPAREL',
  'FOOTWEAR': 'FOOTWEAR',
  'SHOES': 'FOOTWEAR',
  'JEWELRY': 'JEWELRY',
  'JEWELLERY': 'JEWELRY',
  'HANDBAGS': 'HANDBAGS_LUGGAGE',
  'HANDBAGS_LUGGAGE': 'HANDBAGS_LUGGAGE',
  'LUGGAGE': 'HANDBAGS_LUGGAGE',
  'HARDLINES': 'HARDLINES',
  'HOME': 'HARDLINES',
  'TOOLS': 'HARDLINES',
};
