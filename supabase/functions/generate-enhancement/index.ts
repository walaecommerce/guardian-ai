import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      
      console.log(`[Enhancement Gen] Attempt ${attempt}/${maxRetries}: ${parsedError.message}`);
      
      if (!parsedError.retryable || attempt === maxRetries) {
        return new Response(errorText, { status: response.status, headers: response.headers });
      }
      
      await sleep(delay);
      delay *= 2;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === maxRetries) throw lastError;
      await sleep(delay);
      delay *= 2;
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
};

// Category-specific enhancement prompts
const getCategoryEnhancementPrompt = (
  category: string, 
  enhancementType: string,
  targetImprovements: string[],
  preserveElements: string[]
): string => {
  const preserveSection = preserveElements.length > 0 
    ? `\n\nCRITICAL - PRESERVE EXACTLY:\n${preserveElements.map(e => `- ${e}`).join('\n')}`
    : '';

  const improvementsSection = targetImprovements.length > 0
    ? `\n\nTARGET IMPROVEMENTS:\n${targetImprovements.map(e => `- ${e}`).join('\n')}`
    : '';

  // Base prompts by category
  const categoryPrompts: Record<string, string> = {
    'LIFESTYLE': `Enhance this LIFESTYLE product image:

GOAL: Make the product more prominent and appealing within the lifestyle context.

ENHANCEMENT FOCUS:
1. Increase product visibility - product should be the clear hero
2. Improve lighting specifically on the product
3. Add subtle depth of field to focus attention on product
4. Maintain authentic, aspirational lifestyle feeling
5. Ensure product occupies at least 35-40% of frame

MAIN PRODUCT REFERENCE: Use the attached main image to ensure product consistency.
The product in the enhanced image MUST match the main product exactly.
${improvementsSection}${preserveSection}

OUTPUT: Enhanced lifestyle image with product as the clear focal point.`,

    'INFOGRAPHIC': `Enhance this INFOGRAPHIC product image:

GOAL: Improve the informational value and visual appeal of this infographic.

ENHANCEMENT FOCUS:
1. If product image is missing or weak: Add a clean product cutout
2. Improve feature callout graphics (add connector lines, icons)
3. Enhance text readability and visual hierarchy
4. Add professional styling to all graphic elements
5. Ensure clear product-to-feature connections

MAIN PRODUCT REFERENCE: Use for product cutout if adding/improving product image.
${improvementsSection}${preserveSection}

OUTPUT: Professional infographic with clear product and compelling feature presentation.`,

    'PRODUCT_IN_USE': `Enhance this PRODUCT IN USE demonstration image:

GOAL: Make the product usage and benefits clearer and more impactful.

ENHANCEMENT FOCUS:
1. Improve product visibility during the action/demonstration
2. Enhance the clarity of the benefit being shown
3. Add subtle result/benefit indicators if appropriate
4. Improve lighting to highlight the product
5. Maintain natural, authentic usage feeling

MAIN PRODUCT REFERENCE: Ensure product matches exactly.
${improvementsSection}${preserveSection}

OUTPUT: Clear demonstration image with visible product and obvious benefit.`,

    'COMPARISON': `Enhance this COMPARISON image:

GOAL: Make the before/after or comparison states clearly distinguishable.

ENHANCEMENT FOCUS:
1. Add clear "Before" and "After" labels if not present
2. Improve visual distinction between states
3. Enhance the positive outcome side
4. Add subtle result indicators
5. Ensure product is prominently featured

MAIN PRODUCT REFERENCE: Product must be consistent throughout.
${improvementsSection}${preserveSection}

OUTPUT: Clear comparison with obvious improvement/benefit visualization.`,

    'SIZE_CHART': `Enhance this SIZE/DIMENSION image:

GOAL: Make dimensions and sizing information crystal clear.

ENHANCEMENT FOCUS:
1. Add or improve dimension lines with clear measurements
2. Include product image reference if missing
3. Use consistent measurement units throughout
4. Add comparison objects for scale if helpful
5. Ensure all labels are readable

MAIN PRODUCT REFERENCE: Use for reference sizing.
${improvementsSection}${preserveSection}

OUTPUT: Professional size chart with clear, accurate measurements.`,
  };

  return categoryPrompts[category] || `Enhance this product image:

GOAL: Improve overall quality and effectiveness.

ENHANCEMENT TYPE: ${enhancementType}
${improvementsSection}${preserveSection}

MAIN PRODUCT REFERENCE: Ensure product consistency.

OUTPUT: Enhanced, professional product image.`;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      originalImage,
      mainProductImage,
      imageCategory,
      enhancementType,
      targetImprovements,
      preserveElements,
      customPrompt
    } = await req.json();

    const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    
    if (!GOOGLE_GEMINI_API_KEY) {
      throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
    }

    console.log(`[Enhancement Gen] Generating ${enhancementType} enhancement for ${imageCategory} image...`);

    // Build the enhancement prompt
    const prompt = customPrompt || getCategoryEnhancementPrompt(
      imageCategory,
      enhancementType,
      targetImprovements || [],
      preserveElements || []
    );

    // Helper functions
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
      if (!allowed.has(mt)) return guessImageMimeType(base64Data);
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

    const originalImageData = extractBase64(originalImage);
    const mainImageData = mainProductImage ? extractBase64(mainProductImage) : null;

    // Build parts
    const parts: any[] = [
      { text: prompt },
      {
        inline_data: {
          mime_type: originalImageData.mimeType,
          data: originalImageData.data
        }
      }
    ];

    if (mainImageData) {
      parts.push({ text: "Main product reference image (use for product consistency):" });
      parts.push({
        inline_data: {
          mime_type: mainImageData.mimeType,
          data: mainImageData.data
        }
      });
    }

    // Request image generation
    const response = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      const parsedError = parseGeminiError(response.status, errorText);
      console.error("[Enhancement Gen] API error:", response.status, errorText);
      
      return new Response(JSON.stringify({ 
        error: parsedError.message,
        errorType: parsedError.errorType 
      }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();

    let generatedImage: string | null = null;
    let modelText: string | null = null;

    const candidates = data.candidates;

    if (candidates && candidates[0]?.content?.parts) {
      for (const part of candidates[0].content.parts) {
        const inline = part.inlineData || part.inline_data;
        if (inline && inline.data) {
          const mimeType = inline.mimeType || inline.mime_type || "image/png";
          generatedImage = `data:${mimeType};base64,${inline.data}`;
          break;
        }
        if (!modelText && typeof part.text === "string" && part.text.trim()) {
          modelText = part.text.trim();
        }
      }
    }

    const finishReason = candidates?.[0]?.finishReason ?? null;

    if (!generatedImage) {
      if (finishReason === "SAFETY") {
        return new Response(JSON.stringify({
          error: "Image generation was blocked by safety filters.",
          errorType: "safety_block",
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (finishReason === "IMAGE_RECITATION") {
        return new Response(JSON.stringify({
          error: "The AI could not generate an enhanced version. Try a different enhancement or custom prompt.",
          errorType: "image_recitation",
        }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.error("[Enhancement Gen] No image in response:", JSON.stringify(data).substring(0, 500));
      
      return new Response(JSON.stringify({
        error: "No enhanced image was generated. Please try again or use a different enhancement preset.",
        errorType: "no_image_returned",
        finishReason: finishReason || null,
        modelTextSnippet: modelText ? modelText.slice(0, 240) : null,
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[Enhancement Gen] Enhanced image generated successfully");

    return new Response(JSON.stringify({ 
      enhancedImage: generatedImage,
      enhancementType,
      imageCategory,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[Enhancement Gen] Error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Enhancement generation failed" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
