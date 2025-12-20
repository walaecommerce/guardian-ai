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
      originalImageBase64, 
      generatedImageBase64, 
      imageType, 
      mainImageBase64 
    } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const isMain = imageType === 'MAIN';
    
    const systemPrompt = `You are an Amazon compliance verification expert. Your job is to verify that an AI-generated image meets Amazon's requirements.

VERIFICATION CRITERIA:
${isMain ? `
MAIN IMAGE REQUIREMENTS:
- Background MUST be pure white RGB(255,255,255)
- NO text overlays, watermarks, or badges
- Product should occupy 85%+ of frame
- Product identity MUST match the original exactly (same product, labels, colors)
` : `
SECONDARY IMAGE REQUIREMENTS:
- Lifestyle background preserved (NOT replaced with white)
- Only prohibited badges removed (Best Seller, Amazon's Choice)
- Product identity MUST match the original AND the main product image
- Infographic text and context preserved
`}

CRITICAL CHECKS:
1. Is the product in the generated image the SAME product as the original?
2. Are product labels, branding, and colors preserved exactly?
3. Have compliance issues been fixed without introducing new ones?
${!isMain ? '4. Does the product match the main product reference (if provided)?' : ''}

Return JSON:
{
  "score": <0-100>,
  "isSatisfactory": boolean (true if score >= 85),
  "productMatch": boolean (true if same product as original),
  "critique": "Specific issues found that need fixing",
  "improvements": ["List of specific improvements to make"],
  "passedChecks": ["List of checks that passed"],
  "failedChecks": ["List of checks that failed"]
}`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
    ];

    // Build content array with images
    const content: any[] = [
      { type: "text", text: "Verify this AI-generated image against the original:" },
      { type: "text", text: "ORIGINAL IMAGE:" },
      { type: "image_url", image_url: { url: originalImageBase64 } },
      { type: "text", text: "GENERATED IMAGE:" },
      { type: "image_url", image_url: { url: generatedImageBase64 } },
    ];

    // Add main image reference for secondary images
    if (!isMain && mainImageBase64) {
      content.push(
        { type: "text", text: "MAIN PRODUCT REFERENCE (generated image must show this same product):" },
        { type: "image_url", image_url: { url: mainImageBase64 } }
      );
    }

    messages.push({ role: "user", content });

    console.log(`Verifying ${imageType} image...`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const responseContent = data.choices?.[0]?.message?.content || "";
    
    const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse verification result");
    }
    
    const verification = JSON.parse(jsonMatch[0]);
    console.log(`Verification complete. Score: ${verification.score}, Satisfactory: ${verification.isSatisfactory}`);

    return new Response(JSON.stringify(verification), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Verification error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
