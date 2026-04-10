import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { fetchGemini } from "../_shared/gemini.ts";
import { MODELS } from "../_shared/models.ts";
import { requireAuth, isAuthError } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Coverage model for image completeness ────────────────────

interface CoverageType {
  key: string;
  aliases: string[];   // category names that satisfy this
  weight: number;
  label: string;
  whyItMatters: string;
  whatToShow: string;
}

const REQUIRED_COVERAGE: CoverageType[] = [
  {
    key: 'HERO',
    aliases: ['PRODUCT_SHOT', 'MAIN', 'HERO'],
    weight: 30,
    label: 'Hero / Main Image',
    whyItMatters: 'The main image is the first thing shoppers see in search results — it drives 80% of click-through decisions.',
    whatToShow: 'Product on pure white background, filling 85%+ of the frame, no text or badges.',
  },
  {
    key: 'LIFESTYLE',
    aliases: ['LIFESTYLE', 'PRODUCT_IN_USE', 'IN_USE'],
    weight: 25,
    label: 'Lifestyle / In-Use Image',
    whyItMatters: 'Lifestyle images help shoppers visualize owning the product and increase conversion by 20-30%.',
    whatToShow: 'Product being used by a person in a natural, aspirational setting with warm lighting.',
  },
  {
    key: 'INFOGRAPHIC',
    aliases: ['INFOGRAPHIC', 'CALLOUT', 'FEATURES'],
    weight: 25,
    label: 'Infographic / Feature Callout',
    whyItMatters: 'Infographics communicate key features quickly — critical for mobile shoppers who don\'t read descriptions.',
    whatToShow: 'Product with 3-5 key feature callouts, icons, and short benefit text. Clean layout.',
  },
  {
    key: 'DETAIL',
    aliases: ['DETAIL', 'PACKAGING', 'SIZE_CHART', 'COMPARISON', 'INGREDIENTS', 'CLOSEUP'],
    weight: 20,
    label: 'Detail / Supporting Image',
    whyItMatters: 'Detail images reduce returns by setting accurate expectations about size, texture, and packaging.',
    whatToShow: 'Close-up of materials/textures, size reference next to common objects, or ingredient/nutrition panel.',
  },
];

