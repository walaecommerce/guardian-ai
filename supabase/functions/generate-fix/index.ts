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
      customPrompt,
      verifiedProductClaims,
      spatialAnalysis // NEW: Pass spatial zones from analyze-image
    } = await req.json();
    
    const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    
    if (!GOOGLE_GEMINI_API_KEY) {
      throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
    }

    const isMain = imageType === 'MAIN';
    
    // Build protected zones list from spatial analysis
    const buildProtectedZonesText = () => {
      if (!spatialAnalysis) return '';
      
      const zones: string[] = [];
      
      // Add text zones as protected
      if (spatialAnalysis.textZones?.length > 0) {
        for (const zone of spatialAnalysis.textZones) {
          zones.push(`- TEXT ZONE [${zone.id}] at ${zone.location}: "${zone.content}" (bounds: top ${zone.bounds?.top}%, left ${zone.bounds?.left}%, ${zone.bounds?.width}%x${zone.bounds?.height}%) - DO NOT TOUCH`);
        }
      }
      
      // Add protected areas
      if (spatialAnalysis.protectedAreas?.length > 0) {
        for (const area of spatialAnalysis.protectedAreas) {
          zones.push(`- PROTECTED [${area.id}]: ${area.description} (bounds: top ${area.bounds?.top}%, left ${area.bounds?.left}%, ${area.bounds?.width}%x${area.bounds?.height}%) - DO NOT MODIFY`);
        }
      }
      
      // Add product zones
      if (spatialAnalysis.productZones?.length > 0) {
        for (const zone of spatialAnalysis.productZones) {
          zones.push(`- PRODUCT [${zone.id}] at ${zone.location}: ${zone.type}, covers ${zone.coverage}% of frame - PRESERVE EXACTLY`);
        }
      }
      
      return zones.length > 0 ? zones.join('\n') : '';
    };
    
    // Build removal instructions from overlay elements
    const buildRemovalInstructions = () => {
      if (!spatialAnalysis?.overlayElements?.length) return '';
      
      const removals = spatialAnalysis.overlayElements
        .filter((el: any) => el.action === 'remove' && !el.isPartOfPackaging)
        .map((el: any) => `- REMOVE [${el.id}]: ${el.type} at ${el.location} (bounds: top ${el.bounds?.top}%, left ${el.bounds?.left}%, ${el.bounds?.width}%x${el.bounds?.height}%) via INPAINTING - match surrounding background`);
      
      return removals.length > 0 ? removals.join('\n') : '';
    };
    
    const protectedZonesText = buildProtectedZonesText();
    const removalInstructions = buildRemovalInstructions();
    
    // Build comprehensive prompt based on image type
    let prompt: string;
    
    if (customPrompt) {
      prompt = customPrompt;
      console.log("[Guardian] Using custom prompt from user");
    } else if (isMain) {
      prompt = generativePrompt || `Edit this product photo for e-commerce use:

TASK: Make minimal edits to create a clean product photo.

EDITS NEEDED:
1. BACKGROUND: Change background to pure white (#FFFFFF). Keep product edges clean.
2. REMOVE: Any promotional badges, stickers, or overlay graphics (not part of actual product packaging).
3. FRAMING: Product centered, filling most of frame.

PRESERVE EXACTLY:
- The product itself unchanged
- All text/labels that are physically ON the product packaging
- Product colors, shape, proportions

OUTPUT: Clean product photo on white background, professional quality.`;
    } else {
      // SECONDARY IMAGE - simplified prompt to avoid IMAGE_RECITATION
      prompt = `Edit this product image by making ONLY these changes:

TASK: Remove promotional overlays while keeping everything else identical.

REMOVE (if present):
- Award badges or "best seller" ribbons
- Star rating overlays
- "Prime" logos (unless printed on actual product)
- Promotional text like "Sale" or "Deal"
- Third-party watermarks

PRESERVE EXACTLY (do not modify):
- The product and its packaging
- All text that is physically printed on the product
- The background scene/setting
- Any informational graphics or size callouts
- The overall composition and layout

${protectedZonesText ? `PROTECTED AREAS (do not touch):\n${protectedZonesText}\n` : ''}
${removalInstructions ? `SPECIFIC REMOVALS:\n${removalInstructions}\n` : ''}

OUTPUT: Same image with only prohibited overlays removed via clean inpainting.`;
    }

    // Add previous critique for retry attempts (simplified to avoid IMAGE_RECITATION)
    if (previousCritique) {
      prompt += `

ISSUES TO FIX: ${previousCritique}`;
    }

    // Add error-aware regeneration (simplified)
    if (previousGeneratedImage) {
      prompt += `

RETRY MODE: Compare with previous attempt and fix mistakes.`;
    }

    // Skip product title/ASIN and verified claims - they trigger IMAGE_RECITATION
    // The image itself contains the product identity

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
          contents: [{ parts }],
          // Force an image response (prevents text-only "apology" outputs)
          generationConfig: {
            responseModalities: ["IMAGE"],
          },
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
        const inline = part.inlineData || part.inline_data;
        if (inline) {
          const mimeType = inline.mimeType || inline.mime_type || 'image/png';
          generatedImage = `data:${mimeType};base64,${inline.data}`;
          break;
        }
      }
    }
    
    if (!generatedImage) {
      const finishReason = candidates?.[0]?.finishReason;

      if (finishReason === 'SAFETY') {
        return new Response(JSON.stringify({
          error: "Image generation was blocked by safety filters. Please try a different image.",
          errorType: "safety_block",
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (finishReason === 'IMAGE_RECITATION') {
        return new Response(JSON.stringify({
          error: "The AI refused to return an image (IMAGE_RECITATION). Try Smart Regenerate or a simpler custom prompt focusing on background/overlay removal only.",
          errorType: "image_recitation",
        }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Sometimes the model returns text-only even for image tasks.
      console.error("[Guardian] No image in response:", JSON.stringify(data).substring(0, 500));
      return new Response(JSON.stringify({
        error: "No image was returned by the AI for this request. Please retry (Smart Regenerate) or simplify the prompt.",
        errorType: "no_image_returned",
        finishReason: finishReason || null,
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
