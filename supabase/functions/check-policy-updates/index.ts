import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { fetchGemini } from "../_shared/gemini.ts";
import { MODELS } from "../_shared/models.ts";
import { requireAuth, isAuthError } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authResult = await requireAuth(req, corsHeaders);
    if (isAuthError(authResult)) return authResult;

    const GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    const today = new Date().toISOString().split("T")[0];
    const checkedAt = new Date().toISOString();

    // Step 1: Use Gemini with google_search grounding to find real policy updates
    const searchResponse = await fetchGemini({
      model: MODELS.analysis,
      messages: [
        {
          role: "system",
          content: `You are an Amazon Seller Central policy researcher. Use Google Search to find real, verifiable Amazon product listing policy changes from the last 90 days. Only report changes you can verify with actual sources. If you cannot find any real policy changes, say so explicitly.`,
        },
        {
          role: "user",
          content: `Today is ${today}. Search for any Amazon Seller Central product image policy changes, listing requirement updates, or compliance rule changes published in the last 90 days. Focus on:
- Main image requirements (white background, text overlay rules)
- Secondary image rules
- Title formatting rules
- Prohibited content updates
- New badge or overlay restrictions
- A+ Content rule changes

Report only changes you find from real sources. Include the source URL for each change.`,
        },
      ],
      temperature: 0.1,
      tools: [
        { google_search: {} },
      ],
    });

    if (!searchResponse.ok) {
      const errText = await searchResponse.text();
      console.error("Grounded search error:", searchResponse.status, errText);

      if (searchResponse.status === 429 || searchResponse.status === 402) {
        return new Response(JSON.stringify({
          status: "error",
          reason: searchResponse.status === 402 ? "AI credits exhausted" : "Rate limit exceeded",
          updates: [],
          checkedAt,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        status: "error",
        reason: "Research unavailable",
        updates: [],
        checkedAt,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const searchResult = await searchResponse.json();
    const searchContent = searchResult.choices?.[0]?.message?.content || "";
    const groundingMeta = searchResult.groundingMetadata;

    // Extract grounding source URLs from metadata
    const groundingSources: { uri: string; title: string }[] = [];
    if (groundingMeta?.groundingChunks) {
      for (const chunk of groundingMeta.groundingChunks) {
        if (chunk.web?.uri) {
          groundingSources.push({
            uri: chunk.web.uri,
            title: chunk.web.title || new URL(chunk.web.uri).hostname,
          });
        }
      }
    }

    // Step 2: Parse the grounded response into structured format via tool call
    const parseResponse = await fetchGemini({
      model: MODELS.analysis,
      messages: [
        {
          role: "system",
          content: `You are a structured data extractor. Given research findings about Amazon policy changes, extract them into the requested structured format. Only include updates that have real evidence. If the research found no real updates, return an empty updates array. Set confidence based on source quality: "high" if from official Amazon/Seller Central docs, "medium" if from reputable seller blogs, "low" if unclear sourcing.`,
        },
        {
          role: "user",
          content: `Research findings:\n${searchContent}\n\nAvailable source URLs from grounding:\n${groundingSources.map(s => `- ${s.title}: ${s.uri}`).join('\n') || 'None found'}\n\nExtract structured policy updates. If no real updates were found, return an empty updates array.`,
        },
      ],
      temperature: 0.1,
      tools: [
        {
          type: "function",
          function: {
            name: "return_policy_updates",
            description: "Return structured Amazon policy update data with citations.",
            parameters: {
              type: "object",
              properties: {
                updates: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string", description: "Short title of the policy change" },
                      summary: { type: "string", description: "What changed and how it affects sellers" },
                      sourceUrl: { type: "string", description: "URL of the source. Use actual URL from grounding sources if available." },
                      sourceName: { type: "string", description: "Name of the source (e.g. Amazon Seller Central, Seller Forums)" },
                      publishedDate: { type: "string", description: "YYYY-MM-DD date if known, empty string if unknown" },
                      confidence: { type: "string", enum: ["high", "medium", "low"] },
                      affectedArea: { type: "string", enum: ["title", "image", "claims", "content", "general"] },
                      impact: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
                      keywords: {
                        type: "array",
                        items: { type: "string" },
                        description: "2-4 terms matching violation categories",
                      },
                    },
                    required: ["title", "summary", "confidence", "affectedArea", "impact", "keywords"],
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
                },
              },
              required: ["updates", "current_rules_summary"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "return_policy_updates" } },
    });

    if (!parseResponse.ok) {
      console.error("Parse step failed:", parseResponse.status);
      return new Response(JSON.stringify({
        status: "error",
        reason: "Failed to parse research results",
        updates: [],
        checkedAt,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parseResult = await parseResponse.json();
    const toolCall = parseResult.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      return new Response(JSON.stringify({
        status: "no_updates",
        updates: [],
        checkedAt,
        current_rules_summary: { main_image: [], secondary_image: [], prohibited_content: [] },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(toolCall.function.arguments);

    // Stamp each update with checkedAt
    const updates = (parsed.updates || []).map((u: any) => ({
      ...u,
      checkedAt,
      sourceUrl: u.sourceUrl || "",
      sourceName: u.sourceName || "",
      publishedDate: u.publishedDate || "",
    }));

    const status = updates.length > 0 ? "updates_found" : "no_updates";

    return new Response(JSON.stringify({
      status,
      updates,
      checkedAt,
      last_checked: checkedAt,
      current_rules_summary: parsed.current_rules_summary || {
        main_image: [], secondary_image: [], prohibited_content: [],
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Policy check error:", e);
    return new Response(JSON.stringify({
      status: "error",
      reason: e instanceof Error ? e.message : "Unknown error",
      updates: [],
      checkedAt: new Date().toISOString(),
      current_rules_summary: { main_image: [], secondary_image: [], prohibited_content: [] },
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
