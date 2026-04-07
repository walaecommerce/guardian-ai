import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { MODELS } from "../_shared/models.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

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

    // Auth validation
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const supabaseAuth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    console.log(`[generate-enhancement] Authenticated user: ${claimsData.claims.sub}`);

    const {
      originalImage,
      mainProductImage,
      imageCategory,
      enhancementType,
      targetImprovements,
      preserveElements,
      customPrompt
    } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log(`[generate-enhancement] using model: ${MODELS.imageGen} via Lovable AI gateway`);
    console.log(`[Enhancement Gen] Generating ${enhancementType} enhancement for ${imageCategory} image...`);

    const prompt = customPrompt || getCategoryEnhancementPrompt(
      imageCategory,
      enhancementType,
      targetImprovements || [],
      preserveElements || []
    );

    // Build content parts
    const contentParts: any[] = [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: toDataUrl(originalImage) } },
    ];

    if (mainProductImage) {
      contentParts.push({ type: "text", text: "Main product reference image (use for product consistency):" });
      contentParts.push({ type: "image_url", image_url: { url: toDataUrl(mainProductImage) } });
    }

    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODELS.imageGen,
        messages: [{ role: "user", content: contentParts }],
        modalities: ["image", "text"],
      }),
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded.", errorType: "rate_limit" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Settings → Workspace → Usage.", errorType: "payment_required" }), {
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

    // Extract image from gateway response
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

      console.error(`[Enhancement Gen] No image in gateway response. Text: ${textContent.slice(0, 200)}`);

      return new Response(JSON.stringify({
        error: "No enhanced image was generated. Please try again or use a different enhancement preset.",
        errorType: "no_image_returned",
        modelTextSnippet: textContent.slice(0, 240) || null,
      }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[Enhancement Gen] ✅ Enhanced image generated successfully via Lovable AI gateway");

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
