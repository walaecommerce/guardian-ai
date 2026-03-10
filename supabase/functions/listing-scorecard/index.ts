import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { images, listingTitle } = await req.json();
    // images: Array<{ base64: string, type: string, category: string, analysisScore?: number }>

    if (!images || images.length === 0) {
      return new Response(JSON.stringify({ error: "No images provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. COMPLETENESS (deterministic)
    const imageCount = images.length;
    const completenessScore = imageCount >= 9 ? 100 : imageCount >= 7 ? 80 : imageCount >= 5 ? 60 : 40;

    // 2. COMPLIANCE (from existing analysis)
    const analyzedScores = images
      .filter((img: any) => img.analysisScore !== undefined)
      .map((img: any) => img.analysisScore);
    const complianceScore = analyzedScores.length > 0
      ? Math.round(analyzedScores.reduce((a: number, b: number) => a + b, 0) / analyzedScores.length)
      : 0;

    // 3. DIVERSITY (deterministic from categories)
    const categories = new Set(images.map((img: any) => img.category));
    const diversityTargets = ['PRODUCT_SHOT', 'LIFESTYLE', 'INFOGRAPHIC', 'DETAIL', 'SIZE_CHART', 'PACKAGING'];
    const diversityHits = diversityTargets.filter(t => categories.has(t)).length;
    const diversityScore = Math.min(100, diversityHits * 16 + (categories.has('PRODUCT_IN_USE') ? 4 : 0));

    // 4-6. AI-assessed scores (text readability, emotional appeal, brand consistency)
    // Send a batch of images (max 6 for token limits) to Gemini for subjective scoring
    const sampleImages = images.slice(0, 6);
    const imageParts = sampleImages.map((img: any, i: number) => ([
      { type: "text", text: `Image ${i + 1} (${img.type}, ${img.category}):` },
      { type: "image_url", url: `data:image/jpeg;base64,${img.base64}` },
    ])).flat();

    const systemPrompt = `You are a senior Amazon listing optimization expert. Analyze these product listing images and score three dimensions. Return ONLY valid JSON matching the schema below.

SCORING CRITERIA:

1. TEXT_READABILITY (0-100): For images containing text/infographics, would the text be readable on a mobile phone screen (5-6 inch)? Consider font size, contrast, density. If no infographic images, score based on label legibility. 100 = all text crisp and large. 0 = unreadable.

2. EMOTIONAL_APPEAL (0-100): Do the lifestyle/usage images evoke positive emotions? Look for: appetizing food presentation, happy people, aspirational settings, warm lighting, professional food styling. 100 = highly aspirational. 50 = generic. 0 = unappealing.

3. BRAND_CONSISTENCY (0-100): Do all images feel like they belong to the same brand? Check: consistent color palette, similar fonts, matching style/tone, cohesive visual language across all images. 100 = perfect brand coherence. 50 = somewhat mixed. 0 = completely inconsistent.

Also provide a "priority_actions" array of exactly 3 strings — the top 3 things to fix ranked by impact on sales conversion.

JSON Schema:
{
  "text_readability": number,
  "emotional_appeal": number, 
  "brand_consistency": number,
  "priority_actions": [string, string, string]
}`;

    const userContent: any[] = [
      { type: "text", text: `Listing: "${listingTitle}". ${imageCount} total images. Analyze these samples:` },
      ...imageParts,
      { type: "text", text: "Return ONLY the JSON object. No markdown." },
    ];

    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      // Return deterministic scores only
      return new Response(JSON.stringify({
        compliance: complianceScore,
        completeness: completenessScore,
        diversity: diversityScore,
        textReadability: 50,
        emotionalAppeal: 50,
        brandConsistency: 50,
        priorityActions: [
          "Run full AI analysis for accurate subjective scores",
          "Add more image types to improve diversity",
          imageCount < 9 ? `Add ${9 - imageCount} more images` : "Maintain current image count",
        ],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || "";
    const cleaned = content.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const result = {
      compliance: complianceScore,
      completeness: completenessScore,
      diversity: diversityScore,
      textReadability: Math.max(0, Math.min(100, parsed.text_readability || 50)),
      emotionalAppeal: Math.max(0, Math.min(100, parsed.emotional_appeal || 50)),
      brandConsistency: Math.max(0, Math.min(100, parsed.brand_consistency || 50)),
      priorityActions: parsed.priority_actions || [
        "Improve image quality and compliance",
        "Add missing image types",
        "Ensure brand consistency",
      ],
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Scorecard error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
