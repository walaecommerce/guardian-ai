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
    const { imageBase64, imageType, listingTitle } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const isMain = imageType === 'MAIN';
    
    const systemPrompt = `You are an Amazon product listing compliance expert. Analyze images for Amazon FBA policy violations.

For MAIN images, check:
- Background MUST be pure white RGB(255,255,255)
- NO text overlays, watermarks, promotional badges
- Product should occupy 85%+ of the frame
- High resolution and sharp focus
- NO "Best Seller", "Amazon's Choice" badges

For SECONDARY images:
- Lifestyle/textured backgrounds are ALLOWED
- Infographic text is ALLOWED but must be readable
- Same badge restrictions as main images

Also perform OCR to detect packaging text and compare with the listing title for content consistency.

Return your analysis as a JSON object with this exact structure:
{
  "overallScore": <0-100>,
  "status": "PASS" or "FAIL",
  "mainImageAnalysis": {
    "backgroundCheck": { "isCompliant": boolean, "detectedColor": string, "message": string },
    "textOverlayCheck": { "isCompliant": boolean, "detectedText": string[], "message": string },
    "productOccupancy": { "percentage": number, "isCompliant": boolean, "message": string },
    "imageQuality": { "score": number, "issues": string[], "message": string }
  },
  "contentConsistency": {
    "packagingTextDetected": string,
    "discrepancies": string[],
    "isConsistent": boolean
  },
  "violations": [{ "severity": "critical"|"warning"|"info", "category": string, "message": string, "recommendation": string }],
  "fixRecommendations": string[],
  "generativePrompt": string
}`;

    const userPrompt = `Analyze this ${isMain ? 'MAIN' : 'SECONDARY'} Amazon product image for compliance.
${listingTitle ? `Listing Title: "${listingTitle}"` : 'No listing title provided.'}
Check all compliance rules and return detailed JSON analysis.`;

    console.log(`Analyzing ${imageType} image...`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { 
            role: "user", 
            content: [
              { type: "text", text: userPrompt },
              { type: "image_url", image_url: { url: imageBase64 } }
            ]
          }
        ],
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
    const content = data.choices?.[0]?.message?.content || "";
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse analysis result");
    }
    
    const analysis = JSON.parse(jsonMatch[0]);
    console.log(`Analysis complete. Score: ${analysis.overallScore}`);

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Analysis error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
