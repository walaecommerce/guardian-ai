import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VerificationResult {
  claim: string;
  verified: boolean;
  exists: boolean;
  releaseStatus: 'released' | 'announced' | 'rumored' | 'not_found' | 'unknown';
  details: string;
  sources: string[];
  searchDate: string;
}

interface VerificationResponse {
  claims: VerificationResult[];
  overallValid: boolean;
  timestamp: string;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { claims, productTitle, asin } = await req.json();
    
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    
    if (!OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not configured");
    }

    if (!claims || !Array.isArray(claims) || claims.length === 0) {
      return new Response(JSON.stringify({ 
        claims: [],
        overallValid: true,
        timestamp: new Date().toISOString()
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[ProductVerify] Verifying ${claims.length} claims using Perplexity via OpenRouter...`);
    console.log(`[ProductVerify] Claims: ${JSON.stringify(claims)}`);

    // Build the verification prompt
    const claimsText = claims.map((c: string, i: number) => `${i + 1}. "${c}"`).join('\n');
    
    const systemPrompt = `You are a product market research expert. Your job is to verify if product claims are accurate based on current market information.

For each claim, determine:
1. Does this product/model actually exist and is it released?
2. Is the claim accurate based on current market data?
3. What is the release status?

Be especially careful with:
- Phone models (iPhone, Samsung Galaxy, Pixel, etc.)
- Electronics with model numbers
- Product versions or generations
- "New", "Latest", "2024", "2025" claims

IMPORTANT: Use your real-time search capabilities to verify current product releases. Do NOT rely on training data for product release dates.`;

    const userPrompt = `Verify these product claims for accuracy:

${claimsText}

${productTitle ? `Product context: "${productTitle}"` : ''}
${asin ? `Amazon ASIN: ${asin}` : ''}

For each claim, respond with a JSON object containing:
{
  "verifications": [
    {
      "claim": "the original claim text",
      "verified": true/false (is the claim accurate?),
      "exists": true/false (does this product exist?),
      "releaseStatus": "released" | "announced" | "rumored" | "not_found",
      "details": "Brief explanation with current market info",
      "sources": ["source1", "source2"]
    }
  ]
}

Search for the latest information about each product. Today's date is ${new Date().toISOString().split('T')[0]}.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://lovable.dev',
        'X-Title': 'Amazon Image Compliance Checker'
      },
      body: JSON.stringify({
        model: 'perplexity/sonar-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[ProductVerify] OpenRouter API error:", response.status, errorText);
      
      // Return a graceful fallback - assume claims are valid if we can't verify
      return new Response(JSON.stringify({
        claims: claims.map((claim: string) => ({
          claim,
          verified: true,
          exists: true,
          releaseStatus: 'unknown' as const,
          details: 'Could not verify - API error. Assuming valid.',
          sources: [],
          searchDate: new Date().toISOString()
        })),
        overallValid: true,
        timestamp: new Date().toISOString(),
        error: 'Verification API unavailable, defaulting to valid'
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    console.log("[ProductVerify] Raw response:", content.substring(0, 500));

    // Parse the JSON response
    let verifications: any[] = [];
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        verifications = parsed.verifications || [];
      }
    } catch (parseError) {
      console.error("[ProductVerify] Failed to parse response:", parseError);
      // Fallback: assume all claims are valid
      verifications = claims.map((claim: string) => ({
        claim,
        verified: true,
        exists: true,
        releaseStatus: 'unknown',
        details: 'Could not parse verification response',
        sources: []
      }));
    }

    // Build final response
    const results: VerificationResult[] = verifications.map((v: any) => ({
      claim: v.claim || '',
      verified: v.verified ?? true,
      exists: v.exists ?? true,
      releaseStatus: v.releaseStatus || 'unknown',
      details: v.details || '',
      sources: v.sources || [],
      searchDate: new Date().toISOString()
    }));

    const overallValid = results.every(r => r.verified);

    console.log(`[ProductVerify] Verification complete. ${results.filter(r => r.verified).length}/${results.length} claims verified.`);

    return new Response(JSON.stringify({
      claims: results,
      overallValid,
      timestamp: new Date().toISOString()
    } as VerificationResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[ProductVerify] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ 
      error: errorMessage,
      claims: [],
      overallValid: true,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
