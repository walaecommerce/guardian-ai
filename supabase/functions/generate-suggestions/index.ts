import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { fetchGemini } from "../_shared/gemini.ts";
import { MODELS } from "../_shared/models.ts";
import { requireAuth, isAuthError } from "../_shared/auth.ts";
import { parseJsonBody, errorResponse, successResponse } from "../_shared/validation.ts";

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
    if (!GEMINI_API_KEY) return errorResponse(500, "GEMINI_API_KEY not configured", {}, corsHeaders);

    const bodyOrError = await parseJsonBody(req);
    if (bodyOrError instanceof Response) return bodyOrError;
    const { listingTitle, auditResults, imageCount, titleRuleViolations, missingCoverageTypes } = bodyOrError as Record<string, any>;

    // Build context-rich prompt with deterministic findings
    const titleViolationsContext = titleRuleViolations?.length > 0
      ? `\n\nDETERMINISTIC TITLE RULE VIOLATIONS (January 21, 2025 Amazon Title Rules):\n${titleRuleViolations.map((v: any) => `- ${v.ruleName}: ${v.message} (${v.severity})`).join('\n')}`
      : '\n\nNo deterministic title rule violations detected.';

    const coverageContext = missingCoverageTypes?.length > 0
      ? `\n\nMISSING IMAGE COVERAGE TYPES:\n${missingCoverageTypes.map((t: string) => `- ${t}`).join('\n')}`
      : '';

    const systemPrompt = `You are a senior Amazon listing optimization specialist with deep expertise in the January 21, 2025 Amazon title and image policy rules. Analyze this compliance audit data and generate specific, actionable improvements. Every recommendation MUST:
1. Reference a specific finding from the audit data — never generate vague or boilerplate advice
2. Explain WHY with category-specific reasoning and expected conversion impact
3. Be immediately actionable — the seller should know exactly what to do
4. Cite the relevant Amazon policy rule when applicable

Key Amazon rules to enforce (January 21, 2025):
- Title: 200-char max, no ALL CAPS, no special chars (~!$?_{}^¬¦), no promotional language, no keyword stuffing (3+ repeats), brand first
- Main image: pure white background, 85%+ fill, no text/badges/watermarks
- Secondary: no "Best Seller" / "Amazon's Choice" badges, no misleading claims
- Image completeness: listings need hero, lifestyle, infographic, and detail/packaging coverage minimum

Do not generate generic advice like "improve your listing" or "add more images". Each point must be specific to THIS listing's data.`;

    const userPrompt = `Product: ${listingTitle}

Audit results: ${JSON.stringify(auditResults, null, 2)}

Images analyzed: ${imageCount}${titleViolationsContext}${coverageContext}

Generate improvement recommendations. Be specific and evidence-based.`;

    const response = await fetchGemini({
      model: MODELS.analysis,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
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
                      evidence: { type: "string", description: "Specific audit finding or data point this recommendation is based on" },
                    },
                    required: ["type", "why_it_matters", "priority", "estimated_conversion_impact", "generation_prompt"],
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
                      evidence: { type: "string", description: "Which Jan 2025 rule is violated or which audit finding triggered this" },
                    },
                    required: ["issue", "current_example", "suggested_fix", "reason"],
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
                      evidence: { type: "string", description: "Specific audit data point driving this recommendation" },
                    },
                    required: ["action", "effort", "estimated_impact", "how_to_do_it"],
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
                      evidence: { type: "string" },
                    },
                    required: ["image_type", "current_issue", "specific_recommendation", "example_prompt_for_ai_generation"],
                  },
                },
                overall_strategy: { type: "string" },
              },
              required: ["missing_image_types", "title_improvements", "quick_wins", "image_improvements", "overall_strategy"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "return_suggestions" } },
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
