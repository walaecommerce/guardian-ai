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

    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-pro-preview",
        messages: [
          {
            role: "system",
            content: `You are an Amazon marketplace policy researcher with access to web search. Search for the most recent Amazon Seller Central image requirements and product listing policy updates from the last 60 days. Focus on: main image requirements, secondary image rules, prohibited content updates, new badge restrictions, A+ content rules.`,
          },
          {
            role: "user",
            content: `Today is ${new Date().toISOString().split("T")[0]}. Search for any Amazon product image policy changes, Seller Central announcements, or listing requirement updates published in the last 60 days. Include any changes to image guidelines, prohibited content rules, or new compliance requirements.`,
          },
        ],
        temperature: 0.2,
        tools: [
          {
            type: "function",
            function: {
              name: "return_policy_updates",
              description: "Return structured Amazon policy update data.",
              parameters: {
                type: "object",
                properties: {
                  last_checked: { type: "string", description: "ISO date string of when this check was performed" },
                  source_summary: { type: "string", description: "Brief note on where this info was found" },
                  updates: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        date: { type: "string", description: "YYYY-MM-DD date the policy was announced or took effect" },
                        policy_area: { type: "string", description: "e.g. Main Image, Secondary Images, Prohibited Content, Image Quality" },
                        change_description: { type: "string", description: "Concise description of what changed" },
                        impact: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
                        source_url: { type: "string", description: "URL of the source announcement or documentation" },
                        keywords: {
                          type: "array",
                          items: { type: "string" },
                          description: "2-4 terms that match violation categories (e.g. background, text overlay, badge, watermark)",
                        },
                      },
                      required: ["date", "policy_area", "change_description", "impact", "keywords"],
                      additionalProperties: false,
                    },
                  },
                  current_rules_summary: {
                    type: "object",
                    properties: {
                      main_image: { type: "array", items: { type: "string" } },
                      secondary_image: { type: "array", items: { type: "string" } },
                      prohibited_content: { type: "array", items: { type: "string" } },
                    },
                    required: ["main_image", "secondary_image", "prohibited_content"],
                    additionalProperties: false,
                  },
                },
                required: ["last_checked", "updates", "current_rules_summary"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_policy_updates" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);

      if (response.status === 429 || response.status === 402) {
        return new Response(JSON.stringify({
          error: response.status === 402 ? "AI credits exhausted" : "Rate limit exceeded",
          updates: [],
          last_checked: new Date().toISOString(),
          current_rules_summary: {
            main_image: [],
            secondary_image: [],
            prohibited_content: [],
          },
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error(`AI gateway returned ${response.status}`);
    }

    const aiResult = await response.json();

    // Try tool call first
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall) {
      const parsed = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback: parse content
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
      current_rules_summary: { main_image: [], secondary_image: [], prohibited_content: [] },
    }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
