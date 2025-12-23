import { supabase } from '@/integrations/supabase/client';
import { ImageCategory } from '@/types';

export interface ClassificationResult {
  category: ImageCategory;
  confidence: number;
  reasoning: string;
}

// Simple in-memory cache
const classificationCache = new Map<string, ClassificationResult>();

/**
 * Generate a cache key from image data
 */
function getCacheKey(imageBase64: string): string {
  // Use first 100 chars + last 100 chars + length as a simple hash
  const start = imageBase64.slice(0, 100);
  const end = imageBase64.slice(-100);
  return `${start}_${end}_${imageBase64.length}`;
}

/**
 * Classify an image using AI vision
 */
export async function classifyImage(
  imageBase64: string,
  productTitle?: string,
  asin?: string
): Promise<ClassificationResult> {
  // Check cache first
  const cacheKey = getCacheKey(imageBase64);
  const cached = classificationCache.get(cacheKey);
  if (cached) {
    console.log('Using cached classification:', cached.category);
    return cached;
  }

  try {
    const { data, error } = await supabase.functions.invoke('classify-image', {
      body: {
        imageBase64,
        productTitle,
        asin
      }
    });

    if (error) {
      console.error('Classification API error:', error);
      throw error;
    }

    const result: ClassificationResult = {
      category: (data.category || 'UNKNOWN') as ImageCategory,
      confidence: data.confidence || 0,
      reasoning: data.reasoning || ''
    };

    // Cache the result
    classificationCache.set(cacheKey, result);

    return result;
  } catch (error) {
    console.error('Image classification failed:', error);
    
    // Return fallback result
    return {
      category: 'UNKNOWN',
      confidence: 0,
      reasoning: 'Classification failed'
    };
  }
}

/**
 * Classify multiple images in parallel with rate limiting
 */
export async function classifyImages(
  images: Array<{ base64: string; index: number }>,
  productTitle?: string,
  asin?: string,
  onProgress?: (index: number, result: ClassificationResult) => void
): Promise<Map<number, ClassificationResult>> {
  const results = new Map<number, ClassificationResult>();
  
  // Process in batches of 3 to avoid rate limiting
  const batchSize = 3;
  for (let i = 0; i < images.length; i += batchSize) {
    const batch = images.slice(i, i + batchSize);
    
    const batchResults = await Promise.all(
      batch.map(async (img) => {
        const result = await classifyImage(img.base64, productTitle, asin);
        if (onProgress) {
          onProgress(img.index, result);
        }
        return { index: img.index, result };
      })
    );

    batchResults.forEach(({ index, result }) => {
      results.set(index, result);
    });

    // Small delay between batches
    if (i + batchSize < images.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return results;
}

/**
 * Clear the classification cache
 */
export function clearClassificationCache(): void {
  classificationCache.clear();
}
