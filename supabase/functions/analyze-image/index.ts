import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const parseGeminiError = (status: number, errorText: string): { message: string; errorType: string; retryable: boolean } => {
  try {
    const errorJson = JSON.parse(errorText);
    const apiMessage = errorJson?.error?.message || '';
    
    if (status === 429) {
      return { message: "Rate limit exceeded. Please wait a moment and try again.", errorType: "rate_limit", retryable: true };
    }
    if (status === 403) {
      return { message: "API key invalid or quota exceeded.", errorType: "auth_error", retryable: false };
    }
    if (status === 400) {
      if (apiMessage.includes('MIME type')) {
        return { message: `Invalid image format: ${apiMessage}`, errorType: "invalid_image", retryable: false };
      }
      if (apiMessage.includes('safety')) {
        return { message: "Image was blocked by safety filters.", errorType: "safety_block", retryable: false };
      }
      return { message: `Invalid request: ${apiMessage}`, errorType: "bad_request", retryable: false };
    }
    if (status >= 500) {
      return { message: "Google AI service temporarily unavailable. Retrying...", errorType: "server_error", retryable: true };
    }
    return { message: apiMessage || `API error (${status})`, errorType: "unknown", retryable: status >= 500 };
  } catch {
    return { message: `API error (${status})`, errorType: "unknown", retryable: status >= 500 };
  }
};

const fetchWithRetry = async (url: string, options: RequestInit, maxRetries = MAX_RETRIES): Promise<Response> => {
  let lastError: Error | null = null;
  let delay = INITIAL_DELAY_MS;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (response.ok) return response;
      
      const errorText = await response.text();
      const parsedError = parseGeminiError(response.status, errorText);
      
      console.log(`[Guardian] Attempt ${attempt}/${maxRetries}: ${parsedError.message}`);
      
      if (!parsedError.retryable || attempt === maxRetries) {
        return new Response(errorText, { status: response.status, headers: response.headers });
      }
      
      console.log(`[Guardian] Retrying in ${delay}ms...`);
      await sleep(delay);
      delay *= 2;
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[Guardian] Attempt ${attempt}/${maxRetries} failed:`, lastError.message);
      
      if (attempt === maxRetries) throw lastError;
      
      await sleep(delay);
      delay *= 2;
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
};

// Helper function to verify product claims via real-time search
const verifyProductClaims = async (claims: string[], productTitle?: string, asin?: string): Promise<{
  verifiedClaims: Map<string, { verified: boolean; details: string }>;
  allValid: boolean;
}> => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");
    
    if (!supabaseUrl || !supabaseKey) {
      console.log("[Guardian] Supabase not configured, skipping claim verification");
      return { verifiedClaims: new Map(), allValid: true };
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/verify-product-claims`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ claims, productTitle, asin }),
    });

    if (!response.ok) {
      console.log("[Guardian] Claim verification failed, proceeding without it");
      return { verifiedClaims: new Map(), allValid: true };
    }

    const data = await response.json();
    const verifiedClaims = new Map<string, { verified: boolean; details: string }>();
    
    for (const claim of (data.claims || [])) {
      verifiedClaims.set(claim.claim, {
        verified: claim.verified,
        details: claim.details
      });
    }

    return { verifiedClaims, allValid: data.overallValid };
  } catch (error) {
    console.error("[Guardian] Claim verification error:", error);
    return { verifiedClaims: new Map(), allValid: true };
  }
};

// Helper function to extract product claims from text
const extractProductClaims = (text: string): string[] => {
  const claims: string[] = [];
  
  // Extract phone model patterns (iPhone XX, Galaxy SXX, Pixel X, etc.)
  const phonePatterns = [
    /iPhone\s*\d+\s*(Pro|Pro Max|Plus|Mini)?/gi,
    /Galaxy\s*[SAZ]\d+\s*(Ultra|Plus|\+)?/gi,
    /Pixel\s*\d+\s*(Pro|a)?/gi,
    /OnePlus\s*\d+\s*(Pro|T)?/gi,
  ];
  
  for (const pattern of phonePatterns) {
    const matches = text.match(pattern);
    if (matches) {
      claims.push(...matches.map(m => m.trim()));
    }
  }
  
  // Extract year claims (2024, 2025, etc.)
  const yearMatches = text.match(/\b20\d{2}\s*(model|edition|version|release)?\b/gi);
  if (yearMatches) {
    claims.push(...yearMatches.map(m => m.trim()));
  }
  
  // Extract "new" or "latest" claims
  const newPatterns = text.match(/\b(new|latest|newest|just released|brand new)\s+\w+/gi);
  if (newPatterns) {
    claims.push(...newPatterns.map(m => m.trim()));
  }
  
  return [...new Set(claims)]; // Remove duplicates
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, imageType, listingTitle, productAsin } = await req.json();
    const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    
    if (!GOOGLE_GEMINI_API_KEY) {
      throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
    }

    const isMain = imageType === 'MAIN';
    
    const systemPrompt = `You are Guardian, an expert Amazon FBA compliance auditor with pixel-level precision. Your mission is to detect ALL policy violations that could trigger listing suppression.

## YOUR ANALYSIS PROTOCOL

### Phase 1: BACKGROUND ANALYSIS (MAIN images only)
${isMain ? `
Perform pixel-level scanning:
- Sample background pixels at edges and corners
- Pure white requirement: RGB(255,255,255) ±2 tolerance
- Detect gradients, shadows, or off-white tones
- Flag ANY deviation from pure white

