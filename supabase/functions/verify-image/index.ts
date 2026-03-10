import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { MODELS } from "../_shared/models.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;
const SATISFACTORY_THRESHOLD = 85;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ── Error parser ─────────────────────────────────────────────────

const parseGeminiError = (status: number, errorText: string): { message: string; errorType: string; retryable: boolean } => {
  try {
    const errorJson = JSON.parse(errorText);
    const apiMessage = errorJson?.error?.message || '';
    if (status === 429) return { message: "Rate limit exceeded. Please wait a moment and try again.", errorType: "rate_limit", retryable: true };
    if (status === 403) return { message: "API key invalid or quota exceeded.", errorType: "auth_error", retryable: false };
    if (status === 400) {
      if (apiMessage.includes('safety')) return { message: "Image was blocked by safety filters.", errorType: "safety_block", retryable: false };
      if (apiMessage.includes('MIME type')) return { message: `Invalid image format: ${apiMessage}`, errorType: "invalid_image", retryable: false };
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
      console.log(`[verify-image] Attempt ${attempt}/${MAX_RETRIES}: ${parsed.message}`);
      if (!parsed.retryable || attempt === MAX_RETRIES) {
        return new Response(errorText, { status: response.status, headers: response.headers });
      }
      await sleep(delay);
      delay *= 2;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[verify-image] Attempt ${attempt}/${MAX_RETRIES} failed:`, lastError.message);
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

const extractBase64 = (dataUrl: string | undefined | null): { data: string; mimeType: string } => {
  if (!dataUrl) return { mimeType: 'image/jpeg', data: '' };
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
    const {
      originalImageBase64,
      generatedImageBase64,
      imageType,
      mainImageBase64,
      previousCritique,
    } = await req.json();

    const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GOOGLE_GEMINI_API_KEY) {
      throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
    }

    const isMain = imageType === 'MAIN';

    // Validate required images
    const originalImage = extractBase64(originalImageBase64);
    const generatedImage = extractBase64(generatedImageBase64);

    if (!originalImage.data || !generatedImage.data) {
      console.error("[verify-image] Missing image data — original:", !!originalImage.data, "generated:", !!generatedImage.data);
      return new Response(JSON.stringify({
        error: "Missing required image data. Both original and generated images are required.",
        errorType: "missing_images",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[verify-image] using model: ${MODELS.verification}`);
    console.log(`[verify-image] Verifying ${imageType} image...`);

    // ── Build prompt ──

    let systemText = `You are a quality verification specialist for Amazon product images. Compare the generated image against the original and verify compliance. Return ONLY valid JSON.`;

    if (previousCritique) {
      systemText = `Previous attempt critique: ${previousCritique}. Address these specific issues in your evaluation.\n\n${systemText}`;
    }

    const outputSchema = `
Return this EXACT JSON structure:
{
  "score": <0-100>,
  "is_satisfactory": <true if score >= 80 AND product identity preserved>,
  "critique": "<concise description of issues>",
  "checks": {
    "background_compliant": <boolean>,
    "text_removed": <boolean>,
    "product_identity_preserved": <boolean>,
    "occupancy_adequate": <boolean>,
    "quality_acceptable": <boolean>
  },
  "improvement_suggestion": "<specific actionable improvement>"
}`;

    // ── Build parts ──

    const parts: any[] = [
      { text: systemText + "\n" + outputSchema },
      { text: "ORIGINAL IMAGE:" },
      { inline_data: { mime_type: originalImage.mimeType, data: originalImage.data } },
      { text: "GENERATED FIX:" },
      { inline_data: { mime_type: generatedImage.mimeType, data: generatedImage.data } },
    ];

    // Add main reference for secondary images
    if (!isMain && mainImageBase64) {
      const mainImage = extractBase64(mainImageBase64);
      if (mainImage.data) {
        parts.push({ text: "MAIN PRODUCT REFERENCE (for product identity check):" });
        parts.push({ inline_data: { mime_type: mainImage.mimeType, data: mainImage.data } });
      }
    }

    parts.push({ text: "Verify the generated image meets all requirements and return this JSON structure exactly." });

    // ── Make API request ──

    const requestBody = {
      model: MODELS.verification,
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: "application/json",
        thinkingConfig: {
          thinkingLevel: "High",
        },
      },
    };

    const response = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.verification}:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      const parsed = parseGeminiError(response.status, errorText);
      console.error("[verify-image] API error:", response.status, errorText);
      return new Response(JSON.stringify({ error: parsed.message, errorType: parsed.errorType }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();

    // ── Parse response: skip thinking tokens ──

    const textBlock = (data.candidates?.[0]?.content?.parts || [])
      .filter((p: any) => !p.thought && p.text)
      .map((p: any) => p.text)
      .join("");

    if (!textBlock) {
      console.error("[verify-image] No text content in response");
      return new Response(JSON.stringify({
        error: "No text content returned from verification model",
        errorType: "parse_error",
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clean = textBlock.replace(/```json|```/g, "").trim();

    let rawResult: any;
    try {
      rawResult = JSON.parse(clean);
    } catch {
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("[verify-image] Failed to parse JSON:", clean.substring(0, 300));
        return new Response(JSON.stringify({
          error: "Failed to parse verification response as JSON",
          errorType: "parse_error",
          rawSnippet: clean.substring(0, 240),
        }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      rawResult = JSON.parse(jsonMatch[0]);
    }

    // ── Map to frontend-compatible camelCase format ──

    const checks = rawResult.checks || {};
    const score = rawResult.score ?? 0;
    const productMatch = checks.product_identity_preserved ?? rawResult.productMatch ?? true;

    // Server-side threshold enforcement
    let isSatisfactory = rawResult.is_satisfactory ?? rawResult.isSatisfactory ?? false;
    if (score < SATISFACTORY_THRESHOLD) {
      isSatisfactory = false;
    }
    if (!productMatch) {
      isSatisfactory = false;
    }

    const mappedResult = {
      score,
      isSatisfactory,
      productMatch,
      critique: rawResult.critique || '',
      improvements: [rawResult.improvement_suggestion].filter(Boolean),
      passedChecks: Object.entries(checks)
        .filter(([, v]) => v === true)
        .map(([k]) => k.replace(/_/g, ' ')),
      failedChecks: Object.entries(checks)
        .filter(([, v]) => v === false)
        .map(([k]) => k.replace(/_/g, ' ')),
      componentScores: {
        identity: productMatch ? 90 : 30,
        compliance: checks.background_compliant && checks.text_removed ? 90 : 40,
        quality: checks.quality_acceptable ? 90 : 50,
        textLayout: 80,
        noAdditions: 90,
      },
    };

    console.log(`[verify-image] Score: ${mappedResult.score}%, Satisfactory: ${mappedResult.isSatisfactory} (threshold: ${SATISFACTORY_THRESHOLD})`);
    console.log(`[verify-image] Product match: ${mappedResult.productMatch}`);
    if (mappedResult.failedChecks.length > 0) {
      console.log(`[verify-image] Failed checks: ${mappedResult.failedChecks.join(', ')}`);
    }

    return new Response(JSON.stringify(mappedResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[verify-image] Error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Verification failed",
      errorType: "verification_failed",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
