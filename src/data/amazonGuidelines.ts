// Amazon Product Image Guidelines Reference Data
// Based on official Amazon Seller Central requirements

export interface ImageGuideline {
  category: string;
  purpose: string;
  requirements: string[];
  bestPractices: string[];
  prohibitedElements: string[];
  enhancementOpportunities: string[];
}

export const AMAZON_IMAGE_GUIDELINES: Record<string, ImageGuideline> = {
  MAIN: {
    category: 'Main Image',
    purpose: 'Primary product photo shown in search results and product page',
    requirements: [
      'Pure white background RGB(255,255,255)',
      'Product occupies 85-100% of frame',
      'No text overlays, badges, or watermarks',
      'Entire product visible (no cropping of main product)',
      'Professional photography quality',
      'No props, accessories, or lifestyle elements',
      'No promotional messaging',
    ],
    bestPractices: [
      'Product perfectly centered',
      'Consistent lighting without harsh shadows',
      'High resolution (1000px+ on longest side)',
      'Sharp focus throughout product',
      'True-to-life color representation',
      'Product shown at primary selling angle',
    ],
    prohibitedElements: [
      'Best Seller badges',
      'Amazon\'s Choice badges',
      'Star rating overlays',
      'Prime logos (unless part of packaging)',
      'Deal/Sale tags',
      'Third-party watermarks',
      'Review count indicators',
      'Price overlays',
      'Promotional percentages',
    ],
    enhancementOpportunities: [
      'Background cleanup to pure white',
      'Shadow removal',
      'Color correction',
      'Lighting balance',
      'Product centering',
      'Resolution upscaling',
    ],
  },

  PRODUCT_SHOT: {
    category: 'Additional Product Shot',
    purpose: 'Show product from different angles or in packaging',
    requirements: [
      'Product clearly visible and identifiable',
      'Consistent with main image product',
      'No misleading visual alterations',
    ],
    bestPractices: [
      'Show different angles (side, back, top)',
      'Include packaging if relevant',
      'Highlight product details',
      'Maintain consistent lighting style',
      'Show scale reference when helpful',
    ],
    prohibitedElements: [
      'Same restrictions as MAIN image for badges',
      'Deceptive size representations',
      'Altered product appearance',
    ],
    enhancementOpportunities: [
      'Multiple angle compilation',
      'Detail zoom insets',
      'Packaging presentation',
      'Color/variant showcase',
    ],
  },

  LIFESTYLE: {
    category: 'Lifestyle Image',
    purpose: 'Show product in real-world context to help buyers envision ownership',
    requirements: [
      'Product must be clearly visible and recognizable',
      'Context must be appropriate for target audience',
      'Product should be the hero of the scene',
      'No misleading scenarios',
    ],
    bestPractices: [
      'Product occupies at least 30-40% of frame',
      'Authentic, relatable setting',
      'Natural lighting preferred',
      'Aspirational but realistic scenario',
      'Target demographic representation',
      'Product in active use or prominent display',
      'Bokeh/blur background to emphasize product',
    ],
    prohibitedElements: [
      'Same badge restrictions as MAIN',
      'Competing brand logos',
      'Unrealistic or misleading usage',
      'Poor quality phone-like photos',
    ],
    enhancementOpportunities: [
      'Add/improve product visibility in scene',
      'Enhance lighting on product',
      'Add product cutout overlay',
      'Improve background quality',
      'Add subtle product focus effects',
      'Color grading for mood',
    ],
  },

  INFOGRAPHIC: {
    category: 'Infographic/Feature Image',
    purpose: 'Educate buyers about product features, specifications, and benefits',
    requirements: [
      'Product image or cutout must be present',
      'Text must be readable and accurate',
      'Claims must be truthful and verifiable',
      'Consistent with listing information',
    ],
    bestPractices: [
      'Clear visual hierarchy (product > features > details)',
      'Concise, scannable text (bullet-style)',
      'Feature callouts with arrows/lines',
      'Icons for quick comprehension',
      'Comparison tables when relevant',
      'Dimension/size specifications',
      'Key selling points highlighted',
      'Brand colors and fonts for consistency',
    ],
    prohibitedElements: [
      'Same badge restrictions',
      'False or exaggerated claims',
      'Competitor brand mentions',
      'Cluttered or unreadable layouts',
    ],
    enhancementOpportunities: [
      'Add product cutout if missing',
      'Improve text readability',
      'Add professional feature callouts',
      'Better visual hierarchy',
      'Add icons/graphics',
      'Dimension annotations',
      'Comparison elements',
    ],
  },

  PRODUCT_IN_USE: {
    category: 'Product In Use/Demonstration',
    purpose: 'Show product being actively used to demonstrate functionality',
    requirements: [
      'Product clearly visible during use',
      'Usage scenario realistic and accurate',
      'Demonstrates actual product capability',
    ],
    bestPractices: [
      'Action shot showing key feature',
      'Hand/person interaction when appropriate',
      'Before/after when showing results',
      'Clear benefit visualization',
      'Natural, authentic usage',
    ],
    prohibitedElements: [
      'Exaggerated results',
      'Unrealistic expectations',
      'Same badge restrictions',
    ],
    enhancementOpportunities: [
      'Improve product visibility during action',
      'Add result/benefit indicators',
      'Enhance action clarity',
      'Add usage annotations',
    ],
  },

  SIZE_CHART: {
    category: 'Size/Dimension Chart',
    purpose: 'Provide accurate sizing and measurement information',
    requirements: [
      'Accurate measurements',
      'Clear, readable dimensions',
      'Consistent unit system',
    ],
    bestPractices: [
      'Include product image for reference',
      'Multiple measurement points',
      'Comparison with common objects',
      'Size guide for apparel',
      'Clear measurement lines and labels',
    ],
    prohibitedElements: [
      'Inaccurate measurements',
      'Misleading scale representations',
    ],
    enhancementOpportunities: [
      'Add product image reference',
      'Improve dimension clarity',
      'Add comparison objects',
      'Better visual hierarchy',
    ],
  },

  COMPARISON: {
    category: 'Comparison/Before-After',
    purpose: 'Show product advantages or demonstrate results',
    requirements: [
      'Truthful, verifiable comparisons',
      'No competitor brand disparagement',
      'Accurate before/after results',
    ],
    bestPractices: [
      'Clear visual distinction between states',
      'Product prominently featured',
      'Obvious benefit demonstration',
      'Fair, representative comparison',
    ],
    prohibitedElements: [
      'Exaggerated results',
      'False claims',
      'Competitor logos/names',
    ],
    enhancementOpportunities: [
      'Improve comparison visibility',
      'Add result annotations',
      'Better before/after distinction',
    ],
  },

  PACKAGING: {
    category: 'Packaging Shot',
    purpose: 'Show product packaging and box contents',
    requirements: [
      'Accurate packaging representation',
      'Show what customer will receive',
    ],
    bestPractices: [
      'Unboxing experience preview',
      'Include all accessories visible',
      'Show package size/dimensions',
      'Gift-ready presentation',
    ],
    prohibitedElements: [
      'Outdated packaging versions',
      'Items not included in sale',
    ],
    enhancementOpportunities: [
      'Improve packaging presentation',
      'Add contents layout',
      'Show unboxing sequence',
    ],
  },

  DETAIL: {
    category: 'Detail/Close-up Shot',
    purpose: 'Showcase specific product features or quality',
    requirements: [
      'Clearly connected to main product',
      'Accurate representation of detail',
    ],
    bestPractices: [
      'Macro photography quality',
      'Texture and material showcase',
      'Feature callouts',
      'Quality indicators',
    ],
    prohibitedElements: [
      'Misleading detail enhancements',
      'Unrelated close-ups',
    ],
    enhancementOpportunities: [
      'Add feature annotations',
      'Improve detail visibility',
      'Add zoom indicator',
    ],
  },
};

