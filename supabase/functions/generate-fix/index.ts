import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      prompt = generativePrompt || `Transform this product image into an Amazon MAIN image that is 100% compliant:

## CRITICAL REQUIREMENTS - MUST FOLLOW EXACTLY:

### 1. BACKGROUND TRANSFORMATION
- Replace ENTIRE background with PURE WHITE: RGB(255,255,255)
- This means EVERY pixel that is not the product must be #FFFFFF
- Remove ALL shadows, gradients, or off-white tones
- Create clean, crisp edges between product and background
- NO gray areas, NO subtle shadows, NO gradient falloffs

### 2. PRODUCT PRESERVATION (HIGHEST PRIORITY)
- The product must remain EXACTLY as it appears in the original
- Preserve ALL product labels, text, and branding PRECISELY
- Maintain exact colors, shapes, and proportions
- Keep all product details sharp and unchanged
- DO NOT alter, enhance, or "improve" the product itself

### 3. PROHIBITED ELEMENTS - REMOVE COMPLETELY
- "Best Seller" badges or ribbons
- "Amazon's Choice" labels
- Star ratings or review counts
- "Prime" logos (unless on actual packaging)
- "Deal" or "Sale" tags
- ANY promotional overlays
- Watermarks or third-party logos

### 4. FRAMING & COMPOSITION
- Product should occupy 85% of the frame
- Center the product perfectly
- Square 1:1 aspect ratio
- No cropping of product edges
- Professional studio lighting appearance

### 5. QUALITY STANDARDS
- High resolution output
- Sharp focus throughout
- No compression artifacts
- Professional appearance`;
    } else {
      prompt = generativePrompt || `Edit this SECONDARY Amazon product image while PRESERVING its context:

## CRITICAL REQUIREMENTS:

### 1. CONTEXT PRESERVATION (HIGHEST PRIORITY)
- KEEP the lifestyle background/scene EXACTLY as is
- DO NOT replace background with white
- Maintain the infographic layout if present
- Preserve all product demonstration context

### 2. PRODUCT IDENTITY
- The product shown must remain IDENTICAL
- Same labels, same colors, same branding
- No alterations to the product itself
- Keep product positioning unchanged

### 3. REMOVE ONLY PROHIBITED ELEMENTS:
- "Best Seller" badges (gold/orange ribbon style)
- "Amazon's Choice" labels (dark orange/black)
- "#1 Best Seller" or ranking overlays
- Star ratings added as overlays (not on packaging)
- "Prime" logos added as overlays
- Promotional text like "30% OFF" 
- "Deal of the Day" tags

### 4. PRESERVE ALLOWED ELEMENTS:
- Product feature callouts ("Waterproof", "BPA Free")
- Dimension/size annotations
- Ingredient lists or material info
- Comparison charts
- Before/after demonstrations
- How-to-use illustrations

### 5. QUALITY
- Maintain original image quality
- Clean removal of prohibited elements
- Seamless editing with no visible artifacts`;
    }

    // Add previous critique for retry attempts
    if (previousCritique) {
      prompt += `

## ⚠️ PREVIOUS ATTEMPT FAILED VERIFICATION - FIX THESE ISSUES:
${previousCritique}

This is a retry. The previous generated image had problems. You MUST address each issue listed above.
Pay special attention to:
1. Any background color issues mentioned
2. Any product identity/mismatch issues
3. Any remaining badges or prohibited elements
4. Quality or composition problems noted`;
    }

    // Add error-aware regeneration when previous generated image is provided
    if (previousGeneratedImage) {
      prompt += `

## 🔄 REGENERATION MODE - ANALYZE YOUR PREVIOUS MISTAKE:
I am providing THREE images:
1. ORIGINAL - The source image that needs fixing
2. MY PREVIOUS ATTEMPT - What I generated before (which had issues)
3. The reference context if applicable

CRITICAL COMPARISON TASK:
- Look CAREFULLY at your previous attempt
- Compare it pixel-by-pixel with the original product
- Identify EXACTLY where you went wrong:
  * Did you change the product shape?
  * Did you alter labels or text?
  * Did you modify colors incorrectly?
  * Did you leave artifacts or add unwanted elements?
  
Generate a NEW version that:
1. Fixes the specific mistakes from your previous attempt
2. Stays MORE faithful to the original product
3. Only makes the compliance changes (background/badges) without altering the product itself`;
    }

    // Add product context to ensure correct product identity
    if (productTitle || productAsin) {
      prompt += `

## 📦 PRODUCT IDENTITY (CRITICAL):
${productTitle ? `Product: "${productTitle}"` : ''}
${productAsin ? `Amazon ASIN: ${productAsin}` : ''}
The output image MUST show THIS EXACT product. Do NOT generate a different or generic product.
Preserve ALL visible branding, model numbers, and product-specific features.`;
    }

    // Add cross-reference instruction for secondary images
    if (!isMain && mainImageBase64) {
      prompt += `

## 🔗 CROSS-REFERENCE REQUIREMENT:
The product in your output MUST be visually consistent with the main product image.
Same product, same labels, same branding, same colors.
This ensures listing coherence across all images.`;
    }

    console.log(`[Guardian] Generating ${imageType} fix using OpenAI gpt-image-1...${previousCritique ? ' (retry with critique)' : ''}${previousGeneratedImage ? ' (comparing with previous attempt)' : ''}`);

    // Build the prompt with image context for OpenAI
    let fullPrompt = prompt;
    
    // Note: OpenAI's image generation API takes the source image directly
    // We'll edit the provided image based on the prompt

    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        image: imageBase64,
        prompt: fullPrompt,
        n: 1,
        size: "1024x1024",
        quality: "high"
      }),
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
