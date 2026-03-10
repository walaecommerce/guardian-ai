import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { images, listingTitle } = await req.json();

    if (!images || images.length === 0) {
      return new Response(JSON.stringify({ error: "No images provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const imageCount = images.length;

    // 1. COMPLIANCE (from existing analysis scores)
    const analyzedScores = images
      .filter((img: any) => img.analysisScore !== undefined && img.analysisScore !== null)
      .map((img: any) => img.analysisScore);
    const complianceScore = analyzedScores.length > 0
      ? Math.round(analyzedScores.reduce((a: number, b: number) => a + b, 0) / analyzedScores.length)
      : 0;

    // 2. COMPLETENESS (deterministic)
    const completenessMap: Record<number, number> = { 9: 100, 8: 88, 7: 77, 6: 66, 5: 55, 4: 44 };
    const completenessScore = completenessMap[Math.min(imageCount, 9)] ?? 30;

    // 3. DIVERSITY (deterministic from categories)
    const categories = new Set(images.map((img: any) => img.category));
    let diversityScore = 0;
    if (categories.has('PRODUCT_SHOT')) diversityScore += 17;
    if (categories.has('LIFESTYLE') || categories.has('PRODUCT_IN_USE')) diversityScore += 17;
    if (categories.has('INFOGRAPHIC')) diversityScore += 17;
    if (categories.has('DETAIL') || categories.has('PACKAGING')) diversityScore += 17;
    if (categories.has('SIZE_CHART') || categories.has('COMPARISON')) diversityScore += 16;
    // Brand/story — approximate from having multiple non-product categories
    const nonProductCats = [...categories].filter(c => c !== 'PRODUCT_SHOT' && c !== 'UNKNOWN');
    if (nonProductCats.length >= 3) diversityScore += 16;
    diversityScore = Math.min(100, diversityScore);

    // 4. TEXT READABILITY (from per-image scores if available)
    const readabilityScores = images
      .filter((img: any) => img.textReadabilityScore !== undefined && img.textReadabilityScore !== null)
      .map((img: any) => img.textReadabilityScore);
    const hasReadabilityFromAnalysis = readabilityScores.length > 0;
    const clientReadability = hasReadabilityFromAnalysis
      ? Math.round(readabilityScores.reduce((a: number, b: number) => a + b, 0) / readabilityScores.length)
      : null;

    // 5. EMOTIONAL APPEAL (from per-image scores if available)
    const emotionScores = images
      .filter((img: any) => img.emotionalAppealScore !== undefined && img.emotionalAppealScore !== null)
      .map((img: any) => img.emotionalAppealScore);
    const hasEmotionFromAnalysis = emotionScores.length > 0;
    const clientEmotion = hasEmotionFromAnalysis
      ? Math.round(emotionScores.reduce((a: number, b: number) => a + b, 0) / emotionScores.length)
      : null;

    // 6. BRAND CONSISTENCY — always requires multi-image AI call
    // Also get readability + emotion if not available from per-image analysis
    const sampleImages = images.slice(0, 6);
    const imageParts = sampleImages.map((img: any, i: number) => ([
      { type: "text", text: `Image ${i + 1} (${img.type}, ${img.category}):` },
      { type: "image_url", url: `data:image/jpeg;base64,${img.base64}` },
    ])).flat();

    const needsReadability = clientReadability === null;
    const needsEmotion = clientEmotion === null;

    const systemPrompt = `You are a senior Amazon listing optimization expert. Analyze these product listing images and return ONLY valid JSON.

Score these dimensions (0-100 each):

1. BRAND_CONSISTENCY: Do all images feel like they belong to the same brand? Check consistent color palette, fonts, style/tone, visual language. 100 = perfect coherence.
${needsReadability ? `
2. TEXT_READABILITY: Would text/infographic content be readable on a mobile phone (5-6 inch)? Consider font size, contrast, density. If no text images, score label legibility. 100 = crisp and clear.` : ''}
${needsEmotion ? `
3. EMOTIONAL_APPEAL: Do images evoke positive emotions? Look for appetizing food, happy people, aspirational settings, professional styling. 100 = highly aspirational.` : ''}

Return JSON:
{
  "brand_consistency": <number>${needsReadability ? ',\n  "text_readability": <number>' : ''}${needsEmotion ? ',\n  "emotional_appeal": <number>' : ''}
}`;

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
          { role: "user", content: [
            { type: "text", text: `Listing: "${listingTitle}". ${imageCount} total images. Analyze:` },
            ...imageParts,
            { type: "text", text: "Return ONLY the JSON. No markdown." },
          ]},
        ],
        temperature: 0.3,
      }),
    });

    let brandConsistency = 50;
    let aiReadability = 50;
    let aiEmotion = 50;

    if (response.ok) {
      const aiResult = await response.json();
      const content = aiResult.choices?.[0]?.message?.content || "";
      const cleaned = content.replace(/```json|```/g, "").trim();
      try {
        const parsed = JSON.parse(cleaned);
        brandConsistency = Math.max(0, Math.min(100, parsed.brand_consistency ?? 50));
        if (needsReadability) aiReadability = Math.max(0, Math.min(100, parsed.text_readability ?? 50));
        if (needsEmotion) aiEmotion = Math.max(0, Math.min(100, parsed.emotional_appeal ?? 50));
      } catch (e) {
        console.error("Failed to parse AI response:", e);
      }
    } else {
      console.error("AI gateway error:", response.status, await response.text());
    }

    const textReadability = clientReadability ?? aiReadability;
    const emotionalAppeal = clientEmotion ?? aiEmotion;

    // Generate priority actions based on lowest scores
    const scores = [
      { name: 'Compliance', score: complianceScore, dimension: 'compliance' },
      { name: 'Completeness', score: completenessScore, dimension: 'completeness' },
      { name: 'Diversity', score: diversityScore, dimension: 'diversity' },
      { name: 'Text Readability', score: textReadability, dimension: 'readability' },
      { name: 'Emotional Appeal', score: emotionalAppeal, dimension: 'emotion' },
      { name: 'Brand Consistency', score: brandConsistency, dimension: 'brand' },
    ].sort((a, b) => a.score - b.score);

    const priorityActions: string[] = [];
    for (const dim of scores.slice(0, 3)) {
      switch (dim.dimension) {
        case 'compliance':
          priorityActions.push(`Your Compliance score is ${dim.score}/100 — fix critical violations to avoid listing suppression.`);
          break;
        case 'completeness':
          priorityActions.push(`Your Completeness score is ${dim.score}/100 — you are only using ${imageCount} of 9 image slots. Add ${9 - Math.min(imageCount, 9)} more images to significantly improve your listing.`);
          break;
        case 'diversity':
          priorityActions.push(`Your Diversity score is ${dim.score}/100 — add missing image types like ${['lifestyle', 'infographic', 'size chart'].filter(() => Math.random() > 0.4).join(', ') || 'lifestyle images'} to showcase your product better.`);
          break;
        case 'readability':
          priorityActions.push(`Your Readability score is ${dim.score}/100 — increase font sizes and contrast on infographic images. Most shoppers view on mobile.`);
          break;
        case 'emotion':
          priorityActions.push(`Your Emotional Appeal score is ${dim.score}/100 — add lifestyle images showing the product in aspirational, real-world settings with warm lighting.`);
          break;
        case 'brand':
          priorityActions.push(`Your Brand Consistency score is ${dim.score}/100 — unify your color palette, typography, and visual style across all images.`);
          break;
      }
    }

    const result = {
      compliance: complianceScore,
      completeness: completenessScore,
      diversity: diversityScore,
      textReadability,
      emotionalAppeal,
      brandConsistency,
      priorityActions,
    };

    console.log("[listing-scorecard] Scores:", JSON.stringify(result));

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
