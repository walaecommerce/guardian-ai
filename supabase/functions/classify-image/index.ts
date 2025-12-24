import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const parseGeminiError = (status: number, errorText: string): { message: string; errorType: string; retryable: boolean } => {
  try {
    const errorJson = JSON.parse(errorText);
    const apiMessage = errorJson?.error?.message || '';
    
    if (status === 429) {
      return { message: "Rate limit exceeded. Please wait a moment and try again.", errorType: "rate_limit", retryable: true };
    }
    if (status === 403) {
      return { message: "API key invalid or quota exceeded.", errorType: "auth_error", retryable: false };
    }
    if (status === 400) {
      if (apiMessage.includes('MIME type')) {
        return { message: `Invalid image format: ${apiMessage}`, errorType: "invalid_image", retryable: false };
      }
      if (apiMessage.includes('safety')) {
        return { message: "Image was blocked by safety filters.", errorType: "safety_block", retryable: false };
      }
      return { message: `Invalid request: ${apiMessage}`, errorType: "bad_request", retryable: false };
    }
    if (status >= 500) {
      return { message: "Google AI service temporarily unavailable. Retrying...", errorType: "server_error", retryable: true };
    }
    return { message: apiMessage || `API error (${status})`, errorType: "unknown", retryable: status >= 500 };
  } catch {
    return { message: `API error (${status})`, errorType: "unknown", retryable: status >= 500 };
  }
};

const fetchWithRetry = async (url: string, options: RequestInit, maxRetries = MAX_RETRIES): Promise<Response> => {
  let lastError: Error | null = null;
  let delay = INITIAL_DELAY_MS;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (response.ok) return response;
      
      const errorText = await response.text();
      const parsedError = parseGeminiError(response.status, errorText);
      
      console.log(`[Guardian] Attempt ${attempt}/${maxRetries}: ${parsedError.message}`);
      
      if (!parsedError.retryable || attempt === maxRetries) {
        return new Response(errorText, { status: response.status, headers: response.headers });
      }
      
      console.log(`[Guardian] Retrying in ${delay}ms...`);
      await sleep(delay);
      delay *= 2;
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[Guardian] Attempt ${attempt}/${maxRetries} failed:`, lastError.message);
      
      if (attempt === maxRetries) throw lastError;
      
      await sleep(delay);
      delay *= 2;
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
};

interface ClassificationResult {
  category: string;
  confidence: number;
  reasoning: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, productTitle, asin } = await req.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: 'imageBase64 is required', errorType: 'missing_image' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");

    if (!GOOGLE_GEMINI_API_KEY) {
      console.error('GOOGLE_GEMINI_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured', errorType: 'config_error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contextInfo = productTitle ? `Product: "${productTitle}"` : '';
    const asinInfo = asin ? `ASIN: ${asin}` : '';

    const systemPrompt = `You are an expert Amazon product image classifier. Your task is to analyze product listing images and classify them into specific categories based on their CONTENT, not their position in the listing.

IMPORTANT: "MAIN" is a POSITION designation (first image in listing), NOT a content category. Do NOT use "MAIN" as a category.

Categories to classify based on image CONTENT:
1. PRODUCT_SHOT - Product photographed on a clean/white background, no text overlays, badges, or graphics. Just the product clearly visible. This is what Amazon requires for the first listing position.
2. INFOGRAPHIC - Image with text callouts, feature highlights, specifications, bullet points, diagrams, or educational content about the product.
3. LIFESTYLE - Product shown in a real-world setting or environment. May include people, rooms, outdoor scenes, or contextual backgrounds.
4. PRODUCT_IN_USE - Someone actively using or demonstrating the product. Focus is on the action/usage.
5. SIZE_CHART - Dimensions, measurements, size comparisons, or measurement graphics.
6. COMPARISON - Before/after shots, vs competitors, feature comparison tables, or side-by-side comparisons.
7. PACKAGING - Shows the product box, packaging, or what's included in the box.
8. DETAIL - Close-up or zoom shot of specific product features, textures, or components.

Respond with ONLY a JSON object in this exact format:
{
  "category": "CATEGORY_NAME",
  "confidence": 85,
  "reasoning": "Brief explanation of why this category"
}`;

    const userPrompt = `Classify this Amazon product image.
${contextInfo}
${asinInfo}

Analyze the image and determine which category it belongs to based on its visual characteristics.`;

    console.log('[Guardian] Calling Google Gemini API for image classification...');

    const guessImageMimeType = (base64DataRaw: string): string => {
      const base64Data = (base64DataRaw || '').trim();
      if (base64Data.startsWith('/9j/')) return 'image/jpeg';
      if (base64Data.startsWith('iVBOR')) return 'image/png';
      if (base64Data.startsWith('R0lGOD')) return 'image/gif';
      if (base64Data.startsWith('UklGR')) return 'image/webp';
      return 'image/jpeg';
    };

    const normalizeMimeType = (mimeTypeRaw: string, base64Data: string): string => {
      const mt = (mimeTypeRaw || '').toLowerCase().trim();
      if (mt === 'image/jpg') return 'image/jpeg';
      const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
      if (!allowed.has(mt)) {
        return guessImageMimeType(base64Data);
      }
      return mt;
    };

    const extractBase64 = (dataUrl: string): { data: string; mimeType: string } => {
      if (dataUrl.startsWith('data:')) {
        const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          const data = (match[2] || '').trim();
          const mimeType = normalizeMimeType(match[1], data);
          return { mimeType, data };
        }
      }
      return { mimeType: 'image/jpeg', data: (dataUrl || '').trim() };
    };

    const imageData = extractBase64(imageBase64);

    const response = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{
            parts: [
              { text: userPrompt },
              {
                inline_data: {
                  mime_type: imageData.mimeType,
                  data: imageData.data
                }
              }
            ]
          }]
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      const parsedError = parseGeminiError(response.status, errorText);
      console.error('[Guardian] Google Gemini API error:', response.status, errorText);
      
      return new Response(
        JSON.stringify({ 
          error: parsedError.message, 
          errorType: parsedError.errorType,
          category: 'UNKNOWN',
          confidence: 0
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    console.log('[Guardian] AI response:', content);

    let result: ClassificationResult;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      result = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('[Guardian] Failed to parse AI response:', parseError);
      result = {
        category: 'UNKNOWN',
        confidence: 0,
        reasoning: 'Failed to parse classification result'
      };
    }

    // Map legacy "MAIN" category to "PRODUCT_SHOT" for consistency
    if (result.category === 'MAIN') {
      result.category = 'PRODUCT_SHOT';
    }
    
    const validCategories = ['PRODUCT_SHOT', 'INFOGRAPHIC', 'LIFESTYLE', 'PRODUCT_IN_USE', 'SIZE_CHART', 'COMPARISON', 'PACKAGING', 'DETAIL', 'UNKNOWN'];
    if (!validCategories.includes(result.category)) {
      result.category = 'UNKNOWN';
    }

    console.log('[Guardian] Classification result:', result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Guardian] Classification error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: 'classification_failed',
        category: 'UNKNOWN',
        confidence: 0
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
