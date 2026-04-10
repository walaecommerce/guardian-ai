import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { MODELS } from "../_shared/models.ts";
import { useCredit, createAdminClient } from "../_shared/credits.ts";
import { fetchGemini } from "../_shared/gemini.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};


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

  if (cat.includes('FOOD') || cat.includes('BEVERAGE')) return 'FOOD_BEVERAGE';
  if (cat.includes('SUPPLEMENT') || cat.includes('VITAMIN')) return 'SUPPLEMENTS';
  if (cat.includes('PET')) return 'PET_SUPPLIES';
  if (cat.includes('BEAUTY') || cat.includes('PERSONAL') || cat.includes('SKINCARE') || cat.includes('COSMETIC')) return 'BEAUTY';
  if (cat.includes('HOME') || cat.includes('GARDEN') || cat.includes('KITCHEN') || cat.includes('OUTDOOR')) return 'HOME_GARDEN';
  if (cat.includes('TOY') || cat.includes('GAME') || cat.includes('PUZZLE')) return 'TOYS_GAMES';
  if (cat.includes('ELECTRON')) return 'ELECTRONICS';
  if (cat.includes('APPAREL') || cat.includes('CLOTH')) return 'APPAREL';

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
  if (homeKw.some(kw => title.includes(kw))) return 'HOME_GARDEN';
  if (toyKw.some(kw => title.includes(kw))) return 'TOYS_GAMES';
  if (apparelKw.some(kw => title.includes(kw))) return 'APPAREL';
  if (foodKw.some(kw => title.includes(kw))) return 'FOOD_BEVERAGE';
  if (petKw.some(kw => title.includes(kw))) return 'PET_SUPPLIES';
  if (techKw.some(kw => title.includes(kw))) return 'ELECTRONICS';

  return 'GENERAL';
}

// ── Category-specific prompt templates (full regeneration fallback) ──

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

  HOME_GARDEN: (title) =>
    `Professional Amazon main image: ${title} on pure white RGB(255,255,255) background. Product centered and photographed at the most informative angle — for flat items (mats, rugs): slight overhead 3/4 angle showing surface texture and full shape. For upright items (vases, lamps, organizers): eye-level shot with a slight 5-degree turn to show depth. For tools and hardware: lay flat or stand upright showing the primary grip/handle and functional end. Materials and finishes (wood grain, metal, ceramic glaze, fabric weave) must be rendered with accurate texture and color. Even, warm-neutral studio lighting with soft shadow beneath — no harsh reflections. Product fills 85% of frame. No lifestyle staging, no rooms, no plants (unless the plant IS the product), no decorative props. Photorealistic, 4K quality, home editorial style.`,

  TOYS_GAMES: (title) =>
    `Professional Amazon main image: ${title} on pure white RGB(255,255,255) background. Product fully assembled and displayed at a dynamic 3/4 angle that best shows its play features. Colors must be vibrant and true-to-life — do not desaturate or mute toy colors. If the toy has moving parts, wheels, or articulation points, position them to suggest action. If board game or card game: show the box front-facing with title art fully legible. If building set: show the completed build, not loose pieces. If plush/stuffed: show upright, facing camera with a slight friendly tilt. All printed artwork, character designs, and brand logos on the product must be crisp and clearly visible. Bright, cheerful studio lighting — no harsh shadows. Product fills 85% of frame. No children, no hands, no lifestyle background. Photorealistic, 4K quality, toy catalog style.`,

  GENERAL: (title) =>
    `Professional Amazon main image: ${title} on pure white RGB(255,255,255) background. Product centered, filling 85% of frame. All key features visible. Even studio lighting with soft natural shadow directly beneath product. No text, no props, no lifestyle elements. Photorealistic, 4K quality.`,
};

// ── Category-specific background edit notes ─────────────────────

