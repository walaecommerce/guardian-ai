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
      mainImageBase64, // Reference image for secondary images
      previousCritique // Feedback from failed verification
    } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const isMain = imageType === 'MAIN';
    
    // Build prompt with context
    let prompt = generativePrompt || (isMain 
      ? "Transform this product image to be Amazon MAIN image compliant: Place the product on a pure white RGB(255,255,255) background. Remove ALL text overlays, badges, watermarks. Keep the product centered and occupying 85% of the frame. Preserve exact product identity including labels, branding, shape, colors. High resolution, sharp focus."
      : "Make this image Amazon compliant while PRESERVING the lifestyle context and scene. Only remove prohibited elements like 'Best Seller' or 'Amazon's Choice' badges. Keep any infographic text if present. Maintain the natural background and setting. Preserve the exact product identity.");

    // Add previous critique for retry attempts
    if (previousCritique) {
      prompt += `\n\nIMPORTANT - PREVIOUS ATTEMPT FAILED. Fix these issues:\n${previousCritique}`;
    }

    // Add cross-reference instruction for secondary images
    if (!isMain && mainImageBase64) {
      prompt += "\n\nCRITICAL: The product in this image MUST match the main product image exactly - same product, same labels, same colors.";
    }

    console.log(`Generating ${imageType} fix... ${previousCritique ? '(retry with critique)' : ''}`);

    // Build content array with images
    const content: any[] = [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: imageBase64 } }
    ];

    // Add main image reference for secondary images
    if (!isMain && mainImageBase64) {
      content.push(
        { type: "text", text: "Reference: This is the MAIN product image. Your output must show this same product:" },
        { type: "image_url", image_url: { url: mainImageBase64 } }
      );
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image-preview",
        messages: [
          { role: "user", content }
        ],
        modalities: ["image", "text"]
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait and try again." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const generatedImage = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    
    if (!generatedImage) {
      throw new Error("No image generated");
    }

    console.log("Image fix generated successfully");

    return new Response(JSON.stringify({ fixedImage: generatedImage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Generation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