// Enhancement type definitions
export type EnhancementType = 
  | 'add_product'           // Add product cutout to image
  | 'improve_visibility'    // Make product more prominent
  | 'enhance_graphics'      // Improve infographic quality
  | 'add_infographic'       // Add feature callouts
  | 'improve_context'       // Better lifestyle setting
  | 'add_annotations'       // Add dimension/feature labels
  | 'color_correction'      // Fix lighting/colors
  | 'background_upgrade'    // Upgrade background quality
  | 'composition_fix'       // Improve product positioning
  | 'quality_enhancement';  // General quality improvement

export interface EnhancementPreset {
  id: string;
  type: EnhancementType;
  label: string;
  description: string;
  icon: string;
  applicableCategories: string[];
  promptTemplate: string;
  preserveElements: string[];
}

export const ENHANCEMENT_PRESETS: EnhancementPreset[] = [
  // LIFESTYLE Enhancements
  {
    id: 'lifestyle_product_prominence',
    type: 'improve_visibility',
    label: 'Make Product More Prominent',
    description: 'Enhance product visibility in lifestyle scene',
    icon: '🎯',
    applicableCategories: ['LIFESTYLE', 'PRODUCT_IN_USE'],
    promptTemplate: `Enhance this lifestyle image to make the product more prominent:

GOAL: Increase product visibility while maintaining the authentic lifestyle context.

ENHANCEMENTS:
1. Adjust lighting to highlight the product
2. Subtly blur background to create depth of field focus on product
3. Ensure product occupies at least 35-40% of frame
4. Improve product lighting contrast against background
5. Maintain natural, authentic scene feeling

PRESERVE:
- Overall scene composition
- Lifestyle context and setting
- Natural, non-artificial appearance
- Product authenticity and details

REFERENCE: Use main product image for exact product appearance.`,
    preserveElements: ['scene context', 'background setting', 'authentic feel'],
  },
  {
    id: 'lifestyle_add_product_cutout',
    type: 'add_product',
    label: 'Add Product Cutout Overlay',
    description: 'Add a clean product cutout alongside the lifestyle image',
    icon: '🖼️',
    applicableCategories: ['LIFESTYLE'],
    promptTemplate: `Enhance this lifestyle image by adding a product cutout:

GOAL: Create a hybrid image with lifestyle background AND prominent product cutout.

ENHANCEMENTS:
1. Keep the lifestyle background scene on one side (60%)
2. Add a clean product cutout from the main image (40%)
3. Create a subtle dividing element or gradient transition
4. Ensure product cutout has slight drop shadow for depth
5. Product cutout should be on pure white or complementary background

LAYOUT: Split composition with lifestyle (left) and product cutout (right)

PRESERVE:
- Original lifestyle scene on left side
- Product authenticity from main image
- Professional, catalog-quality appearance`,
    preserveElements: ['lifestyle scene', 'product identity'],
  },

  // INFOGRAPHIC Enhancements
  {
    id: 'infographic_add_product',
    type: 'add_product',
    label: 'Add Product Image',
    description: 'Add missing product cutout to infographic',
    icon: '📦',
    applicableCategories: ['INFOGRAPHIC'],
    promptTemplate: `Enhance this infographic by adding a product image:

GOAL: Add a clear product cutout to complement the existing feature callouts.

ENHANCEMENTS:
1. Add product cutout from main image (occupy 40-50% of frame)
2. Position product to complement existing text layout
3. Connect feature callouts to relevant product areas
4. Ensure product doesn't overlap important text
5. Add subtle shadow for depth

LAYOUT RULES:
- If text is on right, product goes left (and vice versa)
- Feature arrows/lines should point to relevant product areas
- Maintain visual hierarchy: product > features > details

PRESERVE:
- All existing text and callouts
- Current color scheme
- Overall layout structure`,
    preserveElements: ['text callouts', 'layout structure', 'color scheme'],
  },
  {
    id: 'infographic_enhance_callouts',
    type: 'enhance_graphics',
    label: 'Enhance Feature Callouts',
    description: 'Improve feature callout graphics and readability',
    icon: '✨',
    applicableCategories: ['INFOGRAPHIC'],
    promptTemplate: `Enhance the feature callouts in this infographic:

GOAL: Make feature callouts more professional and readable.

ENHANCEMENTS:
1. Add professional connector lines from text to product
2. Add subtle icons next to key features
3. Improve text contrast and readability
4. Add consistent styling to all callouts
5. Create visual hierarchy (primary vs secondary features)

STYLE:
- Clean, modern connector lines (not cluttered)
- Consistent icon style throughout
- Clear font hierarchy (bold headers, regular descriptions)
- Color accent on key selling points

PRESERVE:
- All existing feature text content
- Product image and placement
- Brand colors if present`,
    preserveElements: ['text content', 'product image', 'brand colors'],
  },
  {
    id: 'infographic_add_dimensions',
    type: 'add_annotations',
    label: 'Add Dimension Annotations',
    description: 'Add size/dimension labels to product',
    icon: '📐',
    applicableCategories: ['INFOGRAPHIC', 'SIZE_CHART', 'PRODUCT_SHOT'],
    promptTemplate: `Add dimension annotations to this product image:

GOAL: Add clear, professional dimension labels.

ENHANCEMENTS:
1. Add dimension lines with arrows on edges
2. Include height, width, and depth measurements
3. Use consistent measurement units (inches or cm)
4. Position labels to not obscure product
5. Add subtle background behind dimension text for readability

STYLE:
- Clean dimension lines with arrow endpoints
- Text in neutral color (gray or black)
- Subtle measurement unit indicator
- Professional technical drawing style

PRESERVE:
- Product image unchanged
- Existing callouts if any
- Overall composition`,
    preserveElements: ['product image', 'existing callouts'],
  },

  // PRODUCT_IN_USE Enhancements
  {
    id: 'in_use_improve_action',
    type: 'improve_visibility',
    label: 'Enhance Action Clarity',
    description: 'Make the product usage/action clearer',
    icon: '⚡',
    applicableCategories: ['PRODUCT_IN_USE'],
    promptTemplate: `Enhance this product-in-use image for clearer action:

GOAL: Make the product usage demonstration clearer and more impactful.

ENHANCEMENTS:
1. Improve lighting on product during use
2. Ensure product is clearly visible in the action
3. Add subtle motion indicators if appropriate
4. Highlight the benefit being demonstrated
5. Ensure action outcome is visually clear

PRESERVE:
- Natural, authentic usage scenario
- Realistic product appearance
- Genuine action/demonstration
- Context of use`,
    preserveElements: ['usage context', 'action authenticity', 'product details'],
  },
  {
    id: 'in_use_add_result',
    type: 'add_annotations',
    label: 'Add Benefit Indicators',
    description: 'Add visual indicators showing product benefit/result',
    icon: '✅',
    applicableCategories: ['PRODUCT_IN_USE', 'COMPARISON'],
    promptTemplate: `Add benefit indicators to this product demonstration:

GOAL: Visually highlight the benefit or result of using this product.

ENHANCEMENTS:
1. Add subtle "result" or "benefit" indicator near outcome
2. Use checkmark or star icon for positive results
3. Add brief benefit text if appropriate
4. Create visual connection between product and benefit
5. Use color accent to highlight positive outcome

STYLE:
- Non-intrusive but noticeable indicators
- Consistent with image style
- Professional annotation look

PRESERVE:
- Authentic demonstration
- Product appearance
- Natural scene context`,
    preserveElements: ['demonstration', 'product appearance', 'scene context'],
  },

  // COMPARISON Enhancements
  {
    id: 'comparison_improve_distinction',
    type: 'enhance_graphics',
    label: 'Improve Before/After Distinction',
    description: 'Make comparison states clearer',
    icon: '↔️',
    applicableCategories: ['COMPARISON'],
    promptTemplate: `Enhance the before/after distinction in this comparison:

GOAL: Make the comparison states clearly distinguishable.

ENHANCEMENTS:
1. Add clear "Before" and "After" labels
2. Use visual divider between states
3. Enhance the positive outcome side
4. Subtle de-emphasis on "before" side
5. Add result indicator on "after" side

LAYOUT:
- Clear visual separation (line, gradient, or contrast)
- Labels positioned consistently
- Product prominent in both states

PRESERVE:
- Truthful representation
- Realistic comparison
- Product authenticity`,
    preserveElements: ['comparison accuracy', 'product identity'],
  },

  // Universal Enhancements
  {
    id: 'quality_professional_upgrade',
    type: 'quality_enhancement',
    label: 'Professional Quality Upgrade',
    description: 'Overall quality improvement for any image type',
    icon: '🌟',
    applicableCategories: ['LIFESTYLE', 'PRODUCT_SHOT', 'INFOGRAPHIC', 'PRODUCT_IN_USE', 'COMPARISON', 'PACKAGING', 'DETAIL'],
    promptTemplate: `Perform a professional quality upgrade on this image:

GOAL: Elevate the overall professional quality of this product image.

ENHANCEMENTS:
1. Improve lighting balance and consistency
2. Enhance color accuracy and vibrancy
3. Sharpen focus on key elements
4. Remove any minor imperfections
5. Ensure professional catalog-quality appearance

QUALITY TARGETS:
- Consistent, flattering lighting
- True-to-life colors
- Sharp, clear focus
- Clean, polished appearance
- Professional e-commerce standard

PRESERVE:
- Product authenticity
- Original composition intent
- All text and annotations
- Brand elements`,
    preserveElements: ['product authenticity', 'composition', 'text', 'brand elements'],
  },
];

// Get applicable presets for a given image category
export const getPresetsForCategory = (category: string): EnhancementPreset[] => {
  return ENHANCEMENT_PRESETS.filter(preset => 
    preset.applicableCategories.includes(category) ||
    preset.applicableCategories.includes('*')
  );
};

// Get guideline for a category
export const getGuidelineForCategory = (category: string): ImageGuideline | undefined => {
  return AMAZON_IMAGE_GUIDELINES[category];
};
