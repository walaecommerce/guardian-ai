import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { MODELS } from "../_shared/models.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

// ── Error parser ─────────────────────────────────────────────────

const parseGeminiError = (status: number, errorText: string): { message: string; errorType: string; retryable: boolean } => {
  try {
    const errorJson = JSON.parse(errorText);
    const apiMessage = errorJson?.error?.message || '';

    if (status === 429) return { message: "Rate limit exceeded. Please wait a moment and try again.", errorType: "rate_limit", retryable: true };
    if (status === 403) return { message: "API key invalid or quota exceeded.", errorType: "auth_error", retryable: false };
    if (status === 400) {
      if (apiMessage.includes('safety')) return { message: "Image was blocked by safety filters.", errorType: "safety_block", retryable: false };
      if (apiMessage.includes('MIME type')) return { message: `Invalid image format: ${apiMessage}`, errorType: "invalid_image", retryable: false };
      return { message: `Invalid request: ${apiMessage}`, errorType: "bad_request", retryable: false };
    }
    if (status >= 500) return { message: "Google AI service temporarily unavailable. Retrying...", errorType: "server_error", retryable: true };
    return { message: apiMessage || `API error (${status})`, errorType: "unknown", retryable: status >= 500 };
  } catch {
    return { message: `API error (${status})`, errorType: "unknown", retryable: status >= 500 };
  }
};

// ── Fetch with retry ─────────────────────────────────────────────

