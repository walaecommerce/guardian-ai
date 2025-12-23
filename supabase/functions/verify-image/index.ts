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
    const { 
      originalImageBase64, 
      generatedImageBase64, 
      imageType, 
      mainImageBase64 
    } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const isMain = imageType === 'MAIN';
    
    const systemPrompt = `You are Guardian's verification module. Your job is to critically evaluate AI-generated product images for Amazon compliance.

## VERIFICATION PROTOCOL

You will receive:
1. ORIGINAL IMAGE - The source product image with violations
2. GENERATED IMAGE - The AI-corrected version to verify
${!isMain ? '3. MAIN PRODUCT REFERENCE - To verify product consistency' : ''}

## VERIFICATION CHECKLIST

### CHECK 1: PRODUCT IDENTITY (CRITICAL - Weight: 40%)
Compare the product between original and generated:
- Is it visually the SAME product?
- Are brand labels preserved and readable?
- Are product colors accurate?
- Are shapes and proportions correct?
- Would a customer recognize this as the same item?

FAIL CONDITIONS:
- Product looks different from original
- Labels are missing, changed, or illegible
- Colors are significantly altered
- Shape/proportions are distorted
- Brand identity is compromised

### CHECK 2: COMPLIANCE FIXES (Weight: 30%)
${isMain ? `
For MAIN images, verify:
- Background is PURE WHITE RGB(255,255,255)
  * Sample corners and edges mentally
  * No gray tones, no gradients, no shadows
  * Clean crisp edge between product and background
- All prohibited badges REMOVED
- Product occupies ~85% of frame
- Product is well-centered
` : `
For SECONDARY images, verify:
- Original context/background is PRESERVED (NOT white)
- ONLY prohibited badges removed
- Infographic elements preserved
- Product demonstration context intact
`}

### CHECK 3: QUALITY ASSESSMENT (Weight: 20%)
Evaluate:
- Resolution maintained or improved
- No blur or soft focus introduced
- No compression artifacts
- No unnatural edges or halos
- Professional appearance

### CHECK 4: NEW ISSUES INTRODUCED (Weight: 10%)
Check for AI generation artifacts:
- Distorted text on packaging
- Warped product shapes
- Unnatural lighting
- Floating/disconnected elements
- Visible editing seams

## SCORING FORMULA
Final Score = (Identity × 0.40) + (Compliance × 0.30) + (Quality × 0.20) + (NoNewIssues × 0.10)

Score each component 0-100, then calculate weighted average.

## OUTPUT FORMAT
Return ONLY valid JSON:
{
  "score": <0-100 weighted final score>,
  "isSatisfactory": <true if score >= 80 AND productMatch is true>,
  "productMatch": <boolean - is this visually the SAME product?>,
  "componentScores": {
    "identity": <0-100>,
    "compliance": <0-100>,
    "quality": <0-100>,
    "noNewIssues": <0-100>
  },
  "critique": "Concise description of the most important issues that need fixing",
  "improvements": [
    "Specific actionable improvement 1",
    "Specific actionable improvement 2"
  ],
  "passedChecks": [
    "What the generated image got RIGHT"
  ],
  "failedChecks": [
    "What still needs to be fixed"
  ],
  "thinkingSteps": [
    "Step-by-step verification process the user can see",
    "🔬 Sampling background color at corners: RGB(X,Y,Z)...",
    "📊 Comparing product silhouette with original...",
    "✓ Label text 'BRAND NAME' preserved correctly",
    "⚠️ Found slight color deviation in product body",
    "Show your calculation process so user sees AI 'thinking'"
  ]
}

IMPORTANT: The thinkingSteps array should show your actual analysis process step-by-step.
Include specific pixel sampling, measurements, comparisons, and decisions.
This will be displayed live to the user so they can see the AI verification happening.

CRITICAL: Be strict. Amazon will reject images with issues. Better to flag for retry than pass a flawed image.`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
    ];

    // Build content array with images
    const content: any[] = [
      { type: "text", text: `Verify this ${imageType} AI-generated image against Amazon compliance requirements.` },
      { type: "text", text: "=== ORIGINAL IMAGE (source with violations) ===" },
      { type: "image_url", image_url: { url: originalImageBase64 } },
      { type: "text", text: "=== GENERATED IMAGE (AI-corrected, needs verification) ===" },
      { type: "image_url", image_url: { url: generatedImageBase64 } },
    ];

    // Add main image reference for secondary images
    if (!isMain && mainImageBase64) {
      content.push(
        { type: "text", text: "=== MAIN PRODUCT REFERENCE (generated image must match this product) ===" },
        { type: "image_url", image_url: { url: mainImageBase64 } }
      );
    }

    content.push({ 
      type: "text", 
      text: "Execute full verification protocol and return detailed JSON assessment." 
    });

    messages.push({ role: "user", content });

    console.log(`[Guardian] Verifying ${imageType} image...`);
    console.log(`[Guardian] Check 1: Product identity verification...`);
    console.log(`[Guardian] Check 2: Compliance fixes verification...`);
    console.log(`[Guardian] Check 3: Quality assessment...`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.error("[Guardian] Rate limit exceeded");
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("[Guardian] AI Gateway error:", response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const responseContent = data.choices?.[0]?.message?.content || "";
    
    const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[Guardian] Failed to parse JSON from response");
      throw new Error("Could not parse verification result");
    }
    
    const verification = JSON.parse(jsonMatch[0]);
    
    console.log(`[Guardian] Verification complete. Score: ${verification.score}%, Satisfactory: ${verification.isSatisfactory}`);
    console.log(`[Guardian] Product match: ${verification.productMatch}`);
    if (verification.failedChecks?.length > 0) {
      console.log(`[Guardian] Failed checks: ${verification.failedChecks.join(', ')}`);
    }

    return new Response(JSON.stringify(verification), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Guardian] Verification error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
