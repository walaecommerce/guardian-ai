/**
 * ListingContext — structured product knowledge extracted from Amazon listing data.
 * Used as context across audit, fix, enhance, and reporting flows.
 */

export interface ListingContext {
  title: string;
  brand: string | null;
  bullets: string[];
  description: string | null;
  category: string | null;
  attributes: Record<string, string>;
  claims: string[];
  keywords: string[];
  asin: string | null;
  sourceUrl: string | null;
  /** Placeholder for future campaign/creative intent */
  campaignIntent?: string | null;
}

// ── Brand extraction heuristics ────────────────────────────────

const BRAND_PREFIXES = [
  /^(?:Visit the |Brand: ?)/i,
];

function extractBrandFromTitle(title: string): string | null {
  // Common pattern: "BrandName ProductName ..."
  // Heuristic: first word(s) before a separator or known product type
  const dashSplit = title.split(/\s[-–—|]\s/);
  if (dashSplit.length >= 2 && dashSplit[0].split(/\s+/).length <= 3) {
    return dashSplit[0].trim();
  }
  return null;
}

function cleanBrand(raw: string): string {
  let cleaned = raw.trim();
  for (const prefix of BRAND_PREFIXES) {
    cleaned = cleaned.replace(prefix, '');
  }
  return cleaned.trim();
}

// ── Bullet normalization ───────────────────────────────────────

function normalizeBullets(raw: string[] | undefined | null): string[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .map(b => (typeof b === 'string' ? b.trim() : ''))
    .filter(b => b.length > 0 && b.length < 2000);
}

// ── Description cleaning ───────────────────────────────────────

function cleanDescription(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/<[^>]+>/g, ' ')         // strip HTML tags
    .replace(/&[a-z]+;/gi, ' ')       // strip HTML entities
    .replace(/\s{2,}/g, ' ')          // collapse whitespace
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

// ── Claim / keyword extraction ─────────────────────────────────

const CLAIM_PATTERNS = [
  /(?:FDA|USDA|organic|non-gmo|gluten.?free|vegan|cruelty.?free|BPA.?free|made in (?:the )?(?:USA|America)|100%|clinically (?:tested|proven)|dermatologist (?:tested|recommended)|lab.?tested|third.?party tested|premium|professional.?grade)/gi,
];

function extractClaims(bullets: string[], description: string | null, title: string): string[] {
  const allText = [title, ...bullets, description || ''].join(' ');
  const claims = new Set<string>();

  for (const pattern of CLAIM_PATTERNS) {
    const matches = allText.matchAll(pattern);
    for (const m of matches) {
      claims.add(m[0].trim().toLowerCase());
    }
  }

  return Array.from(claims);
}

function extractKeywords(title: string, bullets: string[]): string[] {
  const allText = [title, ...bullets].join(' ').toLowerCase();
  // Simple keyword extraction: unique words > 4 chars, de-duped, max 20
  const words = allText
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 4);
  const unique = Array.from(new Set(words));
  return unique.slice(0, 20);
}

// ── Attribute extraction from HTML ─────────────────────────────

function extractAttributesFromHtml(html: string): Record<string, string> {
  const attrs: Record<string, string> = {};

  // Product details table rows
  const rowPattern = /<tr[^>]*>\s*<t[dh][^>]*>([^<]+)<\/t[dh]>\s*<t[dh][^>]*>([^<]+)<\/t[dh]>/gi;
  let match;
  while ((match = rowPattern.exec(html)) !== null) {
    const key = match[1].trim().replace(/\s+/g, ' ');
    const val = match[2].trim().replace(/\s+/g, ' ');
    if (key.length < 60 && val.length < 200) {
      attrs[key] = val;
    }
  }

  return attrs;
}

// ── Bullet extraction from HTML ────────────────────────────────

