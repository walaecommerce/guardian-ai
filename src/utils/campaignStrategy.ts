/**
 * Campaign-aware image strategy recommendations.
 *
 * Derives recommended image roles from ProductKnowledge + existing assets,
 * detects missing/weak/redundant roles, and generates actionable recommendations.
 */

import type { ImageAsset } from '@/types';
import type { ProductKnowledge } from './productKnowledge';
import { extractImageCategory, type ImageCategory } from './imageCategory';

// ── Image Role definitions ──────────────────────────────────────

export type ImageRole =
  | 'hero'
  | 'packaging_closeup'
  | 'benefits_infographic'
  | 'dimensions_size'
  | 'ingredients_specs'
  | 'usage_how_it_works'
  | 'lifestyle_context'
  | 'comparison_differentiation'
  | 'trust_claim_support';

export interface RoleDefinition {
  role: ImageRole;
  label: string;
  description: string;
  /** Image categories that satisfy this role */
  satisfiedBy: ImageCategory[];
  /** Also matched via violation/content heuristics */
  contentKeywords: string[];
}

const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    role: 'hero',
    label: 'Hero / Main Image',
    description: 'Primary product shot on white background',
    satisfiedBy: ['MAIN'],
    contentKeywords: [],
  },
  {
    role: 'packaging_closeup',
    label: 'Packaging Close-up',
    description: 'Detailed view of packaging, labels, or materials',
    satisfiedBy: ['PACKAGING', 'DETAIL'],
    contentKeywords: ['packaging', 'label', 'close-up', 'detail'],
  },
  {
    role: 'benefits_infographic',
    label: 'Benefits / Features Infographic',
    description: 'Visual callouts highlighting key benefits and features',
    satisfiedBy: ['INFOGRAPHIC'],
    contentKeywords: ['infographic', 'benefits', 'features', 'callout'],
  },
  {
    role: 'dimensions_size',
    label: 'Dimensions / Size Reference',
    description: 'Size chart, measurement guide, or scale reference',
    satisfiedBy: ['SIZE_CHART'],
    contentKeywords: ['size', 'dimension', 'measurement', 'scale'],
  },
  {
    role: 'ingredients_specs',
    label: 'Ingredients / Materials / Specs',
    description: 'Ingredient list, supplement facts, material composition, or technical specs',
    satisfiedBy: ['INFOGRAPHIC', 'DETAIL'],
    contentKeywords: ['ingredient', 'supplement fact', 'nutrition', 'material', 'specification', 'spec'],
  },
  {
    role: 'usage_how_it_works',
    label: 'Usage / How It Works',
    description: 'Product in use, step-by-step usage, or demonstration',
    satisfiedBy: ['PRODUCT_IN_USE'],
    contentKeywords: ['usage', 'how to', 'instruction', 'demonstration', 'step'],
  },
  {
    role: 'lifestyle_context',
    label: 'Lifestyle / Context',
    description: 'Product shown in real-life setting or aspirational context',
    satisfiedBy: ['LIFESTYLE'],
    contentKeywords: ['lifestyle', 'context', 'scene', 'setting'],
  },
  {
    role: 'comparison_differentiation',
    label: 'Comparison / Differentiation',
    description: 'Product compared to alternatives or previous versions',
    satisfiedBy: ['COMPARISON'],
    contentKeywords: ['comparison', 'vs', 'versus', 'compare', 'differentiat'],
  },
  {
    role: 'trust_claim_support',
    label: 'Trust / Claim Support',
    description: 'Certifications, lab results, awards, or claim substantiation',
    satisfiedBy: ['INFOGRAPHIC', 'DETAIL'],
    contentKeywords: ['certified', 'tested', 'award', 'trust', 'certification', 'lab result', 'fda', 'usda'],
  },
];

// ── Product type → role importance mapping ──────────────────────

type RolePriority = 'essential' | 'recommended' | 'optional';

const PRODUCT_TYPE_ROLE_PRIORITIES: Record<string, Partial<Record<ImageRole, RolePriority>>> = {
  supplement: {
    hero: 'essential',
    ingredients_specs: 'essential',
    benefits_infographic: 'essential',
    trust_claim_support: 'recommended',
    packaging_closeup: 'recommended',
    usage_how_it_works: 'optional',
    lifestyle_context: 'optional',
    dimensions_size: 'optional',
  },
  food_beverage: {
    hero: 'essential',
    packaging_closeup: 'essential',
    ingredients_specs: 'recommended',
    benefits_infographic: 'recommended',
    lifestyle_context: 'recommended',
    dimensions_size: 'optional',
    usage_how_it_works: 'optional',
  },
  pet_supply: {
    hero: 'essential',
    ingredients_specs: 'essential',
    packaging_closeup: 'recommended',
    benefits_infographic: 'recommended',
    lifestyle_context: 'recommended',
    usage_how_it_works: 'optional',
  },
  beauty: {
    hero: 'essential',
    benefits_infographic: 'essential',
    ingredients_specs: 'recommended',
    lifestyle_context: 'recommended',
    usage_how_it_works: 'recommended',
    packaging_closeup: 'optional',
    comparison_differentiation: 'optional',
  },
  electronics: {
    hero: 'essential',
    benefits_infographic: 'essential',
    dimensions_size: 'recommended',
    usage_how_it_works: 'recommended',
    comparison_differentiation: 'optional',
    packaging_closeup: 'optional',
  },
  apparel: {
    hero: 'essential',
    lifestyle_context: 'essential',
    dimensions_size: 'essential',
    packaging_closeup: 'optional',
    benefits_infographic: 'optional',
    usage_how_it_works: 'optional',
  },
  home_garden: {
    hero: 'essential',
    dimensions_size: 'recommended',
    lifestyle_context: 'recommended',
    usage_how_it_works: 'recommended',
    benefits_infographic: 'optional',
  },
  toy: {
    hero: 'essential',
    lifestyle_context: 'essential',
    dimensions_size: 'recommended',
    benefits_infographic: 'optional',
    usage_how_it_works: 'optional',
  },
};

