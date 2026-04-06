import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
  if (dataUrl.startsWith('http://') || dataUrl.startsWith('https://')) return dataUrl;
  return `data:${guessImageMimeType(dataUrl)};base64,${dataUrl}`;
};

const fetchImageAsDataUrl = async (input: string): Promise<string> => {
  if (!input) return '';
  if (input.startsWith('data:')) return input;
  if (input.startsWith('http://') || input.startsWith('https://')) {
    const resp = await fetch(input);
    if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status}`);
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const b64 = btoa(binary);
    const contentType = resp.headers.get('content-type') || 'image/png';
    const mime = normalizeMimeType(contentType, b64);
    return `data:${mime};base64,${b64}`;
  }
  return `data:${guessImageMimeType(input)};base64,${input}`;
};

// ── Main handler ─────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, productTitle } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const imageUrl = await fetchImageAsDataUrl(imageBase64);
    if (!imageUrl) {
      return new Response(JSON.stringify({ error: "Missing image data" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[extract-product-identity] Extracting identity for: ${productTitle?.slice(0, 60)}`);

    const prompt = `Analyze this product image and extract a detailed product identity card. This will be used to ensure consistency across all images in the listing.

Product title for context: "${productTitle || 'Unknown product'}"

Return ONLY valid JSON with this exact structure:
{
  "brandName": "<brand name visible on packaging, or 'Unknown'>",
  "productName": "<product name/variant as shown on label>",
  "dominantColors": ["<hex color 1>", "<hex color 2>", "<hex color 3>"],
  "packagingType": "<bottle|bag|box|tube|jar|can|pouch|blister|sachet|other>",
  "shapeDescription": "<concise description of product shape and proportions>",
  "labelText": ["<key text lines visible on front label>"],
  "keyVisualFeatures": ["<distinctive visual features: cap color, label design, transparent window, etc>"],
  "productDescriptor": "<one paragraph describing this exact product for identity matching — include brand, variant, packaging details, colors, and unique identifiers>"
}`;

    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODELS.analysis,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl } },
          ]
        }],
      }),
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded", errorType: "rate_limit" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted", errorType: "payment_required" }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[extract-product-identity] Gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: `AI gateway error (${response.status})` }), {
        status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const textBlock = data.choices?.[0]?.message?.content || '';
    const clean = textBlock.replace(/```json|```/g, "").trim();

    let identity: any;
    try {
      identity = JSON.parse(clean);
    } catch {
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("[extract-product-identity] Failed to parse:", clean.substring(0, 300));
        return new Response(JSON.stringify({ error: "Failed to parse identity response" }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      identity = JSON.parse(jsonMatch[0]);
    }

    console.log(`[extract-product-identity] ✅ Extracted: ${identity.brandName} - ${identity.productName}`);
    console.log(`[extract-product-identity] Colors: ${identity.dominantColors?.join(', ')}`);
    console.log(`[extract-product-identity] Shape: ${identity.shapeDescription}`);

    return new Response(JSON.stringify({ identity }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[extract-product-identity] Error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Identity extraction failed",
    }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
