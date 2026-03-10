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

const SYSTEM_PROMPT = `You are Guardian, an Amazon FBA compliance officer with forensic image analysis capabilities. Analyze product images with pixel-level precision and return ONLY valid JSON with no markdown, no preamble, no explanation outside the JSON structure.`;

const MAIN_IMAGE_RULES = `MAIN IMAGE RULES (apply strictly):
- Background: MUST be pure white RGB(255,255,255). Any shadow, gradient, or off-white tone = CRITICAL violation
- Text overlays: ZERO tolerance. No badges, watermarks, promotional text, Best Seller, Amazon's Choice = CRITICAL violation
- Product occupancy: must fill 85%+ of frame. Under 70% = HIGH violation
- Image quality: must be sharp, high-res, professionally lit. Blur or grain = MEDIUM violation
- Props: only if they clarify product use. Lifestyle props = HIGH violation`;

const SECONDARY_IMAGE_RULES = `SECONDARY IMAGE RULES (relaxed):
- Background: lifestyle and textured backgrounds are ALLOWED — do NOT flag these
- Text: infographic text and callouts are ALLOWED and expected — do NOT flag these
- Prohibited: Best Seller badges, Amazon's Choice badges, competitor logos = CRITICAL violation
- Quality: must be readable and clear`;

const OUTPUT_SCHEMA = `
Return this EXACT JSON structure:
{
  "overall_score": <0-100>,
  "status": "PASS" or "FAIL",
  "severity": "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "violations": [
    {
      "rule": "<rule name>",
      "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      "description": "<what is wrong>",
      "recommendation": "<how to fix>"
    }
  ],
  "content_consistency": {
    "packaging_text_detected": "<all text read from product>",
    "listing_title": "<the listing title provided>",
    "discrepancies": ["<mismatch 1>", "<mismatch 2>"]
  },
  "fix_recommendations": ["<ordered fix actions>"],
  "generative_prompt": "<detailed AI image generation prompt to fix all issues>"
}

SCORING:
- 100: Perfect compliance
- 85-99: Minor issues, likely passes
- 70-84: Moderate issues, fix recommended
- 50-69: Significant violations
- 0-49: Critical failures`;

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

// ── Main handler ─────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, imageType, listingTitle, productAsin } = await req.json();

    const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GOOGLE_GEMINI_API_KEY) {
      throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
    }

    const isMain = imageType === 'MAIN';
    const rules = isMain ? MAIN_IMAGE_RULES : SECONDARY_IMAGE_RULES;
    const titleRef = listingTitle || 'No listing title provided — skip content consistency check.';

    console.log(`[analyze-image] using model: ${MODELS.analysis}`);
    console.log(`[analyze-image] Analyzing ${imageType} image...`);

    const imageData = extractBase64(imageBase64);

    // ── Build request per spec ──
    const requestBody = {
      model: MODELS.analysis,
      contents: [{
        parts: [
          { text: `${SYSTEM_PROMPT}\n\n${rules}\n\n${OUTPUT_SCHEMA}` },
          { inline_data: { mime_type: imageData.mimeType, data: imageData.data } },
          { text: `Analyze this image against the rules above. Listing title for OCR cross-reference: ${titleRef}` },
        ],
      }],
      generationConfig: {
        responseMimeType: "application/json",
        thinkingConfig: {
          thinkingLevel: "High",
        },
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

    // ── Parse response: skip thinking tokens, extract JSON ──
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
      // Fallback: try extracting JSON object
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

    console.log(`[analyze-image] Score: ${rawResult.overall_score}%, Status: ${rawResult.status}`);

    // ── Map snake_case API response to camelCase for frontend compatibility ──
    const mappedResult = {
      overallScore: rawResult.overall_score ?? rawResult.overallScore ?? 0,
      status: rawResult.status || 'FAIL',
      severity: rawResult.severity || 'NONE',
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
      fixRecommendations: rawResult.fix_recommendations || rawResult.fixRecommendations || [],
      generativePrompt: rawResult.generative_prompt || rawResult.generativePrompt || '',
      // Preserve spatial analysis if the model returns it
      spatialAnalysis: rawResult.spatialAnalysis || rawResult.spatial_analysis || undefined,
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
