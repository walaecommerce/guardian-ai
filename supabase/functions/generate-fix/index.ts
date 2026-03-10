import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { MODELS } from "../_shared/models.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

// ── Prompt builders ──────────────────────────────────────────────

function buildMainImagePrompt(description: string): string {
  return `Generate a product photograph. Requirements:
- Pure white background RGB(255,255,255) — no shadows, gradients, or tints whatsoever
- Remove ALL text overlays, badges, watermarks, promotional elements
- Preserve exact product identity: same label design, colors, shape, size proportions
- Product must fill 85% of the frame
- Professional studio lighting, sharp focus, high resolution
- Amazon main image compliant

Product description: ${description}`;
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
    } = await req.json();

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
      const description = productTitle || generativePrompt || 'Amazon product';
      let prompt = customPrompt || buildMainImagePrompt(description);
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
