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
      
      console.log(`[Enhancement] Attempt ${attempt}/${maxRetries}: ${parsedError.message}`);
      
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      imageBase64, 
      mainImageBase64,
      imageCategory,
      listingTitle,
      productAsin 
    } = await req.json();

    const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    
    if (!GOOGLE_GEMINI_API_KEY) {
      throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
    }

    console.log(`[Enhancement] Deep analyzing ${imageCategory} image...`);

    const systemPrompt = `You are an expert Amazon product image analyst specializing in enhancement recommendations. Your job is to:
1. Analyze the uploaded secondary image for quality and effectiveness
2. Compare it against the main product image for consistency
3. Identify specific enhancement opportunities based on Amazon best practices
4. Provide actionable recommendations for improvement

## IMAGE CATEGORY CONTEXT
You are analyzing a "${imageCategory}" image. Apply category-specific analysis:

${imageCategory === 'LIFESTYLE' ? `
LIFESTYLE IMAGE ANALYSIS:
- Product Visibility: Is the product clearly visible and recognizable? (minimum 30-40% of frame)
- Context Appropriateness: Does the lifestyle setting resonate with target customers?
- Product Hero Status: Is the product the "hero" of the scene or just a prop?
- Lighting Quality: Is the product well-lit within the scene?
- Authenticity: Does the scene feel natural and aspirational?
` : ''}

${imageCategory === 'INFOGRAPHIC' ? `
INFOGRAPHIC IMAGE ANALYSIS:
- Product Presence: Is there a clear product image/cutout present?
- Text Readability: Are feature callouts easy to read?
- Visual Hierarchy: Is there clear priority (product > features > details)?
- Information Density: Is there too much or too little information?
- Professional Quality: Do the graphics look professional?
` : ''}

${imageCategory === 'PRODUCT_IN_USE' ? `
PRODUCT IN USE ANALYSIS:
- Product Visibility During Action: Is the product visible while being used?
- Benefit Clarity: Is the benefit/result of usage clear?
- Action Authenticity: Does the usage look natural and realistic?
- Result Demonstration: Are the outcomes of using the product visible?
` : ''}

${imageCategory === 'COMPARISON' ? `
COMPARISON IMAGE ANALYSIS:
- State Distinction: Is the before/after clearly distinguishable?
- Product Prominence: Is the product clearly featured in comparison?
- Fairness: Is the comparison fair and not misleading?
- Visual Impact: Is the improvement visually compelling?
` : ''}

## MAIN PRODUCT REFERENCE
I will provide the MAIN product image. Use this to:
- Verify the product in the secondary image matches the main product
- Check for consistency in product appearance (color, shape, labels)
- Identify if any key product elements are missing

## OUTPUT FORMAT
Return ONLY valid JSON:
{
  "imageCategory": "${imageCategory}",
  "productVisibility": {
    "score": <0-100>,
    "isProductClearlyVisible": boolean,
    "productBounds": { "top": %, "left": %, "width": %, "height": % } or null,
    "issues": ["list of visibility issues"]
  },
  "comparisonWithMain": {
    "sameProductDetected": boolean,
    "productMatchScore": <0-100>,
    "missingElements": ["elements in main image not visible here"]
  },
  "contentQuality": {
    "lifestyleContextAppropriate": boolean,
    "infographicTextReadable": boolean,
    "featureHighlightsPresent": boolean,
    "callToActionStrength": <0-100>,
    "overallQuality": <0-100>
  },
  "enhancementOpportunities": [
    {
      "id": "unique_id",
      "type": "add_product|improve_visibility|enhance_graphics|add_infographic|improve_context|add_annotations|color_correction|background_upgrade|composition_fix|quality_enhancement",
      "priority": "high|medium|low",
      "description": "What should be improved",
      "expectedImprovement": "What result this will achieve"
    }
  ],
  "recommendedPresets": ["preset_ids that would help this image"],
  "analysisNotes": "Brief summary of overall assessment"
}`;

    const userPrompt = `Analyze this ${imageCategory} image for enhancement opportunities.
${listingTitle ? `Product: "${listingTitle}"` : ''}
${productAsin ? `ASIN: ${productAsin}` : ''}

Compare against the main product image provided and identify all opportunities to improve this image's effectiveness.`;

    // Helper functions for image processing
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

    const imageData = extractBase64(imageBase64);
    const mainImageData = mainImageBase64 ? extractBase64(mainImageBase64) : null;

    // Build request parts
    const parts: any[] = [
      { text: userPrompt },
      {
        inline_data: {
          mime_type: imageData.mimeType,
          data: imageData.data
        }
      }
    ];

    if (mainImageData) {
      parts.push({ text: "Main product reference image:" });
      parts.push({
        inline_data: {
          mime_type: mainImageData.mimeType,
          data: mainImageData.data
        }
      });
    }

    const response = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts }]
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      const parsedError = parseGeminiError(response.status, errorText);
      console.error("[Enhancement] API error:", response.status, errorText);
      
      return new Response(JSON.stringify({ 
        error: parsedError.message,
        errorType: parsedError.errorType 
      }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[Enhancement] Failed to parse JSON from response");
      throw new Error("Could not parse enhancement analysis result");
    }
    
    const analysis = JSON.parse(jsonMatch[0]);
    
    console.log(`[Enhancement] Analysis complete. Quality: ${analysis.contentQuality?.overallQuality}%, Opportunities: ${analysis.enhancementOpportunities?.length || 0}`);

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[Enhancement] Analysis error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Analysis failed" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
