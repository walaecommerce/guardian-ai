import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { MODELS } from "../_shared/models.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ── System prompt ────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Guardian, an Amazon FBA compliance officer with forensic image analysis capabilities. Analyze product images with pixel-level precision and return ONLY valid JSON with no markdown, no preamble, no explanation outside the JSON structure.

STEP 1 — CATEGORY DETECTION (do this first):
Examine the product image and determine the category:
- FOOD_BEVERAGE: packaged food, snacks, beverages, cooking ingredients, condiments
- PET_SUPPLIES: pet food, pet treats, pet supplements, pet accessories
- SUPPLEMENTS: dietary supplements, vitamins, protein powders, health capsules
- BEAUTY_PERSONAL_CARE: skincare, haircare, cosmetics, personal hygiene products
- ELECTRONICS: devices, gadgets, cables, chargers, tech accessories
- GENERAL_MERCHANDISE: everything else (home goods, tools, toys, clothing, etc.)

Apply the category-specific rules below in addition to the universal rules.`;

const MAIN_IMAGE_RULES = `UNIVERSAL MAIN IMAGE RULES (apply to ALL categories):

BACKGROUND:
- MUST be pure white RGB(255,255,255). Any shadow, gradient, or off-white tone = CRITICAL violation
- No environmental backgrounds — countertops, tables, wooden surfaces, kitchen settings = CRITICAL violation

TEXT & BADGES:
- ZERO tolerance for overlays. No badges, watermarks, promotional text, "Best Seller", "Amazon's Choice" = CRITICAL violation

PRODUCT PRESENTATION:
- Product must fill 85%+ of frame. Under 70% = HIGH violation
- Product must face forward with primary label readable. Sideways or back-facing = HIGH violation

IMAGE QUALITY:
- Must be sharp, high-res, professionally lit. Blur or grain = MEDIUM violation`;

const SECONDARY_IMAGE_RULES = `UNIVERSAL SECONDARY IMAGE RULES (apply to ALL categories):

ALLOWED & ENCOURAGED:
- Lifestyle backgrounds, textured backgrounds — do NOT flag these
- Infographic text, callouts, nutritional highlights — do NOT flag these
- Comparison images showing size reference or product scale — ALLOWED
- Multiple product variants or flavors shown together — ALLOWED

PROHIBITED (still enforced):
- "Best Seller" badges, "Amazon's Choice" badges, competitor brand logos = CRITICAL violation
- Competitor product comparisons using their actual brand names/logos = HIGH violation

IMAGE QUALITY:
- Must be readable and clear. Blurry or pixelated = MEDIUM violation`;

const FOOD_RULES = `FOOD PRODUCT SPECIFIC RULES (apply when category is FOOD):

MAIN IMAGE:
- No hands holding product = MEDIUM violation
- No props (bowls, plates, serving suggestions, utensils) = MEDIUM violation
- Product must face forward with label fully readable = HIGH violation if not
- No environmental backgrounds (countertops, tables) = HIGH violation (covered by universal rules but doubly enforced)
- Expiry dates, lot codes, or date stamps visible on packaging = MEDIUM violation (should be hidden or not visible in hero shot)

SECONDARY IMAGES:
- Lifestyle showing food being eaten or served = ALLOWED and POSITIVE
- Infographic callouts showing macros, ingredients, claims = ALLOWED and POSITIVE
- Size/scale reference images = ALLOWED
- Multiple variants shown together = ALLOWED
- Nutrition facts panel must be legible if shown = LOW violation if blurry

OCR EXTRACTION for food products — extract ALL of these if visible:
1. Product/brand name
2. Flavor name (e.g. "Sea Salt", "Cheddar", "Original", "Tangy Dijon Mustard")
3. Net weight or quantity (e.g. "5 Oz", "200g", "1lb")
4. Serving size and servings per container
5. Key health/diet claims (e.g. "Gluten Free", "Non-GMO", "Keto Friendly", "Vegan", "Organic", "Dairy Free")
6. Allergen statements (e.g. "Contains: Wheat, Soy")
7. Pack count if visible (e.g. "Pack of 6", "Case of 12")

