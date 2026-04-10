import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth, isAuthError } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { MODELS } from "../_shared/models.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authResult = await requireAuth(req, corsHeaders);
    if (isAuthError(authResult)) return authResult;

    // Check admin role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', authResult.userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check provider health
    const geminiKey = Deno.env.get('GOOGLE_GEMINI_API_KEY');
    const isConfigured = !!geminiKey;
    let isHealthy = false;
    let lastCheckError: string | null = null;

    if (isConfigured) {
      try {
        // Lightweight models list call to verify the key works
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}&pageSize=1`,
          { signal: AbortSignal.timeout(8000) }
        );
        isHealthy = resp.ok;
        if (!resp.ok) {
          const body = await resp.text();
          lastCheckError = `HTTP ${resp.status}: ${body.slice(0, 200)}`;
        }
      } catch (e) {
        lastCheckError = e instanceof Error ? e.message : 'Connection failed';
      }
    }

    const status = {
      provider: 'Google Gemini',
      configured: isConfigured,
      healthy: isHealthy,
      lastCheckAt: new Date().toISOString(),
      lastCheckError,
      models: {
        analysis: MODELS.analysis,
        verification: MODELS.verification,
        imageGeneration: MODELS.imageGen,
        imageGenerationHQ: MODELS.imageGenHQ,
      },
    };

    return new Response(JSON.stringify(status), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
