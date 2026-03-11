import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { MODELS } from "../_shared/models.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

// ── System instruction ────────────────────────────────────────────

const SYSTEM_INSTRUCTION = `You are a professional Amazon product photographer and image editor. Your job is to generate a replacement image that will PASS Amazon's main image requirements:
- Pure white background: RGB(255,255,255) — not off-white, not grey
- Product occupies 85% or more of the frame
- No text, logos, watermarks, or graphics overlaid on the image
- No additional props or objects
- No human models
- Single product only (unless the listing is for a multi-pack)
The generated image must look like a professional studio photograph, not a 3D render or illustration.`;

// ── Category detection ───────────────────────────────────────────

type FixCategory = 'FOOD_BEVERAGE' | 'APPAREL' | 'ELECTRONICS' | 'PET_SUPPLIES' | 'BEAUTY' | 'SUPPLEMENTS' | 'HOME_GARDEN' | 'TOYS_GAMES' | 'GENERAL';

function detectFixCategory(imageCategory?: string, productTitle?: string): FixCategory {
  const cat = (imageCategory || '').toUpperCase();
  const title = (productTitle || '').toLowerCase();

  // From analysis category
  if (cat.includes('FOOD') || cat.includes('BEVERAGE')) return 'FOOD_BEVERAGE';
  if (cat.includes('SUPPLEMENT') || cat.includes('VITAMIN')) return 'SUPPLEMENTS';
  if (cat.includes('PET')) return 'PET_SUPPLIES';
  if (cat.includes('BEAUTY') || cat.includes('PERSONAL') || cat.includes('SKINCARE') || cat.includes('COSMETIC')) return 'BEAUTY';
  if (cat.includes('HOME') || cat.includes('GARDEN') || cat.includes('KITCHEN') || cat.includes('OUTDOOR')) return 'HOME_GARDEN';
  if (cat.includes('TOY') || cat.includes('GAME') || cat.includes('PUZZLE')) return 'TOYS_GAMES';
  if (cat.includes('ELECTRON')) return 'ELECTRONICS';
  if (cat.includes('APPAREL') || cat.includes('CLOTH')) return 'APPAREL';

  // Fallback: keyword detection from title
  const supplementKw = ['supplement', 'vitamin', 'protein', 'capsule', 'probiotic', 'collagen', 'omega', 'multivitamin', 'creatine', 'amino', 'magnesium', 'zinc', 'iron', 'calcium', 'biotin', 'melatonin', 'ashwagandha', 'turmeric', 'elderberry', 'gummy', 'tablet', 'softgel'];
  const beautyKw = ['serum', 'cream', 'lotion', 'shampoo', 'conditioner', 'moisturizer', 'cleanser', 'toner', 'sunscreen', 'foundation', 'mascara', 'lipstick', 'concealer', 'eyeshadow', 'blush', 'primer', 'perfume', 'cologne', 'deodorant', 'body wash', 'face wash', 'skincare', 'makeup', 'cosmetic', 'hair oil', 'nail polish'];
  const homeKw = ['garden', 'planter', 'vase', 'candle', 'lamp', 'rug', 'curtain', 'pillow', 'blanket', 'organizer', 'shelf', 'basket', 'hanger', 'towel', 'mat', 'mop', 'broom', 'storage', 'drawer', 'hook', 'wreath', 'pot', 'decor', 'furniture', 'patio', 'grill', 'hose', 'sprinkler', 'toolbox'];
  const toyKw = ['toy', 'game', 'puzzle', 'lego', 'doll', 'action figure', 'board game', 'plush', 'stuffed', 'playset', 'building block', 'rc car', 'nerf', 'craft kit', 'play-doh', 'slime', 'figurine', 'dice', 'card game'];
  const foodKw = ['food', 'snack', 'drink', 'beverage', 'sauce', 'coffee', 'tea', 'juice', 'candy', 'chocolate', 'cereal', 'bar', 'chip', 'cookie'];
  const petKw = ['dog', 'cat', 'pet', 'puppy', 'kitten', 'treat', 'kibble', 'chew', 'leash', 'collar'];
  const techKw = ['electronic', 'charger', 'cable', 'bluetooth', 'wireless', 'speaker', 'headphone', 'usb', 'hdmi', 'adapter', 'camera', 'phone', 'laptop', 'tablet', 'device'];
  const apparelKw = ['shirt', 'pants', 'dress', 'jacket', 'hoodie', 'sweater', 'sock', 'shoe', 'boot', 'hat', 'glove', 'scarf', 'coat', 'blouse', 'skirt', 'jeans', 'legging', 'underwear', 'bra'];

  if (supplementKw.some(kw => title.includes(kw))) return 'SUPPLEMENTS';
  if (beautyKw.some(kw => title.includes(kw))) return 'BEAUTY';
  if (apparelKw.some(kw => title.includes(kw))) return 'APPAREL';
  if (foodKw.some(kw => title.includes(kw))) return 'FOOD_BEVERAGE';
  if (petKw.some(kw => title.includes(kw))) return 'PET_SUPPLIES';
  if (techKw.some(kw => title.includes(kw))) return 'ELECTRONICS';

  return 'GENERAL';
}