// Category-specific bonus recommendations
const CATEGORY_EXTRAS: Record<string, { key: string; label: string; whyItMatters: string; whatToShow: string }[]> = {
  FOOD_BEVERAGE: [
    { key: 'INGREDIENTS_CLOSEUP', label: 'Ingredients / Nutrition Panel', whyItMatters: 'Health-conscious buyers check ingredients before purchasing food items.', whatToShow: 'Clear shot of the nutrition facts panel and ingredient list on the packaging.' },
  ],
  SUPPLEMENTS: [
    { key: 'SUPPLEMENT_FACTS', label: 'Supplement Facts Panel', whyItMatters: 'Shoppers compare supplement formulations — the facts panel is mandatory for trust.', whatToShow: 'High-resolution photo of the Supplement Facts label, fully readable.' },
  ],
  APPAREL: [
    { key: 'SIZE_CHART', label: 'Size Chart', whyItMatters: 'Size charts reduce returns by 15-25% for apparel listings.', whatToShow: 'Clear size chart with measurements in both inches and centimeters.' },
  ],
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authResult = await requireAuth(req, corsHeaders);
    if (isAuthError(authResult)) return authResult;

    const GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    const { images, listingTitle, category } = await req.json();

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

    // 2. COMPLETENESS — coverage-based scoring
    const categories = new Set(images.map((img: any) => (img.category || '').toUpperCase()));
    let coverageScore = 0;
    const coveredTypes: string[] = [];
    const missingCoverage: CoverageType[] = [];

    for (const cov of REQUIRED_COVERAGE) {
      const isCovered = cov.aliases.some(alias => categories.has(alias));
      if (isCovered) {
        coverageScore += cov.weight;
        coveredTypes.push(cov.key);
      } else {
        missingCoverage.push(cov);
      }
    }

    // Small bonus for slot utilization (up to 10 extra points)
    const slotBonus = Math.min(10, Math.round((Math.min(imageCount, 9) / 9) * 10));
    const completenessScore = Math.min(100, coverageScore + slotBonus);

    // 3. DIVERSITY (deterministic from categories)
    let diversityScore = 0;
    if (categories.has('PRODUCT_SHOT')) diversityScore += 17;
    if (categories.has('LIFESTYLE') || categories.has('PRODUCT_IN_USE')) diversityScore += 17;
    if (categories.has('INFOGRAPHIC')) diversityScore += 17;
    if (categories.has('DETAIL') || categories.has('PACKAGING')) diversityScore += 17;
    if (categories.has('SIZE_CHART') || categories.has('COMPARISON')) diversityScore += 16;
    const nonProductCats = [...categories].filter(c => c !== 'PRODUCT_SHOT' && c !== 'UNKNOWN');
    if (nonProductCats.length >= 3) diversityScore += 16;
    diversityScore = Math.min(100, diversityScore);

    // 4. TEXT READABILITY
    const readabilityScores = images
      .filter((img: any) => img.textReadabilityScore !== undefined && img.textReadabilityScore !== null)
      .map((img: any) => img.textReadabilityScore);
    const hasReadabilityFromAnalysis = readabilityScores.length > 0;
    const clientReadability = hasReadabilityFromAnalysis
      ? Math.round(readabilityScores.reduce((a: number, b: number) => a + b, 0) / readabilityScores.length)
      : null;

    // 5. EMOTIONAL APPEAL
    const emotionScores = images
      .filter((img: any) => img.emotionalAppealScore !== undefined && img.emotionalAppealScore !== null)
      .map((img: any) => img.emotionalAppealScore);
    const hasEmotionFromAnalysis = emotionScores.length > 0;
    const clientEmotion = hasEmotionFromAnalysis
      ? Math.round(emotionScores.reduce((a: number, b: number) => a + b, 0) / emotionScores.length)
      : null;

    // 6. BRAND CONSISTENCY — AI call
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

    const response = await fetchGemini({
      model: MODELS.analysis,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: [
          { type: "text", text: `Listing: "${listingTitle}". ${imageCount} total images. Analyze:` },
          ...imageParts,
          { type: "text", text: "Return ONLY the JSON. No markdown." },
        ]},
      ],
      temperature: 0.3,
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

    // Generate priority actions based on lowest scores + coverage gaps
    const scores = [
      { name: 'Compliance', score: complianceScore, dimension: 'compliance' },
      { name: 'Completeness', score: completenessScore, dimension: 'completeness' },
      { name: 'Diversity', score: diversityScore, dimension: 'diversity' },
      { name: 'Text Readability', score: textReadability, dimension: 'readability' },
      { name: 'Emotional Appeal', score: emotionalAppeal, dimension: 'emotion' },
      { name: 'Brand Consistency', score: brandConsistency, dimension: 'brand' },
    ].sort((a, b) => a.score - b.score);

    const priorityActions: string[] = [];

    // Add coverage-specific recommendations
    if (missingCoverage.length > 0) {
      for (const mc of missingCoverage.slice(0, 2)) {
        priorityActions.push(`Missing ${mc.label}: ${mc.whyItMatters} Add an image showing: ${mc.whatToShow}`);
      }
    }

    // Add category-specific extras
    const catExtras = CATEGORY_EXTRAS[(category || '').toUpperCase()] || [];
    for (const extra of catExtras) {
      if (!categories.has(extra.key) && !coveredTypes.includes(extra.key)) {
        priorityActions.push(`Missing ${extra.label}: ${extra.whyItMatters} Show: ${extra.whatToShow}`);
      }
    }

    // Fill remaining slots with score-based recommendations
    for (const dim of scores) {
      if (priorityActions.length >= 3) break;
      switch (dim.dimension) {
        case 'compliance':
          if (dim.score < 80) priorityActions.push(`Your Compliance score is ${dim.score}/100 — fix critical violations to avoid listing suppression.`);
          break;
        case 'readability':
          if (dim.score < 70) priorityActions.push(`Your Readability score is ${dim.score}/100 — increase font sizes and contrast on infographic images. Most shoppers view on mobile.`);
          break;
        case 'emotion':
          if (dim.score < 70) priorityActions.push(`Your Emotional Appeal score is ${dim.score}/100 — add lifestyle images showing the product in aspirational, real-world settings.`);
          break;
        case 'brand':
          if (dim.score < 70) priorityActions.push(`Your Brand Consistency score is ${dim.score}/100 — unify your color palette, typography, and visual style across all images.`);
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
      missingCoverageTypes: missingCoverage.map(mc => mc.label),
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
