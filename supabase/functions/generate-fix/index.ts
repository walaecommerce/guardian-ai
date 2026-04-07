import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { MODELS } from "../_shared/models.ts";
import { useCredit, createAdminClient } from "../_shared/credits.ts";

const GATEWAY_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
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

function buildBackgroundReplacementPrompt(title: string, category: FixCategory, identity?: any): string {
  let prompt = `BACKGROUND-ONLY EDIT + BADGE REMOVAL — STRICT RULES:
1. Replace the background with pure white RGB(255,255,255) — not off-white, not grey
2. REMOVE all promotional badges, overlays, and stickers (e.g. "Best Seller", "Amazon's Choice", "#1 New Release", any ribbon/seal/starburst graphics) — these are NOT part of the product
3. DO NOT modify, regenerate, recolor, or alter the actual product (bottle, box, packaging) in any way
4. DO NOT change label text, logos, colors, shape, or any product detail that is printed ON the packaging
5. DO NOT crop or reposition the product
6. Ensure the product occupies 85%+ of the frame
7. Remove any shadows that are not directly beneath the product
8. Add a soft, natural shadow directly beneath the product
9. Clean up any background artifacts or noise around product edges
10. The result must look like a professional studio photograph on seamless white

IMPORTANT DISTINCTION: Promotional badges/overlays are digitally added ON TOP of the photograph and must be removed. Product labels/logos are physically printed ON the packaging and must be preserved.

${CATEGORY_BG_NOTES[category]}

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

function buildSecondaryImagePrompt(identity?: any): string {
  let prompt = `Edit this product image with MINIMAL targeted changes only:
- REMOVE: "Best Seller" badges, "Amazon's Choice" badges, competitor logos, unreadable text
- PRESERVE EVERYTHING ELSE: lifestyle setting, background scene, people, props, infographic text, annotations, product context
- Do NOT change the background
- Do NOT remove informational text or callouts
- Do NOT regenerate the product — it must remain pixel-identical
- Make the smallest possible edit to achieve compliance`;
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

async function callGateway(apiKey: string, contentParts: any[], model?: string): Promise<Response> {
  return fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || MODELS.imageGen,
      messages: [{ role: "user", content: contentParts }],
      modalities: ["image", "text"],
    }),
  });
}

function extractImageFromResponse(data: any): string | null {
  return data?.choices?.[0]?.message?.images?.[0]?.image_url?.url || null;
}

// ── OpenAI Masked Inpainting (Tier 2) ───────────────────────────

function generateMaskPng(overlayElements: any[], imageWidth: number, imageHeight: number): string {
  // Build a minimal PNG with white rectangles over removal zones, transparent elsewhere
  // Using raw PNG byte construction (no canvas dependency)
  const w = imageWidth || 1024;
  const h = imageHeight || 1024;

  // Create RGBA pixel data: all transparent initially
  const pixels = new Uint8Array(w * h * 4);
  // All zeros = fully transparent black (which OpenAI treats as "don't edit")

  for (const el of overlayElements) {
    if (el.action !== 'remove' || el.isPartOfPackaging) continue;
    const bounds = el.bounds;
    if (!bounds) continue;

    // bounds can be percentages (0-100) or pixels — normalize to pixels
    const bTop = bounds.top <= 1 ? Math.floor(bounds.top * h) : Math.floor((bounds.top / 100) * h);
    const bLeft = bounds.left <= 1 ? Math.floor(bounds.left * w) : Math.floor((bounds.left / 100) * w);
    const bWidth = bounds.width <= 1 ? Math.floor(bounds.width * w) : Math.floor((bounds.width / 100) * w);
    const bHeight = bounds.height <= 1 ? Math.floor(bounds.height * h) : Math.floor((bounds.height / 100) * h);

    // Add padding around the badge for cleaner inpainting
    const pad = Math.max(4, Math.floor(Math.min(bWidth, bHeight) * 0.1));
    const x0 = Math.max(0, bLeft - pad);
    const y0 = Math.max(0, bTop - pad);
    const x1 = Math.min(w, bLeft + bWidth + pad);
    const y1 = Math.min(h, bTop + bHeight + pad);

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = (y * w + x) * 4;
        pixels[idx] = 255;     // R
        pixels[idx + 1] = 255; // G
        pixels[idx + 2] = 255; // B
        pixels[idx + 3] = 255; // A (opaque white = "edit this area")
      }
    }
  }

  // Encode as PNG using minimal encoder
  return encodePng(w, h, pixels);
}

// Minimal PNG encoder for RGBA data
function encodePng(width: number, height: number, rgba: Uint8Array): string {
  const crc32Table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    crc32Table[i] = c;
  }
  const crc32 = (data: Uint8Array) => {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) c = crc32Table[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };

  // Build raw scanlines with filter byte 0 (None) per row
  const rawSize = height * (1 + width * 4);
  const raw = new Uint8Array(rawSize);
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0; // filter: None
    const rowStart = y * width * 4;
    raw.set(rgba.subarray(rowStart, rowStart + width * 4), offset);
    offset += width * 4;
  }

  // Deflate using DecompressionStream workaround — use store-only deflate
  // For simplicity and Deno compatibility, use uncompressed deflate blocks
  const deflateStore = (input: Uint8Array): Uint8Array => {
    const blocks: Uint8Array[] = [];
    const maxBlock = 65535;
    for (let i = 0; i < input.length; i += maxBlock) {
      const end = Math.min(i + maxBlock, input.length);
      const len = end - i;
      const isLast = end === input.length;
      const header = new Uint8Array(5);
      header[0] = isLast ? 1 : 0;
      header[1] = len & 0xFF;
      header[2] = (len >> 8) & 0xFF;
      header[3] = ~len & 0xFF;
      header[4] = (~len >> 8) & 0xFF;
      blocks.push(header);
      blocks.push(input.subarray(i, end));
    }
    let totalLen = 0;
    for (const b of blocks) totalLen += b.length;
    const result = new Uint8Array(totalLen);
    let off = 0;
    for (const b of blocks) { result.set(b, off); off += b.length; }
    return result;
  };

  // zlib wrapper: CMF + FLG + deflated + Adler32
  const adler32 = (data: Uint8Array): number => {
    let a = 1, b = 0;
    for (let i = 0; i < data.length; i++) {
      a = (a + data[i]) % 65521;
      b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
  };

  const deflated = deflateStore(raw);
  const adler = adler32(raw);
  const zlibData = new Uint8Array(2 + deflated.length + 4);
  zlibData[0] = 0x78; zlibData[1] = 0x01; // CMF + FLG (no compression)
  zlibData.set(deflated, 2);
  const adlerOff = 2 + deflated.length;
  zlibData[adlerOff] = (adler >> 24) & 0xFF;
  zlibData[adlerOff + 1] = (adler >> 16) & 0xFF;
  zlibData[adlerOff + 2] = (adler >> 8) & 0xFF;
  zlibData[adlerOff + 3] = adler & 0xFF;

  // Build PNG chunks
  const makeChunk = (type: string, data: Uint8Array): Uint8Array => {
    const typeBytes = new TextEncoder().encode(type);
    const chunk = new Uint8Array(4 + 4 + data.length + 4);
    const dv = new DataView(chunk.buffer);
    dv.setUint32(0, data.length);
    chunk.set(typeBytes, 4);
    chunk.set(data, 8);
    const crcData = new Uint8Array(4 + data.length);
    crcData.set(typeBytes, 0);
    crcData.set(data, 4);
    dv.setUint32(8 + data.length, crc32(crcData));
    return chunk;
  };

  const ihdr = new Uint8Array(13);
  const ihdrDv = new DataView(ihdr.buffer);
  ihdrDv.setUint32(0, width);
  ihdrDv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', zlibData);
  const iendChunk = makeChunk('IEND', new Uint8Array(0));

  const png = new Uint8Array(signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length);
  let p = 0;
  png.set(signature, p); p += signature.length;
  png.set(ihdrChunk, p); p += ihdrChunk.length;
  png.set(idatChunk, p); p += idatChunk.length;
  png.set(iendChunk, p);

  // Convert to base64
  let binary = '';
  for (let i = 0; i < png.length; i++) binary += String.fromCharCode(png[i]);
  return btoa(binary);
}

function extractRawBase64(dataUrl: string): string {
  if (dataUrl.startsWith('data:')) {
    const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
    return match ? match[1] : dataUrl;
  }
  return dataUrl;
}

async function callOpenAIInpainting(
  openaiKey: string,
  imageBase64: string,
  maskBase64: string,
  prompt: string,
): Promise<string | null> {
  // Convert base64 to Blob for multipart upload
  const imageBytes = Uint8Array.from(atob(extractRawBase64(imageBase64)), c => c.charCodeAt(0));
  const maskBytes = Uint8Array.from(atob(maskBase64), c => c.charCodeAt(0));

  const imageBlob = new Blob([imageBytes], { type: 'image/png' });
  const maskBlob = new Blob([maskBytes], { type: 'image/png' });

  const formData = new FormData();
  formData.append('image', imageBlob, 'image.png');
  formData.append('mask', maskBlob, 'mask.png');
  formData.append('prompt', prompt);
  formData.append('model', 'dall-e-2');
  formData.append('n', '1');
  formData.append('size', '1024x1024');
  formData.append('response_format', 'b64_json');

  console.log(`[generate-fix] Tier 2: Calling OpenAI Image Edits API...`);

  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[generate-fix] OpenAI inpainting error (${response.status}):`, errorText);
    return null;
  }

  const data = await response.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) {
    console.error('[generate-fix] OpenAI returned no image data');
    return null;
  }

  return `data:image/png;base64,${b64}`;
}

