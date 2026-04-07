import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { MODELS } from "../_shared/models.ts";
import { fetchGemini } from "../_shared/gemini.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SATISFACTORY_THRESHOLD = 85;

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

const toDataUrl = (dataUrl: string | undefined | null): string => {
  if (!dataUrl) return '';
  if (dataUrl.startsWith('data:')) {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const rawMime = match[1];
      const b64 = match[2];
      const normalizedMime = normalizeMimeType(rawMime, b64);
      if (rawMime !== normalizedMime) return `data:${normalizedMime};base64,${b64}`;
    }
    return dataUrl;
  }
  // If it's a URL, return it as-is — we'll handle fetching separately
  if (dataUrl.startsWith('http://') || dataUrl.startsWith('https://')) {
    return dataUrl;
  }
  return `data:${guessImageMimeType(dataUrl)};base64,${dataUrl}`;
};

const fetchImageAsDataUrl = async (input: string): Promise<string> => {
  if (!input) return '';
  // Already a data URL or raw base64 converted to data URL
  if (input.startsWith('data:')) return input;
  // It's a URL — fetch and convert to base64
  if (input.startsWith('http://') || input.startsWith('https://')) {
    const resp = await fetch(input);
    if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status} ${input}`);
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const b64 = btoa(binary);
    const contentType = resp.headers.get('content-type') || 'image/png';
    const mime = normalizeMimeType(contentType, b64);
    return `data:${mime};base64,${b64}`;
  }
  // Raw base64
  return `data:${guessImageMimeType(input)};base64,${input}`;
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
      productIdentity,
      spatialAnalysis,
    } = await req.json();

    const GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const isMain = imageType === 'MAIN';

    const originalUrl = await fetchImageAsDataUrl(originalImageBase64);
    const generatedUrl = await fetchImageAsDataUrl(generatedImageBase64);

    if (!originalUrl || !generatedUrl) {
      console.error("[verify-image] Missing image data — original:", !!originalUrl, "generated:", !!generatedUrl);
      return new Response(JSON.stringify({
        error: "Missing required image data. Both original and generated images are required.",
        errorType: "missing_images",
      }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[verify-image] using model: ${MODELS.verification} via Google Gemini API`);
    console.log(`[verify-image] Verifying ${imageType} image...`);

    // ── Build prompt with weighted rubric ──

    let systemText = `You are a strict quality verification specialist for Amazon product images. Compare the generated image against the original and verify compliance using a WEIGHTED RUBRIC.`;

    if (previousCritique) {
      systemText = `Previous attempt critique: ${previousCritique}. Address these specific issues in your evaluation.\n\n${systemText}`;
    }

    // Build identity verification section
    let identitySection = '';
    if (productIdentity) {
      identitySection = `
PRODUCT IDENTITY CARD (verify the generated image matches ALL of these):
- Brand: ${productIdentity.brandName || 'Unknown'}
- Product: ${productIdentity.productName || 'Unknown'}
- Packaging type: ${productIdentity.packagingType || 'unknown'}
- Dominant colors: ${(productIdentity.dominantColors || []).join(', ')}
- Shape: ${productIdentity.shapeDescription || 'N/A'}
- Key label text that MUST be present: ${(productIdentity.labelText || []).join(' | ')}
- Visual features: ${(productIdentity.keyVisualFeatures || []).join(', ')}

Check each identity attribute individually. If ANY label text is missing/changed or colors are wrong, product_identity_preserved MUST be false.`;
    }

    const outputSchema = `
WEIGHTED SCORING RUBRIC:
- Product Identity (35%): Does the generated image show the EXACT same product? Same brand, labels, colors, shape.
- Background Compliance (25%): ${isMain ? 'Pure white RGB(255,255,255) background' : 'Appropriate lifestyle/infographic context preserved'}.
- Badge/Text Removal (20%): Are prohibited badges removed while legitimate text is preserved?
- Image Quality (10%): Sharp, professional, no artifacts, proper lighting.
- No New Issues (10%): No new elements added, no hallucinated features, no cropping errors.
${identitySection}

Return this EXACT JSON structure:
{
  "score": <0-100 weighted>,
  "is_satisfactory": <true if score >= 85 AND product identity preserved>,
  "critique": "<concise description of specific issues found>",
  "checks": {
    "background_compliant": <boolean>,
    "text_removed": <boolean — prohibited badges/overlays removed>,
    "product_identity_preserved": <boolean — EXACT same product, same labels, colors, shape>,
    "occupancy_adequate": <boolean — product fills 85%+ for MAIN>,
    "quality_acceptable": <boolean>,
    "no_new_elements": <boolean — nothing hallucinated or added>,
    "label_text_legible": <boolean — all original label text is crisp and readable>
  },
  "identity_details": {
    "brand_match": <boolean>,
    "color_match": <boolean>,
    "shape_match": <boolean>,
    "label_text_match": <boolean>,
    "missing_features": ["<any identity features that are wrong or missing>"]
  },
  "improvement_suggestion": "<specific actionable improvement for the next retry>"
}`;

    // ── Build content parts ──

    const contentParts: any[] = [
      { type: "text", text: systemText + "\n" + outputSchema },
      { type: "text", text: "ORIGINAL IMAGE:" },
      { type: "image_url", image_url: { url: originalUrl } },
      { type: "text", text: "GENERATED FIX:" },
      { type: "image_url", image_url: { url: generatedUrl } },
    ];

    if (!isMain && mainImageBase64) {
      const mainUrl = await fetchImageAsDataUrl(mainImageBase64);
      if (mainUrl) {
        contentParts.push({ type: "text", text: "MAIN PRODUCT REFERENCE (for product identity check):" });
        contentParts.push({ type: "image_url", image_url: { url: mainUrl } });
      }
    }

    contentParts.push({ type: "text", text: "Verify the generated image against the weighted rubric and return the JSON structure exactly." });

    // ── Make gateway request with retry for transient errors ──

    const MAX_RETRIES = 2;
    let response!: Response;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      response = await fetchGemini({
        model: MODELS.verification,
        messages: [{ role: "user", content: contentParts }],
      });

      // Retry on transient 502/503 errors
      if ((response.status === 502 || response.status === 503) && attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s
        console.warn(`[verify-image] Gateway ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await response.text(); // consume body to prevent leak
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      break;
    }

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded.", errorType: "rate_limit" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Settings → Workspace → Usage.", errorType: "payment_required" }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[verify-image] Gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: `AI gateway error (${response.status})`, errorType: "gateway_error" }), {
        status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const responseText = await response.text();
    if (!responseText || responseText.trim().length === 0) {
      console.error("[verify-image] Empty response from gateway");
      return new Response(JSON.stringify({ error: "Empty response from AI gateway", errorType: "empty_response" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let data: any;
    try { data = JSON.parse(responseText); } catch {
      console.error("[verify-image] Invalid JSON from gateway:", responseText.substring(0, 300));
      return new Response(JSON.stringify({ error: "Invalid JSON from AI gateway", errorType: "parse_error" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const textBlock = data.choices?.[0]?.message?.content || '';

    if (!textBlock) {
      console.error("[verify-image] No content in response");
      return new Response(JSON.stringify({
        error: "No content returned from verification model",
        errorType: "parse_error",
      }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      rawResult = JSON.parse(jsonMatch[0]);
    }

    // ── Map to frontend-compatible camelCase format ──

    const checks = rawResult.checks || {};
    const identityDetails = rawResult.identity_details || {};
    const score = rawResult.score ?? 0;
    const productMatch = checks.product_identity_preserved ?? rawResult.productMatch ?? true;

    let isSatisfactory = rawResult.is_satisfactory ?? rawResult.isSatisfactory ?? false;
    if (score < SATISFACTORY_THRESHOLD) isSatisfactory = false;
    if (!productMatch) isSatisfactory = false;

    // Check identity details for stricter matching
    if (identityDetails.missing_features?.length > 0) {
      console.log(`[verify-image] Identity missing features: ${identityDetails.missing_features.join(', ')}`);
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
      identityDetails: {
        brandMatch: identityDetails.brand_match ?? true,
        colorMatch: identityDetails.color_match ?? true,
        shapeMatch: identityDetails.shape_match ?? true,
        labelTextMatch: identityDetails.label_text_match ?? true,
        missingFeatures: identityDetails.missing_features || [],
      },
      componentScores: {
        identity: productMatch ? (identityDetails.label_text_match === false ? 60 : 90) : 30,
        compliance: checks.background_compliant && checks.text_removed ? 90 : 40,
        quality: checks.quality_acceptable ? 90 : 50,
        textLayout: checks.label_text_legible ? 90 : 50,
        noAdditions: checks.no_new_elements ? 90 : 40,
      },
    };

    console.log(`[verify-image] Score: ${mappedResult.score}%, Satisfactory: ${mappedResult.isSatisfactory} (threshold: ${SATISFACTORY_THRESHOLD})`);
    console.log(`[verify-image] Product match: ${mappedResult.productMatch}`);
    if (mappedResult.failedChecks.length > 0) {
      console.log(`[verify-image] Failed checks: ${mappedResult.failedChecks.join(', ')}`);
    }
    if (mappedResult.identityDetails.missingFeatures.length > 0) {
      console.log(`[verify-image] Missing identity features: ${mappedResult.identityDetails.missingFeatures.join(', ')}`);
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
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
