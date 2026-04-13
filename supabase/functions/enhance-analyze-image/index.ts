import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { MODELS } from "../_shared/models.ts";
import { fetchGemini } from "../_shared/gemini.ts";
import { requireAuth, isAuthError } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

const toDataUrl = (dataUrl: string): string => {
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
  return `data:${guessImageMimeType(dataUrl)};base64,${dataUrl}`;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authResult = await requireAuth(req, corsHeaders);
    if (isAuthError(authResult)) return authResult;

    const { imageBase64, mainImageBase64, imageCategory, listingTitle, productAsin, imageType, productCategory } = await req.json();

    // Guard: MAIN images are never eligible for enhancement
    if (imageType === 'MAIN' || imageCategory === 'MAIN') {
      console.log('[Enhancement] Skipping MAIN/hero image — not eligible for enhancement');
      return new Response(JSON.stringify({
        imageCategory: 'MAIN',
        enhancementOpportunities: [],
        analysisNotes: 'MAIN/hero images are not eligible for enhancement to preserve white-background compliance.'
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    console.log(`[enhance-analyze-image] using model: ${MODELS.analysis} via Google Gemini API`);
    console.log(`[Enhancement] Analyzing ${imageCategory} image for quality polish opportunities...`);

    // ── Compliance-preserving analysis prompt ──────────────────────
    // Enhancement = quality polish only. Never suggest adding elements,
    // changing layout, converting content type, or redesigning the image.
    const systemPrompt = `You are an Amazon product image quality analyst. Your ONLY job is to identify conservative quality-polish opportunities that improve the image WITHOUT changing its content, layout, structure, or category.

## ABSOLUTE RULES — NEVER SUGGEST:
- Adding text, callout graphics, annotations, labels, or infographic elements
- Adding product cutouts, overlays, or comparison labels
- Converting the image to a different category (e.g. lifestyle → infographic)
- Redesigning layout or composition
- Adding promotional badges, banners, or marketing elements
- Adding props, backgrounds, or context elements that don't already exist
- Any change that would alter what the image fundamentally IS

## ALLOWED ENHANCEMENT TYPES (quality polish only):
- "lighting_improvement" — fix uneven lighting, add subtle fill light on product
- "color_correction" — improve white balance, color accuracy, saturation balance
- "sharpness_improvement" — improve clarity and detail sharpness
- "contrast_improvement" — improve tonal contrast and depth
- "noise_reduction" — reduce grain or compression artifacts
- "product_focus" — subtle depth-of-field to draw eye to product (no cropping)
- "quality_enhancement" — general resolution/quality improvements

## IMAGE CATEGORY: "${imageCategory}"
The image's current category must be PRESERVED. Enhancement must not change what type of image this is.

## OUTPUT FORMAT
Return ONLY valid JSON:
{
  "imageCategory": "${imageCategory}",
  "contentQuality": {
    "overallQuality": <0-100>,
    "lightingScore": <0-100>,
    "sharpnessScore": <0-100>,
    "colorAccuracyScore": <0-100>
  },
  "enhancementOpportunities": [
    {
      "id": "unique_id",
      "type": "lighting_improvement|color_correction|sharpness_improvement|contrast_improvement|noise_reduction|product_focus|quality_enhancement",
      "priority": "high|medium|low",
      "description": "What specific quality aspect should be improved",
      "expectedImprovement": "What visual quality improvement this will achieve"
    }
  ],
  "analysisNotes": "Brief quality assessment summary"
}

If the image is already high quality (overallQuality >= 85), return an empty enhancementOpportunities array.
Only return opportunities where there is genuine, visible quality improvement to be made.`;

    const userPrompt = `Analyze this ${imageCategory} image for quality-polish opportunities only.
${listingTitle ? `Product: "${listingTitle}"` : ''}
Do NOT suggest adding new elements, text, graphics, or changing the image's category or layout.
Only suggest lighting, color, sharpness, contrast, and clarity improvements.`;

    const contentParts: any[] = [
      { type: "text", text: userPrompt },
      { type: "image_url", image_url: { url: toDataUrl(imageBase64) } },
    ];

    if (mainImageBase64) {
      contentParts.push({ type: "text", text: "Main product reference (for color/identity consistency check only):" });
      contentParts.push({ type: "image_url", image_url: { url: toDataUrl(mainImageBase64) } });
    }

    const response = await fetchGemini({
      model: MODELS.analysis,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: contentParts },
      ],
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded.", errorType: "rate_limit" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted.", errorType: "payment_required" }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Enhancement] Gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: `AI gateway error (${response.status})`, errorType: "gateway_error" }), {
        status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[Enhancement] Failed to parse JSON from response");
      throw new Error("Could not parse enhancement analysis result");
    }

    const analysis = JSON.parse(jsonMatch[0]);

    // Server-side guard: strip any opportunity types that aren't in the safe allow-list
    const SAFE_TYPES = new Set([
      'lighting_improvement', 'color_correction', 'sharpness_improvement',
      'contrast_improvement', 'noise_reduction', 'product_focus', 'quality_enhancement',
    ]);
    if (Array.isArray(analysis.enhancementOpportunities)) {
      analysis.enhancementOpportunities = analysis.enhancementOpportunities.filter(
        (o: any) => SAFE_TYPES.has(o?.type)
      );
    }

    console.log(`[Enhancement] Analysis complete. Quality: ${analysis.contentQuality?.overallQuality}%, Safe opportunities: ${analysis.enhancementOpportunities?.length || 0}`);

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[Enhancement] Analysis error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Analysis failed"
    }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
