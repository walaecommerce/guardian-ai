import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

// Helper to sleep for exponential backoff
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Parse Gemini API error for user-friendly message
const parseGeminiError = (status: number, errorText: string): { message: string; errorType: string; retryable: boolean } => {
  try {
    const errorJson = JSON.parse(errorText);
    const apiMessage = errorJson?.error?.message || '';
    
    if (status === 429) {
      return { 
        message: "Rate limit exceeded. Please wait a moment and try again.", 
        errorType: "rate_limit",
        retryable: true 
      };
    }
    if (status === 403) {
      return { 
        message: "API key invalid or quota exceeded. Please check your Google Gemini API key.", 
        errorType: "auth_error",
        retryable: false 
      };
    }
    if (status === 400) {
      if (apiMessage.includes('MIME type')) {
        return { 
          message: `Invalid image format: ${apiMessage}`, 
          errorType: "invalid_image",
          retryable: false 
        };
      }
      if (apiMessage.includes('safety')) {
        return { 
          message: "Image was blocked by safety filters. Please try a different image.", 
          errorType: "safety_block",
          retryable: false 
        };
      }
      return { 
        message: `Invalid request: ${apiMessage}`, 
        errorType: "bad_request",
        retryable: false 
      };
    }
    if (status === 500 || status === 502 || status === 503) {
      return { 
        message: "Google AI service temporarily unavailable. Retrying...", 
        errorType: "server_error",
        retryable: true 
      };
    }
    return { 
      message: apiMessage || `API error (${status})`, 
      errorType: "unknown",
      retryable: status >= 500 
    };
  } catch {
    return { 
      message: `API error (${status}): ${errorText.substring(0, 100)}`, 
      errorType: "unknown",
      retryable: status >= 500 
    };
  }
};