const DEFAULT_ROLE_PRIORITIES: Partial<Record<ImageRole, RolePriority>> = {
  hero: 'essential',
  benefits_infographic: 'recommended',
  lifestyle_context: 'recommended',
  packaging_closeup: 'optional',
  dimensions_size: 'optional',
  usage_how_it_works: 'optional',
};

// ── Strategy output types ───────────────────────────────────────

export interface RoleCoverage {
  role: ImageRole;
  label: string;
  priority: RolePriority;
  status: 'covered' | 'weak' | 'missing';
  coveredBy: string[]; // asset names
  weakReason?: string;
}

export interface StrategyRecommendation {
  role: ImageRole;
  label: string;
  rationale: string;
  priority: RolePriority;
}

export interface CampaignStrategy {
  /** Detected product positioning */
  productPositioning: string;
  /** Product type hint */
  productType: string | null;
  /** Role coverage analysis */
  roleCoverage: RoleCoverage[];
  /** Top recommendations (max 5) */
  recommendations: StrategyRecommendation[];
  /** Summary stats */
  coveredCount: number;
  missingCount: number;
  weakCount: number;
  /** Whether we have enough context to make meaningful recommendations */
  isActionable: boolean;
  /** Confidence level */
  confidence: 'high' | 'medium' | 'low';
}

// ── Core derivation logic ───────────────────────────────────────

function getRolePriorities(productType: string | null): Partial<Record<ImageRole, RolePriority>> {
  if (productType && PRODUCT_TYPE_ROLE_PRIORITIES[productType]) {
    return PRODUCT_TYPE_ROLE_PRIORITIES[productType];
  }
  return DEFAULT_ROLE_PRIORITIES;
}

function detectCoveredRoles(assets: ImageAsset[]): Map<ImageRole, string[]> {
  const coverage = new Map<ImageRole, string[]>();

  for (const asset of assets) {
    const cat = extractImageCategory(asset);
    for (const def of ROLE_DEFINITIONS) {
      if (def.satisfiedBy.includes(cat)) {
        const existing = coverage.get(def.role) || [];
        existing.push(asset.name);
        coverage.set(def.role, existing);
      }
    }
  }

  return coverage;
}

function detectWeakCoverage(
  role: ImageRole,
  coveringAssets: string[],
  allAssets: ImageAsset[],
): string | null {
  if (coveringAssets.length === 0) return null;

  // Check if covering assets have low scores
  const coveringWithResults = allAssets.filter(
    a => coveringAssets.includes(a.name) && a.analysisResult
  );

  if (coveringWithResults.length === 0) return null;

  const avgScore = coveringWithResults.reduce(
    (sum, a) => sum + (a.analysisResult?.overallScore || 0), 0
  ) / coveringWithResults.length;

  if (avgScore < 50) return `Low quality (avg score ${Math.round(avgScore)}%)`;

  const criticalViolations = coveringWithResults.flatMap(
    a => a.analysisResult?.violations || []
  ).filter(v => v.severity === 'critical');

  if (criticalViolations.length > 0) return `${criticalViolations.length} critical issue(s)`;

  return null;
}

function buildPositioningSummary(pk: ProductKnowledge): string {
  const parts: string[] = [];

  if (pk.brand) parts.push(pk.brand);
  if (pk.productTypeHint) {
    parts.push(pk.productTypeHint.replace(/_/g, ' '));
  }

  if (pk.supportedClaims.length > 0) {
    const topClaims = pk.supportedClaims.slice(0, 3).join(', ');
    parts.push(`positioning: ${topClaims}`);
  }

  return parts.length > 0 ? parts.join(' — ') : 'General product';
}