Severity Levels:
- CRITICAL: Background clearly non-white (colored, gray, patterned)
- HIGH: Background off-white (RGB 250-254 range) 
- MEDIUM: Minor shadows or gradients at edges
- LOW: Barely perceptible imperfections
- NONE: Pure white verified
` : `
For SECONDARY images:
- Lifestyle/textured backgrounds are ALLOWED
- Focus on prohibited badge detection
- Preserve context while checking compliance
`}

### Phase 2: TEXT & BADGE DETECTION
Scan for prohibited overlays:
- "Best Seller" badges (gold/orange ribbon)
- "Amazon's Choice" badges (dark orange/black)
- "#1 Best Seller" rankings
- "Top Rated" labels
- "Deal of the Day" / "Lightning Deal" tags
- Promotional percentages ("30% OFF")
- Review stars or ratings overlays
- "Prime" logos added as overlays
- Watermarks or third-party logos
- "New" or "Sale" tags

For infographic text (SECONDARY only):
- Allowed: Product features, dimensions, ingredient lists
- Flag if text obscures critical product details

### Phase 3: PRODUCT OCCUPANCY (MAIN only)
${isMain ? `
Measure product frame coverage:
- Product should fill 85-100% of longest dimension
- Centered with minimal dead space
- No excessive cropping of product edges
- Proportional framing
` : ''}

### Phase 4: IMAGE QUALITY
Technical assessment:
- Resolution clarity (no pixelation)
- Focus sharpness (no blur)
- Lighting balance (no over/under exposure)
- Color accuracy (no distortion)
- Compression artifacts (minimal)

### Phase 5: OCR & CONTENT CONSISTENCY
Read all visible text on product packaging:
- Brand name
- Product name/variant
- Key claims/descriptions
- Model numbers

Compare against listing title for discrepancies.

## OUTPUT FORMAT
Return ONLY valid JSON:
{
  "overallScore": <0-100>,
  "status": "PASS" or "FAIL",
  "mainImageAnalysis": {
    "backgroundCheck": { 
      "isCompliant": boolean, 
      "detectedColor": "RGB(x,x,x) or description",
      "severity": "NONE|LOW|MEDIUM|HIGH|CRITICAL",
      "message": "Detailed finding" 
    },
    "textOverlayCheck": { 
      "isCompliant": boolean, 
      "detectedText": ["list", "of", "detected", "text"],
      "prohibitedBadges": ["list of found badges"],
      "message": "Detailed finding" 
    },
    "productOccupancy": { 
      "percentage": number, 
      "isCompliant": boolean, 
      "message": "Frame coverage assessment" 
    },
    "imageQuality": { 
      "score": number, 
      "issues": ["resolution", "focus", "lighting issues"],
      "message": "Technical quality assessment" 
    }
  },
  "contentConsistency": {
    "packagingTextDetected": "All text read from product packaging",
    "listingTitleMatch": boolean,
    "discrepancies": ["list of mismatches"],
    "isConsistent": boolean
  },
  "violations": [
    { 
      "severity": "critical|warning|info", 
      "category": "background|badges|text|quality|occupancy",
      "message": "What's wrong",
      "recommendation": "Specific fix action"
    }
  ],
  "fixRecommendations": ["Ordered list of fixes by priority"],
  "generativePrompt": "Detailed prompt for AI image generation to fix all issues"
}

SCORING GUIDE:
- 100: Perfect compliance, no issues
- 85-99: Minor issues, likely to pass
- 70-84: Moderate issues, fix recommended  
- 50-69: Significant violations, fix required
- 0-49: Critical failures, will be suppressed`;

    const userPrompt = `Analyze this ${isMain ? 'MAIN' : 'SECONDARY'} Amazon product image for FBA compliance.
${listingTitle ? `Listing Title: "${listingTitle}"` : 'No listing title provided - skip content consistency check.'}

Execute full analysis protocol and return comprehensive JSON assessment.`;

    console.log(`[Guardian] Analyzing ${imageType} image...`);
    console.log(`[Guardian] Phase 1: Scanning background pixels...`);
    console.log(`[Guardian] Phase 2: Detecting badges and text overlays...`);
    console.log(`[Guardian] Phase 3: Measuring product occupancy...`);

    const guessImageMimeType = (base64DataRaw: string): string => {
      const base64Data = (base64DataRaw || '').trim();
      if (base64Data.startsWith('/9j/')) return 'image/jpeg';
      if (base64Data.startsWith('iVBOR')) return 'image/png';
      if (base64Data.startsWith('R0lGOD')) return 'image/gif';
      if (base64Data.startsWith('UklGR')) return 'image/webp';
      return 'image/jpeg';
    };

    const normalizeMimeType = (mimeTypeRaw: string, base64Data: string): string => {
      const mt = (mimeTypeRaw || '').toLowerCase().trim();
      if (mt === 'image/jpg') return 'image/jpeg';
      const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
      if (!allowed.has(mt)) {
        return guessImageMimeType(base64Data);
      }
      return mt;
    };

    const extractBase64 = (dataUrl: string): { data: string; mimeType: string } => {
      if (dataUrl.startsWith('data:')) {
        const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          const data = (match[2] || '').trim();
          const mimeType = normalizeMimeType(match[1], data);
          return { mimeType, data };
        }
      }
      return { mimeType: 'image/jpeg', data: (dataUrl || '').trim() };
    };

    const imageData = extractBase64(imageBase64);

    const response = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{
            parts: [
              { text: userPrompt },
              {
                inline_data: {
                  mime_type: imageData.mimeType,
                  data: imageData.data
                }
              }
            ]
          }]
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      const parsedError = parseGeminiError(response.status, errorText);
      console.error("[Guardian] Google Gemini API error:", response.status, errorText);
      
      return new Response(JSON.stringify({ 
        error: parsedError.message,
        errorType: parsedError.errorType 
      }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[Guardian] Failed to parse JSON from response");
      throw new Error("Could not parse analysis result");
    }
    
    let analysis = JSON.parse(jsonMatch[0]);
    
    console.log(`[Guardian] Initial analysis complete. Score: ${analysis.overallScore}%, Status: ${analysis.status}`);
    console.log(`[Guardian] Found ${analysis.violations?.length || 0} violations`);

    // Phase 6: Real-time product claim verification
    // Extract product claims from detected text and listing title
    const allDetectedText = [
      listingTitle || '',
      analysis.contentConsistency?.packagingTextDetected || '',
      ...(analysis.mainImageAnalysis?.textOverlayCheck?.detectedText || [])
    ].join(' ');
    
    const productClaims = extractProductClaims(allDetectedText);
    
    if (productClaims.length > 0) {
      console.log(`[Guardian] Phase 6: Verifying ${productClaims.length} product claims via real-time search...`);
      console.log(`[Guardian] Claims to verify: ${productClaims.join(', ')}`);
      
      const { verifiedClaims, allValid } = await verifyProductClaims(productClaims, listingTitle, productAsin);
      
      // Filter out false positive violations about "unreleased" products that are actually released
      if (analysis.violations && analysis.violations.length > 0) {
        const originalViolationCount = analysis.violations.length;
        
        analysis.violations = analysis.violations.filter((violation: any) => {
          const violationText = `${violation.message || ''} ${violation.recommendation || ''}`.toLowerCase();
          
          // Check if this violation is about unreleased/deceptive product claims
          const isUnreleasedClaim = violationText.includes('unreleased') || 
                                    violationText.includes('not released') ||
                                    violationText.includes('deceptive') ||
                                    violationText.includes('doesn\'t exist') ||
                                    violationText.includes('does not exist') ||
                                    violationText.includes('fake product');
          
          if (isUnreleasedClaim) {
            // Check if any verified claim contradicts this violation
            for (const [claim, verification] of verifiedClaims) {
              if (violationText.includes(claim.toLowerCase()) && verification.verified) {
                console.log(`[Guardian] Removing false positive: "${violation.message}" - Product "${claim}" is verified as released`);
                return false; // Filter out this violation
              }
            }
            
            // Also check if the claim pattern matches any verified product
            for (const [claim, verification] of verifiedClaims) {
              if (verification.verified) {
                const claimLower = claim.toLowerCase();
                // Check for partial matches (e.g., "iPhone 17" in violation about "iPhone 17 Pro")
                if (productClaims.some(pc => violationText.includes(pc.toLowerCase()))) {
                  console.log(`[Guardian] Removing false positive violation - verified product exists`);
                  return false;
                }
              }
            }
          }
          
          return true; // Keep this violation
        });
        
        const removedCount = originalViolationCount - analysis.violations.length;
        if (removedCount > 0) {
          console.log(`[Guardian] Removed ${removedCount} false positive violations after real-time verification`);
          
          // Recalculate score if violations were removed
          if (analysis.violations.length === 0 && analysis.status === 'FAIL') {
            // If no violations remain that caused failure, might need to pass
            const criticalViolations = analysis.violations.filter((v: any) => v.severity === 'critical');
            if (criticalViolations.length === 0) {
              // Boost score since we removed false positives
              analysis.overallScore = Math.min(100, analysis.overallScore + (removedCount * 10));
              if (analysis.overallScore >= 70) {
                analysis.status = 'PASS';
              }
            }
          }
        }
      }
      
      // Add verification info to the analysis
      analysis.productVerification = {
        claimsChecked: productClaims,
        verificationResults: Object.fromEntries(verifiedClaims),
        allClaimsValid: allValid,
        verifiedAt: new Date().toISOString()
      };
    }
    
    console.log(`[Guardian] Final analysis. Score: ${analysis.overallScore}%, Status: ${analysis.status}`);

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Guardian] Analysis error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ 
      error: errorMessage,
      errorType: "analysis_failed"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