// Fetch with retry logic
const fetchWithRetry = async (url: string, options: RequestInit, maxRetries = MAX_RETRIES): Promise<Response> => {
  let lastError: Error | null = null;
  let delay = INITIAL_DELAY_MS;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (response.ok) {
        return response;
      }
      
      const errorText = await response.text();
      const parsedError = parseGeminiError(response.status, errorText);
      
      console.log(`[Guardian] Attempt ${attempt}/${maxRetries}: ${parsedError.message}`);
      
      if (!parsedError.retryable || attempt === maxRetries) {
        // Create a new response with the error info
        return new Response(errorText, { 
          status: response.status, 
          headers: response.headers 
        });
      }
      
      console.log(`[Guardian] Retrying in ${delay}ms...`);
      await sleep(delay);
      delay *= 2; // Exponential backoff
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[Guardian] Attempt ${attempt}/${maxRetries} failed:`, lastError.message);
      
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      await sleep(delay);
      delay *= 2;
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      imageBase64, 
      imageType, 
      generativePrompt,
      mainImageBase64,
      previousCritique,
      previousGeneratedImage,
      productTitle,
      productAsin,
      customPrompt
    } = await req.json();
    
    const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    
    if (!GOOGLE_GEMINI_API_KEY) {
      throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
    }

    const isMain = imageType === 'MAIN';
    
    // Build comprehensive prompt based on image type
    let prompt: string;
    
    if (customPrompt) {
      prompt = customPrompt;
      console.log("[Guardian] Using custom prompt from user");
    } else if (isMain) {
      prompt = generativePrompt || `Transform this product image into an Amazon MAIN image that is 100% compliant:

## CRITICAL REQUIREMENTS - MUST FOLLOW EXACTLY:

### 1. BACKGROUND TRANSFORMATION
- Replace ENTIRE background with PURE WHITE: RGB(255,255,255)
- This means EVERY pixel that is not the product must be #FFFFFF
- Remove ALL shadows, gradients, or off-white tones
- Create clean, crisp edges between product and background
- NO gray areas, NO subtle shadows, NO gradient falloffs

### 2. PRODUCT PRESERVATION (HIGHEST PRIORITY)
- The product must remain EXACTLY as it appears in the original
- Preserve ALL product labels, text, and branding PRECISELY
- Maintain exact colors, shapes, and proportions
- Keep all product details sharp and unchanged
- DO NOT alter, enhance, or "improve" the product itself

### 3. PROHIBITED ELEMENTS - REMOVE COMPLETELY
- "Best Seller" badges or ribbons
- "Amazon's Choice" labels
- Star ratings or review counts
- "Prime" logos (unless on actual packaging)
- "Deal" or "Sale" tags
- ANY promotional overlays
- Watermarks or third-party logos

### 4. FRAMING & COMPOSITION
- Product should occupy 85% of the frame
- Center the product perfectly
- Square 1:1 aspect ratio
- No cropping of product edges
- Professional studio lighting appearance

### 5. QUALITY STANDARDS
- High resolution output
- Sharp focus throughout
- No compression artifacts
- Professional appearance`;
    } else {
      prompt = generativePrompt || `Edit this SECONDARY Amazon product image while PRESERVING its context:

## CRITICAL REQUIREMENTS:

### 1. CONTEXT PRESERVATION (HIGHEST PRIORITY)
- KEEP the lifestyle background/scene EXACTLY as is
- DO NOT replace background with white
- Maintain the infographic layout if present
- Preserve all product demonstration context

### 2. PRODUCT IDENTITY
- The product shown must remain IDENTICAL
- Same labels, same colors, same branding
- No alterations to the product itself
- Keep product positioning unchanged

### 3. REMOVE ONLY PROHIBITED ELEMENTS:
- "Best Seller" badges (gold/orange ribbon style)
- "Amazon's Choice" labels (dark orange/black)
- "#1 Best Seller" or ranking overlays
- Star ratings added as overlays (not on packaging)
- "Prime" logos added as overlays
- Promotional text like "30% OFF" 
- "Deal of the Day" tags

### 4. PRESERVE ALLOWED ELEMENTS:
- Product feature callouts ("Waterproof", "BPA Free")
- Dimension/size annotations
- Ingredient lists or material info
- Comparison charts
- Before/after demonstrations
- How-to-use illustrations

### 5. QUALITY
- Maintain original image quality
- Clean removal of prohibited elements
- Seamless editing with no visible artifacts`;
    }

    // Add previous critique for retry attempts
    if (previousCritique) {
      prompt += `

## ⚠️ PREVIOUS ATTEMPT FAILED VERIFICATION - FIX THESE ISSUES:
${previousCritique}

This is a retry. The previous generated image had problems. You MUST address each issue listed above.
Pay special attention to:
1. Any background color issues mentioned
2. Any product identity/mismatch issues
3. Any remaining badges or prohibited elements
4. Quality or composition problems noted`;
    }

    // Add error-aware regeneration when previous generated image is provided
    if (previousGeneratedImage) {
      prompt += `

## 🔄 REGENERATION MODE - ANALYZE YOUR PREVIOUS MISTAKE:
I am providing THREE images:
1. ORIGINAL - The source image that needs fixing
2. MY PREVIOUS ATTEMPT - What I generated before (which had issues)
3. The reference context if applicable

CRITICAL COMPARISON TASK:
- Look CAREFULLY at your previous attempt
- Compare it pixel-by-pixel with the original product
- Identify EXACTLY where you went wrong:
  * Did you change the product shape?
  * Did you alter labels or text?
  * Did you modify colors incorrectly?
  * Did you leave artifacts or add unwanted elements?
  
Generate a NEW version that:
1. Fixes the specific mistakes from your previous attempt
2. Stays MORE faithful to the original product
3. Only makes the compliance changes (background/badges) without altering the product itself`;
    }

    // Add product context to ensure correct product identity
    if (productTitle || productAsin) {
      prompt += `

## 📦 PRODUCT IDENTITY (CRITICAL):
${productTitle ? `Product: "${productTitle}"` : ''}
${productAsin ? `Amazon ASIN: ${productAsin}` : ''}
The output image MUST show THIS EXACT product. Do NOT generate a different or generic product.
Preserve ALL visible branding, model numbers, and product-specific features.`;
    }

    // Add cross-reference instruction for secondary images
    if (!isMain && mainImageBase64) {
      prompt += `

## 🔗 CROSS-REFERENCE REQUIREMENT:
I am also providing the MAIN product image as reference.
The product in your output MUST be visually consistent with this reference.
Same product, same labels, same branding, same colors.
This ensures listing coherence across all images.`;
    }

    console.log(`[Guardian] Generating ${imageType} fix...${previousCritique ? ' (retry with critique)' : ''}${previousGeneratedImage ? ' (comparing with previous attempt)' : ''}`);

    // Helper to extract base64 data from data URL
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

    // Build parts array for Google's API format
    const parts: any[] = [{ text: prompt }];
    
    // Add original image
    const originalImage = extractBase64(imageBase64);
    parts.push({ text: "=== ORIGINAL IMAGE (fix this while preserving product identity) ===" });
    parts.push({
      inline_data: {
        mime_type: originalImage.mimeType,
        data: originalImage.data
      }
    });

    // Add previous generated image for comparison if provided
    if (previousGeneratedImage) {
      const prevImage = extractBase64(previousGeneratedImage);
      parts.push({ text: "=== MY PREVIOUS ATTEMPT (analyze where I went wrong and fix it) ===" });
      parts.push({
        inline_data: {
          mime_type: prevImage.mimeType,
          data: prevImage.data
        }
      });
    }

    // Add main image reference for secondary images
    if (!isMain && mainImageBase64) {
      const mainImage = extractBase64(mainImageBase64);
      parts.push({ text: "MAIN PRODUCT REFERENCE IMAGE (your output must show this exact product):" });
      parts.push({
        inline_data: {
          mime_type: mainImage.mimeType,
          data: mainImage.data
        }
      });
    }

    const response = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ parts }]
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      const parsedError = parseGeminiError(response.status, errorText);
      console.error("[Guardian] Google Gemini API error:", response.status, errorText);
      
      return new Response(JSON.stringify({ 
        error: parsedError.message,
        errorType: parsedError.errorType,
        statusCode: response.status
      }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    
    // Extract image from Google's response format
    let generatedImage: string | null = null;
    const candidates = data.candidates;
    
    if (candidates && candidates[0]?.content?.parts) {
      for (const part of candidates[0].content.parts) {
        if (part.inlineData) {
          const mimeType = part.inlineData.mimeType || 'image/png';
          generatedImage = `data:${mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }
    }
    
    if (!generatedImage) {
      // Check for content filtering or other issues
      const finishReason = candidates?.[0]?.finishReason;
      if (finishReason === 'SAFETY') {
        return new Response(JSON.stringify({ 
          error: "Image generation was blocked by safety filters. Please try a different image.",
          errorType: "safety_block"
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      console.error("[Guardian] No image in response:", JSON.stringify(data).substring(0, 500));
      throw new Error("No image generated - the AI could not process this request");
    }

    console.log("[Guardian] Image fix generated successfully");

    return new Response(JSON.stringify({ fixedImage: generatedImage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Guardian] Generation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ 
      error: errorMessage,
      errorType: "generation_failed"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
