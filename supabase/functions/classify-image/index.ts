import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

interface ClassificationResult {
  category: string;
  confidence: number;
  reasoning: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, productTitle, asin } = await req.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: 'imageBase64 is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare the image URL for the vision model
    const imageUrl = imageBase64.startsWith('data:') 
      ? imageBase64 
      : `data:image/jpeg;base64,${imageBase64}`;

    const contextInfo = productTitle ? `Product: "${productTitle}"` : '';
    const asinInfo = asin ? `ASIN: ${asin}` : '';

    const systemPrompt = `You are an expert Amazon product image classifier. Your task is to analyze product listing images and classify them into specific categories.

Categories to classify:
1. MAIN - Primary product image on a pure white background, no text overlays, badges, or graphics. Just the product clearly visible.
2. INFOGRAPHIC - Image with text callouts, feature highlights, specifications, bullet points, diagrams, or educational content about the product.
3. LIFESTYLE - Product shown in a real-world setting or environment. May include people, rooms, outdoor scenes, or contextual backgrounds.
4. PRODUCT_IN_USE - Someone actively using or demonstrating the product. Focus is on the action/usage.
5. SIZE_CHART - Dimensions, measurements, size comparisons, or measurement graphics.
6. COMPARISON - Before/after shots, vs competitors, feature comparison tables, or side-by-side comparisons.
7. PACKAGING - Shows the product box, packaging, or what's included in the box.
8. DETAIL - Close-up or zoom shot of specific product features, textures, or components.

Respond with ONLY a JSON object in this exact format:
{
  "category": "CATEGORY_NAME",
  "confidence": 85,
  "reasoning": "Brief explanation of why this category"
}`;

    const userPrompt = `Classify this Amazon product image.
${contextInfo}
${asinInfo}

Analyze the image and determine which category it belongs to based on its visual characteristics.`;

    console.log('Calling Lovable AI for image classification...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              { type: 'image_url', image_url: { url: imageUrl } }
            ]
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded, please try again later' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'AI classification failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log('AI response:', content);

    // Parse the JSON response
    let result: ClassificationResult;
    try {
      // Extract JSON from the response (handle markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      result = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // Default fallback
      result = {
        category: 'UNKNOWN',
        confidence: 0,
        reasoning: 'Failed to parse classification result'
      };
    }

    // Validate the category
    const validCategories = ['MAIN', 'INFOGRAPHIC', 'LIFESTYLE', 'PRODUCT_IN_USE', 'SIZE_CHART', 'COMPARISON', 'PACKAGING', 'DETAIL', 'UNKNOWN'];
    if (!validCategories.includes(result.category)) {
      result.category = 'UNKNOWN';
    }

    console.log('Classification result:', result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Classification error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        category: 'UNKNOWN',
        confidence: 0
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