const CATEGORY_BG_NOTES: Record<FixCategory, string> = {
  FOOD_BEVERAGE: 'Preserve all label printing, foil textures, and transparent packaging elements.',
  APPAREL: 'Preserve fabric texture, stitching, and any garment tags visible.',
  ELECTRONICS: 'Preserve chrome, glass, and metallic reflections on the product surface. Do not flatten glossy screens.',
  PET_SUPPLIES: 'Preserve label printing and any textured packaging surfaces.',
  BEAUTY: 'Preserve glossy, frosted, or metallic surface reflections and pump/cap details.',
  SUPPLEMENTS: 'Preserve all label text, dosage info, and bottle cap/seal details with clinical clarity.',
  HOME_GARDEN: 'Preserve material textures — wood grain, ceramic glaze, metal patina, fabric weave.',
  TOYS_GAMES: 'Preserve vibrant toy colors exactly — do not desaturate. Keep all printed artwork and character designs crisp.',
  GENERAL: 'Preserve all surface details, textures, and printed elements on the product.',
};

// ── Prompt builders ──────────────────────────────────────────────

function buildBackgroundReplacementPrompt(title: string, category: FixCategory, identity?: any, violations?: any[]): string {
  const topViolations = (violations || []).slice(0, 3);
  const violationContext = topViolations.length > 0
    ? `\n\nSPECIFIC VIOLATIONS TO FIX:\n${topViolations.map((v: any, i: number) => `${i + 1}. [${v.severity}] ${v.message} → ${v.recommendation}`).join('\n')}`
    : '';

  let prompt = `BACKGROUND-ONLY EDIT + BADGE REMOVAL — STEP-BY-STEP INSTRUCTIONS:

STEP 1: Identify all pixels that are NOT part of the physical product (background, shadows, surfaces, environmental elements).
STEP 2: Replace ALL identified background pixels with pure white RGB(255,255,255) — not off-white, not grey, not cream.
STEP 3: Scan for promotional badges/overlays (Best Seller, Amazon's Choice, #1 New Release, ribbons, starburst graphics). These are digitally added ON TOP of the photo — REMOVE them completely by inpainting the area beneath.
STEP 4: DO NOT modify ANY pixel that belongs to the actual product — labels, logos, colors, shape, texture must remain pixel-identical.
STEP 5: Ensure the product occupies 85%+ of the frame. If the product is too small, crop tighter around it.
STEP 6: Add a soft, natural drop shadow directly beneath the product for depth.
STEP 7: Clean up any background artifacts, halos, or noise around product edges.
OUTPUT: The edited image only. No text response needed.

IMPORTANT DISTINCTION: Promotional badges/overlays are digitally added ON TOP of the photograph and must be removed. Product labels/logos are physically printed ON the packaging and must be preserved.

${CATEGORY_BG_NOTES[category]}
${violationContext}

Product: ${title}`;

  if (identity) {
    prompt += `

PRODUCT IDENTITY CARD (these details must remain UNCHANGED in the output):
- Brand: ${identity.brandName || 'Unknown'}
- Product: ${identity.productName || title}
- Packaging: ${identity.packagingType || 'unknown'}
- Shape: ${identity.shapeDescription || 'standard'}
- Dominant colors: ${(identity.dominantColors || []).join(', ')}
- Key label text: ${(identity.labelText || []).join(' | ')}
- Visual features: ${(identity.keyVisualFeatures || []).join(', ')}

CRITICAL: Every pixel of the product must remain identical to the input image. Only background pixels and promotional badge overlays should change.`;
  }

  return prompt;
}

function buildMainImagePrompt(title: string, category: FixCategory, identity?: any): string {
  let prompt = `${SYSTEM_INSTRUCTION}\n\n${CATEGORY_PROMPTS[category](title)}`;
  if (identity) {
    prompt += `\n\nPRODUCT IDENTITY CARD (preserve these details exactly):
- Brand: ${identity.brandName || 'Unknown'}
- Product: ${identity.productName || title}
- Packaging: ${identity.packagingType || 'unknown'}
- Shape: ${identity.shapeDescription || 'standard'}
- Dominant colors: ${(identity.dominantColors || []).join(', ')}
- Key label text: ${(identity.labelText || []).join(' | ')}
- Visual features: ${(identity.keyVisualFeatures || []).join(', ')}

CRITICAL: The generated image must show THIS EXACT product. Do NOT change any labels, colors, shape, or branding. It is better to leave a small background imperfection than to alter the product identity.`;
  }
  return prompt;
}

