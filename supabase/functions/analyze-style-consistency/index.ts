import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { MODELS } from "../_shared/models.ts";
import { fetchGemini } from "../_shared/gemini.ts";
import { resolveAuth } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { images, listingTitle } = await req.json();

    if (!images || !Array.isArray(images) || images.length < 2) {
      return new Response(JSON.stringify({
        error: "At least 2 images are required for style consistency analysis",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[style-consistency] Analyzing ${images.length} images for listing: ${listingTitle?.slice(0, 50)}`);

    // Build content parts with all images
    const contentParts: any[] = [
      {
        type: "text",
        text: `You are a professional Amazon listing style consultant. Analyze ALL ${images.length} images from this listing for visual consistency and coherence.

Listing: "${listingTitle || 'Unknown'}"

Evaluate these 6 dimensions across ALL images:

1. **Color Palette Harmony** (0-100): Do the images share a cohesive color palette? Are brand colors consistent? Are there jarring color clashes between images?

2. **Lighting & Exposure** (0-100): Is the lighting style consistent? Are exposure levels similar? Do some images look amateur while others look professional?

3. **Text & Typography Style** (0-100): If infographic/text images exist, do they use consistent fonts, text sizes, and text colors? Are callout styles unified?

4. **Product Angle Consistency** (0-100): Is the product photographed from similar professional angles? Does the product look like the same item across all images?

5. **Background Coherence** (0-100): Do the backgrounds work together as a set? Main should be white, but secondary images should share a visual theme.

6. **Brand Identity** (0-100): Is the brand presence consistent? Logo placement, brand colors, packaging presentation — do they feel like one cohesive brand story?

For each dimension, provide:
- A score (0-100)
- A brief assessment (1-2 sentences)
- Specific issues found (array of strings, empty if none)

Also provide:
- An overall coherence score (weighted average: Color 20%, Lighting 15%, Text 15%, Angle 15%, Background 15%, Brand 20%)
- A 1-sentence overall verdict
- Top 3 actionable recommendations to improve consistency
- Which image pairs have the weakest consistency (by index, 0-based)

Return this EXACT JSON structure:
{
  "overallScore": <0-100>,
  "verdict": "<1-sentence overall assessment>",
  "dimensions": {
    "colorPalette": { "score": <0-100>, "assessment": "<text>", "issues": ["<issue>"] },
    "lighting": { "score": <0-100>, "assessment": "<text>", "issues": ["<issue>"] },
    "typography": { "score": <0-100>, "assessment": "<text>", "issues": ["<issue>"] },
    "productAngle": { "score": <0-100>, "assessment": "<text>", "issues": ["<issue>"] },
    "background": { "score": <0-100>, "assessment": "<text>", "issues": ["<issue>"] },
    "brandIdentity": { "score": <0-100>, "assessment": "<text>", "issues": ["<issue>"] }
  },
  "recommendations": ["<actionable tip 1>", "<actionable tip 2>", "<actionable tip 3>"],
  "weakestPairs": [{ "imageA": <index>, "imageB": <index>, "reason": "<why>" }]
}`
      }
    ];

    // Add each image
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      contentParts.push({
        type: "text",
        text: `Image ${i + 1} (${img.type || 'SECONDARY'}, ${img.category || 'unknown'}):`
      });
      contentParts.push({
        type: "image_url",
        image_url: { url: img.url }
      });
    }

    contentParts.push({
      type: "text",
      text: "Analyze ALL images above for cross-image style consistency. Return the JSON structure exactly."
    });

    // Call gateway
    const response = await fetchGemini({
      model: MODELS.analysis,
      messages: [{ role: "user", content: contentParts }],
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded.", errorType: "rate_limit" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted.", errorType: "payment_required" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[style-consistency] Gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: `AI gateway error (${response.status})` }), {
        status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const textBlock = data.choices?.[0]?.message?.content || '';

    if (!textBlock) {
      return new Response(JSON.stringify({ error: "No content returned from AI" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clean = textBlock.replace(/```json|```/g, "").trim();
    let result: any;
    try {
      result = JSON.parse(clean);
    } catch {
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return new Response(JSON.stringify({ error: "Failed to parse response" }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      result = JSON.parse(jsonMatch[0]);
    }

    console.log(`[style-consistency] ✅ Overall coherence score: ${result.overallScore}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[style-consistency] Error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Style consistency analysis failed",
    }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