CONTENT CONSISTENCY CHECKS for food:
- Flavor name on packaging vs listing title = CRITICAL if mismatch (e.g. package says "Cheddar" but title says "Sea Salt")
- Net weight on packaging vs listing title = CRITICAL if mismatch (e.g. package shows "4.5 oz" but title says "5 Oz")
- Key claims on packaging must match claims in listing title — missing or contradicting claims = HIGH violation
- Pack count (Pack of 6, Case of 12) must match listing title exactly = CRITICAL if mismatch (e.g. single bag shown but title says "Pack of 6")`;

const PET_RULES = `PET PRODUCT SPECIFIC RULES (apply when category is PET):

MAIN IMAGE:
- No hands holding product = MEDIUM violation
- Product must face forward with label fully readable = HIGH violation if not
- No raw meat imagery on main image = MEDIUM violation
- No environmental backgrounds = HIGH violation

SECONDARY IMAGES:
- Pet shown eating/enjoying the product = ALLOWED and POSITIVE
- Feeding guidelines visible = POSITIVE signal
- Ingredient callouts and nutritional info = ALLOWED and POSITIVE

OCR EXTRACTION for pet products — extract ALL of these if visible:
1. Product/brand name
2. Protein source (e.g. "Chicken", "Beef", "Salmon", "Lamb")
3. Net weight or count (e.g. "5 lb", "30 Count", "24 oz")
4. Key claims ("Grain Free", "Made in USA", "All Natural", "No Artificial Flavors")
5. Country of origin
6. Life stage (e.g. "Puppy", "Adult", "Senior", "All Life Stages")

CONTENT CONSISTENCY CHECKS for pet products:
- Protein source on packaging vs listing title = CRITICAL if mismatch (e.g. package says "Chicken" but title says "Beef")
- Weight/count of treats on packaging vs listing title = CRITICAL if mismatch
- "Made in USA" or country of origin claims must be consistent between packaging and title = HIGH if mismatch
- Life stage must match if specified = HIGH if mismatch`;

const SUPPLEMENT_RULES = `SUPPLEMENT PRODUCT SPECIFIC RULES (apply when category is SUPPLEMENT):

MAIN IMAGE:
- No hands holding product = MEDIUM violation
- Product must face forward with supplement facts panel NOT as primary visible face = preferred but not violation
- No props (pills scattered, powder spilled) = MEDIUM violation

SECONDARY IMAGES:
- Supplement facts panel shown clearly = POSITIVE signal
- Before/after imagery = HIGH violation (Amazon prohibits this)
- Dosage/usage instructions visible = ALLOWED and POSITIVE

OCR EXTRACTION for supplements — extract ALL of these if visible:
1. Product/brand name
2. Supplement type (e.g. "Vitamin D3", "Whey Protein", "Multivitamin")
3. Serving size and servings per container
4. Key claims ("Non-GMO", "Third Party Tested", "GMP Certified", "Vegan")
5. Count/quantity (e.g. "120 Capsules", "2 lb", "30 Servings")
6. Active ingredients and amounts

CONTENT CONSISTENCY CHECKS for supplements:
- Supplement type on packaging vs listing title = CRITICAL if mismatch
- Count/quantity on packaging vs listing title = CRITICAL if mismatch
- Key claims must match between packaging and title = HIGH if mismatch`;

const GENERAL_RULES = `GENERAL MERCHANDISE RULES (apply when category is GENERAL):

MAIN IMAGE:
- No hands holding product = MEDIUM violation
- No props or accessories not included in the sale = MEDIUM violation
- Product must face forward showing primary features = HIGH violation if not

SECONDARY IMAGES:
- Dimensions/size reference images = ALLOWED and POSITIVE
- Product in use / lifestyle context = ALLOWED
- Feature callout infographics = ALLOWED

