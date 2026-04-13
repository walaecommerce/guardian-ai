/**
 * ProductKnowledge — shared edge function module for deriving structured
 * product knowledge from ListingContext and building prompt sections.
 *
 * Mirrors src/utils/productKnowledge.ts but runs in Deno edge functions.
 */

export interface ProductKnowledge {
  identitySummary: string;
  brand: string | null;
  productTypeHint: string | null;
  allowedTextCues: string[];
  supportedClaims: string[];
  attributeHints: string[];
  completeness: number;
  isActionable: boolean;
}

interface ListingContextInput {
  title?: string;
  brand?: string | null;
  bullets?: string[];
  description?: string | null;
  claims?: string[];
  keywords?: string[];
  attributes?: Record<string, string>;
  category?: string | null;
}

const PRODUCT_TYPE_PATTERNS: [RegExp, string][] = [
  [/\b(supplement|vitamin|capsule|tablet|softgel|probiotic|collagen|omega|multivitamin|creatine|amino|magnesium|zinc|biotin|melatonin|ashwagandha|turmeric|elderberry|gummy|gummies)\b/i, 'supplement'],
  [/\b(dog|cat|pet|puppy|kitten|treat|kibble|chew)\b/i, 'pet_supply'],
  [/\b(food|snack|drink|beverage|sauce|coffee|tea|juice|candy|chocolate|cereal|chip|cookie|bar|protein powder|whey)\b/i, 'food_beverage'],
  [/\b(serum|cream|lotion|shampoo|conditioner|moisturizer|cleanser|toner|sunscreen|foundation|mascara|lipstick|perfume|cologne|deodorant|skincare|makeup|cosmetic)\b/i, 'beauty'],
  [/\b(charger|cable|bluetooth|wireless|speaker|headphone|usb|hdmi|adapter|camera|laptop|tablet|electronic)\b/i, 'electronics'],
  [/\b(shirt|pants|dress|jacket|hoodie|sweater|sock|boot|hat|coat|blouse|skirt|jeans|legging)\b/i, 'apparel'],
  [/\b(garden|planter|vase|candle|lamp|rug|curtain|pillow|blanket|organizer|shelf|furniture|decor)\b/i, 'home_garden'],
  [/\b(toy|game|puzzle|doll|action figure|plush|stuffed|playset|building block|lego)\b/i, 'toy'],
];

function inferProductType(title: string, bullets: string[]): string | null {
  const text = [title, ...bullets.slice(0, 3)].join(' ').toLowerCase();
  for (const [pattern, type] of PRODUCT_TYPE_PATTERNS) {
    if (pattern.test(text)) return type;
  }
  return null;
}

function extractAllowedTextCues(ctx: ListingContextInput): string[] {
  const cues: Set<string> = new Set();
  if (ctx.brand) cues.add(ctx.brand);
  if (ctx.title) {
    const segments = ctx.title.split(/[,|–—-]/).map(s => s.trim()).filter(Boolean);
    if (segments[0] && segments[0].length < 80) cues.add(segments[0]);
  }
  for (const claim of (ctx.claims || []).slice(0, 10)) {
    cues.add(claim);
  }
  const sizePatterns = /\b(\d+\.?\d*\s*(?:oz|ml|mg|g|kg|lb|lbs|ct|count|pack|capsule|tablet|softgel|fl\.?\s*oz|gallon|liter|quart|pint)s?)\b/gi;
  const titleMatches = (ctx.title || '').matchAll(sizePatterns);
  for (const m of titleMatches) cues.add(m[0].trim().toLowerCase());
  const attrs = ctx.attributes || {};
  for (const attr of ['Brand', 'Flavor', 'Scent', 'Color', 'Size', 'Material', 'Pattern']) {
    if (attrs[attr]) cues.add(attrs[attr]);
  }
  return Array.from(cues).filter(c => c.length > 1);
}

function extractAttributeHints(ctx: ListingContextInput): string[] {
  const hints: string[] = [];
  const attrs = ctx.attributes || {};
  for (const key of ['Brand', 'Item Weight', 'Package Dimensions', 'Flavor', 'Scent', 'Material', 'Color', 'Size', 'Age Range', 'Breed Size', 'Special Feature']) {
    if (attrs[key]) hints.push(`${key}: ${attrs[key]}`);
  }
  return hints.slice(0, 8);
}

function scoreCompleteness(ctx: ListingContextInput): number {
  let score = 0;
  if (ctx.title && ctx.title.length > 5) score += 25;
  if (ctx.brand) score += 20;
  if ((ctx.bullets || []).length > 0) score += 20;
  if (ctx.description) score += 15;
  if ((ctx.claims || []).length > 0) score += 10;
  if (Object.keys(ctx.attributes || {}).length > 0) score += 10;
  return Math.min(100, score);
}

