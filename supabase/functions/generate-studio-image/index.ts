import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { MODELS } from "../_shared/models.ts";
import { fetchGemini } from "../_shared/gemini.ts";
import { requireAuth, isAuthError } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const MAX_RETRIES = 3;

// ── Category-specific prohibited elements ─────────────────────

const PROHIBITED_ELEMENTS = [
  'promotional badges ("Best Seller", "Amazon\'s Choice", "#1")',
  'watermarks or logos not belonging to the brand',
  'competitor brand names or logos',
  '"Buy Now", "Sale", "Discount" text',
  'star ratings or review counts',
  'QR codes on main images',
  'misleading size representations',
];

const CATEGORY_RULES: Record<string, { required: string[]; prohibited: string[]; style: string }> = {
  FOOD_BEVERAGE: {
    required: ['packaging as hero subject', 'front-label clearly visible', 'appetizing presentation'],
    prohibited: ['loose food without packaging on MAIN', 'unverified health claims'],
    style: 'Warm, appetizing lighting. Clean presentation. Food-safe setting.',
  },
  SUPPLEMENTS: {
    required: ['bottle/container as hero', 'supplement facts panel visible', 'clinical clarity'],
    prohibited: ['loose pills/capsules as MAIN image', 'medical claims without FDA disclaimer'],
    style: 'Clean, clinical lighting. White or neutral background. Professional health product aesthetics.',
  },
  APPAREL: {
    required: ['flat lay or ghost mannequin', 'fabric texture visible', 'true-to-life colors'],
    prohibited: ['wrinkled or poorly ironed garments', 'cluttered backgrounds'],
    style: 'Even, neutral lighting. Ghost mannequin or flat lay. Accurate color representation.',
  },
  ELECTRONICS: {
    required: ['3/4 angle showing depth', 'visible ports and interfaces', 'screen content if applicable'],
    prohibited: ['outdated UI on screens', 'cables obscuring product'],
    style: 'Sharp, detailed studio lighting. Slight shadow for depth. Technical precision.',
  },
  BEAUTY: {
    required: ['luxurious lighting', 'glass/metallic texture rendering', 'slight 5-degree angle'],
    prohibited: ['before/after medical claims', 'unrealistic skin editing'],
    style: 'Soft, luxurious lighting. Premium feel. Emphasis on texture and finish.',
  },
  PET_SUPPLIES: {
    required: ['treats front-facing', 'toys at natural play angles', 'size reference where relevant'],
    prohibited: ['unsafe product usage depictions', 'aggressive animal imagery'],
    style: 'Warm, friendly lighting. Natural angles. Pet-safe context.',
  },
  HOME_GARDEN: {
    required: ['material textures clearly visible', 'warm-neutral lighting', 'room context for lifestyle'],
    prohibited: ['misleading scale', 'unrelated decor distracting from product'],
    style: 'Warm, inviting lighting. Home setting context. Material detail emphasis.',
  },
  GENERAL: {
    required: ['product clearly identifiable', 'clean composition', 'professional lighting'],
    prohibited: [],
    style: 'Clean, professional studio lighting. Sharp focus. Product-forward composition.',
  },
};

// ── Structured prompt planner ─────────────────────────────────

interface PromptParams {
  productName: string;
  description: string;
  claims: string[];
  colors: string[];
  template: string;
  aspectRatio: string;
  resolution: string;
  customPrompt?: string;
  category?: string;
}