OCR EXTRACTION for general products — extract if visible:
1. Product/brand name
2. Model number
3. Key specs visible on packaging
4. Country of origin
5. Certifications (UL, CE, FCC, etc.)`;

const OUTPUT_SCHEMA = `
Return this EXACT JSON structure:
{
  "overall_score": <0-100>,
  "status": "PASS" or "FAIL",
  "severity": "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "product_category": "FOOD" | "PET" | "SUPPLEMENT" | "GENERAL",
  "text_readability_score": <0-100 — for SECONDARY images only, rate how readable any text/infographic content would be on a mobile phone screen. Consider font size, contrast, text density, legibility. For MAIN images return null>,
  "emotional_appeal_score": <0-100 — for SECONDARY images only, rate the emotional appeal and aspirational quality. Consider: appetizing food, happy people, active lifestyle, professional photography, warm lighting. For MAIN images return null>,
  "violations": [
    {
      "rule": "<rule name>",
      "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      "description": "<what is wrong>",
      "recommendation": "<how to fix>"
    }
  ],
  "content_consistency": {
    "packaging_text_detected": "<all text read from product packaging>",
    "extracted_details": {
      "flavor": "<detected flavor or null>",
      "net_weight": "<detected weight or null>",
      "pack_size": "<detected pack size or null>",
      "health_claims": ["<claim1>", "<claim2>"],
      "allergens": "<detected allergen statement or null>"
    },
    "listing_title": "<the listing title provided>",
    "discrepancies": ["<mismatch 1>", "<mismatch 2>"]
  },
  "category_specific_checks": {
    "flavor_detected": "<string or null>",
    "weight_detected": "<string or null>",
    "claims_detected": ["<claim1>", "<claim2>"],
    "pack_count_detected": "<string or null>",
    "protein_source_detected": "<string or null — for PET>",
    "supplement_type_detected": "<string or null — for SUPPLEMENT>",
    "country_of_origin_detected": "<string or null>",
    "category_violations": [
      {
        "rule": "<category-specific rule>",
        "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
        "description": "<what is wrong>",
        "recommendation": "<how to fix>"
      }
    ]
  },
  "fix_recommendations": ["<ordered fix actions>"],
  "generative_prompt": "<detailed AI image generation prompt to fix all issues>"
}

SCORING:
- 100: Perfect compliance
- 85-99: Minor issues, likely passes
- 70-84: Moderate issues, fix recommended
- 50-69: Significant violations
- 0-49: Critical failures

TEXT READABILITY SCORING (SECONDARY images only):
- 100: All text is large, high-contrast, minimal density — perfect mobile readability
- 80: Text is readable but some smaller elements
- 60: Text is somewhat readable but dense or low contrast in places
- 40: Difficult to read on mobile — too small or too much text
- 20: Very poor readability — tiny text, low contrast
- 0: Completely unreadable text