// ── Main handler ─────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
    console.log(`[generate-fix] Authenticated user: ${claimsData.claims.sub}`);

    // Deduct fix credit
    try {
      const admin = createAdminClient();
      await useCredit(admin, claimsData.claims.sub as string, 'fix');
    } catch (creditErr: any) {
      if (creditErr?.status === 402) {
        return new Response(
          JSON.stringify({ error: creditErr.message || 'No fix credits remaining', errorType: 'payment_required' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.warn('[generate-fix] Credit check failed, proceeding:', creditErr);
    }

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
      productIdentity,
      useOpenAIInpainting,
    } = await req.json();

    const fixCategory = detectFixCategory(imageCategory, productTitle);
    console.log(`[generate-fix] Detected category: ${fixCategory} (from imageCategory=${imageCategory}, title=${productTitle?.slice(0, 40)})`);

    const GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const isMain = imageType === 'MAIN';
    const isSecondary = !isMain;

    // ── Tier 2: OpenAI Masked Inpainting for secondary images ──
    if (useOpenAIInpainting && isSecondary && spatialAnalysis?.overlayElements?.length > 0) {
      console.log(`[generate-fix] Tier 2 activated: OpenAI Masked Inpainting`);
      const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
      if (!OPENAI_API_KEY) {
        console.error("[generate-fix] OPENAI_API_KEY not configured, falling back to Gemini");
      } else {
        const removableElements = spatialAnalysis.overlayElements.filter(
          (el: any) => el.action === 'remove' && !el.isPartOfPackaging
        );

        if (removableElements.length > 0) {
          const imgW = spatialAnalysis.imageDimensions?.width || 1024;
          const imgH = spatialAnalysis.imageDimensions?.height || 1024;
          const maskBase64 = generateMaskPng(removableElements, imgW, imgH);

          const inpaintPrompt = `Seamlessly fill the removed area to match the surrounding background pattern, texture, and lighting. Do not add any new elements, text, or objects. The edit should be invisible — the removed badge should disappear as if it was never there.`;

          const result = await callOpenAIInpainting(OPENAI_API_KEY, imageBase64, maskBase64, inpaintPrompt);
          if (result) {
            console.log(`[generate-fix] ✅ OpenAI Tier 2 inpainting succeeded`);
            return new Response(JSON.stringify({
              fixedImage: result,
              usedBackgroundSegmentation: false,
              usedOpenAIInpainting: true,
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          console.warn(`[generate-fix] OpenAI inpainting returned null, falling back to Gemini`);
        }
      }
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
        let prompt = customPrompt || buildBackgroundReplacementPrompt(title, fixCategory, productIdentity);
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
      let prompt = customPrompt || buildSecondaryImagePrompt(productIdentity);
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
      let prompt = customPrompt || buildSecondaryImagePrompt(productIdentity);
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
