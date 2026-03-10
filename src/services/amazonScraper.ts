import { ScrapedProduct, ScrapedImage, ImageCategory } from '@/types';
import { supabase } from '@/integrations/supabase/client';

// ── Icon / UI element filters ────────────────────────────────────
const ICON_FILTERS = [
  'icon', 'logo', 'button', 'zoom', 'magnify', 'spinner', 'play',
  'star', 'pixel', 'sprite', 'transparent', 'nav_', 'arrow',
];

// ── ASIN extractor ───────────────────────────────────────────────
export function extractAsin(url: string): string | null {
  const patterns = [
    /\/dp\/([A-Z0-9]{10})/i,
    /\/gp\/product\/([A-Z0-9]{10})/i,
    /\/product\/([A-Z0-9]{10})/i,
    /asin=([A-Z0-9]{10})/i,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1].toUpperCase();
  }
  return null;
}

// ── Image ID extractor (for dedup) ───────────────────────────────
export function getImageId(url: string): string {
  const match = url.match(/\/(?:I|S|G)\/([a-zA-Z0-9\-+%]{9,})/);
  return match ? match[1] : url.split('/').pop()?.split('.')[0] || url;
}

// ── Canonical key for dedup ──────────────────────────────────────
export function getCanonicalImageKey(url: string): string {
  return getImageId(cleanImageUrl(url)).toLowerCase();
}

// ── URL cleanup pipeline ─────────────────────────────────────────

/** Step 1: Strip crop parameters */
function stripCropParams(url: string): string {
  return url
    .replace(/\._AC_SX\d+_/g, '')
    .replace(/\._SY\d+_/g, '')
    .replace(/\._CR\d+,\d+,\d+,\d+_/g, '')
    .replace(/\._AC_UL\d+_/g, '');
}

/** Step 2: Upgrade resolution */
function upgradeResolution(url: string): string {
  return url.replace(/\._SL\d+_/g, '._SL1500_');
}

/** Step 3: Full cleanup */
export function cleanImageUrl(url: string): string {
  let cleaned = stripCropParams(url);
  cleaned = upgradeResolution(cleaned);
  // Remove any remaining Amazon size modifiers
  cleaned = cleaned.replace(/\._[A-Z]{2}_[A-Z0-9_,]+_\./g, '.');
  return cleaned;
}

// ── Filters ──────────────────────────────────────────────────────

function isIconOrSprite(url: string): boolean {
  const lower = url.toLowerCase();
  return ICON_FILTERS.some(f => lower.includes(f));
}

function isAmazonProductImage(url: string): boolean {
  return /\/images\/[ISG]\//i.test(url);
}

// ── Title extraction from HTML ───────────────────────────────────

