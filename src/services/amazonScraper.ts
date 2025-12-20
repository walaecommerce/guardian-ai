import { ScrapedProduct } from '@/types';
import { supabase } from '@/integrations/supabase/client';

const ICON_FILTERS = ['icon', 'logo', 'button', 'zoom', 'magnify', 'spinner', 'play', 'star', 'pixel', 'sprite', 'transparent', 'badge', 'arrow', 'close'];

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

function extractImages(html: string): string[] {
  const imageSet = new Set<string>();
  
  // Main gallery images
  const mainPattern = /https:\/\/m\.media-amazon\.com\/images\/I\/[a-zA-Z0-9\-+%]+\.(jpg|jpeg|png|webp)/gi;
  const mainMatches = html.match(mainPattern) || [];
  
  // S and G paths for A+ content
  const sPattern = /https:\/\/m\.media-amazon\.com\/images\/S\/[a-zA-Z0-9\-+%\/]+\.(jpg|jpeg|png|webp)/gi;
  const gPattern = /https:\/\/m\.media-amazon\.com\/images\/G\/[a-zA-Z0-9\-+%\/]+\.(jpg|jpeg|png|webp)/gi;
  
  const sMatches = html.match(sPattern) || [];
  const gMatches = html.match(gPattern) || [];
  
  [...mainMatches, ...sMatches, ...gMatches].forEach(url => {
    if (!isIconOrSprite(url)) {
      const cleaned = cleanImageUrl(url);
      const id = getImageId(cleaned);
      const existing = Array.from(imageSet).find(u => getImageId(u) === id);
      if (!existing) {
        imageSet.add(cleaned);
      }
    }
  });

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

  // Try backend scraping first (more reliable)
  const backendResult = await scrapeViaBackend(url);
  
  if (backendResult?.html) {
    const title = extractTitle(backendResult.html);
    const images = extractImages(backendResult.html);
    
    if (images.length > 0) {
      return { asin, title, images };
    }
  }

  // If backend fails, throw helpful error
  throw new Error(
    'Amazon blocks direct scraping. Please use manual upload instead, or right-click product images on Amazon and save them to upload here.'
  );
}
