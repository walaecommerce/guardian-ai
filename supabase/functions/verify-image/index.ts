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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      originalImageBase64, 
      generatedImageBase64, 
      imageType, 
      mainImageBase64,
      spatialAnalysis // NEW: Original spatial zones to verify preservation
    } = await req.json();
    
    const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    
    if (!GOOGLE_GEMINI_API_KEY) {
      throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
    }

    const isMain = imageType === 'MAIN';
    
    // Build protected zones reference for verification
    const buildProtectedZonesReference = () => {
      if (!spatialAnalysis) return '';
      
      const zones: string[] = [];
      
      if (spatialAnalysis.textZones?.length > 0) {
        zones.push("TEXT ZONES that must be preserved:");
        for (const zone of spatialAnalysis.textZones) {
          zones.push(`  - [${zone.id}] at ${zone.location}: "${zone.content}"`);
        }
      }
      
      if (spatialAnalysis.protectedAreas?.length > 0) {
        zones.push("PROTECTED AREAS that must be unchanged:");
        for (const area of spatialAnalysis.protectedAreas) {
          zones.push(`  - [${area.id}]: ${area.description}`);
        }
      }
      
      return zones.length > 0 ? zones.join('\n') : '';
    };
    
    const protectedZonesRef = buildProtectedZonesReference();
    
    const systemPrompt = `You are Guardian's verification module. Your job is to critically evaluate AI-generated product images for Amazon compliance.

## VERIFICATION PROTOCOL

You will receive:
1. ORIGINAL IMAGE - The source product image with violations
2. GENERATED IMAGE - The AI-corrected version to verify
${!isMain ? '3. MAIN PRODUCT REFERENCE - To verify product consistency' : ''}

## VERIFICATION CHECKLIST

### CHECK 1: PRODUCT IDENTITY (CRITICAL - Weight: 35%)
Compare the product between original and generated:
- Is it visually the SAME product?
- Are brand labels preserved and readable?
- Are product colors accurate?
- Are shapes and proportions correct?
- Would a customer recognize this as the same item?

FAIL CONDITIONS:
- Product looks different from original
- Labels are missing, changed, or illegible
- Colors are significantly altered
- Shape/proportions are distorted
- Brand identity is compromised

### CHECK 2: COMPLIANCE FIXES (Weight: 25%)
${isMain ? `
For MAIN images, verify:
- Background is PURE WHITE RGB(255,255,255)
  * Sample corners and edges mentally
  * No gray tones, no gradients, no shadows
  * Clean crisp edge between product and background
- All prohibited badges REMOVED
- Product occupies ~85% of frame
- Product is well-centered
` : `
For SECONDARY images, verify:
- Original context/background is PRESERVED (NOT white)
- ONLY prohibited badges removed
- Infographic elements preserved
- Product demonstration context intact
`}

### CHECK 3: TEXT & LAYOUT PRESERVATION (NEW - Weight: 25%)
${!isMain ? `
CRITICAL FOR SECONDARY IMAGES:
${protectedZonesRef ? `
${protectedZonesRef}

Verify EACH of these zones:
` : ''}
- Is ALL original text still fully visible and readable?
- Are infographic callouts and feature descriptions intact?
- Is the layout/composition identical to original?
- Were any text areas obscured, covered, or modified?

FAIL CONDITIONS:
- Any text that was readable in original is now obscured or missing
- New elements were added that cover existing content
- Layout structure was changed
- Text was distorted or made illegible
` : `
For MAIN images:
- Product text/labels should remain sharp and readable
- No new text artifacts introduced
`}

### CHECK 4: NO NEW ELEMENTS ADDED (Weight: 10%)
${!isMain ? `
CRITICAL CHECK: Compare original vs generated for ADDITIONS:
- Were any NEW product images added that weren't in original?
- Were any NEW shapes, icons, or graphics inserted?
- Were any NEW text overlays created?

