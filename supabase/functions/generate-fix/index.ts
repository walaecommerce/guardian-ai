import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { MODELS } from "../_shared/models.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const parseGeminiError = (status: number, errorText: string): { message: string; errorType: string; retryable: boolean } => {
  try {
    const errorJson = JSON.parse(errorText);
    const apiMessage = errorJson?.error?.message || '';
    
    if (status === 429) {
      return { message: "Rate limit exceeded. Please wait a moment and try again.", errorType: "rate_limit", retryable: true };
    }
    if (status === 403) {
      return { message: "API key invalid or quota exceeded. Please check your Google Gemini API key.", errorType: "auth_error", retryable: false };
    }
    if (status === 400) {
      if (apiMessage.includes('MIME type')) {
        return { message: `Invalid image format: ${apiMessage}`, errorType: "invalid_image", retryable: false };
      }
      if (apiMessage.includes('safety')) {
        return { message: "Image was blocked by safety filters. Please try a different image.", errorType: "safety_block", retryable: false };
      }
      return { message: `Invalid request: ${apiMessage}`, errorType: "bad_request", retryable: false };
    }
    if (status === 500 || status === 502 || status === 503) {
      return { message: "Google AI service temporarily unavailable. Retrying...", errorType: "server_error", retryable: true };
    }
    return { message: apiMessage || `API error (${status})`, errorType: "unknown", retryable: status >= 500 };
  } catch {
    return { message: `API error (${status}): ${errorText.substring(0, 100)}`, errorType: "unknown", retryable: status >= 500 };
  }
};