const fetchWithRetry = async (url: string, options: RequestInit): Promise<Response> => {
  let lastError: Error | null = null;
  let delay = INITIAL_DELAY_MS;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;

      const errorText = await response.text();
      const parsed = parseGeminiError(response.status, errorText);
      console.log(`[generate-fix] Attempt ${attempt}/${MAX_RETRIES}: ${parsed.message}`);

      if (!parsed.retryable || attempt === MAX_RETRIES) {
        return new Response(errorText, { status: response.status, headers: response.headers });
      }

      await sleep(delay);
      delay *= 2;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[generate-fix] Attempt ${attempt}/${MAX_RETRIES} failed:`, lastError.message);
      if (attempt === MAX_RETRIES) throw lastError;
      await sleep(delay);
      delay *= 2;
    }
  }

  throw lastError || new Error('Max retries exceeded');
};

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

const extractBase64 = (dataUrl: string): { data: string; mimeType: string } => {
  if (dataUrl.startsWith('data:')) {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const data = (match[2] || '').trim();
      return { mimeType: normalizeMimeType(match[1], data), data };
    }
  }
  return { mimeType: 'image/jpeg', data: (dataUrl || '').trim() };
};

// ── Response extractor ───────────────────────────────────────────

const extractImageFromResponse = (data: any): { success: true; imageBase64: string; mimeType: string } | { success: false; error: string; finishReason: string | null; modelText: string | null } => {
  const candidates = data.candidates;
  const finishReason = candidates?.[0]?.finishReason ?? null;
  let modelText: string | null = null;

  if (candidates?.[0]?.content?.parts) {
    for (const part of candidates[0].content.parts) {
      // Skip thinking tokens
      if (part.thought === true) continue;

      const inline = part.inlineData || part.inline_data;
      if (inline && inline.data) {
        const mimeType = inline.mimeType || inline.mime_type || 'image/png';
        return { success: true, imageBase64: inline.data, mimeType };
      }

      if (!modelText && typeof part.text === 'string' && part.text.trim()) {
        modelText = part.text.trim();
      }
    }
  }

  // Map specific finish reasons to user-friendly errors
  if (finishReason === 'SAFETY') {
    return { success: false, error: "Image generation was blocked by safety filters.", finishReason, modelText };
  }
  if (finishReason === 'IMAGE_RECITATION') {
    return { success: false, error: "The AI could not generate a fix for this image. Try a simpler custom prompt.", finishReason, modelText };
  }
  if (finishReason === 'MALFORMED_FUNCTION_CALL') {
    return { success: false, error: "The AI tried to use internal tools instead of generating an image. Please retry.", finishReason, modelText };
  }

  return { success: false, error: "No image generated", finishReason, modelText };
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

    const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GOOGLE_GEMINI_API_KEY) {
      throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
    }

    const isMain = imageType === 'MAIN';
    console.log(`[generate-fix] using model: ${MODELS.imageGen}`);
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

    // ── Construct parts for each pattern ──

    let parts: any[];

    if (isMain) {
      // PATTERN A — MAIN image: text-to-image
      const description = productTitle || generativePrompt || 'Amazon product';
      let prompt = customPrompt || buildMainImagePrompt(description);

      if (previousCritique) {
        prompt += `\n\nPREVIOUS ISSUES TO FIX: ${previousCritique}`;
      }

      parts = [{ text: prompt }];

      // If we have the original image, include it as reference
      if (imageBase64) {
        const img = extractBase64(imageBase64);
        parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } });
      }

      console.log(`[generate-fix] MAIN prompt length: ${prompt.length}, has original ref: ${!!imageBase64}`);

    } else if (mainImageBase64) {
      // PATTERN C — SECONDARY with main reference (two images)
      const mainRef = extractBase64(mainImageBase64);
      const secondary = extractBase64(imageBase64);

      let prompt = customPrompt || `Edit this secondary image. Remove ONLY: Best Seller badges, Amazon's Choice badges, competitor logos. PRESERVE everything else: lifestyle setting, people, props, infographic text, background. Ensure product matches the reference main image provided.`;
      prompt += buildProtectedZonesText();
      prompt += buildRemovalInstructions();

      if (previousCritique) {
        prompt += `\n\nPREVIOUS ISSUES TO FIX: ${previousCritique}`;
      }

      parts = [
        { text: prompt },
        { inline_data: { mime_type: mainRef.mimeType, data: mainRef.data } },
        { inline_data: { mime_type: secondary.mimeType, data: secondary.data } },
      ];

      console.log(`[generate-fix] SECONDARY+REF prompt length: ${prompt.length}`);

    } else {
      // PATTERN B — SECONDARY without main reference (one image)
      const secondary = extractBase64(imageBase64);

      let prompt = customPrompt || buildSecondaryImagePrompt();
      prompt += buildProtectedZonesText();
      prompt += buildRemovalInstructions();

      if (previousCritique) {
        prompt += `\n\nPREVIOUS ISSUES TO FIX: ${previousCritique}`;
      }

      parts = [
        { text: prompt },
        { inline_data: { mime_type: secondary.mimeType, data: secondary.data } },
      ];

      console.log(`[generate-fix] SECONDARY prompt length: ${prompt.length}`);
    }

    // Add previous attempt for comparison if retrying
    if (previousGeneratedImage) {
      const prev = extractBase64(previousGeneratedImage);
      parts.push({ text: "Previous attempt (for comparison — fix the issues noted above):" });
      parts.push({ inline_data: { mime_type: prev.mimeType, data: prev.data } });
    }

    // ── Make API request ──

    const requestBody = {
      model: MODELS.imageGen,
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {
          aspectRatio: "1:1",
          imageSize: "2K",
        },
        thinkingConfig: {
          thinkingLevel: "High",
        },
      },
      tool_config: {
        function_calling_config: {
          mode: "NONE",
        },
      },
    };

    console.log(`[generate-fix] Sending request: parts=${parts.length}, isMain=${isMain}`);

    const response = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.imageGen}:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      const parsed = parseGeminiError(response.status, errorText);
      console.error("[generate-fix] API error:", response.status, errorText);
      return new Response(JSON.stringify({ error: parsed.message, errorType: parsed.errorType }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const result = extractImageFromResponse(data);

    if (!result.success) {
      console.error(`[generate-fix] No image returned. finishReason=${result.finishReason}, text=${result.modelText?.slice(0, 200)}`);

      const statusCode = result.finishReason === 'SAFETY' ? 400
        : result.finishReason === 'IMAGE_RECITATION' ? 422
        : 502;

      return new Response(JSON.stringify({
        error: result.error,
        errorType: result.finishReason?.toLowerCase() || 'no_image_returned',
        finishReason: result.finishReason,
        modelTextSnippet: result.modelText?.slice(0, 240) || null,
      }), {
        status: statusCode,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[generate-fix] ✅ Image generated successfully (${result.mimeType})`);

    return new Response(JSON.stringify({
      fixedImage: `data:${result.mimeType};base64,${result.imageBase64}`,
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
