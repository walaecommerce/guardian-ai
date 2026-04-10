import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { MODELS } from "../_shared/models.ts";
import { fetchGemini } from "../_shared/gemini.ts";
import { resolveAuth } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const MAX_RETRIES = 3;

// ── Prompt templates ─────────────────────────────────────────

const TEMPLATES: Record<string, (p: PromptParams) => string> = {
  hero: (p) => `Professional Amazon product photography of ${p.productName}. ${p.description}. Pure white background RGB(255,255,255), no shadows or gradients. Product centered and filling 85% of frame. Studio lighting with soft shadows. Sharp focus, high resolution. ${p.claims.length ? p.claims.join(', ') + ' visible on packaging.' : ''} Amazon main image compliant.`,

  lifestyle: (p) => `Lifestyle photograph showing ${p.productName} being enjoyed in a natural setting. ${p.description}. Warm natural lighting. Person enjoying the product in an aspirational way. ${p.claims.length ? p.claims.join(', ') + ' subtly visible on product packaging.' : ''} High resolution photography. No text overlays or badges.`,

  infographic: (p) => `Clean product infographic for ${p.productName}. Product on left side of frame. Right side shows 3-4 key benefits as text callouts with arrows pointing to product features. Clean sans-serif font. ${p.colors.length ? 'Brand colors: ' + p.colors.join(', ') + '.' : ''} Key claims: ${p.claims.join(', ') || 'premium quality'}. Professional Amazon listing design. ${p.description}`,

  size_reference: (p) => `Product size reference photo for ${p.productName}. ${p.description}. Product placed next to a common everyday object (hand, coin, ruler, pen) for scale comparison. Clean white or light neutral background. Clear size relationship visible. Professional product photography.`,

  ingredients: (p) => `Macro closeup shot of key ingredients for ${p.productName}. ${p.description}. Beautiful food/ingredient photography showing raw ingredients scattered artfully. Natural lighting, shallow depth of field. ${p.claims.length ? 'Highlighting: ' + p.claims.join(', ') + '.' : ''} High resolution detail photography.`,

  benefits_grid: (p) => `Professional 2x2 benefits grid infographic for ${p.productName}. Four quadrants each showing one key benefit with icon and short text. ${p.description}. ${p.colors.length ? 'Brand colors: ' + p.colors.join(', ') + '.' : ''} Clean modern design. ${p.claims.length ? 'Benefits: ' + p.claims.join(', ') + '.' : ''} Amazon listing format.`,

  before_after: (p) => `Before and after split image for ${p.productName}. Left side shows the problem/before state, right side shows the solution/after state with the product. ${p.description}. Clean dividing line between halves. Professional comparison photography. ${p.claims.length ? p.claims.join(', ') : ''}`,

  bundle: (p) => `Professional product bundle shot showing ${p.productName} with all included items/accessories arranged neatly. ${p.description}. Clean white background. All items clearly visible and labeled. Studio lighting. ${p.claims.length ? p.claims.join(', ') + '.' : ''} Amazon compliant product photography.`,
};

interface PromptParams {
  productName: string;
  description: string;
  claims: string[];
  colors: string[];
  template: string;
  aspectRatio: string;
  resolution: string;
  customPrompt?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { geminiApiKey } = await resolveAuth(req);

    const body: PromptParams = await req.json();
    const { productName, description, claims = [], colors = [], template, aspectRatio = '1:1', resolution = '2K', customPrompt } = body;

    if (!productName) throw new Error('Product name is required');

    // Build prompt
    const templateFn = TEMPLATES[template] || TEMPLATES.hero;
    const prompt = customPrompt || templateFn({ productName, description: description || '', claims, colors, template, aspectRatio, resolution });

    console.log(`[Studio] Generating ${template} image for "${productName}" at ${aspectRatio} ${resolution}`);

    let lastError = '';
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      console.log(`[generate-studio-image] using model: ${MODELS.imageGen}`);
      try {
        const response = await fetchGemini({
          apiKey: geminiApiKey,
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
    // Handle auth/BYOK errors from resolveAuth
    if ((e as any)?.status === 401 || (e as any)?.status === 403) {
      return new Response(JSON.stringify({ error: (e as any)?.message || "Unauthorized", errorType: (e as any)?.errorType || "auth_error" }), {
        status: (e as any)?.status || 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
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