export function deriveProductKnowledge(ctx: ListingContextInput | null | undefined): ProductKnowledge {
  if (!ctx || !ctx.title) {
    return { identitySummary: '', brand: null, productTypeHint: null, allowedTextCues: [], supportedClaims: [], attributeHints: [], completeness: 0, isActionable: false };
  }
  const brand = ctx.brand || null;
  const productTypeHint = inferProductType(ctx.title, ctx.bullets || []);
  const allowedTextCues = extractAllowedTextCues(ctx);
  const supportedClaims = [...(ctx.claims || [])];
  const attributeHints = extractAttributeHints(ctx);
  const completeness = scoreCompleteness(ctx);

  const parts: string[] = [];
  if (brand) parts.push(brand);
  let titlePart = ctx.title;
  if (brand && titlePart.toLowerCase().startsWith(brand.toLowerCase())) {
    titlePart = titlePart.slice(brand.length).replace(/^[\s\-–—|]+/, '').trim();
  }
  if (titlePart) parts.push(titlePart.length > 100 ? titlePart.substring(0, 100) + '…' : titlePart);

  return {
    identitySummary: parts.join(' — '),
    brand,
    productTypeHint,
    allowedTextCues,
    supportedClaims,
    attributeHints,
    completeness,
    isActionable: completeness >= 25,
  };
}

/**
 * Build audit-oriented prompt section with knowledge-based reasoning rules.
 */
export function buildKnowledgeAuditSection(pk: ProductKnowledge): string {
  if (!pk.isActionable) return '';

  const lines: string[] = ['\nPRODUCT KNOWLEDGE (use for informed audit reasoning):'];
  lines.push(`Identity: ${pk.identitySummary}`);
  if (pk.brand) lines.push(`Brand: ${pk.brand}`);
  if (pk.productTypeHint) lines.push(`Product type: ${pk.productTypeHint}`);
  if (pk.allowedTextCues.length > 0) lines.push(`Allowed packaging text: ${pk.allowedTextCues.slice(0, 8).join(' | ')}`);
  if (pk.supportedClaims.length > 0) lines.push(`Supported claims: ${pk.supportedClaims.slice(0, 8).join(', ')}`);
  if (pk.attributeHints.length > 0) lines.push(`Key attributes: ${pk.attributeHints.slice(0, 5).join('; ')}`);
  lines.push(`Context completeness: ${pk.completeness}%`);
  lines.push('');
  lines.push('KNOWLEDGE-BASED REASONING RULES:');
  lines.push('- Text matching allowed packaging text or supported claims is LEGITIMATE — do NOT flag as overlay/violation');
  lines.push('- Text NOT in the allowed set may still be legitimate if physically printed on packaging — use visual judgment');
  lines.push('- Claims visible on packaging that are NOT in the supported claims set should be noted as UNVERIFIED, not auto-flagged as violation');
  lines.push('- Brand name on packaging is ALWAYS legitimate — never flag brand text as a violation');
  lines.push('- Do NOT require all listing bullets/claims to appear visually on the product');
  lines.push('- Use product type hint to improve category detection accuracy');
  return lines.join('\n');
}

/**
 * Build preservation-oriented prompt section for fix/enhance.
 */
export function buildKnowledgePreservationSection(pk: ProductKnowledge): string {
  if (!pk.isActionable) return '';

  const lines: string[] = ['\nPRODUCT KNOWLEDGE — PRESERVATION GUIDANCE:'];
  lines.push(`Identity: ${pk.identitySummary}`);
  if (pk.brand) lines.push(`Brand "${pk.brand}" text MUST be preserved on packaging`);
  if (pk.allowedTextCues.length > 0) lines.push(`Legitimate packaging text to preserve: ${pk.allowedTextCues.slice(0, 8).join(' | ')}`);
  if (pk.supportedClaims.length > 0) lines.push(`Valid claims (preserve if printed): ${pk.supportedClaims.slice(0, 6).join(', ')}`);
  lines.push('RULES:');
  lines.push('- Do NOT invent or add claims not in the supported set');
  lines.push('- Do NOT modify legitimate brand/product text on packaging');
  lines.push('- Preserve product identity cues exactly');
  return lines.join('\n');
}

/**
 * Build verification-oriented prompt section.
 */
export function buildKnowledgeVerificationSection(pk: ProductKnowledge): string {
  if (!pk.isActionable) return '';

  const lines: string[] = ['\nPRODUCT KNOWLEDGE — VERIFICATION CONTEXT:'];
  lines.push(`Identity: ${pk.identitySummary}`);
  if (pk.brand) lines.push(`Expected brand: ${pk.brand}`);
  if (pk.allowedTextCues.length > 0) lines.push(`Legitimate text that must be present: ${pk.allowedTextCues.slice(0, 8).join(' | ')}`);
  if (pk.supportedClaims.length > 0) lines.push(`Valid claims: ${pk.supportedClaims.slice(0, 6).join(', ')}`);
  lines.push('- Verify brand name is preserved');
  lines.push('- Verify no unsupported claims were introduced');
  lines.push('- Verify legitimate packaging text was not removed');
  return lines.join('\n');
}
