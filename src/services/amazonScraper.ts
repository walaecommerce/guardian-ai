import { ScrapedProduct } from '@/types';
import { supabase } from '@/integrations/supabase/client';

// Filters for icons and small UI elements that are NOT product images
const ICON_FILTERS = ['icon', 'logo', 'button', 'zoom', 'magnify', 'spinner', 'play', 'star', 'pixel', 'sprite', 'transparent', 'badge', 'arrow', 'close', 'nav', 'menu', 'search', 'cart', 'prime-logo'];

// Filters for sections containing non-product images (sponsored, related, etc.)
const EXCLUDED_SECTIONS = [
  'sponsored',
  'sims-consolidated',
  'similar_items',
  'customers_also_viewed',
  'recommendations',
  'compare-with-similar',
  'aplus-module',  // A+ modules from OTHER products
  'advertisement',
  'ad-feedback',
  'rhf-shoveler',  // "Related items" shoveler
  'session-based-sims',
  'p13n-desktop-sidesheet'
];

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

export function getImageId(url: string): string {
  const match = url.match(/\/(?:I|S|G)\/([a-zA-Z0-9\-+%]{9,})/);
  if (match) return match[1];
  return url.split('/').pop()?.split('.')[0] || url;
}

export function cleanImageUrl(url: string): string {
  // Remove Amazon size modifiers to get full resolution
  return url.replace(/\._[A-Z]{2}_[A-Z0-9_,]+_\./g, '.');
}

function isIconOrSprite(url: string): boolean {
  const lower = url.toLowerCase();
  return ICON_FILTERS.some(filter => lower.includes(filter));
}

function isFromExcludedSection(html: string, imageUrl: string): boolean {
  // Check if the image URL appears within an excluded section
  for (const section of EXCLUDED_SECTIONS) {
    // Find section boundaries
    const sectionPattern = new RegExp(
      `id=["']${section}["'][^>]*>([\\s\\S]*?)<\\/div>\\s*<\\/div>`,
      'gi'
    );
    const sectionMatch = html.match(sectionPattern);
    if (sectionMatch) {
      for (const match of sectionMatch) {
        if (match.includes(imageUrl) || match.includes(getImageId(imageUrl))) {
          return true;
        }
      }
    }
  }
  return false;
}

function extractTitle(html: string): string {
  // Strategy 1: productTitle id
  const titleMatch = html.match(/id="productTitle"[^>]*>([^<]+)</i);
  if (titleMatch) return titleMatch[1].trim();

  // Strategy 2: title-card class
  const titleCardMatch = html.match(/class="[^"]*title[^"]*"[^>]*>([^<]+)</i);
  if (titleCardMatch) return titleCardMatch[1].trim();

  // Strategy 3: h1 tag
  const h1Match = html.match(/<h1[^>]*>([^<]+)</i);
  if (h1Match) return h1Match[1].trim();

  // Strategy 4: og:title meta
  const ogMatch = html.match(/property="og:title"[^>]*content="([^"]+)"/i);
  if (ogMatch) return ogMatch[1].trim();

  // Strategy 5: document title
  const docTitle = html.match(/<title>([^<]+)</i);
  if (docTitle) return docTitle[1].split(':')[0].trim();

  return '';
}

// Extract main gallery images from Amazon's imageGalleryData or colorImages JSON
function extractGalleryImages(html: string): string[] {
  const galleryImages: string[] = [];
  
  // Pattern 1: imageGalleryData array (most reliable)
  const galleryDataMatch = html.match(/imageGalleryData['"]\s*:\s*\[([\s\S]*?)\]/);
  if (galleryDataMatch) {
    const hiResMatches = galleryDataMatch[1].match(/"hiRes"\s*:\s*"(https:[^"]+)"/gi);
    if (hiResMatches) {
      hiResMatches.forEach(match => {
        const urlMatch = match.match(/"(https:[^"]+)"/);
        if (urlMatch) {
          galleryImages.push(urlMatch[1].replace(/\\u002F/g, '/'));
        }
      });
    }
  }
  
  // Pattern 2: colorImages JSON object
  const colorImagesMatch = html.match(/colorImages['"]\s*:\s*\{[\s\S]*?"initial"\s*:\s*\[([\s\S]*?)\]/);
  if (colorImagesMatch) {
    const hiResMatches = colorImagesMatch[1].match(/"hiRes"\s*:\s*"(https:[^"]+)"/gi);
    if (hiResMatches) {
      hiResMatches.forEach(match => {
        const urlMatch = match.match(/"(https:[^"]+)"/);
        if (urlMatch && !galleryImages.includes(urlMatch[1])) {
          galleryImages.push(urlMatch[1].replace(/\\u002F/g, '/'));
        }
      });
    }
    // Also get large images as fallback
    const largeMatches = colorImagesMatch[1].match(/"large"\s*:\s*"(https:[^"]+)"/gi);
    if (largeMatches) {
      largeMatches.forEach(match => {
        const urlMatch = match.match(/"(https:[^"]+)"/);
        if (urlMatch && !galleryImages.includes(urlMatch[1])) {
          galleryImages.push(urlMatch[1].replace(/\\u002F/g, '/'));
        }
      });
    }
  }
  
  // Pattern 3: Main image container (fallback)
  const mainImageMatch = html.match(/id=["']landingImage["'][^>]*src=["'](https:[^"']+)["']/i);
  if (mainImageMatch && !galleryImages.includes(mainImageMatch[1])) {
    galleryImages.push(mainImageMatch[1]);
  }
  
  return galleryImages;
}

// Extract A+ content images that belong to THIS product
function extractAPlusImages(html: string, asin: string): string[] {
  const aplusImages: string[] = [];
  
  // Find the product's A+ content section (aplus-3p is third-party brand content)
  const aplusMatch = html.match(/id=["']aplus["'][^>]*>([\s\S]*?)(?=<\/div>\s*<\/div>\s*<div[^>]*id=["'])/i) ||
                     html.match(/class=["'][^"]*aplus[^"]*["'][^>]*>([\s\S]*?)(?=<div[^>]*class=["']a-section)/i);
  
  if (aplusMatch) {
    const aplusContent = aplusMatch[1];
    // Extract images from A+ content
    const imgMatches = aplusContent.match(/https:\/\/m\.media-amazon\.com\/images\/[SG]\/[a-zA-Z0-9\-+%\/]+\.(jpg|jpeg|png|webp)/gi);
    if (imgMatches) {
      imgMatches.forEach(url => {
        if (!isIconOrSprite(url)) {
          aplusImages.push(cleanImageUrl(url));
        }
      });
    }
  }
  
  return aplusImages;
}

