import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { useCredit, checkCredits, createAdminClient } from "../_shared/credits.ts";
import { MODELS } from "../_shared/models.ts";
import { fetchGemini } from "../_shared/gemini.ts";

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

/**
 * Build a compliance-preserving quality-polish prompt.
 * Enhancement = improve lighting, color, sharpness, contrast.
 * NEVER add elements, change layout, convert content type, or redesign.
 */
const buildEnhancementPrompt = (
  imageCategory: string,
  targetImprovements: string[],
  preserveElements: string[]
): string => {
  const preserveSection = preserveElements.length > 0
    ? `\nPRESERVE EXACTLY:\n${preserveElements.map(e => `- ${e}`).join('\n')}`
    : '';

  const improvementsSection = targetImprovements.length > 0
    ? `\nTARGETED QUALITY IMPROVEMENTS:\n${targetImprovements.map(e => `- ${e}`).join('\n')}`
    : '';

  // MAIN/hero: minimal polish only
  if (imageCategory === 'MAIN' || imageCategory === 'HERO') {
    return `This is a MAIN/HERO product image. Apply minimal quality polish ONLY.

CRITICAL RULES:
- MUST keep pure white background (RGB 255,255,255)
- MUST NOT add any text, callouts, badges, graphics, or overlays
- MUST NOT change product appearance, color, shape, or positioning
- MUST NOT add lifestyle context, props, or scene elements
- Product must remain the sole subject on white background
- Only allowed: subtle lighting balance, sharpness, color accuracy
${improvementsSection}${preserveSection}

OUTPUT: Minimally polished hero product image on pure white background. Nearly identical to the input.`;
  }

  // All secondary images: conservative quality polish
  return `Apply conservative quality polish to this ${imageCategory} product image.

ABSOLUTE RULES — DO NOT:
- Add text, callout graphics, annotations, labels, or infographic elements
- Add product cutouts, overlays, comparison labels, or badges
- Convert the image to a different type (e.g. lifestyle → infographic)
- Redesign, restructure, or change the composition/layout
- Add promotional badges, banners, marketing text, or watermarks
- Add props, backgrounds, or context elements not already in the image
- Change what the image fundamentally IS — preserve its category and role

ALLOWED QUALITY IMPROVEMENTS ONLY:
- Improve lighting: even out shadows, subtle fill light on product
- Improve color: better white balance, accurate color representation
- Improve sharpness: enhance detail clarity and edge definition
- Improve contrast: better tonal depth and visual pop
- Reduce noise: minimize grain or compression artifacts
- Subtle focus: gentle depth-of-field to draw attention to product

The enhanced image must look like a better-lit, better-color-balanced, sharper version of the SAME image — not a different image.
${improvementsSection}${preserveSection}

OUTPUT: Quality-polished version preserving the exact same composition, layout, content type, and visual identity.`;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const supabaseAuth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = claimsData.claims.sub as string;
    const admin = createAdminClient();
    console.log(`[generate-enhancement] Authenticated user: ${userId}`);

    // Pre-check enhance credits (debit on success only)
    try {
      const remaining = await checkCredits(admin, userId, 'enhance');
      const { data: roleData } = await admin
        .from('user_roles').select('role')
        .eq('user_id', userId).eq('role', 'admin').maybeSingle();
      if (!roleData && remaining <= 0) {
        return new Response(
          JSON.stringify({ error: 'No enhance credits remaining. Upgrade your plan to continue.', errorType: 'payment_required' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (creditErr: any) {
      console.warn('[generate-enhancement] Credit pre-check failed, proceeding:', creditErr);
    }

    const {
      originalImage,
      mainProductImage,
      imageCategory,
      enhancementType,
      targetImprovements,
      preserveElements,
      customPrompt,
      sessionImageId,
      listingContext,
    } = await req.json();

    const GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    console.log(`[generate-enhancement] model: ${MODELS.imageGen}, category: ${imageCategory}, type: ${enhancementType}`);

    // Never use customPrompt for enhancement — always use the safe builder
    let prompt = buildEnhancementPrompt(
      imageCategory,
      targetImprovements || [],
      preserveElements || []
    );

    // Inject listing context guardrails if available
    if (listingContext && typeof listingContext === 'object') {
      const parts: string[] = [];
      if (listingContext.brand) parts.push(`Brand: ${listingContext.brand}`);
      if (listingContext.title) parts.push(`Product: ${listingContext.title}`);
      if (Array.isArray(listingContext.claims) && listingContext.claims.length > 0) {
        parts.push(`Valid claims: ${listingContext.claims.slice(0, 6).join(', ')}`);
      }
      if (parts.length > 0) {
        prompt += `\n\nPRODUCT CONTEXT:
${parts.join('\n')}
- Preserve the product's intended positioning and valid claims
- Do NOT add, remove, or change any text/claims on the product
- Do NOT create visual elements implying unsupported claims
- Enhancement is polish only — not redesign`;
      }
    }

    const contentParts: any[] = [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: toDataUrl(originalImage) } },
    ];

    if (mainProductImage) {
      contentParts.push({ type: "text", text: "Main product reference (for color/identity consistency only — do not copy its layout):" });
      contentParts.push({ type: "image_url", image_url: { url: toDataUrl(mainProductImage) } });
    }

    const response = await fetchGemini({
      model: MODELS.imageGen,
      messages: [{ role: "user", content: contentParts }],
      modalities: ["image", "text"],
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded.", errorType: "rate_limit" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted.", errorType: "payment_required" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Enhancement Gen] Gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: `AI gateway error (${response.status})`, errorType: "gateway_error" }), {
        status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const imageResult = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageResult) {
      const textContent = data.choices?.[0]?.message?.content || '';
      const finishReason = data.choices?.[0]?.finish_reason ?? null;

      if (finishReason === "content_filter") {
        return new Response(JSON.stringify({
          error: "Image generation was blocked by safety filters.",
          errorType: "safety_block",
        }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.error(`[Enhancement Gen] No image in response. Text: ${textContent.slice(0, 200)}`);
      return new Response(JSON.stringify({
        error: "No enhanced image was generated. Please try again.",
        errorType: "no_image_returned",
        modelTextSnippet: textContent.slice(0, 240) || null,
      }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[Enhancement Gen] ✅ Quality-polished image generated successfully");

    // Debit enhance credit on success only
    const idemKey = sessionImageId ? `enhance:${sessionImageId}` : `enhance:${userId}:${Date.now()}`;
    try { await useCredit(admin, userId, 'enhance', 'generate-enhancement', idemKey); } catch (e: any) { console.warn('[generate-enhancement] Post-success debit failed:', e?.message); }

    return new Response(JSON.stringify({
      enhancedImage: imageResult,
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
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
