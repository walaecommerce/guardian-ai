import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    const { listingTitle, auditResults, scoreCardData, imageCount } = await req.json();

    const systemPrompt = `You are a senior Amazon listing optimization specialist with 10 years experience increasing conversion rates. Analyze this compliance audit data and generate specific, actionable improvements that will increase both compliance AND sales conversion. Be specific, practical, and prioritize by revenue impact.`;

    const userPrompt = `Product: ${listingTitle}

Audit results: ${JSON.stringify(auditResults, null, 2)}

Listing health scores: ${JSON.stringify(scoreCardData || {}, null, 2)}

Images analyzed: ${imageCount}

Generate improvement recommendations.`;

    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-pro-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
        tools: [
          {
            type: "function",
            function: {
              name: "return_suggestions",
              description: "Return structured improvement suggestions for an Amazon listing.",
              parameters: {
                type: "object",
                properties: {
                  missing_image_types: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string" },
                        why_it_matters: { type: "string" },
                        priority: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
                        estimated_conversion_impact: { type: "string" },
                        generation_prompt: { type: "string" },
                      },
                      required: ["type", "why_it_matters", "priority", "estimated_conversion_impact", "generation_prompt"],
                      additionalProperties: false,
                    },
                  },
                  title_improvements: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        issue: { type: "string" },
                        current_example: { type: "string" },
                        suggested_fix: { type: "string" },
                        reason: { type: "string" },
                      },
                      required: ["issue", "current_example", "suggested_fix", "reason"],
                      additionalProperties: false,
                    },
                  },
                  quick_wins: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        action: { type: "string" },
                        effort: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
                        estimated_impact: { type: "string" },
                        how_to_do_it: { type: "string" },
                      },
                      required: ["action", "effort", "estimated_impact", "how_to_do_it"],
                      additionalProperties: false,
                    },
                  },
                  image_improvements: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        image_type: { type: "string" },
                        current_issue: { type: "string" },
                        specific_recommendation: { type: "string" },
                        example_prompt_for_ai_generation: { type: "string" },
                      },
                      required: ["image_type", "current_issue", "specific_recommendation", "example_prompt_for_ai_generation"],
                      additionalProperties: false,
                    },
                  },
                  overall_strategy: { type: "string" },
                },
                required: ["missing_image_types", "title_improvements", "quick_wins", "image_improvements", "overall_strategy"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_suggestions" } },
      }),
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
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings → Workspace → Usage.", errorType: "payment_required" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway returned ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      // Fallback: try to parse content as JSON
      const content = aiResult.choices?.[0]?.message?.content || "";
      const cleaned = content.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(toolCall.function.arguments);
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
