import { ScrapedProduct, ScrapedImage, ImageCategory } from '@/types';
import { supabase } from '@/integrations/supabase/client';

// Filters for icons and small UI elements that are NOT product images
const ICON_FILTERS = ['icon', 'logo', 'button', 'zoom', 'magnify', 'spinner', 'play', 'star', 'pixel', 'sprite', 'transparent', 'badge', 'arrow', 'close', 'nav', 'menu', 'search', 'cart', 'prime-logo', 'video-thumbs', 'play-button'];

// Section IDs that contain OTHER products (not the current product)
const EXCLUDED_SECTION_IDS = [
  'sponsored',
  'sims-consolidated',
  'similar_items',
  'customers_also_viewed',
  'recommendations',
  'compare-with-similar',
  'advertisement',
  'ad-feedback',
  'rhf-shoveler',
  'session-based-sims',
  'p13n-desktop-sidesheet',
  'sp_detail',
  'sp_detail2',
  'sims-fbt',
  'purchase-sims-feature',
  'HLCXComparisonWidget',
  'anonCarousel',
  'day0-sims-desktop-dp-sims_session-based-sims-702',
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

// Canonical key for reliable deduplication (ignores host differences, query strings)
export function getCanonicalImageKey(url: string): string {
  const cleaned = cleanImageUrl(url);
  // Extract just the path part after /images/I/
  const pathMatch = cleaned.match(/\/images\/I\/([a-zA-Z0-9\-+%._]+)/i);
  if (pathMatch) {
    // Remove extension and size modifiers for canonical comparison
    return pathMatch[1].replace(/\.(jpg|jpeg|png|gif|webp)$/i, '').toLowerCase();
  }
  // Fallback to getImageId
  return getImageId(url).toLowerCase();
}

// Check if URL is a valid Amazon product image (broader acceptance)
function isValidAmazonImage(url: string): boolean {
  // Must contain /images/I/ path (the actual product image path)
  if (!url.includes('/images/I/')) return false;
  
  // Host must be Amazon-related
  const amazonHosts = ['media-amazon.com', 'ssl-images-amazon.com', 'images-amazon.com', 'm.media-amazon.com'];
  try {
    const urlObj = new URL(url);
    return amazonHosts.some(host => urlObj.hostname.includes(host) || urlObj.hostname.endsWith(host));
  } catch {
    // If URL parsing fails, check by string
    return amazonHosts.some(host => url.includes(host));
  }
}

function isIconOrSprite(url: string): boolean {
  const lower = url.toLowerCase();
  return ICON_FILTERS.some(filter => lower.includes(filter));
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

// Extract ASIN from imageBlockState JSON to verify we're getting the right product
function extractImageBlockAsin(html: string): string | null {
  // Look for imageBlockState script
  const stateMatch = html.match(/data-a-state='{"key":"imageBlockState"}'[^>]*>([\s\S]*?)<\/script>/i);
  if (stateMatch) {
    try {
      const stateJson = JSON.parse(stateMatch[1]);
      if (stateJson.landingAsin) return stateJson.landingAsin.toUpperCase();
      if (stateJson.asin) return stateJson.asin.toUpperCase();
    } catch (e) {
      // JSON parse failed, try regex
    }
  }
  
  // Alternative: look for landingAsin in any script
  const asinMatch = html.match(/"landingAsin"\s*:\s*"([A-Z0-9]{10})"/i);
  if (asinMatch) return asinMatch[1].toUpperCase();
  
  return null;
}

// Interface for image with variant metadata
interface ImageWithVariant {
  url: string;
  variant: string | null;  // "MAIN", "PT01", "PT02", etc.
  isLandingImage: boolean;
}

// Extract landing image URL (the DEFINITIVE main image)
function extractLandingImageUrl(html: string): string | null {
  const landingImagePatterns = [
    /id=["']landingImage["'][^>]*data-old-hires=["'](https:[^"']+)["']/i,
    /id=["']landingImage["'][^>]*src=["'](https:[^"']+)["']/i,
    /id=["']imgBlkFront["'][^>]*data-old-hires=["'](https:[^"']+)["']/i,
    /id=["']imgBlkFront["'][^>]*src=["'](https:[^"']+)["']/i,
  ];
  
  for (const pattern of landingImagePatterns) {
    const match = html.match(pattern);
    if (match && match[1].includes('media-amazon.com/images/I/')) {
      const cleaned = cleanImageUrl(match[1]);
      console.log(`[Scraper] Found landing image: ${cleaned.substring(0, 80)}...`);
      return cleaned;
    }
  }
  return null;
}

// Extract main gallery images from Amazon's imageGalleryData or colorImages JSON
// Returns images with variant metadata for accurate categorization
function extractGalleryImagesWithVariants(html: string, targetAsin: string): ImageWithVariant[] {
  const images: ImageWithVariant[] = [];
  const seenIds = new Set<string>();
  
  // First, get the landing image - this is ALWAYS the main image
  const landingImageUrl = extractLandingImageUrl(html);
  
  // Verify we're extracting from the correct product's data
  const blockAsin = extractImageBlockAsin(html);
  if (blockAsin && blockAsin !== targetAsin) {
    console.log(`[Scraper] Warning: imageBlockState ASIN (${blockAsin}) doesn't match target (${targetAsin})`);
  }
  
  // Helper to add image if not duplicate - use canonical key for robust deduplication
  const addImage = (url: string, variant: string | null, isLanding: boolean) => {
    const cleaned = cleanImageUrl(url);
    const canonicalKey = getCanonicalImageKey(cleaned);
    if (!seenIds.has(canonicalKey) && !isIconOrSprite(cleaned) && isValidAmazonImage(cleaned)) {
      seenIds.add(canonicalKey);
      images.push({ url: cleaned, variant, isLandingImage: isLanding });
    }
  };
  
  // Pattern 1: Try to parse full colorImages JSON with variant metadata
  const colorImagesFullPatterns = [
    /'colorImages'\s*:\s*(\{[\s\S]*?\})\s*(?=,\s*['"]|$)/,
    /"colorImages"\s*:\s*(\{[\s\S]*?\})\s*(?=,\s*"|$)/,
  ];
  
  for (const pattern of colorImagesFullPatterns) {
    const match = html.match(pattern);
    if (match) {
      try {
        // Clean up JSON escapes
        let jsonStr = match[1]
          .replace(/\\u002F/g, '/')
          .replace(/\\\//g, '/')
          .replace(/\\'/g, "'");
        
        // Try to extract the initial array with variants
        const initialMatch = jsonStr.match(/['"]initial['"]\s*:\s*\[([\s\S]*?)\](?=\s*[,}])/);
        if (initialMatch) {
          // Parse each image object to get variant info
          const imageObjPattern = /\{[^{}]*['"]hiRes['"][^{}]*\}/g;
          const imageObjs = initialMatch[1].match(imageObjPattern);
          
          if (imageObjs) {
            console.log(`[Scraper] Found ${imageObjs.length} image objects in colorImages.initial`);
            
            imageObjs.forEach(objStr => {
              // Extract hiRes URL
              const hiResMatch = objStr.match(/['"]hiRes['"]\s*:\s*['"]?(https:[^'"}\s,]+)['"]?/);
              // Extract variant (MAIN, PT01, PT02, etc.)
              const variantMatch = objStr.match(/['"]variant['"]\s*:\s*['"]([^'"]+)['"]/);
              
              if (hiResMatch) {
                const url = hiResMatch[1];
                const variant = variantMatch ? variantMatch[1] : null;
                const isLanding = landingImageUrl ? getImageId(url) === getImageId(landingImageUrl) : false;
                addImage(url, variant, isLanding);
              }
            });
          }
        }
        
        if (images.length > 0) {
          console.log(`[Scraper] Extracted ${images.length} images with variants from colorImages`);
          break;
        }
      } catch (e) {
        console.log('[Scraper] Failed to parse colorImages JSON, trying fallback patterns');
      }
    }
  }
  
  // Pattern 2: Simple hiRes extraction if JSON parsing failed
  if (images.length === 0) {
    const colorImagesPatterns = [
      /'colorImages'\s*:\s*\{[^}]*['"]initial['"]\s*:\s*\[([\s\S]*?)\]\s*\}/,
      /"colorImages"\s*:\s*\{[^}]*"initial"\s*:\s*\[([\s\S]*?)\]\s*\}/,
      /colorImages['"]\s*:\s*\{[\s\S]*?['"]initial['"]\s*:\s*\[([\s\S]*?)\]/,
    ];
    
    for (const pattern of colorImagesPatterns) {
      const colorImagesMatch = html.match(pattern);
      if (colorImagesMatch) {
        console.log('[Scraper] Found colorImages.initial (simple extraction)');
        const imagesJson = colorImagesMatch[1];
        
        // Extract ALL hiRes URLs (not just first few)
        const hiResMatches = imagesJson.matchAll(/['"]hiRes['"]\s*:\s*['"]?(https:[^'"}\s,]+)['"]?/gi);
        for (const match of hiResMatches) {
          const url = match[1];
          const isLanding = landingImageUrl ? getImageId(url) === getImageId(landingImageUrl) : false;
          addImage(url, null, isLanding);
        }
        
        // Fallback to large if no hiRes
        if (images.length === 0) {
          const largeMatches = imagesJson.matchAll(/['"]large['"]\s*:\s*['"]?(https:[^'"}\s,]+)['"]?/gi);
          for (const match of largeMatches) {
            const url = match[1];
            const isLanding = landingImageUrl ? getImageId(url) === getImageId(landingImageUrl) : false;
            addImage(url, null, isLanding);
          }
        }
        
        console.log(`[Scraper] Extracted ${images.length} images from colorImages (simple)`);
        if (images.length > 0) break;
      }
    }
  }
  
  // Pattern 3: imageGalleryData array (alternative structure)
  if (images.length === 0) {
    const galleryDataPatterns = [
      /'imageGalleryData'\s*:\s*\[([\s\S]*?)\]/,
      /"imageGalleryData"\s*:\s*\[([\s\S]*?)\]/,
      /imageGalleryData['"]\s*:\s*\[([\s\S]*?)\]/,
    ];
    
    for (const pattern of galleryDataPatterns) {
      const galleryDataMatch = html.match(pattern);
      if (galleryDataMatch) {
        console.log('[Scraper] Found imageGalleryData');
        const hiResMatches = galleryDataMatch[1].matchAll(/['"]hiRes['"]\s*:\s*['"]?(https:[^'"}\s,]+)['"]?/gi);
        for (const match of hiResMatches) {
          const url = match[1];
          const isLanding = landingImageUrl ? getImageId(url) === getImageId(landingImageUrl) : false;
          addImage(url, null, isLanding);
        }
        console.log(`[Scraper] Extracted ${images.length} images from imageGalleryData`);
        if (images.length > 0) break;
      }
    }
  }
  
  // Pattern 4: imageBlockState JSON (most reliable source - parse ALL color variant keys, not just 'initial')
  const imageBlockStateMatch = html.match(/data-a-state='{"key":"imageBlockState"}'[^>]*>([\s\S]*?)<\/script>/i);
  if (imageBlockStateMatch) {
    try {
      const stateJson = JSON.parse(imageBlockStateMatch[1]);
      if (stateJson.colorImages) {
        // Iterate ALL keys in colorImages (initial, plus any color variant ASINs)
        const allKeys = Object.keys(stateJson.colorImages);
        console.log(`[Scraper] Found imageBlockState with colorImages keys: ${allKeys.join(', ')}`);
        
        for (const key of allKeys) {
          const imageArray = stateJson.colorImages[key];
          if (Array.isArray(imageArray)) {
            console.log(`[Scraper] Processing colorImages.${key} with ${imageArray.length} images`);
            imageArray.forEach((img: any) => {
              const url = img.hiRes || img.large || img.main || img.thumb;
              if (url) {
                const variant = img.variant || null;
                const isLanding = landingImageUrl ? getImageId(url) === getImageId(landingImageUrl) : false;
                addImage(url, variant, isLanding);
              }
            });
          }
        }
      }
    } catch (e) {
      console.log('[Scraper] Failed to parse imageBlockState JSON');
    }
  }
  
  // Pattern 5: Extract from data-a-dynamic-image attributes
  const dynamicImageMatches = html.matchAll(/data-a-dynamic-image=["']\{([^}]+)\}["']/gi);
  for (const match of dynamicImageMatches) {
    const urls = match[1].match(/https:\/\/m\.media-amazon\.com\/images\/I\/[a-zA-Z0-9\-+%._]+/gi);
    if (urls) {
      urls.forEach(url => {
        const isLanding = landingImageUrl ? getImageId(url) === getImageId(landingImageUrl) : false;
        addImage(url, null, isLanding);
      });
    }
  }
  
  // Pattern 6: altImages thumbnail list (always extract, no minimum)
  const altImagesMatch = html.match(/id=["']altImages["'][^>]*>([\s\S]*?)(?=<\/ul>|<\/div>\s*<div[^>]*id=["'](?!altImages))/i);
  if (altImagesMatch) {
    console.log('[Scraper] Found altImages thumbnail section');
    const thumbContent = altImagesMatch[1];
    const thumbUrls = thumbContent.match(/https:\/\/m\.media-amazon\.com\/images\/I\/[a-zA-Z0-9\-+%._]+\.(jpg|jpeg|png)/gi);
    if (thumbUrls) {
      let addedFromAlt = 0;
      thumbUrls.forEach(url => {
        const cleaned = cleanImageUrl(url);
        const id = getImageId(cleaned);
        if (!seenIds.has(id) && !isIconOrSprite(cleaned)) {
          seenIds.add(id);
          const isLanding = landingImageUrl ? id === getImageId(landingImageUrl) : false;
          images.push({ url: cleaned, variant: null, isLandingImage: isLanding });
          addedFromAlt++;
        }
      });
      console.log(`[Scraper] Added ${addedFromAlt} new images from altImages`);
    }
  }
  
  // Pattern 7: imageThumbnail class elements
  const thumbMatches = html.matchAll(/class=["'][^"]*imageThumbnail[^"]*["'][^>]*>[\s\S]*?<img[^>]*src=["'](https:[^"']+)["']/gi);
  for (const match of thumbMatches) {
    if (match[1].includes('media-amazon.com/images/I/')) {
      const isLanding = landingImageUrl ? getImageId(match[1]) === getImageId(landingImageUrl) : false;
      addImage(match[1], null, isLanding);
    }
  }
  
  // Ensure landing image is in the list and properly marked
  if (landingImageUrl) {
    const landingId = getImageId(landingImageUrl);
    const existingLanding = images.find(img => getImageId(img.url) === landingId);
    if (!existingLanding) {
      // Landing image not found in gallery, add it
      images.unshift({ url: landingImageUrl, variant: 'MAIN', isLandingImage: true });
      console.log('[Scraper] Added landing image that was missing from gallery');
    } else {
      // Mark it as landing and ensure MAIN variant
      existingLanding.isLandingImage = true;
      if (!existingLanding.variant) existingLanding.variant = 'MAIN';
    }
  }
  
  console.log(`[Scraper] Total images extracted: ${images.length}`);
  return images;
}

// Detect image category based on variant metadata, landing image flag, and URL patterns
function detectImageCategory(img: ImageWithVariant, index: number): ImageCategory {
  // PRIORITY 1: Landing image is the MAIN position - content is typically a PRODUCT_SHOT
  if (img.isLandingImage) {
    console.log(`[Scraper] Image ${index} is landing image -> PRODUCT_SHOT`);
    return 'PRODUCT_SHOT';
  }
  
  // PRIORITY 2: Check variant metadata from Amazon
  if (img.variant) {
    const variant = img.variant.toUpperCase();
    if (variant === 'MAIN') {
      // Amazon's "MAIN" variant means product shot on white background
      return 'PRODUCT_SHOT';
    }
    // PT01, PT02, etc. are secondary product images
    // They could be any category, so check URL patterns next
  }
  
  // PRIORITY 3: URL pattern analysis
  const lower = img.url.toLowerCase();
  
  if (lower.includes('infographic') || lower.includes('info_') || lower.includes('_info') || lower.includes('_infog')) {
    return 'INFOGRAPHIC';
  }
  if (lower.includes('lifestyle') || lower.includes('life_') || lower.includes('_life') || lower.includes('_ls')) {
    return 'LIFESTYLE';
  }
  if (lower.includes('inuse') || lower.includes('in-use') || lower.includes('action') || lower.includes('_iu_')) {
    return 'PRODUCT_IN_USE';
  }
  if (lower.includes('size') || lower.includes('chart') || lower.includes('dimension') || lower.includes('_sz_')) {
    return 'SIZE_CHART';
  }
  if (lower.includes('compare') || lower.includes('vs') || lower.includes('versus') || lower.includes('_comp')) {
    return 'COMPARISON';
  }
  if (lower.includes('package') || lower.includes('box') || lower.includes('unbox') || lower.includes('_pkg')) {
    return 'PACKAGING';
  }
  if (lower.includes('detail') || lower.includes('close') || lower.includes('zoom') || lower.includes('_dt_')) {
    return 'DETAIL';
  }
  
  // Default: First image without other signals is likely a product shot
  if (index === 0) {
    return 'PRODUCT_SHOT';
  }
  
  return 'UNKNOWN';
}

function extractImages(html: string, asin: string): ScrapedImage[] {
  const resultImages: ScrapedImage[] = [];
  
  console.log(`[Scraper] Starting image extraction for ASIN: ${asin}`);
  
  // Extract gallery images with variant metadata
  const galleryImages = extractGalleryImagesWithVariants(html, asin);
  console.log(`[Scraper] Found ${galleryImages.length} gallery images`);
  
  // Sort images: landing image first, then by variant (MAIN first, then PT01, PT02, etc.)
  galleryImages.sort((a, b) => {
    // Landing image always first
    if (a.isLandingImage && !b.isLandingImage) return -1;
    if (!a.isLandingImage && b.isLandingImage) return 1;
    
    // MAIN variant second
    if (a.variant === 'MAIN' && b.variant !== 'MAIN') return -1;
    if (a.variant !== 'MAIN' && b.variant === 'MAIN') return 1;
    
    // Sort by variant name (PT01 before PT02, etc.)
    if (a.variant && b.variant) {
      return a.variant.localeCompare(b.variant);
    }
    
    return 0;
  });
  
  // Convert to ScrapedImage format with proper category detection
  galleryImages.forEach((img, index) => {
    const category = detectImageCategory(img, index);
    resultImages.push({
      url: img.url,
      category,
      index,
    });
  });
  
  // If we found gallery images, we're done
  if (resultImages.length > 0) {
    console.log(`[Scraper] Final image categories:`);
    resultImages.forEach((img, i) => {
      console.log(`  [${i}] ${img.category}: ${img.url.substring(0, 60)}...`);
    });
    return resultImages;
  }
  
  // FALLBACK: Only if gallery extraction failed
  console.log('[Scraper] Gallery extraction failed, using fallback');
  
  const imageBlockMatch = html.match(/id=["']imageBlock["'][^>]*>([\s\S]*?)(?=<div[^>]*id=["'](?:centerCol|rightCol|feature-bullets))/i) ||
                          html.match(/id=["']altImages["'][^>]*>([\s\S]*?)(?=<\/ul>)/i);
  
  if (imageBlockMatch) {
    const imageBlockContent = imageBlockMatch[1];
    const productImageMatches = imageBlockContent.match(/https:\/\/m\.media-amazon\.com\/images\/I\/[a-zA-Z0-9\-+%._]+\.(jpg|jpeg|png)/gi);
    if (productImageMatches) {
      const seenIds = new Set<string>();
      console.log(`[Scraper] Found ${productImageMatches.length} images in imageBlock section`);
      productImageMatches.forEach((url, index) => {
        const cleaned = cleanImageUrl(url);
        const id = getImageId(cleaned);
        if (!seenIds.has(id) && !isIconOrSprite(cleaned)) {
          seenIds.add(id);
          resultImages.push({
            url: cleaned,
            category: index === 0 ? 'PRODUCT_SHOT' : 'UNKNOWN',
            index: resultImages.length,
          });
        }
      });
    }
  }
  
  // If still no images, try specific main image patterns
  if (resultImages.length === 0) {
    const mainImagePatterns = [
      /id=["']landingImage["'][^>]*src=["'](https:[^"']+)["']/i,
      /id=["']imgBlkFront["'][^>]*src=["'](https:[^"']+)["']/i,
      /class=["'][^"]*imgTagWrapper[^"]*["'][^>]*>[\s\S]*?<img[^>]*src=["'](https:[^"']+)["']/i,
    ];
    
    for (const pattern of mainImagePatterns) {
      const match = html.match(pattern);
      if (match && match[1].includes('media-amazon.com/images/I/')) {
        const cleaned = cleanImageUrl(match[1]);
        if (!isIconOrSprite(cleaned)) {
          resultImages.push({
            url: cleaned,
            category: 'PRODUCT_SHOT',
            index: 0,
          });
          console.log(`[Scraper] Found main image via fallback pattern: ${cleaned.substring(0, 60)}...`);
          break;
        }
      }
    }
  }
  
  console.log(`[Scraper] Final image count: ${resultImages.length}`);
  return resultImages;
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
    console.log(`[Scraper] Received HTML (${backendResult.html.length} chars)`);
    const title = extractTitle(backendResult.html);
    const images = extractImages(backendResult.html, asin);
    
    console.log(`[Scraper] Extracted ${images.length} product images for ASIN ${asin}`);
    console.log(`[Scraper] Product title: "${title}"`);
    
    if (images.length > 0) {
      return { asin, title, images };
    }
  }

  // If backend fails, throw helpful error
  throw new Error(
    'Amazon blocks direct scraping. Please use manual upload instead, or right-click product images on Amazon and save them to upload here.'
  );
}
