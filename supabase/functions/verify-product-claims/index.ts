import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  fromCache?: boolean;
}

interface VerificationResponse {
  claims: VerificationResult[];
  overallValid: boolean;
  timestamp: string;
  cacheHits?: number;
  cacheMisses?: number;
}

interface CacheEntry {
  claim_key: string;
  claim_text: string;
  verified: boolean;
  exists: boolean;
  release_status: string;
  details: string;
  sources: string[];
  expires_at: string;
}

// Generate a normalized cache key from a claim
const generateCacheKey = (claim: string): string => {
  return claim.toLowerCase().trim().replace(/\s+/g, '_');
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { claims, productTitle, asin } = await req.json();
    
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not configured");
    }

    if (!claims || !Array.isArray(claims) || claims.length === 0) {
      return new Response(JSON.stringify({ 
        claims: [],
        overallValid: true,
        timestamp: new Date().toISOString(),
        cacheHits: 0,
        cacheMisses: 0
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[ProductVerify] Verifying ${claims.length} claims...`);

    // Initialize Supabase client for caching
    let supabase: any = null;
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    }

    const cachedResults: Map<string, VerificationResult> = new Map();
    const claimsToVerify: string[] = [];
    let cacheHits = 0;
    let cacheMisses = 0;

    // Check cache for each claim
    if (supabase) {
      const cacheKeys = claims.map((c: string) => generateCacheKey(c));
      
      try {
        const { data: cacheData, error: cacheError } = await supabase
          .from('product_claim_cache')
          .select('*')
          .in('claim_key', cacheKeys)
          .gt('expires_at', new Date().toISOString());

        if (!cacheError && cacheData) {
          for (const cached of cacheData as CacheEntry[]) {
            cachedResults.set(cached.claim_key, {
              claim: cached.claim_text,
              verified: cached.verified,
              exists: cached.exists,
              releaseStatus: cached.release_status as VerificationResult['releaseStatus'],
              details: cached.details || '',
              sources: cached.sources || [],
              searchDate: new Date().toISOString(),
              fromCache: true
            });
            cacheHits++;
          }
          console.log(`[ProductVerify] Cache hits: ${cacheHits}`);
        }
      } catch (cacheErr) {
        console.error("[ProductVerify] Cache lookup error:", cacheErr);
      }
    }

    // Determine which claims need verification
    for (const claim of claims) {
      const key = generateCacheKey(claim);
      if (!cachedResults.has(key)) {
        claimsToVerify.push(claim);
        cacheMisses++;
      }
    }

    console.log(`[ProductVerify] Cache misses: ${cacheMisses}, claims to verify: ${claimsToVerify.length}`);

    // If all claims are cached, return immediately
    if (claimsToVerify.length === 0) {
      const results: VerificationResult[] = claims.map((claim: string) => {
        const key = generateCacheKey(claim);
        return cachedResults.get(key)!;
      });
      
      return new Response(JSON.stringify({
        claims: results,
        overallValid: results.every(r => r.verified),
        timestamp: new Date().toISOString(),
        cacheHits,
        cacheMisses
      } as VerificationResponse), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build the verification prompt for uncached claims
    const claimsText = claimsToVerify.map((c: string, i: number) => `${i + 1}. "${c}"`).join('\n');
    
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

    console.log(`[ProductVerify] Calling Perplexity via OpenRouter for ${claimsToVerify.length} claims...`);

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

    let newVerifications: VerificationResult[] = [];

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[ProductVerify] OpenRouter API error:", response.status, errorText);
      
      // Fallback for uncached claims
      newVerifications = claimsToVerify.map((claim: string) => ({
        claim,
        verified: true,
        exists: true,
        releaseStatus: 'unknown' as const,
        details: 'Could not verify - API error. Assuming valid.',
        sources: [],
        searchDate: new Date().toISOString(),
        fromCache: false
      }));
    } else {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      
      console.log("[ProductVerify] Raw response:", content.substring(0, 500));

      // Parse the JSON response
      let parsedVerifications: any[] = [];
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          parsedVerifications = parsed.verifications || [];
        }
      } catch (parseError) {
        console.error("[ProductVerify] Failed to parse response:", parseError);
        parsedVerifications = claimsToVerify.map((claim: string) => ({
          claim,
          verified: true,
          exists: true,
          releaseStatus: 'unknown',
          details: 'Could not parse verification response',
          sources: []
        }));
      }

      // Build verification results
      newVerifications = parsedVerifications.map((v: any) => ({
        claim: v.claim || '',
        verified: v.verified ?? true,
        exists: v.exists ?? true,
        releaseStatus: v.releaseStatus || 'unknown',
        details: v.details || '',
        sources: v.sources || [],
        searchDate: new Date().toISOString(),
        fromCache: false
      }));

      // Cache the new results
      if (supabase && newVerifications.length > 0) {
        try {
          const cacheEntries = newVerifications.map(v => ({
            claim_key: generateCacheKey(v.claim),
            claim_text: v.claim,
            verified: v.verified,
            exists: v.exists,
            release_status: v.releaseStatus,
            details: v.details,
            sources: v.sources,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
          }));

          const { error: insertError } = await supabase
            .from('product_claim_cache')
            .upsert(cacheEntries, { onConflict: 'claim_key' });

          if (insertError) {
            console.error("[ProductVerify] Cache insert error:", insertError);
          } else {
            console.log(`[ProductVerify] Cached ${cacheEntries.length} new verification results`);
          }
        } catch (cacheErr) {
          console.error("[ProductVerify] Cache write error:", cacheErr);
        }
      }
    }

    // Merge cached and new results in original order
    const allResults: VerificationResult[] = claims.map((claim: string) => {
      const key = generateCacheKey(claim);
      const cached = cachedResults.get(key);
      if (cached) return cached;
      
      // Find in new verifications
      const newResult = newVerifications.find(v => 
        generateCacheKey(v.claim) === key || v.claim.toLowerCase() === claim.toLowerCase()
      );
      if (newResult) return newResult;
      
      // Fallback
      return {
        claim,
        verified: true,
        exists: true,
        releaseStatus: 'unknown' as const,
        details: 'Could not verify',
        sources: [],
        searchDate: new Date().toISOString(),
        fromCache: false
      };
    });

    const overallValid = allResults.every(r => r.verified);

    console.log(`[ProductVerify] Complete. ${allResults.filter(r => r.verified).length}/${allResults.length} verified. Cache: ${cacheHits} hits, ${cacheMisses} misses.`);

    return new Response(JSON.stringify({
      claims: allResults,
      overallValid,
      timestamp: new Date().toISOString(),
      cacheHits,
      cacheMisses
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
      timestamp: new Date().toISOString(),
      cacheHits: 0,
      cacheMisses: 0
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