EMOTIONAL APPEAL SCORING (SECONDARY images only):
- 100: Highly aspirational — beautiful photography, evokes strong positive emotions
- 80: Appealing presentation with good styling
- 60: Adequate but generic
- 40: Below average appeal
- 20: Unappealing or clinical
- 0: Actively off-putting`;

// ── Error parser ─────────────────────────────────────────────────

const parseGeminiError = (status: number, errorText: string): { message: string; errorType: string; retryable: boolean } => {
  try {
    const errorJson = JSON.parse(errorText);
    const apiMessage = errorJson?.error?.message || '';
    if (status === 429) return { message: "Rate limit exceeded. Please wait a moment and try again.", errorType: "rate_limit", retryable: true };
    if (status === 403) return { message: "API key invalid or quota exceeded.", errorType: "auth_error", retryable: false };
    if (status === 400) {
      if (apiMessage.includes('MIME type')) return { message: `Invalid image format: ${apiMessage}`, errorType: "invalid_image", retryable: false };
      if (apiMessage.includes('safety')) return { message: "Image was blocked by safety filters.", errorType: "safety_block", retryable: false };
      return { message: `Invalid request: ${apiMessage}`, errorType: "bad_request", retryable: false };
    }
    if (status >= 500) return { message: "Google AI service temporarily unavailable. Retrying...", errorType: "server_error", retryable: true };
    return { message: apiMessage || `API error (${status})`, errorType: "unknown", retryable: status >= 500 };
  } catch {
    return { message: `API error (${status})`, errorType: "unknown", retryable: status >= 500 };
  }
};

// ── Fetch with retry ─────────────────────────────────────────────

const fetchWithRetry = async (url: string, options: RequestInit): Promise<Response> => {
  let lastError: Error | null = null;
  let delay = INITIAL_DELAY_MS;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      const errorText = await response.text();
      const parsed = parseGeminiError(response.status, errorText);
      console.log(`[analyze-image] Attempt ${attempt}/${MAX_RETRIES}: ${parsed.message}`);
      if (!parsed.retryable || attempt === MAX_RETRIES) {
        return new Response(errorText, { status: response.status, headers: response.headers });
      }
      await sleep(delay);
      delay *= 2;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[analyze-image] Attempt ${attempt}/${MAX_RETRIES} failed:`, lastError.message);
      if (attempt === MAX_RETRIES) throw lastError;
      await sleep(delay);
      delay *= 2;
    }
  }
  throw lastError || new Error('Max retries exceeded');
};

// ── Image helpers ────────────────────────────────────────────────

const guessImageMimeType = (b64: string): string => {
  const d = (b64 || '').trim();
  if (d.startsWith('/9j/')) return 'image/jpeg';
  if (d.startsWith('iVBOR')) return 'image/png';
  if (d.startsWith('R0lGOD')) return 'image/gif';
  if (d.startsWith('UklGR')) return 'image/webp';
  return 'image/jpeg';
};

const normalizeMimeType = (raw: string, b64: string): string => {
  const mt = (raw || '').toLowerCase().trim();
  if (mt === 'image/jpg') return 'image/jpeg';
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  return allowed.has(mt) ? mt : guessImageMimeType(b64);
};

const extractBase64 = (dataUrl: string): { data: string; mimeType: string } => {
  if (dataUrl.startsWith('data:')) {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const data = (match[2] || '').trim();
      return { mimeType: normalizeMimeType(match[1], data), data };
    }
  }
  return { mimeType: 'image/jpeg', data: (dataUrl || '').trim() };
};

// ── Build category-aware prompt ─────────────────────────────────

const buildAnalysisPrompt = (isMain: boolean, listingTitle: string): string => {
  const universalRules = isMain ? MAIN_IMAGE_RULES : SECONDARY_IMAGE_RULES;
  return [
    SYSTEM_PROMPT,
    universalRules,
    '--- CATEGORY-SPECIFIC RULES (apply the matching set after detection) ---',
    FOOD_RULES,
    PET_RULES,
    SUPPLEMENT_RULES,
    GENERAL_RULES,
    OUTPUT_SCHEMA,
  ].join('\n\n');
};

