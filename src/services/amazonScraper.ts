import { ScrapedProduct, ScrapedImage, ImageCategory } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { FunctionsHttpError } from '@supabase/supabase-js';

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
  // Extract the Amazon image ID (the long alphanumeric string before the extension)
  const match = url.match(/\/(?:I|S|G)\/([A-Za-z0-9\-+%]{9,})\./);
  return match ? match[1] : url;
}

// ── Canonical key for dedup ──────────────────────────────────────
export function getCanonicalImageKey(url: string): string {
  const cleaned = cleanAmazonImageUrl(url);
  return getImageId(cleaned || url).toLowerCase();
}

// ── URL cleaning — BUG 3 FIX ────────────────────────────────────
export function cleanAmazonImageUrl(url: string): string | null {
  if (!url) return null;

  // Remove query string entirely
  let cleaned = url.split('?')[0];

  // Remove known crop/resize suffixes and upgrade to high-res
  cleaned = cleaned
    .replace(/\._[A-Z]{2}_[A-Z]{2}\d+_\./g, '.')
    .replace(/\._AC_S[XY]\d+_\./g, '.')
    .replace(/\._AC_UL\d+_\./g, '.')
    .replace(/\._AC_\./g, '.')
    .replace(/\._CR\d+,\d+,\d+,\d+_\./g, '.')
    .replace(/\._SX\d+_\./g, '.')
    .replace(/\._SY\d+_\./g, '.')
    .replace(/\._SL\d+_\./g, '._SL1500_.')
    .replace(/\._UX\d+_\./g, '.')
    .replace(/\._UY\d+_\./g, '.');

  // Ensure URL still looks valid after cleaning
  if (!cleaned.startsWith('http')) return null;

  return cleaned;
}

// Keep old export name for backward compat
export function cleanImageUrl(url: string): string {
  return cleanAmazonImageUrl(url) || url;
}

// ── BUG 1 FIX — Image URL validation ────────────────────────────
const BLOCKED_PATTERNS = [
  '.js', '.css', '.html', '.json', '.xml',
  'amazonui', 'jquery', 'analytics', 'tracking',
  'pixel', 'beacon', 'metrics', 'log',
  'icon', 'logo', 'button', 'zoom', 'magnify',
  'spinner', 'play-button', 'star-rating',
  'sprite', 'transparent', 'nav_', 'arrow',
  'checkmark', 'badge', 'ribbon',
];

function isValidProductImage(url: string): boolean {
  if (!url || typeof url !== 'string') return false;

  // Must be a real URL
  if (!url.startsWith('http')) return false;

  // Must contain Amazon image CDN path
  const hasAmazonImagePath = (
    url.includes('/images/I/') ||
    url.includes('/images/S/') ||
    url.includes('/images/G/') ||
    url.includes('images-na.ssl-images-amazon.com') ||
    url.includes('m.media-amazon.com/images') ||
    url.includes('images-eu.ssl-images-amazon.com') ||
    url.includes('images-fe.ssl-images-amazon.com')
  );
  if (!hasAmazonImagePath) return false;

  // Must end with an image extension OR have no blocked extension
  const hasImageExtension = /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url);
  const hasBlockedExtension = /\.(js|css|html|json|xml|txt|svg|ico|woff|woff2|ttf)(\?|$)/i.test(url);
  if (!hasImageExtension && hasBlockedExtension) return false;

  // Block known non-image patterns
  const lowerUrl = url.toLowerCase();
  if (BLOCKED_PATTERNS.some(p => lowerUrl.includes(p))) return false;

  // Must have a reasonable Amazon image ID
  const imageId = url.match(/\/(?:I|S|G)\/([A-Za-z0-9\-+%]{9,})\./);
  if (!imageId) return false;

  return true;
}

// ── Title extraction from HTML ───────────────────────────────────
function extractTitle(html: string): string {
  const productTitle = html.match(/id=["']productTitle["'][^>]*>([^<]+)/i);
  if (productTitle) return productTitle[1].trim();

  const ogTitle = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  if (ogTitle) return ogTitle[1].trim();

  const docTitle = html.match(/<title>([^<]+)/i);
  if (docTitle) return docTitle[1].split(':')[0].trim();

  return '';
}

// ── BUG 2 FIX — Gallery-only image extraction ───────────────────

/** Extract the specific gallery container HTML sections */
function extractGalleryHtml(html: string): string {
  const gallerySelectors = [
    /id=["']imageBlock["'][^>]*>([\s\S]*?)(?=<\/div>\s*<div[^>]*id=["'](?!imageBlock))/i,
    /id=["']altImages["'][^>]*>([\s\S]*?)(?=<\/div>\s*<div[^>]*id=["'](?!altImages))/i,
    /id=["']imageBlockThumbs["'][^>]*>([\s\S]*?)(?=<\/div>\s*<div[^>]*id=["'](?!imageBlockThumbs))/i,
    /id=["']imgTagWrapperId["'][^>]*>([\s\S]*?)(?=<\/div>)/i,
  ];

  let galleryHtml = '';
  for (const selector of gallerySelectors) {
    const match = html.match(selector);
    if (match) galleryHtml += match[0] + '\n';
  }
  return galleryHtml;
}