function extractImages(html: string, asin: string): string[] {
  const imageSet = new Set<string>();
  const seenIds = new Set<string>();
  
  // PRIORITY 1: Gallery images (highest confidence - definitely this product)
  const galleryImages = extractGalleryImages(html);
  console.log(`[Scraper] Found ${galleryImages.length} gallery images`);
  
  galleryImages.forEach(url => {
    const cleaned = cleanImageUrl(url);
    const id = getImageId(cleaned);
    if (!seenIds.has(id) && !isIconOrSprite(cleaned)) {
      seenIds.add(id);
      imageSet.add(cleaned);
    }
  });
  
  // PRIORITY 2: Images containing the ASIN (definitely this product)
  const asinPattern = new RegExp(
    `https://m\\.media-amazon\\.com/images/I/[a-zA-Z0-9\\-+%]*\\.(jpg|jpeg|png|webp)`,
    'gi'
  );
  const allImages = html.match(asinPattern) || [];
  
  // Check which images are near ASIN references in the HTML
  allImages.forEach(url => {
    const cleaned = cleanImageUrl(url);
    const id = getImageId(cleaned);
    
    if (!seenIds.has(id) && !isIconOrSprite(cleaned)) {
      // Verify this image is in the product context, not in excluded sections
      if (!isFromExcludedSection(html, url)) {
        seenIds.add(id);
        imageSet.add(cleaned);
      }
    }
  });
  
  // PRIORITY 3: A+ content images (but only from this product's section)
  const aplusImages = extractAPlusImages(html, asin);
  console.log(`[Scraper] Found ${aplusImages.length} A+ images`);
  
  aplusImages.forEach(url => {
    const id = getImageId(url);
    if (!seenIds.has(id)) {
      seenIds.add(id);
      imageSet.add(url);
    }
  });
  
  // Filter out any remaining suspected "other product" images
  const finalImages = Array.from(imageSet).filter(url => {
    // Exclude very small images (likely thumbnails from recommendations)
    const sizeMatch = url.match(/\._SX(\d+)_\./i) || url.match(/\._SS(\d+)_\./i);
    if (sizeMatch && parseInt(sizeMatch[1]) < 100) {
      return false;
    }
    return true;
  });
  
  console.log(`[Scraper] Final filtered image count: ${finalImages.length}`);
  return finalImages;
}

export async function downloadImage(url: string): Promise<File | null> {
  // Use weserv.nl which is reliable for image proxying
  const imageProxies = [
    (u: string) => `https://wsrv.nl/?url=${encodeURIComponent(u)}&n=-1`,
  ];

  for (const getProxy of imageProxies) {
    try {
      const proxyUrl = getProxy(url);
      const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
      if (response.ok) {
        const blob = await response.blob();
        const filename = url.split('/').pop()?.split('?')[0] || 'image.jpg';
        return new File([blob], filename, { type: blob.type || 'image/jpeg' });
      }
    } catch (e) {
      continue;
    }
  }
  return null;
}

// Try to scrape via backend edge function (uses Firecrawl if available)
async function scrapeViaBackend(url: string): Promise<{ html?: string; markdown?: string } | null> {
  try {
    const { data, error } = await supabase.functions.invoke('scrape-amazon', {
      body: { url }
    });
    if (error) throw error;
    return data;
  } catch (e) {
    console.log('Backend scraping not available');
    return null;
  }
}

export async function scrapeAmazonProduct(url: string): Promise<ScrapedProduct | null> {
  const asin = extractAsin(url);
  if (!asin) {
    throw new Error('Could not extract ASIN from URL');
  }

  console.log(`[Scraper] Scraping product with ASIN: ${asin}`);

  // Try backend scraping first (more reliable)
  const backendResult = await scrapeViaBackend(url);
  
  if (backendResult?.html) {
    const title = extractTitle(backendResult.html);
    const images = extractImages(backendResult.html, asin);
    
    console.log(`[Scraper] Extracted ${images.length} product images for ASIN ${asin}`);
    
    if (images.length > 0) {
      return { asin, title, images };
    }
  }

  // If backend fails, throw helpful error
  throw new Error(
    'Amazon blocks direct scraping. Please use manual upload instead, or right-click product images on Amazon and save them to upload here.'
  );
}