const fetchWithRetry = async (url: string, options: RequestInit, maxRetries = MAX_RETRIES): Promise<Response> => {
  let lastError: Error | null = null;
  let delay = INITIAL_DELAY_MS;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      
      const errorText = await response.text();
      const parsedError = parseGeminiError(response.status, errorText);
      console.log(`[Guardian] Attempt ${attempt}/${maxRetries}: ${parsedError.message}`);
      
      if (!parsedError.retryable || attempt === maxRetries) {
        return new Response(errorText, { status: response.status, headers: response.headers });
      }
      
      console.log(`[Guardian] Retrying in ${delay}ms...`);
      await sleep(delay);
      delay *= 2;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[Guardian] Attempt ${attempt}/${maxRetries} failed:`, lastError.message);
      if (attempt === maxRetries) throw lastError;
      await sleep(delay);
      delay *= 2;
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
};

// --- Image helpers ---

const guessImageMimeType = (base64DataRaw: string): string => {
  const b = (base64DataRaw || '').trim();
  if (b.startsWith('/9j/')) return 'image/jpeg';
  if (b.startsWith('iVBOR')) return 'image/png';
  if (b.startsWith('R0lGOD')) return 'image/gif';
  if (b.startsWith('UklGR')) return 'image/webp';
  return 'image/jpeg';
};

const normalizeMimeType = (raw: string, base64Data: string): string => {
  const mt = (raw || '').toLowerCase().trim();
  if (mt === 'image/jpg') return 'image/jpeg';
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  return allowed.has(mt) ? mt : guessImageMimeType(base64Data);
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

// --- Main handler ---

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
      productAsin,
      customPrompt,
      verifiedProductClaims,
      spatialAnalysis,
    } = await req.json();

    const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GOOGLE_GEMINI_API_KEY) {
      throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
    }

    const isMain = imageType === 'MAIN';

    // --- Build spatial-aware prompt sections ---

    const buildProtectedZonesText = () => {
      if (!spatialAnalysis) return '';
      const zones: string[] = [];
      if (spatialAnalysis.textZones?.length > 0) {
        for (const zone of spatialAnalysis.textZones) {
          zones.push(`- TEXT ZONE [${zone.id}] at ${zone.location}: "${zone.content}" (bounds: top ${zone.bounds?.top}%, left ${zone.bounds?.left}%, ${zone.bounds?.width}%x${zone.bounds?.height}%) - DO NOT TOUCH`);
        }
      }
      if (spatialAnalysis.protectedAreas?.length > 0) {
        for (const area of spatialAnalysis.protectedAreas) {
          zones.push(`- PROTECTED [${area.id}]: ${area.description} (bounds: top ${area.bounds?.top}%, left ${area.bounds?.left}%, ${area.bounds?.width}%x${area.bounds?.height}%) - DO NOT MODIFY`);
        }
      }
      if (spatialAnalysis.productZones?.length > 0) {
        for (const zone of spatialAnalysis.productZones) {
          zones.push(`- PRODUCT [${zone.id}] at ${zone.location}: ${zone.type}, covers ${zone.coverage}% of frame - PRESERVE EXACTLY`);
        }
      }
      return zones.length > 0 ? zones.join('\n') : '';
    };

    const buildRemovalInstructions = () => {
      if (!spatialAnalysis?.overlayElements?.length) return '';
      const removals = spatialAnalysis.overlayElements
        .filter((el: any) => el.action === 'remove' && !el.isPartOfPackaging)
        .map((el: any) => `- REMOVE [${el.id}]: ${el.type} at ${el.location} (bounds: top ${el.bounds?.top}%, left ${el.bounds?.left}%, ${el.bounds?.width}%x${el.bounds?.height}%) via INPAINTING - match surrounding background`);
      return removals.length > 0 ? removals.join('\n') : '';
    };

    const protectedZonesText = buildProtectedZonesText();
    const removalInstructions = buildRemovalInstructions();

    // --- Build prompt ---

    let prompt: string;

    if (customPrompt) {
      prompt = customPrompt;
      console.log("[Guardian] Using custom prompt from user");
    } else if (isMain) {
      prompt = generativePrompt || `Generate a clean product photo for e-commerce use:

TASK: Create a professional Amazon-style MAIN product image.

REQUIREMENTS:
1. BACKGROUND: Pure white (#FFFFFF). No gradients, no shadows on background.
2. REMOVE: Any promotional badges, stickers, or overlay graphics (not part of actual product packaging).
3. FRAMING: Product centered, filling ~85% of frame.

PRESERVE EXACTLY:
- The product itself unchanged
- All text/labels that are physically ON the product packaging
- Product colors, shape, proportions

OUTPUT: Clean product photo on white background, professional quality.`;
    } else {
      prompt = `Edit the second image by making ONLY these changes:

TASK: Remove promotional overlays while keeping everything else identical.
IMPORTANT: You MUST directly generate and return a modified image. Do NOT call any functions or tools. Output the edited image directly.

REMOVE (if present):
- Award badges or "best seller" ribbons
- Star rating overlays
- "Prime" logos (unless printed on actual product)
- Promotional text like "Sale" or "Deal"
- Third-party watermarks

PRESERVE EXACTLY (do not modify):
- The product and its packaging
- All text that is physically printed on the product
- The background scene/setting
- Any informational graphics or size callouts
- The overall composition and layout

${protectedZonesText ? `PROTECTED AREAS (do not touch):\n${protectedZonesText}\n` : ''}
${removalInstructions ? `SPECIFIC REMOVALS:\n${removalInstructions}\n` : ''}

OUTPUT: Return the edited image directly. Same image with only prohibited overlays removed.`;
    }

    if (previousCritique) {
      prompt += `\n\nISSUES TO FIX: ${previousCritique}`;
    }

    if (previousGeneratedImage) {
      prompt += `\n\nRETRY MODE: Compare with previous attempt and fix mistakes.`;
    }

    console.log(`[Guardian] 🔧 MODEL: ${MODELS.imageGen}`);
    console.log(`[Guardian] Generating ${imageType} fix...${previousCritique ? ' (retry with critique)' : ''}${previousGeneratedImage ? ' (comparing with previous attempt)' : ''}`);

    // --- Extract images ---

    const originalImage = imageBase64 ? extractBase64(imageBase64) : null;
    const prevImage = previousGeneratedImage ? extractBase64(previousGeneratedImage) : null;
    const mainRefImage = !isMain && mainImageBase64 ? extractBase64(mainImageBase64) : null;

    if (mainRefImage) {
      console.log("[Guardian] Cross-referencing with main image for secondary fix");
    }

    // --- Build request parts based on image type ---

    const buildParts = (promptText: string) => {
      const parts: any[] = [];

      if (isMain) {
        // MAIN image: text-to-image generation
        // Send original image for reference + edit instruction
        if (originalImage?.data) {
          parts.push({ text: promptText });
          parts.push({
            inline_data: {
              mime_type: originalImage.mimeType,
              data: originalImage.data,
            },
          });
        } else {
          // Pure text-to-image (no source image)
          parts.push({ text: promptText });
        }
      } else {
        // SECONDARY image: image-to-image edit
        if (mainRefImage) {
          // Case 3: Secondary with main reference — image to fix first, then main ref
          parts.push({
            text: `${promptText}\n\nThe first image is the one to edit. The second image is a reference showing the correct product — ensure the product identity matches.`,
          });
          if (originalImage?.data) {
            parts.push({
              inline_data: {
                mime_type: originalImage.mimeType,
                data: originalImage.data,
              },
            });
          }
          parts.push({
            inline_data: {
              mime_type: mainRefImage.mimeType,
              data: mainRefImage.data,
            },
          });
          }
        } else {
          // Case 2: Secondary without main reference — just prompt + image
          parts.push({ text: promptText });
          if (originalImage?.data) {
            parts.push({
              inline_data: {
                mime_type: originalImage.mimeType,
                data: originalImage.data,
              },
            });
          }
        }
      }

      // Add previous attempt for comparison if retrying
      if (prevImage) {
        parts.push({ text: "Previous attempt image (for comparison):" });
        parts.push({
          inline_data: {
            mime_type: prevImage.mimeType,
            data: prevImage.data,
          },
        });
      }

      return parts;
    };

    // --- Make API request ---

    const requestImage = async (promptText: string) => {
      const parts = buildParts(promptText);

      const requestBody: any = {
        model: MODELS.imageGen,
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: {
            aspectRatio: "1:1",
            imageSize: "2K",
          },
        },
      };

      console.log(`[Guardian] Request: model=${MODELS.imageGen}, parts=${parts.length}, isMain=${isMain}`);

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
        const parsedError = parseGeminiError(response.status, errorText);
        console.error("[Guardian] Google Gemini API error:", response.status, errorText);
        return { ok: false as const, status: response.status, error: parsedError };
      }

      const data = await response.json();

      let generatedImage: string | null = null;
      let modelText: string | null = null;

      const candidates = data.candidates;

      if (candidates && candidates[0]?.content?.parts) {
        for (const part of candidates[0].content.parts) {
          // Skip thinking tokens — they have thought === true
          if (part.thought === true) {
            continue;
          }

          const inline = part.inlineData || part.inline_data;
          if (inline && inline.data) {
            const mimeType = inline.mimeType || inline.mime_type || "image/png";
            generatedImage = `data:${mimeType};base64,${inline.data}`;
            break;
          }
          if (!modelText && typeof part.text === "string" && part.text.trim()) {
            modelText = part.text.trim();
          }
        }
      }

      const finishReason = candidates?.[0]?.finishReason ?? null;

      return {
        ok: true as const,
        generatedImage,
        finishReason,
        modelText,
        raw: data,
      };
    };

    // --- Primary attempt ---

    const primary = await requestImage(prompt);

    if (!primary.ok) {
      return new Response(
        JSON.stringify({ error: primary.error.message, errorType: primary.error.errorType, statusCode: primary.status }),
        { status: primary.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Fallback if no image returned ---

    const shouldFallback = !primary.generatedImage && primary.finishReason !== "SAFETY";

    const fallbackPrompt = isMain
      ? `Generate a clean Amazon-style MAIN product image.\n- Background must be pure white (#FFFFFF).\n- Remove ONLY promotional overlays/badges/watermarks that are NOT printed on the product packaging.\n- Preserve the product, packaging text, shape, colors, and lighting exactly.\n- Do NOT generate a different product.\n\nReturn an IMAGE (do not reply with text-only).`
      : `Edit the provided image with MINIMAL inpainting-only changes.\n- Remove ONLY promotional overlays/badges/star ratings/watermarks that are NOT part of the real product packaging.\n- Preserve everything else exactly (product, packaging text, background scene, layout, infographics).\n- Do NOT regenerate the product.\n\nReturn an IMAGE (do not reply with text-only).`;

    const finalAttempt = shouldFallback ? await requestImage(fallbackPrompt) : primary;

    if (!finalAttempt.ok) {
      return new Response(
        JSON.stringify({ error: finalAttempt.error.message, errorType: finalAttempt.error.errorType, statusCode: finalAttempt.status }),
        { status: finalAttempt.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!finalAttempt.generatedImage) {
      const finishReason = finalAttempt.finishReason;

      if (finishReason === "SAFETY") {
        return new Response(
          JSON.stringify({ error: "Image generation was blocked by safety filters. Please try a different image.", errorType: "safety_block" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (finishReason === "IMAGE_RECITATION") {
        return new Response(
          JSON.stringify({
            error: "The AI refused to return an image (IMAGE_RECITATION). Try Smart Regenerate or a simpler custom prompt focusing on background/overlay removal only.",
            errorType: "image_recitation",
          }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (finishReason === "MALFORMED_FUNCTION_CALL") {
        return new Response(
          JSON.stringify({
            error: "The AI tried to use internal tools instead of generating an image. Please retry — this is a transient model issue.",
            errorType: "malformed_function_call",
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.error("[Guardian] No image in response:", JSON.stringify(finalAttempt.raw).substring(0, 500));

      return new Response(
        JSON.stringify({
          error: "No image was returned by the AI for this request. Please retry (Smart Regenerate) or simplify the prompt.",
          errorType: "no_image_returned",
          finishReason: finishReason || null,
          modelTextSnippet: finalAttempt.modelText ? finalAttempt.modelText.slice(0, 240) : null,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[Guardian] Image fix generated successfully");

    return new Response(JSON.stringify({ fixedImage: finalAttempt.generatedImage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Guardian] Generation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage, errorType: "generation_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
