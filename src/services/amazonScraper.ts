import { ScrapedProduct } from '@/types';
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

// Extract main gallery images from Amazon's imageGalleryData or colorImages JSON
function extractGalleryImages(html: string, targetAsin: string): string[] {
  const galleryImages: string[] = [];
  
  // Verify we're extracting from the correct product's data
  const blockAsin = extractImageBlockAsin(html);
  if (blockAsin && blockAsin !== targetAsin) {
    console.log(`[Scraper] Warning: imageBlockState ASIN (${blockAsin}) doesn't match target (${targetAsin})`);
  }
  
  // Pattern 1: colorImages with various quote styles (rawHtml may use different quotes)
  const colorImagesPatterns = [
    /'colorImages'\s*:\s*\{[^}]*['"]initial['"]\s*:\s*\[([\s\S]*?)\]\s*\}/,
    /"colorImages"\s*:\s*\{[^}]*"initial"\s*:\s*\[([\s\S]*?)\]\s*\}/,
    /colorImages['"]\s*:\s*\{[\s\S]*?['"]initial['"]\s*:\s*\[([\s\S]*?)\]/,
  ];
  
  for (const pattern of colorImagesPatterns) {
    const colorImagesMatch = html.match(pattern);
    if (colorImagesMatch) {
      console.log('[Scraper] Found colorImages.initial');
      const imagesJson = colorImagesMatch[1];
      
      // Extract hiRes first (highest quality)
      const hiResMatches = imagesJson.match(/['"]hiRes['"]\s*:\s*['"]?(https:[^'"}\s,]+)['"]?/gi);
      if (hiResMatches) {
        hiResMatches.forEach(match => {
          const urlMatch = match.match(/['"]?(https:[^'"}\s,]+)['"]?/);
          if (urlMatch) {
            const cleanUrl = urlMatch[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
            if (cleanUrl.includes('media-amazon.com/images/I/') && !galleryImages.includes(cleanUrl)) {
              galleryImages.push(cleanUrl);
            }
          }
        });
      }
      
      // Fallback to large if no hiRes
      if (galleryImages.length === 0) {
        const largeMatches = imagesJson.match(/['"]large['"]\s*:\s*['"]?(https:[^'"}\s,]+)['"]?/gi);
        if (largeMatches) {
          largeMatches.forEach(match => {
            const urlMatch = match.match(/['"]?(https:[^'"}\s,]+)['"]?/);
            if (urlMatch) {
              const cleanUrl = urlMatch[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
              if (cleanUrl.includes('media-amazon.com/images/I/') && !galleryImages.includes(cleanUrl)) {
                galleryImages.push(cleanUrl);
              }
            }
          });
        }
      }
      
      if (galleryImages.length > 0) break;
    }
  }
  
  // Pattern 2: imageGalleryData array (alternative structure)
  if (galleryImages.length === 0) {
    const galleryDataPatterns = [
      /'imageGalleryData'\s*:\s*\[([\s\S]*?)\]/,
      /"imageGalleryData"\s*:\s*\[([\s\S]*?)\]/,
      /imageGalleryData['"]\s*:\s*\[([\s\S]*?)\]/,
    ];
    
    for (const pattern of galleryDataPatterns) {
      const galleryDataMatch = html.match(pattern);
      if (galleryDataMatch) {
        console.log('[Scraper] Found imageGalleryData');
        const hiResMatches = galleryDataMatch[1].match(/['"]hiRes['"]\s*:\s*['"]?(https:[^'"}\s,]+)['"]?/gi);
        if (hiResMatches) {
          hiResMatches.forEach(match => {
            const urlMatch = match.match(/['"]?(https:[^'"}\s,]+)['"]?/);
            if (urlMatch) {
              const cleanUrl = urlMatch[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
              if (cleanUrl.includes('media-amazon.com/images/I/') && !galleryImages.includes(cleanUrl)) {
                galleryImages.push(cleanUrl);
              }
            }
          });
        }
        if (galleryImages.length > 0) break;
      }
    }
  }
  
  // Pattern 3: Landing image with data-old-hires or src (always the MAIN image)
  const landingImagePatterns = [
    /id=["']landingImage["'][^>]*data-old-hires=["'](https:[^"']+)["']/i,
    /id=["']landingImage["'][^>]*src=["'](https:[^"']+)["']/i,
    /id=["']imgBlkFront["'][^>]*src=["'](https:[^"']+)["']/i,
  ];
  
  for (const pattern of landingImagePatterns) {
    const landingImageMatch = html.match(pattern);
    if (landingImageMatch) {
      const mainImage = cleanImageUrl(landingImageMatch[1]);
      console.log(`[Scraper] Found landing image: ${mainImage.substring(0, 80)}...`);
      // Ensure main image is first
      if (!galleryImages.some(img => getImageId(img) === getImageId(mainImage))) {
        galleryImages.unshift(mainImage);
      }
      break;
    }
  }
  
  // Pattern 4: Extract from image block dynamicImageUrl data attributes
  const dynamicImageMatches = html.match(/data-a-dynamic-image=["']\{([^}]+)\}["']/gi);
  if (dynamicImageMatches && galleryImages.length === 0) {
    console.log('[Scraper] Found dynamic image data');
    dynamicImageMatches.forEach(match => {
      const urls = match.match(/https:\/\/m\.media-amazon\.com\/images\/I\/[a-zA-Z0-9\-+%._]+/gi);
      if (urls) {
        urls.forEach(url => {
          const cleaned = cleanImageUrl(url);
          if (!galleryImages.some(img => getImageId(img) === getImageId(cleaned)) && !isIconOrSprite(cleaned)) {
            galleryImages.push(cleaned);
          }
        });
      }
    });
  }
  
  return galleryImages;
}

// Check if an image URL is within an excluded section by checking data-asin attributes
function isImageFromOtherProduct(html: string, imageUrl: string, targetAsin: string): boolean {
  const imageId = getImageId(imageUrl);
  
  // Find where this image appears in the HTML
  const imageIndex = html.indexOf(imageId);
  if (imageIndex === -1) return false;
  
  // Look backwards from the image to find the nearest data-asin attribute
  const precedingHtml = html.substring(Math.max(0, imageIndex - 2000), imageIndex);
  
  // Check for excluded section IDs in the preceding HTML
  for (const sectionId of EXCLUDED_SECTION_IDS) {
    if (precedingHtml.includes(`id="${sectionId}"`) || precedingHtml.includes(`id='${sectionId}'`)) {
      console.log(`[Scraper] Excluding image from section: ${sectionId}`);
      return true;
    }
  }
  
  // Check for data-asin that doesn't match our target
  const dataAsinMatches = precedingHtml.match(/data-asin=["']([A-Z0-9]{10})["']/gi);
  if (dataAsinMatches && dataAsinMatches.length > 0) {
    // Get the closest data-asin (last one before the image)
    const lastMatch = dataAsinMatches[dataAsinMatches.length - 1];
    const asinMatch = lastMatch.match(/["']([A-Z0-9]{10})["']/i);
    if (asinMatch && asinMatch[1].toUpperCase() !== targetAsin) {
      console.log(`[Scraper] Excluding image with different ASIN: ${asinMatch[1]} (target: ${targetAsin})`);
      return true;
    }
  }
  
  return false;
}

// Extract A+ content images that belong to THIS product only
function extractAPlusImages(html: string, asin: string): string[] {
  const aplusImages: string[] = [];
  
  // Find the product's A+ content section (aplus or aplus-3p)
  // The product's own A+ content is typically in a specific container
  const aplusMatch = html.match(/id=["']aplus["'][^>]*>([\s\S]*?)(?=<div[^>]*id=["'](?:dp-container|similarities|sponsored))/i);
  
  if (aplusMatch) {
    const aplusContent = aplusMatch[1];
    
    // Only extract images that don't appear to be from other products
    const imgMatches = aplusContent.match(/https:\/\/m\.media-amazon\.com\/images\/[SG]\/[a-zA-Z0-9\-+%\/._]+\.(jpg|jpeg|png|webp)/gi);
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
  
  console.log(`[Scraper] Starting image extraction for ASIN: ${asin}`);
  
  // PRIORITY 1: Gallery images from colorImages/imageGalleryData JSON
  // These are the DEFINITIVE product images
  const galleryImages = extractGalleryImages(html, asin);
  console.log(`[Scraper] Found ${galleryImages.length} gallery images from JSON`);
  
  galleryImages.forEach(url => {
    const cleaned = cleanImageUrl(url);
    const id = getImageId(cleaned);
    if (!seenIds.has(id) && !isIconOrSprite(cleaned)) {
      seenIds.add(id);
      imageSet.add(cleaned);
    }
  });
  
  // If we found gallery images, we're done - these are the authoritative product images
  if (imageSet.size > 0) {
    console.log(`[Scraper] Using ${imageSet.size} gallery images (no fallback needed)`);
    return Array.from(imageSet);
  }
  
  // FALLBACK: Only if gallery extraction failed, find images from the main image block section only
  console.log('[Scraper] Gallery extraction failed, using fallback');
  
  // Try to find the imageBlock section and extract only images from there
  const imageBlockMatch = html.match(/id=["']imageBlock["'][^>]*>([\s\S]*?)(?=<div[^>]*id=["'](?:centerCol|rightCol|feature-bullets))/i) ||
                          html.match(/id=["']altImages["'][^>]*>([\s\S]*?)(?=<\/ul>)/i);
  
  if (imageBlockMatch) {
    const imageBlockContent = imageBlockMatch[1];
    // Extract only /images/I/ URLs (main product images)
    const productImageMatches = imageBlockContent.match(/https:\/\/m\.media-amazon\.com\/images\/I\/[a-zA-Z0-9\-+%._]+\.(jpg|jpeg|png)/gi);
    if (productImageMatches) {
      console.log(`[Scraper] Found ${productImageMatches.length} images in imageBlock section`);
      productImageMatches.forEach(url => {
        const cleaned = cleanImageUrl(url);
        const id = getImageId(cleaned);
        if (!seenIds.has(id) && !isIconOrSprite(cleaned)) {
          seenIds.add(id);
          imageSet.add(cleaned);
        }
      });
    }
  }
  
  // If still no images, try specific main image patterns
  if (imageSet.size === 0) {
    const mainImagePatterns = [
      /id=["']landingImage["'][^>]*src=["'](https:[^"']+)["']/i,
      /id=["']imgBlkFront["'][^>]*src=["'](https:[^"']+)["']/i,
      /class=["'][^"]*imgTagWrapper[^"]*["'][^>]*>[\s\S]*?<img[^>]*src=["'](https:[^"']+)["']/i,
    ];
    
    for (const pattern of mainImagePatterns) {
      const match = html.match(pattern);
      if (match && match[1].includes('media-amazon.com/images/I/')) {
        const cleaned = cleanImageUrl(match[1]);
        const id = getImageId(cleaned);
        if (!isIconOrSprite(cleaned)) {
          seenIds.add(id);
          imageSet.add(cleaned);
          console.log(`[Scraper] Found main image via fallback pattern: ${cleaned.substring(0, 60)}...`);
          break;
        }
      }
    }
  }
  
  // DO NOT add A+ images when gallery extraction fails - they are likely from other products
  // Only add A+ images if we successfully got gallery images first (which would have returned above)
  
  console.log(`[Scraper] Final fallback image count: ${imageSet.size}`);
  
  console.log(`[Scraper] Final image count: ${imageSet.size}`);
  return Array.from(imageSet);
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
