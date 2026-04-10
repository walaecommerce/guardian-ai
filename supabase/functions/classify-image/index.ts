import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { MODELS } from "../_shared/models.ts";
import { fetchGemini } from "../_shared/gemini.ts";
import { resolveAuth } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ClassificationResult {
  category: string;
  confidence: number;
  reasoning: string;
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
    const { geminiApiKey } = await resolveAuth(req);

    const { imageBase64, productTitle, asin } = await req.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: 'imageBase64 is required', errorType: 'missing_image' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contextInfo = productTitle ? `Product: "${productTitle}"` : '';
    const asinInfo = asin ? `ASIN: ${asin}` : '';

    const systemPrompt = `You are an expert Amazon product image classifier. Your task is to analyze product listing images and classify them into specific categories based on their CONTENT, not their position in the listing.

IMPORTANT: "MAIN" is a POSITION designation (first image in listing), NOT a content category. Do NOT use "MAIN" as a category.

Categories to classify based on image CONTENT:
1. PRODUCT_SHOT - Product photographed on a clean/white background, no text overlays, badges, or graphics. Just the product clearly visible. This is what Amazon requires for the first listing position.
2. INFOGRAPHIC - Image with text callouts, feature highlights, specifications, bullet points, diagrams, or educational content about the product.
3. LIFESTYLE - Product shown in a real-world setting or environment. May include people, rooms, outdoor scenes, or contextual backgrounds.
4. PRODUCT_IN_USE - Someone actively using or demonstrating the product. Focus is on the action/usage.
5. SIZE_CHART - Dimensions, measurements, size comparisons, or measurement graphics.
6. COMPARISON - Before/after shots, vs competitors, feature comparison tables, or side-by-side comparisons.
7. PACKAGING - Shows the product box, packaging, or what's included in the box.
8. DETAIL - Close-up or zoom shot of specific product features, textures, or components.

Respond with ONLY a JSON object in this exact format:
{
  "category": "CATEGORY_NAME",
  "confidence": 85,
  "reasoning": "Brief explanation of why this category"
}`;

    const userPrompt = `Classify this Amazon product image.
${contextInfo}
${asinInfo}

Analyze the image and determine which category it belongs to based on its visual characteristics.`;

    console.log(`[classify-image] using model: ${MODELS.analysis} via Google Gemini API`);

    const response = await fetchGemini({
      apiKey: geminiApiKey,
      model: MODELS.analysis,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            { type: "image_url", image_url: { url: toDataUrl(imageBase64) } },
          ],
        },
      ],
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded.", errorType: "rate_limit", category: 'UNKNOWN', confidence: 0 }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (response.status === 402) {
      console.warn('[classify-image] AI credits exhausted');
      return new Response(JSON.stringify({ error: "Gemini API quota exceeded.", errorType: "payment_required", category: 'UNKNOWN', confidence: 0, reasoning: 'AI credits exhausted' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[classify-image] Gemini API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `Gemini API error (${response.status})`, errorType: 'gateway_error', category: 'UNKNOWN', confidence: 0 }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const responseText = await response.text();
    if (!responseText || responseText.trim().length === 0) {
      console.error("[classify-image] Empty response from Gemini");
      return new Response(JSON.stringify({ error: "Empty response from Gemini API", category: "UNKNOWN", confidence: 0 }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let data: any;
    try { data = JSON.parse(responseText); } catch {
      console.error("[classify-image] Invalid JSON from Gemini:", responseText.substring(0, 300));
      return new Response(JSON.stringify({ error: "Invalid JSON from Gemini API", category: "UNKNOWN", confidence: 0 }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const content = data.choices?.[0]?.message?.content || '';

    console.log('[classify-image] AI response:', content);

    let result: ClassificationResult;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');
      result = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('[classify-image] Failed to parse AI response:', parseError);
      result = { category: 'UNKNOWN', confidence: 0, reasoning: 'Failed to parse classification result' };
    }

    if (result.category === 'MAIN') result.category = 'PRODUCT_SHOT';

    const validCategories = ['PRODUCT_SHOT', 'INFOGRAPHIC', 'LIFESTYLE', 'PRODUCT_IN_USE', 'SIZE_CHART', 'COMPARISON', 'PACKAGING', 'DETAIL', 'UNKNOWN'];
    if (!validCategories.includes(result.category)) result.category = 'UNKNOWN';

    console.log('[classify-image] Classification result:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    // Handle auth/BYOK errors from resolveAuth
    if ((error as any)?.status === 401 || (error as any)?.status === 403) {
      return new Response(JSON.stringify({ error: (error as any)?.message || "Unauthorized", errorType: (error as any)?.errorType || "auth_error" }), {
        status: (error as any)?.status || 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error('[classify-image] Classification error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error', errorType: 'classification_failed', category: 'UNKNOWN', confidence: 0 }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