// ── Category-specific prompt templates ───────────────────────────

const CATEGORY_PROMPTS: Record<FixCategory, (title: string) => string> = {
  FOOD_BEVERAGE: (title) =>
    `Professional Amazon main image: ${title} photographed on pure white RGB(255,255,255) background. Studio lighting with soft shadows directly beneath. The packaging is the HERO — show the front label clearly and fully legible. The label text, flavor name, and brand logo must be crisp and readable. If a bottle: upright, centered, label facing camera. If a bag/pouch: standing upright, front panel filling 85% of frame. If a box: 3/4 angle showing front and one side. No props, no ingredients, no background elements. Product fills 90% of frame. Photorealistic, 4K quality.`,

  APPAREL: (title) =>
    `Professional Amazon main image: ${title} on pure white RGB(255,255,255) background. Ghost mannequin or flat lay style. The garment fills 85% of frame. Show the full item — no cropping. Colors must be accurate to the actual product. All design elements, text prints, and logos on the garment must be clearly visible. No model, no props, no accessories unless part of the product. Evenly lit with no harsh shadows. Photorealistic, 4K quality.`,

  ELECTRONICS: (title) =>
    `Professional Amazon main image: ${title} on pure white RGB(255,255,255) background. Product at slight 3/4 angle to show depth. All ports, buttons, indicators must be visible. If it has a screen: screen showing a clean UI or powered-on state. Chrome and glass surfaces rendered with clean reflections. Product fills 85% of frame. No cables unless the cable IS the product. No packaging, no accessories. Studio lighting, no harsh glare on surfaces. Photorealistic, 4K quality.`,

  PET_SUPPLIES: (title) =>
    `Professional Amazon main image: ${title} on pure white RGB(255,255,255) background. Product centered and upright. If treat/food: show the bag or container front-facing with label fully legible, brand name prominent. If toy/accessory: show the product alone at a natural angle. If grooming: bottle or container upright, label facing camera. Warm, inviting studio lighting. Product fills 85% of frame. No pets in main image, no props, no lifestyle elements. Photorealistic, 4K quality.`,

  BEAUTY: (title) =>
    `Professional Amazon main image: ${title} on pure white RGB(255,255,255) background. Product bottle or container upright, centered, label facing camera at a slight 5-degree angle to show dimension. The brand name, product name, and key claims on the label must be crisp and fully legible. If pump bottle: pump facing right. If tube: cap on, standing upright. If jar: lid on, slight overhead angle to show both lid and label. Luxurious studio lighting with soft reflections on glossy surfaces — no harsh glare. If the product has a metallic, glass, or frosted finish, render the material texture accurately. Product fills 85% of frame. No props, no flowers, no lifestyle elements, no color swatches. Photorealistic, 4K quality, beauty editorial style.`,

  SUPPLEMENTS: (title) =>
    `Professional Amazon main image: ${title} on pure white RGB(255,255,255) background. Supplement bottle or container upright, centered, label facing directly at camera. The Supplement Facts panel does NOT need to be visible — focus on the FRONT label. Brand name, product name, dosage/count, and key ingredient callouts on the front label must be crisp and fully readable. If bottle with cap: cap on, bottle standing straight. If pouch/bag: standing upright, front panel filling 85% of frame. If blister pack or box: show front face at slight 3/4 angle. Clean, clinical studio lighting — bright and trustworthy. No pills scattered around, no ingredients shown loose, no lifestyle props. Product fills 85% of frame. Photorealistic, 4K quality, health & wellness editorial style.`,

  GENERAL: (title) =>
    `Professional Amazon main image: ${title} on pure white RGB(255,255,255) background. Product centered, filling 85% of frame. All key features visible. Even studio lighting with soft natural shadow directly beneath product. No text, no props, no lifestyle elements. Photorealistic, 4K quality.`,
};