function buildSecondaryImagePrompt(identity?: any, violations?: any[]): string {
  const topViolations = (violations || []).slice(0, 3);
  const violationContext = topViolations.length > 0
    ? `\n\nSPECIFIC VIOLATIONS TO FIX:\n${topViolations.map((v: any, i: number) => `${i + 1}. [${v.severity}] ${v.message} → ${v.recommendation}`).join('\n')}`
    : '';

  let prompt = `Edit this product image with MINIMAL targeted changes — STEP-BY-STEP:

STEP 1: Scan for prohibited elements: "Best Seller" badges, "Amazon's Choice" badges, competitor logos, watermarks, unreadable/illegible text.
STEP 2: REMOVE only the prohibited elements found in Step 1 by inpainting — fill the area to seamlessly match the surrounding background/content.
STEP 3: PRESERVE everything else: lifestyle setting, background scene, people, props, infographic text, annotations, product context.
STEP 4: DO NOT change the background color or scene.
STEP 5: DO NOT remove informational text or callouts — only prohibited promotional badges.
STEP 6: DO NOT regenerate the product — it must remain pixel-identical.
OUTPUT: The minimally edited image only. No text response needed.
${violationContext}`;
  if (identity) {
    prompt += `\n\nPRODUCT IDENTITY (must match exactly):
- Brand: ${identity.brandName || 'Unknown'}, Product: ${identity.productName || 'Unknown'}
- Colors: ${(identity.dominantColors || []).join(', ')}
- ${identity.productDescriptor || ''}`;
  }
  return prompt;
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

// ── Gateway request helpers ─────────────────────────────────────

const IMAGE_MODEL_FALLBACK = MODELS.imageGenHQ || "gemini-2.5-flash-image";

async function callGateway(apiKey: string, contentParts: any[], model?: string): Promise<Response> {
  const requestedModel = model || MODELS.imageGen;

  let response = await fetchGemini({
    model: requestedModel,
    messages: [{ role: "user", content: contentParts }],
    modalities: ["image", "text"],
  });

  // Fallback to HQ model if primary returns 404 or empty
  if ((response.status === 404) && requestedModel !== IMAGE_MODEL_FALLBACK) {
    const errorText = await response.text();
    console.warn(
      `[generate-fix] Model ${requestedModel} unavailable, retrying with ${IMAGE_MODEL_FALLBACK}: ${errorText.substring(0, 300)}`,
    );

    response = await fetchGemini({
      model: IMAGE_MODEL_FALLBACK,
      messages: [{ role: "user", content: contentParts }],
      modalities: ["image", "text"],
    });
  }

  return response;
}

function extractImageFromResponse(data: any): string | null {
  return data?.choices?.[0]?.message?.images?.[0]?.image_url?.url || null;
}



    // Determine model: use imageEdit (Nano Banana 2) for secondary, imageGen for main
    const model = isSecondary ? MODELS.imageEdit : MODELS.imageGen;
    console.log(`[generate-fix] using model: ${model} via Google Gemini API`);

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

    // ── Build message content parts ──

    const contentParts: any[] = [];
    let usedBackgroundSegmentation = false;

    if (isMain) {
      const title = productTitle || generativePrompt || 'Amazon product';
      const isRetryAfterBgSegFail = previousCritique && previousCritique.includes('[BG-SEG-IDENTITY-FAIL]');

      if (imageBase64 && !isRetryAfterBgSegFail) {
        // PATTERN A1 — Background-only edit (primary approach for MAIN)
        let prompt = customPrompt || buildBackgroundReplacementPrompt(title, fixCategory, productIdentity, violations);
        if (previousCritique) {
          prompt += `\n\nPREVIOUS ISSUES TO FIX: ${previousCritique}`;
        }
        contentParts.push({ type: "text", text: prompt });
        contentParts.push({
          type: "image_url",
          image_url: { url: toDataUrl(imageBase64) }
        });
        usedBackgroundSegmentation = true;
        console.log(`[generate-fix] Pattern A1 (MAIN background-only edit), prompt length: ${prompt.length}`);
      } else {
        // PATTERN A2 — Full regeneration fallback (no original image, or bg-seg identity failure)
        let prompt = customPrompt || buildMainImagePrompt(title, fixCategory, productIdentity);
        if (previousCritique) {
          const cleanCritique = previousCritique.replace('[BG-SEG-IDENTITY-FAIL]', '').trim();
          if (cleanCritique) prompt += `\n\nPREVIOUS ISSUES TO FIX: ${cleanCritique}`;
        }
        contentParts.push({ type: "text", text: prompt });
        if (imageBase64) {
          contentParts.push({
            type: "image_url",
            image_url: { url: toDataUrl(imageBase64) }
          });
        }
        console.log(`[generate-fix] Pattern A2 (MAIN full regeneration fallback), prompt length: ${prompt.length}, has ref: ${!!imageBase64}`);
      }

    } else if (mainImageBase64) {
      // PATTERN C — SECONDARY with main reference
      let prompt = customPrompt || buildSecondaryImagePrompt(productIdentity, violations);
      prompt += buildProtectedZonesText();
      prompt += buildRemovalInstructions();
      if (previousCritique) {
        prompt += `\n\nPREVIOUS ISSUES TO FIX: ${previousCritique}`;
      }
      contentParts.push({ type: "text", text: prompt });
      contentParts.push({ type: "image_url", image_url: { url: toDataUrl(mainImageBase64) } });
      contentParts.push({ type: "image_url", image_url: { url: toDataUrl(imageBase64) } });
      console.log(`[generate-fix] Pattern C (SECONDARY+REF via ${model}), prompt length: ${prompt.length}`);

    } else {
      // PATTERN B — SECONDARY without main reference
      let prompt = customPrompt || buildSecondaryImagePrompt(productIdentity, violations);
      prompt += buildProtectedZonesText();
      prompt += buildRemovalInstructions();
      if (previousCritique) {
        prompt += `\n\nPREVIOUS ISSUES TO FIX: ${previousCritique}`;
      }
      contentParts.push({ type: "text", text: prompt });
      contentParts.push({ type: "image_url", image_url: { url: toDataUrl(imageBase64) } });
      console.log(`[generate-fix] Pattern B (SECONDARY via ${model}), prompt length: ${prompt.length}`);
    }

    // Add previous attempt for comparison if retrying
    if (previousGeneratedImage) {
      contentParts.push({ type: "text", text: "Previous attempt (for comparison — fix the issues noted above):" });
      contentParts.push({ type: "image_url", image_url: { url: toDataUrl(previousGeneratedImage) } });
    }

    // ── Make gateway request ──

    console.log(`[generate-fix] Sending request: contentParts=${contentParts.length}, isMain=${isMain}, bgSeg=${usedBackgroundSegmentation}, model=${model}`);

    let response = await callGateway(GEMINI_API_KEY, contentParts, model);

    // If background segmentation attempt failed, fall back to full regeneration
    if (usedBackgroundSegmentation && (!response.ok || response.status >= 500)) {
      console.warn(`[generate-fix] Background-only edit failed (status ${response.status}), falling back to full regeneration`);
      const title = productTitle || generativePrompt || 'Amazon product';
      const fallbackPrompt = customPrompt || buildMainImagePrompt(title, fixCategory, productIdentity);
      const fallbackParts: any[] = [{ type: "text", text: fallbackPrompt }];
      if (imageBase64) {
        fallbackParts.push({ type: "image_url", image_url: { url: toDataUrl(imageBase64) } });
      }
      response = await callGateway(GEMINI_API_KEY, fallbackParts);
      usedBackgroundSegmentation = false;
      console.log(`[generate-fix] Fallback to Pattern A2 full regeneration`);
    }

    // Handle rate limit / payment errors
    if (response.status === 429) {
      const body = await response.text();
      console.error("[generate-fix] Rate limited:", body);
      return new Response(JSON.stringify({
        error: "Rate limit exceeded. Please wait a moment and try again.",
        errorType: "rate_limit",
      }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (response.status === 402) {
      const body = await response.text();
      console.error("[generate-fix] Payment required:", body);
      return new Response(JSON.stringify({
        error: "AI credits exhausted. Add credits in Settings → Workspace → Usage.",
        errorType: "payment_required",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[generate-fix] Gateway error:", response.status, errorText);
      return new Response(JSON.stringify({
        error: `AI gateway error (${response.status})`,
        errorType: "gateway_error",
      }), { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const responseText = await response.text();
    if (!responseText || responseText.trim().length === 0) {
      console.error("[generate-fix] Empty response from gateway");

      // If bg-seg returned empty, try full regeneration fallback
      if (usedBackgroundSegmentation) {
        console.warn("[generate-fix] Empty bg-seg response, falling back to full regeneration");
        const title = productTitle || generativePrompt || 'Amazon product';
        const fallbackPrompt = customPrompt || buildMainImagePrompt(title, fixCategory, productIdentity);
        const fallbackParts: any[] = [{ type: "text", text: fallbackPrompt }];
        if (imageBase64) {
          fallbackParts.push({ type: "image_url", image_url: { url: toDataUrl(imageBase64) } });
        }
        const fallbackResp = await callGateway(GEMINI_API_KEY, fallbackParts);
        if (fallbackResp.ok) {
          const fbText = await fallbackResp.text();
          try {
            const fbData = JSON.parse(fbText);
            const fbImage = extractImageFromResponse(fbData);
            if (fbImage) {
              console.log(`[generate-fix] ✅ Fallback full regeneration succeeded`);
              return new Response(JSON.stringify({ fixedImage: fbImage, usedBackgroundSegmentation: false }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          } catch { /* fall through to error */ }
        }
      }

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

    const imageResult = extractImageFromResponse(data);

    if (!imageResult) {
      const textContent = data.choices?.[0]?.message?.content || '';
      console.error(`[generate-fix] No image in response. Text: ${textContent.slice(0, 200)}`);

      // If bg-seg returned no image, try full regeneration fallback
      if (usedBackgroundSegmentation) {
        console.warn("[generate-fix] No image from bg-seg, falling back to full regeneration");
        const title = productTitle || generativePrompt || 'Amazon product';
        const fallbackPrompt = customPrompt || buildMainImagePrompt(title, fixCategory, productIdentity);
        const fallbackParts: any[] = [{ type: "text", text: fallbackPrompt }];
        if (imageBase64) {
          fallbackParts.push({ type: "image_url", image_url: { url: toDataUrl(imageBase64) } });
        }
        const fallbackResp = await callGateway(GEMINI_API_KEY, fallbackParts);
        if (fallbackResp.ok) {
          const fbText = await fallbackResp.text();
          try {
            const fbData = JSON.parse(fbText);
            const fbImage = extractImageFromResponse(fbData);
            if (fbImage) {
              console.log(`[generate-fix] ✅ Fallback full regeneration succeeded`);
              return new Response(JSON.stringify({ fixedImage: fbImage, usedBackgroundSegmentation: false }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          } catch { /* fall through */ }
        }
      }

      return new Response(JSON.stringify({
        error: "No image generated. The AI returned text only. Try a different prompt.",
        errorType: "no_image_returned",
        modelTextSnippet: textContent.slice(0, 240) || null,
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[generate-fix] ✅ Image generated successfully (bgSeg=${usedBackgroundSegmentation}, model=${model})`);

    return new Response(JSON.stringify({
      fixedImage: imageResult,
      usedBackgroundSegmentation,
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