FAIL CONDITIONS:
- AI added a product image/cutout that wasn't in original
- AI inserted graphics to "fill" removed area instead of inpainting
- AI created new visual elements
` : ''}

### CHECK 5: QUALITY ASSESSMENT (Weight: 5%)
Evaluate:
- Resolution maintained or improved
- No blur or soft focus introduced
- No compression artifacts
- No unnatural edges or halos
- Professional appearance

## SCORING FORMULA
Final Score = (Identity × 0.35) + (Compliance × 0.25) + (TextLayout × 0.25) + (NoAdditions × 0.10) + (Quality × 0.05)

Score each component 0-100, then calculate weighted average.

## OUTPUT FORMAT
Return ONLY valid JSON:
{
  "score": <0-100 weighted final score>,
  "isSatisfactory": <true if score >= 80 AND productMatch is true AND no critical text issues>,
  "productMatch": <boolean - is this visually the SAME product?>,
  "textPreserved": <boolean - is all original text still visible and readable?>,
  "noElementsAdded": <boolean - were NO new elements added to the image?>,
  "componentScores": {
    "identity": <0-100>,
    "compliance": <0-100>,
    "textLayout": <0-100>,
    "noAdditions": <0-100>,
    "quality": <0-100>
  },
  "critique": "Concise description of the most important issues that need fixing",
  "improvements": [
    "Specific actionable improvement 1",
    "Specific actionable improvement 2"
  ],
  "passedChecks": [
    "What the generated image got RIGHT"
  ],
  "failedChecks": [
    "What still needs to be fixed"
  ],
  "textIssues": [
    "Specific text/callout that was obscured or damaged"
  ],
  "addedElements": [
    "Description of any new elements that were incorrectly added"
  ],
  "thinkingSteps": [
    "Step-by-step verification process",
    "🔬 Checking product identity...",
    "📝 Verifying text zones preserved...",
    "🚫 Checking for added elements...",
    "Show your analysis process"
  ]
}

CRITICAL FAIL CONDITIONS (automatic isSatisfactory: false):
- Product identity mismatch (different product shown)
- Text zones obscured by new elements
- New product images added over original content
- Layout structure significantly altered

Be STRICT. Better to flag for retry than pass a flawed image.`;

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

    const extractBase64 = (dataUrl: string | undefined | null): { data: string; mimeType: string } => {
      if (!dataUrl) {
        console.warn("[Guardian] extractBase64 received empty/undefined input");
        return { mimeType: 'image/jpeg', data: '' };
      }
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

    const parts: any[] = [
      { text: `Verify this ${imageType} AI-generated image against Amazon compliance requirements.` },
      { text: "=== ORIGINAL IMAGE (source with violations) ===" }
    ];

    const originalImage = extractBase64(originalImageBase64);
    parts.push({
      inline_data: {
        mime_type: originalImage.mimeType,
        data: originalImage.data
      }
    });

    parts.push({ text: "=== GENERATED IMAGE (AI-corrected, needs verification) ===" });
    const generatedImage = extractBase64(generatedImageBase64);
    parts.push({
      inline_data: {
        mime_type: generatedImage.mimeType,
        data: generatedImage.data
      }
    });

    if (!isMain && mainImageBase64) {
      parts.push({ text: "=== MAIN PRODUCT REFERENCE (generated image must match this product) ===" });
      const mainImage = extractBase64(mainImageBase64);
      parts.push({
        inline_data: {
          mime_type: mainImage.mimeType,
          data: mainImage.data
        }
      });
    }

    parts.push({ text: "Execute full verification protocol and return detailed JSON assessment." });

    console.log(`[Guardian] Verifying ${imageType} image...`);
    console.log(`[Guardian] Check 1: Product identity verification...`);
    console.log(`[Guardian] Check 2: Compliance fixes verification...`);
    console.log(`[Guardian] Check 3: Quality assessment...`);

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
      console.error("[Guardian] Google Gemini API error:", response.status, errorText);
      
      return new Response(JSON.stringify({ 
        error: parsedError.message,
        errorType: parsedError.errorType 
      }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const responseContent = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[Guardian] Failed to parse JSON from response");
      throw new Error("Could not parse verification result");
    }
    
    const verification = JSON.parse(jsonMatch[0]);
    
    console.log(`[Guardian] Verification complete. Score: ${verification.score}%, Satisfactory: ${verification.isSatisfactory}`);
    console.log(`[Guardian] Product match: ${verification.productMatch}`);
    if (verification.failedChecks?.length > 0) {
      console.log(`[Guardian] Failed checks: ${verification.failedChecks.join(', ')}`);
    }

    return new Response(JSON.stringify(verification), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Guardian] Verification error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ 
      error: errorMessage,
      errorType: "verification_failed"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