// ── Main handler ─────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, imageType, listingTitle } = await req.json();

    const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GOOGLE_GEMINI_API_KEY) {
      throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
    }

    const isMain = imageType === 'MAIN';
    const titleRef = listingTitle || 'No listing title provided — skip content consistency check.';

    console.log(`[analyze-image] using model: ${MODELS.analysis}`);
    console.log(`[analyze-image] Analyzing ${imageType} image with category detection...`);

    const imageData = extractBase64(imageBase64);
    const systemPrompt = buildAnalysisPrompt(isMain, titleRef);

    const requestBody = {
      model: MODELS.analysis,
      contents: [{
        parts: [
          { text: systemPrompt },
          { inline_data: { mime_type: imageData.mimeType, data: imageData.data } },
          { text: `Analyze this ${imageType} image. First detect the product category (FOOD/PET/SUPPLEMENT/GENERAL), then apply ALL universal rules plus the matching category-specific rules. Perform full OCR extraction on any visible packaging text. Listing title for cross-reference: ${titleRef}` },
        ],
      }],
      generationConfig: {
        responseMimeType: "application/json",
        thinkingConfig: { thinkingLevel: "High" },
      },
    };

    const response = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.analysis}:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      const parsed = parseGeminiError(response.status, errorText);
      console.error("[analyze-image] API error:", response.status, errorText);
      return new Response(JSON.stringify({ error: parsed.message, errorType: parsed.errorType }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();

    const textBlock = (data.candidates?.[0]?.content?.parts || [])
      .filter((p: any) => !p.thought && p.text)
      .map((p: any) => p.text)
      .join("");

    if (!textBlock) {
      console.error("[analyze-image] No text content in response");
      throw new Error("No text content returned from analysis model");
    }

    const clean = textBlock.replace(/```json|```/g, "").trim();

    let rawResult: any;
    try {
      rawResult = JSON.parse(clean);
    } catch {
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("[analyze-image] Failed to parse JSON:", clean.substring(0, 300));
        return new Response(JSON.stringify({
          error: "Failed to parse analysis response as JSON",
          errorType: "parse_error",
          rawSnippet: clean.substring(0, 240),
        }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      rawResult = JSON.parse(jsonMatch[0]);
    }

    const detectedCategory = rawResult.product_category || 'GENERAL';
    console.log(`[analyze-image] Category: ${detectedCategory}, Score: ${rawResult.overall_score}%, Status: ${rawResult.status}`);

    // ── Map to camelCase for frontend ──
    const categoryChecks = rawResult.category_specific_checks || {};
    const mappedResult = {
      overallScore: rawResult.overall_score ?? rawResult.overallScore ?? 0,
      status: rawResult.status || 'FAIL',
      severity: rawResult.severity || 'NONE',
      productCategory: detectedCategory,
      violations: (rawResult.violations || []).map((v: any) => ({
        severity: v.severity || 'info',
        category: v.rule || 'general',
        message: v.description || v.message || '',
        recommendation: v.recommendation || '',
      })),
      contentConsistency: rawResult.content_consistency ? {
        packagingTextDetected: rawResult.content_consistency.packaging_text_detected || '',
        listingTitleMatch: (rawResult.content_consistency.discrepancies || []).length === 0,
        discrepancies: rawResult.content_consistency.discrepancies || [],
        isConsistent: (rawResult.content_consistency.discrepancies || []).length === 0,
      } : undefined,
      categorySpecificChecks: {
        flavorDetected: categoryChecks.flavor_detected || null,
        weightDetected: categoryChecks.weight_detected || null,
        claimsDetected: categoryChecks.claims_detected || [],
        packCountDetected: categoryChecks.pack_count_detected || null,
        proteinSourceDetected: categoryChecks.protein_source_detected || null,
        supplementTypeDetected: categoryChecks.supplement_type_detected || null,
        countryOfOriginDetected: categoryChecks.country_of_origin_detected || null,
        categoryViolations: (categoryChecks.category_violations || []).map((v: any) => ({
          severity: v.severity || 'info',
          category: v.rule || 'category-specific',
          message: v.description || v.message || '',
          recommendation: v.recommendation || '',
        })),
      },
      fixRecommendations: rawResult.fix_recommendations || rawResult.fixRecommendations || [],
      generativePrompt: rawResult.generative_prompt || rawResult.generativePrompt || '',
      spatialAnalysis: rawResult.spatialAnalysis || rawResult.spatial_analysis || undefined,
      textReadabilityScore: rawResult.text_readability_score ?? rawResult.textReadabilityScore ?? null,
      emotionalAppealScore: rawResult.emotional_appeal_score ?? rawResult.emotionalAppealScore ?? null,
    };

    return new Response(JSON.stringify(mappedResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[analyze-image] Error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Analysis failed",
      errorType: "analysis_failed",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
