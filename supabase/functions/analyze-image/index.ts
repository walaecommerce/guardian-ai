import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, imageType, listingTitle } = await req.json();
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

    // Extract base64 data from data URL
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

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }]
        },
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
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.error("[Guardian] Rate limit exceeded");
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait and try again." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("[Guardian] Google Gemini API error:", response.status, errorText);
      throw new Error(`Google Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[Guardian] Failed to parse JSON from response");
      throw new Error("Could not parse analysis result");
    }
    
    const analysis = JSON.parse(jsonMatch[0]);
    
    console.log(`[Guardian] Analysis complete. Score: ${analysis.overallScore}%, Status: ${analysis.status}`);
    console.log(`[Guardian] Found ${analysis.violations?.length || 0} violations`);

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Guardian] Analysis error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