// ── Prompt builders ──────────────────────────────────────────────

function buildMainImagePrompt(title: string, category: FixCategory): string {
  return `${SYSTEM_INSTRUCTION}\n\n${CATEGORY_PROMPTS[category](title)}`;
}

function buildSecondaryImagePrompt(): string {
  return `Edit this product image with MINIMAL targeted changes only:
- REMOVE: "Best Seller" badges, "Amazon's Choice" badges, competitor logos, unreadable text
- PRESERVE EVERYTHING ELSE: lifestyle setting, background scene, people, props, infographic text, annotations, product context
- Do NOT change the background
- Do NOT remove informational text or callouts
- Make the smallest possible edit to achieve compliance`;
}

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
    // Normalize MIME type even for existing data URLs (e.g. application/octet-stream)
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const rawMime = match[1];
      const b64 = match[2];
      const normalizedMime = normalizeMimeType(rawMime, b64);
      if (rawMime !== normalizedMime) {
        return `data:${normalizedMime};base64,${b64}`;
      }
    }
    return dataUrl;
  }
  const mimeType = guessImageMimeType(dataUrl);
  return `data:${mimeType};base64,${dataUrl}`;
};

// ── Main handler ─────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      imageBase64,
      imageType,
      generativePrompt,
      mainImageBase64,
      previousCritique,
      previousGeneratedImage,
      productTitle,
      customPrompt,
      spatialAnalysis,
      imageCategory,
    } = await req.json();

    // Detect category for prompt selection
    const fixCategory = detectFixCategory(imageCategory, productTitle);
    console.log(`[generate-fix] Detected category: ${fixCategory} (from imageCategory=${imageCategory}, title=${productTitle?.slice(0, 40)})`);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const isMain = imageType === 'MAIN';
    console.log(`[generate-fix] using model: ${MODELS.imageGen} via Lovable AI gateway`);
    console.log(`[generate-fix] Pattern: ${isMain ? 'A (MAIN text-to-image)' : mainImageBase64 ? 'C (SECONDARY + main ref)' : 'B (SECONDARY image-to-image)'}`);

    // ── Build spatial context for secondary prompts ──

    const buildProtectedZonesText = (): string => {
      if (!spatialAnalysis) return '';
      const zones: string[] = [];
      for (const z of spatialAnalysis.textZones || []) {
        zones.push(`- TEXT [${z.id}] at ${z.location}: "${z.content}" — DO NOT TOUCH`);
      }
      for (const a of spatialAnalysis.protectedAreas || []) {
        zones.push(`- PROTECTED [${a.id}]: ${a.description} — DO NOT MODIFY`);
      }
      for (const p of spatialAnalysis.productZones || []) {
        zones.push(`- PRODUCT [${p.id}] at ${p.location}: ${p.type}, ${p.coverage}% — PRESERVE`);
      }
      return zones.length ? `\n\nPROTECTED ZONES:\n${zones.join('\n')}` : '';
    };

    const buildRemovalInstructions = (): string => {
      if (!spatialAnalysis?.overlayElements?.length) return '';
      const removals = spatialAnalysis.overlayElements
        .filter((el: any) => el.action === 'remove' && !el.isPartOfPackaging)
        .map((el: any) => `- REMOVE [${el.id}]: ${el.type} at ${el.location} via inpainting`);
      return removals.length ? `\n\nSPECIFIC REMOVALS:\n${removals.join('\n')}` : '';
    };

    // ── Build message content parts (OpenAI-compatible format) ──

    const contentParts: any[] = [];

    if (isMain) {
      // PATTERN A — MAIN image: text-to-image (with optional reference)
      const title = productTitle || generativePrompt || 'Amazon product';
      let prompt = customPrompt || buildMainImagePrompt(title, fixCategory);
      if (previousCritique) {
        prompt += `\n\nPREVIOUS ISSUES TO FIX: ${previousCritique}`;
      }
      contentParts.push({ type: "text", text: prompt });

      // Include original image as reference if available
      if (imageBase64) {
        contentParts.push({
          type: "image_url",
          image_url: { url: toDataUrl(imageBase64) }
        });
      }

      console.log(`[generate-fix] MAIN prompt length: ${prompt.length}, has original ref: ${!!imageBase64}`);

    } else if (mainImageBase64) {
      // PATTERN C — SECONDARY with main reference (two images)
      let prompt = customPrompt || `Edit this secondary image. Remove ONLY: Best Seller badges, Amazon's Choice badges, competitor logos. PRESERVE everything else: lifestyle setting, people, props, infographic text, background. Ensure product matches the reference main image provided.`;
      prompt += buildProtectedZonesText();
      prompt += buildRemovalInstructions();
      if (previousCritique) {
        prompt += `\n\nPREVIOUS ISSUES TO FIX: ${previousCritique}`;
      }

      contentParts.push({ type: "text", text: prompt });
      contentParts.push({
        type: "image_url",
        image_url: { url: toDataUrl(mainImageBase64) }
      });
      contentParts.push({
        type: "image_url",
        image_url: { url: toDataUrl(imageBase64) }
      });

      console.log(`[generate-fix] SECONDARY+REF prompt length: ${prompt.length}`);

    } else {
      // PATTERN B — SECONDARY without main reference (one image)
      let prompt = customPrompt || buildSecondaryImagePrompt();
      prompt += buildProtectedZonesText();
      prompt += buildRemovalInstructions();
      if (previousCritique) {
        prompt += `\n\nPREVIOUS ISSUES TO FIX: ${previousCritique}`;
      }

      contentParts.push({ type: "text", text: prompt });
      contentParts.push({
        type: "image_url",
        image_url: { url: toDataUrl(imageBase64) }
      });

      console.log(`[generate-fix] SECONDARY prompt length: ${prompt.length}`);
    }

    // Add previous attempt for comparison if retrying
    if (previousGeneratedImage) {
      contentParts.push({ type: "text", text: "Previous attempt (for comparison — fix the issues noted above):" });
      contentParts.push({
        type: "image_url",
        image_url: { url: toDataUrl(previousGeneratedImage) }
      });
    }

    // ── Make gateway request ──

    console.log(`[generate-fix] Sending request to Lovable AI gateway: contentParts=${contentParts.length}, isMain=${isMain}`);

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

    // Handle rate limit / payment errors
    if (response.status === 429) {
      const body = await response.text();
      console.error("[generate-fix] Rate limited:", body);
      return new Response(JSON.stringify({
        error: "Rate limit exceeded. Please wait a moment and try again.",
        errorType: "rate_limit",
      }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (response.status === 402) {
      const body = await response.text();
      console.error("[generate-fix] Payment required:", body);
      return new Response(JSON.stringify({
        error: "AI credits exhausted. Add credits in Settings → Workspace → Usage.",
        errorType: "payment_required",
      }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[generate-fix] Gateway error:", response.status, errorText);
      return new Response(JSON.stringify({
        error: `AI gateway error (${response.status})`,
        errorType: "gateway_error",
      }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const responseText = await response.text();
    if (!responseText || responseText.trim().length === 0) {
      console.error("[generate-fix] Empty response from gateway");
      return new Response(JSON.stringify({ error: "Empty response from AI gateway — retry", errorType: "empty_response" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let data: any;
    try { data = JSON.parse(responseText); } catch {
      console.error("[generate-fix] Invalid JSON from gateway:", responseText.substring(0, 300));
      return new Response(JSON.stringify({ error: "Invalid JSON from AI gateway — retry", errorType: "parse_error" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract image from gateway response format
    const imageResult = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageResult) {
      const textContent = data.choices?.[0]?.message?.content || '';
      console.error(`[generate-fix] No image in gateway response. Text: ${textContent.slice(0, 200)}`);
      return new Response(JSON.stringify({
        error: "No image generated. The AI returned text only. Try a different prompt.",
        errorType: "no_image_returned",
        modelTextSnippet: textContent.slice(0, 240) || null,
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[generate-fix] ✅ Image generated successfully via Lovable AI gateway`);

    return new Response(JSON.stringify({
      fixedImage: imageResult,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[generate-fix] Error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Fix generation failed",
      errorType: "generation_failed",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
