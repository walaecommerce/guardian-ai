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

    const systemPrompt = `You are an Amazon marketplace policy researcher. Search for the latest Amazon product image requirements, Seller Central announcements, and listing guideline updates from the last 30 days.

Focus on changes that affect:
- Main image requirements (background, occupancy, text overlays)
- Secondary image rules (lifestyle, infographic, A+ content)
- Prohibited content (badges, watermarks, promotional text)
- New badge or label restrictions
- Image quality or dimension requirements
- Category-specific image rules

Return ONLY valid JSON matching this exact schema:
{
  "updates": [
    {
      "date": "YYYY-MM-DD",
      "policy_area": "string — e.g. Main Image, Secondary Images, Prohibited Content, Image Quality",
      "change_description": "string — concise description of what changed",
      "impact": "HIGH or MEDIUM or LOW",
      "keywords": ["string"] 
    }
  ],
  "last_checked": "ISO date string",
  "source_summary": "string — brief note on where this info was found"
}

Rules:
- keywords array should contain 2-4 terms that would match violation categories (e.g. "background", "text overlay", "badge", "watermark")
- If no recent changes found, return updates as empty array
- Only include confirmed, verifiable policy changes — no speculation
- Date should be the date the policy was announced or took effect`;

    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-pro-preview",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Today is ${new Date().toISOString().split('T')[0]}. Search for any Amazon product image policy changes, Seller Central announcements, or listing requirement updates published in the last 30 days. Include any changes to image guidelines, prohibited content rules, or new compliance requirements. Return the JSON.`,
          },
        ],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
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
    console.error("Policy check error:", e);
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : "Unknown error",
      updates: [],
      last_checked: new Date().toISOString(),
    }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
