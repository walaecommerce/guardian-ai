import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { MODELS } from "../_shared/models.ts";
import { fetchGemini } from "../_shared/gemini.ts";
import { requireAuth, isAuthError } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Prohibited elements for ALL Amazon product images
const PROHIBITED = [
  'promotional badges ("Best Seller", "Amazon\'s Choice", "#1")',
  'watermarks or third-party logos',
  'competitor brand names',
  '"Buy Now", "Sale", "Discount" text',
  'star ratings or review counts',
  'misleading size representations',
  'fake certification badges',
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authResult = await requireAuth(req, corsHeaders);
    if (isAuthError(authResult)) return authResult;

    const GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    const { prompt, imageType, category, productName } = await req.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: "No prompt provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build a structured, Amazon-safe prompt wrapper
    const sections: string[] = [];

    sections.push(`Generate a high-quality Amazon product listing image.`);
    sections.push(`IMAGE TYPE: ${imageType || "PRODUCT"}`);
    if (productName) sections.push(`PRODUCT: ${productName}`);
    if (category) sections.push(`CATEGORY: ${category}`);

    sections.push(`REQUIREMENTS:
- Professional product photography quality
- High resolution, sharp focus
- Amazon marketplace standards
- Clean, appealing composition`);

    sections.push(`SPECIFIC INSTRUCTIONS: ${prompt}`);

    sections.push(`PROHIBITED — DO NOT INCLUDE:
${PROHIBITED.map(p => `• ${p}`).join('\n')}`);

    sections.push(`AMAZON COMPLIANCE: No misleading elements. No fake badges or awards. Product must be accurately represented.`);

    const enhancedPrompt = sections.join('\n\n');

    const response = await fetchGemini({
      model: MODELS.imageGen,
      messages: [
        { role: "user", content: enhancedPrompt },
      ],
      modalities: ["image", "text"],
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Image generation error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`Image generation failed: ${response.status}`);
    }

    const data = await response.json();
    const imageData = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageData) {
      return new Response(JSON.stringify({ error: "No image generated" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      imageUrl: imageData,
      description: data.choices?.[0]?.message?.content || "",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Generate image error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
