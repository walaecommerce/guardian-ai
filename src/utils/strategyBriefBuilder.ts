/**
 * Converts a StrategyRecommendation + ProductKnowledge + ListingContext
 * into a safe, compliance-aware generation brief for the Studio.
 */

import type { StrategyRecommendation, ImageRole } from './campaignStrategy';
import type { ProductKnowledge } from './productKnowledge';
import type { ListingContext } from './listingContext';

export interface GenerationBrief {
  /** Studio template ID that best matches this role */
  templateId: string;
  /** Prefilled product name */
  productName: string;
  /** Prefilled description / prompt context */
  description: string;
  /** Only claims supported by product knowledge */
  claims: string[];
  /** Category for the Studio selector */
  category: string;
  /** Source metadata for tracking */
  strategySource: {
    targetRole: ImageRole;
    recommendationLabel: string;
    priority: string;
  };
  /** Originating audit session ID for round-trip import */
  sourceSessionId?: string;
}

// ── Role → Studio template mapping ──────────────────────────────

const ROLE_TO_TEMPLATE: Record<ImageRole, string> = {
  hero: 'hero',
  packaging_closeup: 'bundle',       // closest match
  benefits_infographic: 'infographic',
  dimensions_size: 'size_reference',
  ingredients_specs: 'ingredients',
  usage_how_it_works: 'lifestyle',    // closest match
  lifestyle_context: 'lifestyle',
  comparison_differentiation: 'before_after',
  trust_claim_support: 'benefits_grid',
};

// ── Product type → Studio category mapping ──────────────────────

const TYPE_TO_CATEGORY: Record<string, string> = {
  supplement: 'SUPPLEMENTS',
  food_beverage: 'FOOD_BEVERAGE',
  pet_supply: 'PET_SUPPLIES',
  beauty: 'BEAUTY',
  electronics: 'ELECTRONICS',
  apparel: 'APPAREL',
  home_garden: 'HOME_GARDEN',
  toy: 'GENERAL',
};

// ── Prohibited content patterns ─────────────────────────────────

const PROHIBITED_CLAIM_PATTERNS = [
  /\bcure[sd]?\b/i,
  /\btreat(?:s|ment)?\b/i,
  /\bprevent[s]?\b/i,
  /\bdiagnos/i,
  /\bdrug\b/i,
  /\bfda[\s-]?approved\b/i,
  /\bguaranteed?\b/i,
  /\b#1\b/i,
  /\bbest[\s-]?selling\b/i,
  /\bmiracl/i,
];

function isClaimSafe(claim: string): boolean {
  return !PROHIBITED_CLAIM_PATTERNS.some(p => p.test(claim));
}

// ── Role-specific description builders ──────────────────────────

function buildRoleDescription(
  role: ImageRole,
  pk: ProductKnowledge,
  ctx: ListingContext | null,
): string {
  const brand = pk.brand || '';
  const identity = pk.identitySummary || '';
  const safeClaims = pk.supportedClaims.filter(isClaimSafe).slice(0, 3);

  switch (role) {
    case 'hero':
      return `Clean hero product shot of ${identity} on pure white background. Product centered, well-lit, no text overlays.`;

    case 'packaging_closeup':
      return `Close-up detail shot of ${identity} packaging showing label, branding${brand ? ` ("${brand}")` : ''}, and product details clearly.`;

    case 'benefits_infographic':
      return `Infographic highlighting key benefits of ${identity}.${safeClaims.length > 0 ? ` Feature these supported claims: ${safeClaims.join(', ')}.` : ''} Use clean callout design.`;

    case 'dimensions_size':
      return `Size reference image for ${identity} showing dimensions with a common object for scale.${pk.attributeHints.find(h => h.startsWith('Package Dimensions')) ? ` ${pk.attributeHints.find(h => h.startsWith('Package Dimensions'))}.` : ''}`;

    case 'ingredients_specs': {
      const specs = pk.attributeHints.slice(0, 3).join('; ');
      return `Ingredients/specs detail image for ${identity}.${specs ? ` Key specs: ${specs}.` : ''} Show supplement facts panel or ingredient list clearly.`;
    }

    case 'usage_how_it_works':
      return `Product-in-use demonstration image for ${identity}. Show the product being used naturally in a realistic setting.`;

    case 'lifestyle_context':
      return `Lifestyle context image for ${identity} in a natural, aspirational setting. Show the product in a real-life scenario.`;

    case 'comparison_differentiation':
      return `Comparison/differentiation image for ${identity}. Highlight unique advantages with a clean visual comparison layout. Do NOT reference competitor brands.`;

    case 'trust_claim_support':
      return `Trust and claim support image for ${identity}.${safeClaims.length > 0 ? ` Visually reinforce: ${safeClaims.join(', ')}.` : ''} Use certifications or test results only if genuinely supported.`;

    default:
      return `Product image for ${identity}.`;
  }
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Build a generation brief from a strategy recommendation.
 * Only includes supported, safe claims. Never invents content.
 */
export function buildGenerationBrief(
  rec: StrategyRecommendation,
  pk: ProductKnowledge | null | undefined,
  ctx: ListingContext | null | undefined,
  sessionId?: string | null,
): GenerationBrief {
  const safePk: ProductKnowledge = pk ?? {
    identitySummary: '',
    brand: null,
    productTypeHint: null,
    allowedTextCues: [],
    supportedClaims: [],
    attributeHints: [],
    completeness: 0,
    isActionable: false,
  };

  const productName = ctx?.title
    ? ctx.title.length > 80 ? ctx.title.substring(0, 80) + '…' : ctx.title
    : safePk.identitySummary || 'Product';

  const description = buildRoleDescription(rec.role, safePk, ctx ?? null);

  const claims = safePk.supportedClaims
    .filter(isClaimSafe)
    .map(c => c.charAt(0).toUpperCase() + c.slice(1))
    .slice(0, 5);

  const category = safePk.productTypeHint
    ? TYPE_TO_CATEGORY[safePk.productTypeHint] || 'GENERAL'
    : 'GENERAL';

  return {
    templateId: ROLE_TO_TEMPLATE[rec.role] || 'hero',
    productName,
    description,
    claims,
    category,
    strategySource: {
      targetRole: rec.role,
      recommendationLabel: rec.label,
      priority: rec.priority,
    },
    ...(sessionId ? { sourceSessionId: sessionId } : {}),
  };
}
