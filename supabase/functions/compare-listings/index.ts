import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { fetchGemini } from "../_shared/gemini.ts";
import { MODELS } from "../_shared/models.ts";
import { requireAuth, isAuthError } from "../_shared/auth.ts";
import { useCredit, checkCredits, createAdminClient } from "../_shared/credits.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth guard
    const authResult = await requireAuth(req, corsHeaders);
    if (isAuthError(authResult)) return authResult;
    const userId = authResult.userId;
    const admin = createAdminClient();

    // Pre-check analyze credits for competitor comparison
    try {
      const remaining = await checkCredits(admin, userId, 'analyze');
      const { data: roleData } = await admin
        .from('user_roles').select('role')
        .eq('user_id', userId).eq('role', 'admin').maybeSingle();
      if (!roleData && remaining <= 0) {
        return new Response(
          JSON.stringify({ error: 'No analyze credits remaining. Upgrade your plan to continue.', errorType: 'payment_required' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (creditErr: any) {
      console.warn('[compare-listings] Credit pre-check failed, proceeding:', creditErr);
    }

    const { yourAnalysis, competitorAnalysis, yourTitle, competitorTitle } = await req.json();

    const GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const systemPrompt = `You are an Amazon competitive intelligence analyst. Compare two product listings and identify competitive advantages and gaps. Return ONLY valid JSON matching the exact schema requested.`;

    const userPrompt = `Compare these two Amazon product listings and generate a competitive intelligence report.

YOUR LISTING ("${yourTitle || 'Unknown'}"):
${JSON.stringify(yourAnalysis, null, 2)}

COMPETITOR LISTING ("${competitorTitle || 'Unknown'}"):
${JSON.stringify(competitorAnalysis, null, 2)}

Return ONLY this JSON structure:
{
  "score_comparison": {
    "your_score": <number>,
    "competitor_score": <number>,
    "winner": "you" | "competitor" | "tie"
  },
  "image_count_comparison": {
    "your_count": <number>,
    "competitor_count": <number>,
    "slots_you_are_missing": <number>
  },
  "image_types_competitor_has_you_dont": [
    { "type": "<string>", "description": "<string>", "recommendation": "<string>" }
  ],
  "competitor_violations": [
    { "violation": "<string>", "severity": "<string>", "your_opportunity": "<string>" }
  ],
  "your_advantages": ["<string>"],
  "priority_actions": [
    { "action": "<string>", "reason": "<string>", "impact": "HIGH" | "MEDIUM" | "LOW" }
  ]
}`;

    console.log("[compare-listings] Calling AI gateway...");

    const response = await fetchGemini({
      model: MODELS.analysis,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "return_comparison",
            description: "Return the competitive comparison report",
            parameters: {
              type: "object",
              properties: {
                score_comparison: {
                  type: "object",
                  properties: {
                    your_score: { type: "number" },
                    competitor_score: { type: "number" },
                    winner: { type: "string", enum: ["you", "competitor", "tie"] },
                  },
                  required: ["your_score", "competitor_score", "winner"],
                },
                image_count_comparison: {
                  type: "object",
                  properties: {
                    your_count: { type: "number" },
                    competitor_count: { type: "number" },
                    slots_you_are_missing: { type: "number" },
                  },
                  required: ["your_count", "competitor_count", "slots_you_are_missing"],
                },
                image_types_competitor_has_you_dont: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string" },
                      description: { type: "string" },
                      recommendation: { type: "string" },
                    },
                    required: ["type", "description", "recommendation"],
                  },
                },
                competitor_violations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      violation: { type: "string" },
                      severity: { type: "string" },
                      your_opportunity: { type: "string" },
                    },
                    required: ["violation", "severity", "your_opportunity"],
                  },
                },
                your_advantages: {
                  type: "array",
                  items: { type: "string" },
                },
                priority_actions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      action: { type: "string" },
                      reason: { type: "string" },
                      impact: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
                    },
                    required: ["action", "reason", "impact"],
                  },
                },
              },
              required: [
                "score_comparison",
                "image_count_comparison",
                "image_types_competitor_has_you_dont",
                "competitor_violations",
                "your_advantages",
                "priority_actions",
              ],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "return_comparison" } },
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits required. Add credits in Settings → Workspace → Usage.", errorType: "payment_required" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("[compare-listings] AI gateway error:", response.status, errText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const toolCall = aiResponse.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      // Fallback: try to parse from content
      const content = aiResponse.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log("[compare-listings] Parsed from content fallback");
        // Debit credit on success
        const idemKey = `compare:${userId}:${Date.now()}`;
        try { await useCredit(admin, userId, 'analyze', 'compare-listings', idemKey); } catch (e: any) { console.warn('[compare-listings] Post-success debit failed:', e?.message); }
        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("No structured response from AI");
    }

    const result = typeof toolCall.function.arguments === 'string'
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;

    console.log("[compare-listings] Success:", result.score_comparison?.winner);

    // Debit credit on success
    const idemKey = `compare:${userId}:${Date.now()}`;
    try { await useCredit(admin, userId, 'analyze', 'compare-listings', idemKey); } catch (e: any) { console.warn('[compare-listings] Post-success debit failed:', e?.message); }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[compare-listings] Error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Comparison failed",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