function buildRecommendationRationale(
  role: ImageRole,
  priority: RolePriority,
  pk: ProductKnowledge,
): string {
  const base = ROLE_DEFINITIONS.find(d => d.role === role);
  if (!base) return '';

  switch (role) {
    case 'ingredients_specs':
      if (pk.productTypeHint === 'supplement') return 'Supplement facts panel is critical for supplements — builds trust and meets buyer expectations';
      if (pk.productTypeHint === 'food_beverage') return 'Ingredient/nutrition info helps food buyers make purchase decisions';
      return 'Specs or materials info helps buyers verify product details';

    case 'dimensions_size':
      if (pk.productTypeHint === 'apparel') return 'Size chart is essential for apparel — reduces returns from sizing issues';
      return 'Size reference helps buyers understand scale and fit in their space';

    case 'lifestyle_context':
      if (pk.productTypeHint === 'apparel') return 'Lifestyle shots show fit and styling — essential for fashion products';
      return 'Lifestyle context helps buyers visualize the product in their life';

    case 'benefits_infographic':
      if (pk.supportedClaims.length > 0) {
        const claims = pk.supportedClaims.slice(0, 2).join(', ');
        return `Claims like "${claims}" present in listing but not visually supported in images`;
      }
      return 'Feature callouts communicate key benefits at a glance';

    case 'trust_claim_support':
      if (pk.supportedClaims.length > 0) return 'Supported claims could be reinforced with visual certification/testing evidence';
      return 'Trust-building imagery can increase conversion for considered purchases';

    case 'usage_how_it_works':
      return 'Showing the product in use helps buyers understand functionality';

    case 'packaging_closeup':
      return 'Close-up of packaging shows label details buyers want to verify';

    case 'comparison_differentiation':
      return 'Comparison imagery can highlight advantages over alternatives';

    case 'hero':
      return 'Every listing needs a compliant main/hero image';

    default:
      return base.description;
  }
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Derive a campaign image strategy from product knowledge and current assets.
 */
export function deriveCampaignStrategy(
  pk: ProductKnowledge | null | undefined,
  assets: ImageAsset[],
): CampaignStrategy {
  // Low-context fallback
  if (!pk || !pk.isActionable) {
    return {
      productPositioning: 'Unknown product',
      productType: null,
      roleCoverage: [],
      recommendations: [],
      coveredCount: 0,
      missingCount: 0,
      weakCount: 0,
      isActionable: false,
      confidence: 'low',
    };
  }

  const priorities = getRolePriorities(pk.productTypeHint);
  const coverage = detectCoveredRoles(assets);
  const positioning = buildPositioningSummary(pk);

  // Build coverage analysis
  const roleCoverage: RoleCoverage[] = [];
  for (const def of ROLE_DEFINITIONS) {
    const priority = priorities[def.role];
    if (!priority) continue; // role not relevant for this product type

    const coveringAssets = coverage.get(def.role) || [];
    const weakReason = detectWeakCoverage(def.role, coveringAssets, assets);

    let status: 'covered' | 'weak' | 'missing';
    if (coveringAssets.length === 0) {
      status = 'missing';
    } else if (weakReason) {
      status = 'weak';
    } else {
      status = 'covered';
    }

    roleCoverage.push({
      role: def.role,
      label: def.label,
      priority,
      status,
      coveredBy: coveringAssets,
      weakReason: weakReason || undefined,
    });
  }

  // Sort: essential first, then recommended, then optional; missing/weak before covered
  const priorityOrder: Record<RolePriority, number> = { essential: 0, recommended: 1, optional: 2 };
  const statusOrder: Record<string, number> = { missing: 0, weak: 1, covered: 2 };
  roleCoverage.sort((a, b) => {
    const pd = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pd !== 0) return pd;
    return statusOrder[a.status] - statusOrder[b.status];
  });

  // Build recommendations from missing/weak roles
  const recommendations: StrategyRecommendation[] = roleCoverage
    .filter(rc => rc.status === 'missing' || rc.status === 'weak')
    .map(rc => ({
      role: rc.role,
      label: rc.label,
      rationale: rc.status === 'weak' && rc.weakReason
        ? `Current coverage is weak: ${rc.weakReason}. ${buildRecommendationRationale(rc.role, rc.priority, pk)}`
        : buildRecommendationRationale(rc.role, rc.priority, pk),
      priority: rc.priority,
    }))
    .slice(0, 5);

  const coveredCount = roleCoverage.filter(r => r.status === 'covered').length;
  const missingCount = roleCoverage.filter(r => r.status === 'missing').length;
  const weakCount = roleCoverage.filter(r => r.status === 'weak').length;

  // Confidence based on context completeness and asset count
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (pk.completeness >= 60 && assets.length >= 3) confidence = 'high';
  else if (pk.completeness >= 30 || assets.length >= 2) confidence = 'medium';

  return {
    productPositioning: positioning,
    productType: pk.productTypeHint,
    roleCoverage,
    recommendations,
    coveredCount,
    missingCount,
    weakCount,
    isActionable: true,
    confidence,
  };
}

/**
 * Get the role definitions (for external use).
 */
export function getRoleDefinitions(): readonly RoleDefinition[] {
  return ROLE_DEFINITIONS;
}
