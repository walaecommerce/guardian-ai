import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { fetchGemini } from "../_shared/gemini.ts";
import { MODELS } from "../_shared/models.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    const { auditData, listingTitle, imageCount, categories } = await req.json();

    const systemPrompt = `You are an Amazon listing optimization expert. Based on this compliance audit data, generate specific actionable improvements for this product listing. Focus on what will increase conversion rate and search ranking, not just compliance.

Return ONLY valid JSON matching this exact structure:
{
  "missing_image_types": [
    {
      "type": "string — e.g. LIFESTYLE, INFOGRAPHIC, SIZE_CHART, COMPARISON, INGREDIENTS_CLOSEUP, BRAND_STORY",
      "description": "string — why this image type matters for conversion",
      "priority": "HIGH or MEDIUM or LOW",
      "example_prompt": "string — a detailed Gemini image generation prompt to create this image from scratch, referencing the product"
    }
  ],
  "title_improvements": [
    {
      "issue": "string — what's wrong or suboptimal",
      "suggestion": "string — specific improvement"
    }
  ],
  "quick_wins": [
    {
      "action": "string — specific action to take",
      "estimated_impact": "string — expected conversion/ranking improvement",
      "effort": "LOW or MEDIUM or HIGH"
    }
  ],
  "competitive_gaps": [
    {
      "gap": "string — what's missing vs top competitors",
      "recommendation": "string — how to close the gap"
    }
  ]
}

Guidelines:
- For missing_image_types, check which of these are missing: LIFESTYLE (product in real use), INFOGRAPHIC (callouts/macros), SIZE_CHART (dimensions), COMPARISON (vs competitors or variants), INGREDIENTS_CLOSEUP (nutrition/ingredients detail), BRAND_STORY (brand values/origin). Only suggest what's actually missing.
- For example_prompt, write detailed prompts that would generate high-quality Amazon product images. Include product name, style, lighting, composition details.
- For quick_wins, sort by effort (LOW first). Focus on highest-impact, lowest-effort changes.
- For title_improvements, analyze keyword placement, character count, brand positioning, and feature/benefit structure.
- Keep arrays concise: max 4 missing_image_types, 3 title_improvements, 5 quick_wins, 3 competitive_gaps.`;

    const userContent = `Listing Title: "${listingTitle}"
Image Count: ${imageCount}/9 slots used
Categories Present: ${categories.join(', ')}

Full Audit Data:
${JSON.stringify(auditData, null, 2)}

Analyze this audit and generate optimization recommendations.`;

    const response = await fetchGemini({
      model: MODELS.analysis,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.4,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway returned ${response.status}`);
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || "";
    const cleaned = content.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Suggestions error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