function extractTitle(html: string): string {
  // Strategy 1: h1#productTitle
  const productTitle = html.match(/id=["']productTitle["'][^>]*>([^<]+)/i);
  if (productTitle) return productTitle[1].trim();

  // Strategy 2: og:title meta tag
  const ogTitle = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  if (ogTitle) return ogTitle[1].trim();

  // Strategy 3: document title
  const docTitle = html.match(/<title>([^<]+)/i);
  if (docTitle) return docTitle[1].split(':')[0].trim();

  return '';
}

// ── Image extraction from HTML ───────────────────────────────────

function extractAllImageUrls(html: string): string[] {
  const urls = new Set<string>();

  // Pattern 1: All src/data-old-hires values matching /images/I/, /images/S/, /images/G/
  const srcMatches = html.matchAll(/(?:src|data-old-hires|data-src)=["'](https?:\/\/[^"']+\/images\/[ISG]\/[^"']+)["']/gi);
  for (const m of srcMatches) urls.add(m[1]);

  // Pattern 2: URLs in JSON blobs (colorImages, imageGalleryData, etc.)
  const jsonUrlMatches = html.matchAll(/["'](https?:\/\/[^"']+\/images\/[ISG]\/[^"']+)["']/gi);
  for (const m of jsonUrlMatches) urls.add(m[1]);

  // Pattern 3: A+ content images in #aplus, #aplusbody, .aplus-module containers
  const aplusSection = html.match(/id=["'](?:aplus|aplusbody)["'][^>]*>([\s\S]*?)(?=<\/section>|<div[^>]*id=["'](?!aplus))/i) ||
    html.match(/class=["'][^"]*aplus-module[^"]*["'][^>]*>([\s\S]*?)(?=<\/section>|$)/i);

  if (aplusSection) {
    const aplusSrcMatches = aplusSection[1].matchAll(/(?:src|data-src)=["'](https?:\/\/[^"']+\/images\/[ISG]\/[^"']+)["']/gi);
    for (const m of aplusSrcMatches) urls.add(m[1]);
  }

  return Array.from(urls);
}

// ── Scrape via Firecrawl edge function ───────────────────────────

export type ImportLogCallback = (level: 'info' | 'success' | 'warning' | 'error' | 'processing', message: string) => void;

interface ScrapeResult {
  product: ScrapedProduct;
}

export async function scrapeAmazonProduct(
  url: string,
  log?: ImportLogCallback,
): Promise<ScrapedProduct> {
  const emit = log || (() => {});

  // ── Step 1: Validate URL ──
  const amazonUrlPattern = /^https?:\/\/(www\.)?amazon\.(com|co\.uk|ca|de|fr|es|it|co\.jp|com\.au|in|com\.br|com\.mx|nl|sg|ae|sa|pl|se|com\.be|com\.tr|eg)(\/.*)?$/i;
  if (!amazonUrlPattern.test(url)) {
    throw new Error('Please enter a valid Amazon product URL (amazon.com/dp/...)');
  }

  // ── Step 2: Extract ASIN ──
  const asin = extractAsin(url);
  emit('processing', `Extracting ASIN: ${asin || 'not found'}...`);
  if (!asin) {
    emit('warning', 'ASIN not detected — attempting scrape without ASIN');
  }

  // ── Step 3: Fetch via Firecrawl ──
  emit('processing', 'Fetching product page...');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let html: string;
  try {
    const { data, error } = await supabase.functions.invoke('scrape-amazon', {
      body: { url },
    });

    clearTimeout(timeout);

    if (error) throw error;

    if (data && !data.success && data.error) {
      // Firecrawl blocked by Amazon
      if (
        data.error.toLowerCase().includes('captcha') ||
        data.error.toLowerCase().includes('blocked') ||
        data.error.toLowerCase().includes('bot')
      ) {
        throw new Error('Amazon blocked this request. Try a different product URL or upload manually.');
      }
      throw new Error(data.error);
    }

    html = data?.html || '';
    if (!html || html.length < 1000) {
      throw new Error('Amazon blocked this request. Try a different product URL or upload manually.');
    }
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error('Import timed out. Try again or upload images manually.');
    }
    throw err;
  }

  // ── Step 4: Extract title ──
  const title = extractTitle(html);
  if (title) {
    emit('info', `📦 Title: ${title.substring(0, 80)}${title.length > 80 ? '...' : ''}`);
  }

  // ── Step 5: Discover raw images ──
  emit('processing', 'Discovering product images...');
  const rawUrls = extractAllImageUrls(html);
  emit('info', `Found ${rawUrls.length} raw images — filtering UI elements...`);

  // ── Step 6: Filter icons/sprites ──
  const filtered = rawUrls.filter(u => isAmazonProductImage(u) && !isIconOrSprite(u));
  const iconCount = rawUrls.length - filtered.length;
  if (iconCount > 0) {
    emit('info', `Filtered out ${iconCount} UI elements (icons, sprites, buttons)`);
  }

  // ── Step 7: Clean URLs for highest resolution ──
  emit('processing', 'Cleaning image URLs for highest resolution...');
  const cleaned = filtered.map(u => cleanImageUrl(u));

  // ── Step 8: Deduplicate by image ID ──
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const u of cleaned) {
    const id = getImageId(u);
    if (!seen.has(id)) {
      seen.add(id);
      unique.push(u);
    }
  }
  const dupeCount = cleaned.length - unique.length;
  emit('processing', `Removing ${dupeCount} duplicates...`);

  // ── Step 9: Check we got images ──
  if (unique.length === 0) {
    throw new Error('NO_IMAGES');
  }

  emit('processing', `Downloading ${unique.length} product images...`);

  // ── Step 10: Build ScrapedImage array ──
  const images: ScrapedImage[] = unique.map((url, index) => ({
    url,
    category: (index === 0 ? 'PRODUCT_SHOT' : 'UNKNOWN') as ImageCategory,
    index,
  }));

  emit('success', `Import complete — ${images.length} images loaded`);

  return {
    asin: asin || 'UNKNOWN',
    title,
    images,
  };
}

// ── Image downloader (via wsrv.nl proxy) ─────────────────────────

export async function downloadImage(url: string): Promise<File | null> {
  const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(url)}&n=-1`;
  try {
    const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
    if (response.ok) {
      const blob = await response.blob();
      const filename = url.split('/').pop()?.split('?')[0] || 'image.jpg';
      return new File([blob], filename, { type: blob.type || 'image/jpeg' });
    }
  } catch {
    // silent fail
  }
  return null;
}