export function extractBulletsFromHtml(html: string): string[] {
  const bullets: string[] = [];

  // Feature bullets section
  const featureBulletsMatch = html.match(/id=["']feature-bullets["'][^>]*>([\s\S]*?)(?=<\/div>\s*<div[^>]*id=["'](?!feature-bullets))/i);
  if (featureBulletsMatch) {
    const liMatches = featureBulletsMatch[1].matchAll(/<li[^>]*>\s*<span[^>]*>([^<]+)<\/span>/gi);
    for (const m of liMatches) {
      const text = m[1].trim();
      if (text.length > 5) bullets.push(text);
    }
  }

  // Fallback: any li within a-unordered-list
  if (bullets.length === 0) {
    const listMatch = html.match(/class=["'][^"]*a-unordered-list[^"]*["'][^>]*>([\s\S]*?)<\/ul>/i);
    if (listMatch) {
      const liMatches = listMatch[1].matchAll(/<li[^>]*>\s*<span[^>]*>([^<]+)<\/span>/gi);
      for (const m of liMatches) {
        const text = m[1].trim();
        if (text.length > 5) bullets.push(text);
      }
    }
  }

  return bullets.slice(0, 10);
}

// ── Description extraction from HTML ───────────────────────────

export function extractDescriptionFromHtml(html: string): string | null {
  // productDescription div
  const descMatch = html.match(/id=["']productDescription["'][^>]*>([\s\S]*?)(?=<\/div>\s*<div[^>]*id=["'](?!productDescription))/i);
  if (descMatch) {
    return cleanDescription(descMatch[1]);
  }

  // Fallback: meta description
  const metaDesc = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
  if (metaDesc) return metaDesc[1].trim();

  return null;
}

// ── Brand extraction from HTML ─────────────────────────────────

export function extractBrandFromHtml(html: string): string | null {
  // bylineInfo link
  const byline = html.match(/id=["']bylineInfo["'][^>]*>(?:[\s\S]*?<a[^>]*>)?([^<]+)/i);
  if (byline) return cleanBrand(byline[1]);

  // Brand row in product details
  const brandRow = html.match(/(?:Brand|Marke|Marque)[^<]*<\/t[dh]>\s*<t[dh][^>]*>([^<]+)/i);
  if (brandRow) return brandRow[1].trim();

  return null;
}

// ── Main normalizer ────────────────────────────────────────────

export interface RawListingData {
  title?: string;
  asin?: string | null;
  sourceUrl?: string | null;
  bullets?: string[];
  description?: string | null;
  brand?: string | null;
  category?: string | null;
  attributes?: Record<string, string>;
  html?: string;
}

/**
 * Normalize raw listing data into a clean ListingContext.
 * Handles missing/empty values gracefully.
 */
export function normalizeListingContext(raw: RawListingData): ListingContext {
  const title = (raw.title || '').trim();

  // Extract from HTML if available and fields are missing
  let bullets = normalizeBullets(raw.bullets);
  let description = cleanDescription(raw.description);
  let brand = raw.brand ? cleanBrand(raw.brand) : null;
  let attributes = raw.attributes || {};

  if (raw.html) {
    if (bullets.length === 0) bullets = extractBulletsFromHtml(raw.html);
    if (!description) description = extractDescriptionFromHtml(raw.html);
    if (!brand) brand = extractBrandFromHtml(raw.html);
    if (Object.keys(attributes).length === 0) attributes = extractAttributesFromHtml(raw.html);
  }

  // Fallback brand from title
  if (!brand) brand = extractBrandFromTitle(title);

  const claims = extractClaims(bullets, description, title);
  const keywords = extractKeywords(title, bullets);

  return {
    title,
    brand,
    bullets,
    description,
    category: raw.category || null,
    attributes,
    claims,
    keywords,
    asin: raw.asin || null,
    sourceUrl: raw.sourceUrl || null,
  };
}

/**
 * Create a minimal ListingContext from just a title (manual upload case).
 */
export function minimalListingContext(title: string, asin?: string | null): ListingContext {
  return normalizeListingContext({ title, asin });
}

/**
 * Serialize ListingContext for DB storage (strips HTML).
 */
export function serializeListingContext(ctx: ListingContext): Record<string, unknown> {
  return { ...ctx };
}

/**
 * Deserialize ListingContext from DB jsonb.
 */
export function deserializeListingContext(raw: unknown): ListingContext | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!obj.title || typeof obj.title !== 'string') return null;

  return {
    title: obj.title as string,
    brand: (obj.brand as string) || null,
    bullets: Array.isArray(obj.bullets) ? obj.bullets.filter((b): b is string => typeof b === 'string') : [],
    description: (obj.description as string) || null,
    category: (obj.category as string) || null,
    attributes: (obj.attributes as Record<string, string>) || {},
    claims: Array.isArray(obj.claims) ? obj.claims.filter((c): c is string => typeof c === 'string') : [],
    keywords: Array.isArray(obj.keywords) ? obj.keywords.filter((k): k is string => typeof k === 'string') : [],
    asin: (obj.asin as string) || null,
    sourceUrl: (obj.sourceUrl as string) || null,
    campaignIntent: (obj.campaignIntent as string) || null,
  };
}