/** Parse imageBlockState / colorImages JSON from inline scripts */
function extractGalleryFromJson(html: string): string[] {
  const urls: string[] = [];

  // Strategy 1: Parse 'colorImages' JSON blob — multiple regex patterns for different Amazon formats
  const colorImagesPatterns = [
    /['"]colorImages['"]:\s*\{[^}]*['"]initial['"]:\s*(\[[\s\S]*?\])\s*\}/,
    /colorImages\s*['"]?\s*:\s*\{\s*['"]initial['"]\s*:\s*(\[[\s\S]*?\])/,
    /'colorImages'\s*:\s*\{\s*'initial'\s*:\s*(\[[\s\S]*?\])\s*\}/,
  ];
  
  for (const pattern of colorImagesPatterns) {
    if (urls.length > 0) break;
    const match = html.match(pattern);
    if (match) {
      try {
        // Fix common JSON issues in Amazon's inline JS (single quotes → double quotes)
        let jsonStr = match[1]
          .replace(/'/g, '"')
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']');
        const items = JSON.parse(jsonStr);
        for (const item of items) {
          const imgUrl = item.hiRes || item.large || item.thumb;
          if (imgUrl) urls.push(imgUrl);
        }
      } catch { /* ignore parse errors */ }
    }
  }

  // Strategy 2: Parse 'imageGalleryData' JSON blob
  const galleryDataPatterns = [
    /imageGalleryData\s*[=:]\s*(\[[\s\S]*?\])\s*[;,]/,
    /['"]imageGalleryData['"]\s*:\s*(\[[\s\S]*?\])/,
  ];
  
  for (const pattern of galleryDataPatterns) {
    if (urls.length > 0) break;
    const match = html.match(pattern);
    if (match) {
      try {
        let jsonStr = match[1].replace(/'/g, '"').replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
        const items = JSON.parse(jsonStr);
        for (const item of items) {
          const imgUrl = item.mainUrl || item.thumbUrl;
          if (imgUrl) urls.push(imgUrl);
        }
      } catch { /* ignore parse errors */ }
    }
  }

  // Strategy 3: Extract hiRes URLs directly from script text with simple regex
  if (urls.length === 0) {
    const hiResMatches = html.matchAll(/["']hiRes["']\s*:\s*["'](https?:\/\/[^"']+)["']/gi);
    for (const m of hiResMatches) urls.push(m[1]);
  }

  // Strategy 4: Extract from data-old-hires attributes (landing image and thumbs)
  if (urls.length === 0) {
    const oldHiresMatches = html.matchAll(/data-old-hires=["'](https?:\/\/[^"']+)["']/gi);
    for (const m of oldHiresMatches) urls.push(m[1]);
  }

  return urls;
}

/** Extract images from gallery containers and JSON, filtered and validated */
function extractProductImages(html: string): string[] {
  const urls = new Set<string>();

  // Priority 1: Extract from gallery JSON blobs (most reliable)
  const jsonUrls = extractGalleryFromJson(html);
  for (const u of jsonUrls) urls.add(u);

  // Priority 2: If JSON parsing found nothing, fall back to gallery HTML containers
  if (urls.size === 0) {
    const galleryHtml = extractGalleryHtml(html);
    const htmlToSearch = galleryHtml || html; // absolute fallback to full HTML

    // Extract image URLs from gallery HTML only
    const srcMatches = htmlToSearch.matchAll(
      /(?:src|data-old-hires|data-src)=["'](https?:\/\/[^"']+\/images\/[ISG]\/[^"']+)["']/gi
    );
    for (const m of srcMatches) urls.add(m[1]);
  }

  // Priority 3: Also grab #landingImage specifically
  const landingImg = html.match(/id=["']landingImage["'][^>]*src=["']([^"']+)["']/i);
  if (landingImg) urls.add(landingImg[1]);

  return Array.from(urls);
}

/** Extract A+ content images separately */
function extractAplusImages(html: string): string[] {
  const urls = new Set<string>();
  const aplusSection = html.match(/id=["'](?:aplus|aplusbody)["'][^>]*>([\s\S]*?)(?=<\/section>|<div[^>]*id=["'](?!aplus))/i) ||
    html.match(/class=["'][^"]*aplus-module[^"]*["'][^>]*>([\s\S]*?)(?=<\/section>|$)/i);

  if (aplusSection) {
    const srcMatches = aplusSection[1].matchAll(
      /(?:src|data-src)=["'](https?:\/\/[^"']+\/images\/[ISG]\/[^"']+)["']/gi
    );
    for (const m of srcMatches) urls.add(m[1]);
  }

  return Array.from(urls);
}

// ── Scrape via Firecrawl edge function ───────────────────────────

export type ImportLogCallback = (level: 'info' | 'success' | 'warning' | 'error' | 'processing', message: string) => void;

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

  let html: string;
  try {
    const { data, error } = await supabase.functions.invoke('scrape-amazon', {
      body: { url },
    });

    if (error) {
      // Extract the real error message from FunctionsHttpError responses
      if (error instanceof FunctionsHttpError) {
        try {
          const errorBody = await error.context.json();
          const msg = errorBody?.error || errorBody?.message || '';
          if (
            msg.toLowerCase().includes('captcha') ||
            msg.toLowerCase().includes('blocked') ||
            msg.toLowerCase().includes('bot')
          ) {
            throw new Error('Amazon blocked this request. Try a different product URL or upload manually.');
          }
          if (msg) throw new Error(msg);
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message !== error.message) throw parseErr;
        }
      }
      throw new Error('Failed to fetch product page. Please try again or upload images manually.');
    }

    if (data && !data.success && data.error) {
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
    throw err;
  }

  // ── Step 4: Extract title ──
  const title = extractTitle(html);
  if (title) {
    emit('info', `📦 Title: ${title.substring(0, 80)}${title.length > 80 ? '...' : ''}`);
  }

  // ── Step 5: Extract gallery images (BUG 2 fix — gallery-only) ──
  emit('processing', 'Discovering product gallery images...');
  const rawUrls = extractProductImages(html);
  emit('info', `Found ${rawUrls.length} raw images from gallery`);

  // ── Step 6: Validate every URL (BUG 1 fix) ──
  const validated = rawUrls.filter(u => isValidProductImage(u));
  const invalidCount = rawUrls.length - validated.length;
  if (invalidCount > 0) {
    emit('info', `Filtered out ${invalidCount} non-image URLs (JS, CSS, icons, sprites)`);
  }

  // ── Step 7: Clean URLs for highest resolution (BUG 3 fix) ──
  emit('processing', 'Cleaning image URLs for highest resolution...');
  const cleaned: string[] = [];
  for (const u of validated) {
    const c = cleanAmazonImageUrl(u);
    if (c) cleaned.push(c);
  }

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
  if (dupeCount > 0) {
    emit('processing', `Removing ${dupeCount} duplicates...`);
  }

  // ── Step 9: Cap at 9 gallery images ──
  const galleryImages = unique.slice(0, 9);

  // ── Step 10: Extract A+ content images separately (capped at 5) ──
  const aplusRaw = extractAplusImages(html);
  const aplusValidated = aplusRaw.filter(u => isValidProductImage(u));
  const aplusCleaned: string[] = [];
  for (const u of aplusValidated) {
    const c = cleanAmazonImageUrl(u);
    if (c && !seen.has(getImageId(c))) {
      seen.add(getImageId(c));
      aplusCleaned.push(c);
    }
  }
  const aplusImages = aplusCleaned.slice(0, 5);

  // ── Step 11: Check we got images ──
  if (galleryImages.length === 0 && aplusImages.length === 0) {
    throw new Error('NO_IMAGES');
  }

  const totalCount = galleryImages.length + aplusImages.length;
  emit('processing', `Downloading ${totalCount} product images...`);

  // ── Step 12: Build ScrapedImage array ──
  const images: ScrapedImage[] = [
    ...galleryImages.map((url, index) => ({
      url,
      category: (index === 0 ? 'PRODUCT_SHOT' : 'UNKNOWN') as ImageCategory,
      index,
    })),
    ...aplusImages.map((url, index) => ({
      url,
      category: 'APLUS' as ImageCategory,
      index: galleryImages.length + index,
    })),
  ];

  emit('success', `Import complete — ${images.length} images loaded (${galleryImages.length} gallery${aplusImages.length > 0 ? ` + ${aplusImages.length} A+` : ''})`);

  return {
    asin: asin || 'UNKNOWN',
    title,
    images,
  };
}

// ── Image downloader (via edge function proxy) ──────────────────

export async function downloadImage(url: string): Promise<File | null> {
  try {
    const { data, error } = await supabase.functions.invoke('proxy-image', {
      body: { url },
    });
    if (error || !data?.base64) return null;

    const binary = atob(data.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const blob = new Blob([bytes], { type: data.contentType || 'image/jpeg' });
    const filename = url.split('/').pop()?.split('?')[0] || 'image.jpg';
    return new File([blob], filename, { type: data.contentType || 'image/jpeg' });
  } catch {
    return null;
  }
}