function buildStructuredPrompt(params: PromptParams): string {
  const cat = (params.category || 'GENERAL').toUpperCase();
  const rules = CATEGORY_RULES[cat] || CATEGORY_RULES.GENERAL;

  const sections: string[] = [];

  // Subject
  sections.push(`SUBJECT: ${params.productName}${params.description ? '. ' + params.description : ''}`);

  // Template-specific composition
  const compositionMap: Record<string, string> = {
    hero: 'Pure white background RGB(255,255,255). Product centered, filling 85%+ of frame. No shadows, gradients, or props. Single product only.',
    lifestyle: 'Natural, aspirational setting. Product in active use by a person. Warm natural lighting. Shallow depth of field on background.',
    infographic: 'Product on left 40% of frame. Right side: 3-4 key benefit callouts with clean arrows pointing to features. Sans-serif typography. Clean grid layout.',
    size_reference: 'Product placed next to a common everyday object (hand, coin, ruler) for scale. Clean white or light neutral background.',
    ingredients: 'Macro close-up of raw key ingredients scattered artfully. Natural lighting. Shallow depth of field. Vibrant, appetizing colors.',
    benefits_grid: '2×2 grid layout. Each quadrant shows one key benefit with icon and short label. Product centered or in each quadrant. Clean modern design.',
    before_after: 'Split composition: left shows the problem state, right shows the solution with the product. Clean vertical dividing line. Equal lighting on both halves.',
    bundle: 'All included items arranged in a clean, organized flat lay or stepped arrangement. Each item clearly visible and identifiable. White background.',
  };
  sections.push(`COMPOSITION: ${compositionMap[params.template] || compositionMap.hero}`);

  // Style direction
  sections.push(`STYLE: ${rules.style}`);

  // Category requirements
  if (rules.required.length > 0) {
    sections.push(`CATEGORY REQUIREMENTS: ${rules.required.join('. ')}.`);
  }

  // Claims to preserve
  if (params.claims.length > 0) {
    sections.push(`ALLOWED CLAIMS (show on packaging if visible): ${params.claims.join(', ')}`);
  }

  // Brand colors
  if (params.colors.length > 0) {
    sections.push(`BRAND COLORS: ${params.colors.join(', ')}`);
  }

  // Prohibited elements — always include
  const allProhibited = [...PROHIBITED_ELEMENTS, ...rules.prohibited];
  sections.push(`PROHIBITED — DO NOT INCLUDE:\n${allProhibited.map(p => `  • ${p}`).join('\n')}`);

  // Amazon compliance
  sections.push(`AMAZON COMPLIANCE: Professional product photography quality. High resolution. Sharp focus. No misleading elements. No text overlays on MAIN images.`);

  return sections.join('\n\n');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authResult = await requireAuth(req, corsHeaders);
    if (isAuthError(authResult)) return authResult;

    const body: PromptParams = await req.json();
    const { productName, description, claims = [], colors = [], template, aspectRatio = '1:1', resolution = '2K', customPrompt, category } = body;

    if (!productName) throw new Error('Product name is required');

    // Build structured prompt
    const prompt = customPrompt || buildStructuredPrompt({
      productName, description: description || '', claims, colors, template, aspectRatio, resolution, category,
    });

    console.log(`[Studio] Generating ${template} image for "${productName}" (category: ${category || 'GENERAL'}) at ${aspectRatio} ${resolution}`);

    let lastError = '';
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      console.log(`[generate-studio-image] using model: ${MODELS.imageGen}`);
      try {
        const response = await fetchGemini({
          model: MODELS.imageGen,
          messages: [{ role: "user", content: prompt }],
          modalities: ["image", "text"],
        });

        if (response.status === 429) {
          console.log(`[Studio] Rate limited, retry ${attempt + 1}`);
          await sleep(10000 * (attempt + 1));
          continue;
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add credits in Settings → Workspace → Usage.' }), {
            status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (!response.ok) {
          lastError = await response.text();
          console.error(`[Studio] API error ${response.status}:`, lastError);
          await sleep(5000 * (attempt + 1));
          continue;
        }

        const data = await response.json();
        const images = data.choices?.[0]?.message?.images;
        if (!images?.[0]?.image_url?.url) {
          lastError = 'No image in response';
          await sleep(5000);
          continue;
        }

        return new Response(JSON.stringify({
          image: images[0].image_url.url,
          prompt,
          template,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      } catch (e) {
        lastError = e instanceof Error ? e.message : 'Unknown';
        console.error(`[Studio] Attempt ${attempt + 1} error:`, lastError);
        await sleep(5000 * (attempt + 1));
      }
    }

    return new Response(JSON.stringify({ error: `Generation failed after ${MAX_RETRIES} attempts: ${lastError}` }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('[Studio] Fatal error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
