import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { MODELS } from "../_shared/models.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

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
    const { imageBase64, mainImageBase64, imageCategory, listingTitle, productAsin } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log(`[enhance-analyze-image] using model: ${MODELS.analysis} via Lovable AI gateway`);
    console.log(`[Enhancement] Deep analyzing ${imageCategory} image...`);

    const systemPrompt = `You are an expert Amazon product image analyst specializing in enhancement recommendations. Your job is to:
1. Analyze the uploaded secondary image for quality and effectiveness
2. Compare it against the main product image for consistency
3. Identify specific enhancement opportunities based on Amazon best practices
4. Provide actionable recommendations for improvement

## IMAGE CATEGORY CONTEXT
You are analyzing a "${imageCategory}" image. Apply category-specific analysis:

${imageCategory === 'LIFESTYLE' ? `
LIFESTYLE IMAGE ANALYSIS:
- Product Visibility: Is the product clearly visible and recognizable? (minimum 30-40% of frame)
- Context Appropriateness: Does the lifestyle setting resonate with target customers?
- Product Hero Status: Is the product the "hero" of the scene or just a prop?
- Lighting Quality: Is the product well-lit within the scene?
- Authenticity: Does the scene feel natural and aspirational?
` : ''}

${imageCategory === 'INFOGRAPHIC' ? `
INFOGRAPHIC IMAGE ANALYSIS:
- Product Presence: Is there a clear product image/cutout present?
- Text Readability: Are feature callouts easy to read?
- Visual Hierarchy: Is there clear priority (product > features > details)?
- Information Density: Is there too much or too little information?
- Professional Quality: Do the graphics look professional?
` : ''}

${imageCategory === 'PRODUCT_IN_USE' ? `
PRODUCT IN USE ANALYSIS:
- Product Visibility During Action: Is the product visible while being used?
- Benefit Clarity: Is the benefit/result of usage clear?
- Action Authenticity: Does the usage look natural and realistic?
- Result Demonstration: Are the outcomes of using the product visible?
` : ''}

${imageCategory === 'COMPARISON' ? `
COMPARISON IMAGE ANALYSIS:
- State Distinction: Is the before/after clearly distinguishable?
- Product Prominence: Is the product clearly featured in comparison?
- Fairness: Is the comparison fair and not misleading?
- Visual Impact: Is the improvement visually compelling?
` : ''}

## MAIN PRODUCT REFERENCE
I will provide the MAIN product image. Use this to:
- Verify the product in the secondary image matches the main product
- Check for consistency in product appearance (color, shape, labels)
- Identify if any key product elements are missing

## OUTPUT FORMAT
Return ONLY valid JSON:
{
  "imageCategory": "${imageCategory}",
  "productVisibility": {
    "score": <0-100>,
    "isProductClearlyVisible": boolean,
    "productBounds": { "top": %, "left": %, "width": %, "height": % } or null,
    "issues": ["list of visibility issues"]
  },
  "comparisonWithMain": {
    "sameProductDetected": boolean,
    "productMatchScore": <0-100>,
    "missingElements": ["elements in main image not visible here"]
  },
  "contentQuality": {
    "lifestyleContextAppropriate": boolean,
    "infographicTextReadable": boolean,
    "featureHighlightsPresent": boolean,
    "callToActionStrength": <0-100>,
    "overallQuality": <0-100>
  },
  "enhancementOpportunities": [
    {
      "id": "unique_id",
      "type": "add_product|improve_visibility|enhance_graphics|add_infographic|improve_context|add_annotations|color_correction|background_upgrade|composition_fix|quality_enhancement",
      "priority": "high|medium|low",
      "description": "What should be improved",
      "expectedImprovement": "What result this will achieve"
    }
  ],
  "recommendedPresets": ["preset_ids that would help this image"],
  "analysisNotes": "Brief summary of overall assessment"
}`;

    const userPrompt = `Analyze this ${imageCategory} image for enhancement opportunities.
${listingTitle ? `Product: "${listingTitle}"` : ''}
${productAsin ? `ASIN: ${productAsin}` : ''}

Compare against the main product image provided and identify all opportunities to improve this image's effectiveness.`;

    // Build content parts
    const contentParts: any[] = [
      { type: "text", text: userPrompt },
      { type: "image_url", image_url: { url: toDataUrl(imageBase64) } },
    ];

    if (mainImageBase64) {
      contentParts.push({ type: "text", text: "Main product reference image:" });
      contentParts.push({ type: "image_url", image_url: { url: toDataUrl(mainImageBase64) } });
    }

    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODELS.analysis,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: contentParts },
        ],
      }),
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded.", errorType: "rate_limit" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Settings → Workspace → Usage.", errorType: "payment_required" }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Enhancement] Gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: `AI gateway error (${response.status})`, errorType: "gateway_error" }), {
        status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[Enhancement] Failed to parse JSON from response");
      throw new Error("Could not parse enhancement analysis result");
    }

    const analysis = JSON.parse(jsonMatch[0]);

    console.log(`[Enhancement] Analysis complete. Quality: ${analysis.contentQuality?.overallQuality}%, Opportunities: ${analysis.enhancementOpportunities?.length || 0}`);

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[Enhancement] Analysis error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Analysis failed"
    }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
