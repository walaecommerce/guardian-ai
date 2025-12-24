import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type DecodedImage = { mime: string; buffer: ArrayBuffer };

function decodeImageDataUrl(dataUrl: string): DecodedImage {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
  const mime = match?.[1] ?? 'image/png';
  const base64Data = match?.[2] ?? dataUrl.replace(/^data:image\/\w+;base64,/, '');

  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Deno types can expose ArrayBufferLike; runtime buffer is ArrayBuffer.
  return { mime, buffer: bytes.buffer as ArrayBuffer };
}

function extFromMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  const fromSlash = mime.split('/')[1];
  return fromSlash || 'png';
}

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
      customPrompt
    } = await req.json();
    
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const isMain = imageType === 'MAIN';
    
    // Build comprehensive prompt based on image type
    let prompt: string;
    
    if (customPrompt) {
      prompt = customPrompt;
      console.log("[Guardian] Using custom prompt from user");
    } else if (isMain) {
      prompt = generativePrompt || `## 🔒 CRITICAL: BACKGROUND-ONLY EDIT TASK

You are performing a SURGICAL BACKGROUND REPLACEMENT. This is NOT image generation - it is MINIMAL EDITING.

## ⛔ ABSOLUTE RESTRICTIONS - VIOLATING THESE FAILS THE TASK:
1. DO NOT regenerate, redraw, or recreate the product
2. DO NOT change the product's shape, size, proportions, or orientation
3. DO NOT alter ANY text, labels, logos, or branding on the product
4. DO NOT modify product colors, materials, or surface details
5. DO NOT reposition or resize the product in the frame
6. DO NOT add or remove any product features or accessories
7. The product pixels must remain IDENTICAL to the source image

## ✅ YOUR ONLY ALLOWED CHANGES:
1. Replace the background with PURE WHITE (#FFFFFF)
2. Remove shadows that fall on the background (not on the product)
3. Remove any Amazon badges/overlays floating in the background area
4. Create clean edges where product meets the new white background

## BACKGROUND REPLACEMENT RULES:
- Every pixel that is NOT the product → change to RGB(255,255,255)
- Keep product shadows that fall ON the product itself
- Edge detection must be precise - no halos or white fringing on product
- No gray gradients or soft shadows on the white background

## PROHIBITED OVERLAYS TO REMOVE (if present):
- "Best Seller" ribbons/badges
- "Amazon's Choice" labels
- Star rating overlays
- "Prime" logo overlays
- Promotional tags ("Deal", "Sale", etc.)

## 🎯 SUCCESS CRITERIA:
✓ Someone looking at before/after should see the SAME EXACT product
✓ Only the background changed to white
✓ All product text/labels perfectly readable and unchanged
✓ Product proportions exactly match the original`;
    } else {
      prompt = generativePrompt || `## 🔒 CRITICAL: MINIMAL SURGICAL EDIT TASK FOR SECONDARY IMAGE

This is a PRESERVATION task, not a transformation. Make the MINIMUM changes required.

## ⛔ ABSOLUTE RESTRICTIONS - VIOLATING THESE FAILS THE TASK:
1. DO NOT change the background - keep the lifestyle/context scene EXACTLY as is
2. DO NOT regenerate, redraw, or recreate the product
3. DO NOT alter the product's shape, colors, labels, or branding
4. DO NOT remove infographic text, feature callouts, or annotations
5. DO NOT modify charts, diagrams, or comparison graphics
6. DO NOT change the image composition or layout
7. It is better to make NO changes than to alter the product identity

## 📝 TEXT & GRAPHICS YOU MUST PRESERVE (these are NOT prohibited):
- ✅ Feature callouts (e.g., "Waterproof", "7 Colors", "BPA Free", "Adjustable")
- ✅ Dimension/size annotations and measurements
- ✅ Comparison charts or tables
- ✅ How-to-use illustrations and diagrams
- ✅ Material/ingredient lists
- ✅ Model names and product specifications
- ✅ Before/after demonstrations
- ✅ Lifestyle scene backgrounds
- ✅ Brand logos that are part of the product or legitimate branding

## 🚫 ONLY REMOVE THESE SPECIFIC AMAZON BADGE TYPES:
- "Best Seller" gold/orange ribbon badges (usually in corners)
- "Amazon's Choice" dark label badges
- "#1 Best Seller" ranking overlays
- Star rating graphics (⭐) added as floating overlays
- "Prime" logo badges added as overlays
- "Deal of the Day" promotional tags
- "X% OFF" sale overlays

## 🎯 REMOVAL TECHNIQUE:
- Surgically remove ONLY the badge pixels
- Fill the removed area with content that matches the surroundings
- If a badge overlaps important content, prioritize keeping the content
- If you cannot cleanly remove a badge, LEAVE IT rather than damage the image

## ✅ SUCCESS CRITERIA:
✓ The image looks 95%+ identical to the original
✓ Only floating Amazon promotional badges were removed
✓ ALL product information text and graphics remain intact
✓ Product identity is completely unchanged`;
    }

    // Add previous critique for retry attempts
    if (previousCritique) {
      prompt += `

## ⚠️ PREVIOUS ATTEMPT FAILED - YOU MUST FIX THESE SPECIFIC ISSUES:
${previousCritique}

🔴 CRITICAL RETRY INSTRUCTIONS:
- Your last attempt changed the product too much or had compliance issues
- This time, be MORE CONSERVATIVE with changes
- Focus ONLY on fixing the specific issues mentioned above
- If the critique mentions product mismatch: you changed the product - DON'T do that
- If the critique mentions background issues: focus ONLY on background, leave product alone
- LESS IS MORE: Make minimal changes to achieve compliance`;
    }

    // Add error-aware regeneration when previous generated image is provided
    if (previousGeneratedImage) {
      prompt += `

## 🔄 CORRECTION MODE - YOU MADE MISTAKES BEFORE:
Your previous attempt was rejected. Common mistakes you may have made:
1. ❌ You regenerated the entire product instead of just editing the background
2. ❌ You changed product labels, text, or branding
3. ❌ You altered the product's shape or proportions
4. ❌ You removed text/graphics that should have been kept (feature callouts, dimensions)
5. ❌ You changed the product color or materials

🎯 THIS TIME:
- Make the MINIMUM possible changes
- If in doubt, change LESS not MORE
- The product must be recognizable as the SAME EXACT product
- Only touch background (for MAIN) or specific badges (for SECONDARY)`;
    }

    // Add product context to ensure correct product identity
    if (productTitle || productAsin) {
      prompt += `

## 📦 PRODUCT IDENTITY LOCK:
${productTitle ? `This is: "${productTitle}"` : ''}
${productAsin ? `ASIN: ${productAsin}` : ''}
The output MUST show this EXACT product with all its distinctive features intact.
If your output looks like a different product, YOU HAVE FAILED.`;
    }

    // Add cross-reference instruction for secondary images
    if (!isMain && mainImageBase64) {
      prompt += `

## 🔗 CONSISTENCY CHECK:
The product must match the main listing image exactly.
Same product, same branding, same identifying features.`;
    }

    console.log(`[Guardian] Generating ${imageType} fix using OpenAI gpt-image-1...${previousCritique ? ' (retry with critique)' : ''}${previousGeneratedImage ? ' (comparing with previous attempt)' : ''}`);

    const { mime, buffer } = decodeImageDataUrl(imageBase64);
    const ext = extFromMime(mime);

    // Create FormData for the API request
    const formData = new FormData();

    // Use a real file upload (required by OpenAI images/edits)
    const file = new File([buffer], `image.${ext}`, { type: mime });
    formData.append('image', file);
    formData.append('prompt', prompt);
    formData.append('model', 'gpt-image-1');
    formData.append('n', '1');
    formData.append('size', '1024x1024');

    console.log(`[Guardian] Sending OpenAI images/edits as multipart/form-data (${mime})`);

    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: new Headers({
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      }),
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Guardian] OpenAI API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: "Rate limit exceeded. Please wait a moment and try again.",
          errorType: "rate_limit"
        }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      if (response.status === 402 || response.status === 401) {
        return new Response(JSON.stringify({ 
          error: "OpenAI API key issue. Please check your API key has sufficient credits.",
          errorType: "payment_required"
        }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    // OpenAI returns b64_json by default for gpt-image-1
    const generatedImageB64 = data.data?.[0]?.b64_json;
    const generatedImageUrl = data.data?.[0]?.url;
    
    let fixedImage: string;
    if (generatedImageB64) {
      fixedImage = `data:image/png;base64,${generatedImageB64}`;
    } else if (generatedImageUrl) {
      fixedImage = generatedImageUrl;
    } else {
      console.error("[Guardian] No image in response:", data);
      throw new Error("No image generated");
    }

    console.log("[Guardian] Image fix generated successfully with OpenAI");

    return new Response(JSON.stringify({ fixedImage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Guardian] Generation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
