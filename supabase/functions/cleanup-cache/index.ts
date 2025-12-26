import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log("[CacheCleanup] Starting expired cache cleanup...");

    // Get count of expired entries before deletion
    const { count: expiredCount, error: countError } = await supabase
      .from('product_claim_cache')
      .select('*', { count: 'exact', head: true })
      .lt('expires_at', new Date().toISOString());

    if (countError) {
      console.error("[CacheCleanup] Error counting expired entries:", countError);
    }

    // Delete expired entries
    const { error: deleteError } = await supabase
      .from('product_claim_cache')
      .delete()
      .lt('expires_at', new Date().toISOString());

    if (deleteError) {
      console.error("[CacheCleanup] Error deleting expired entries:", deleteError);
      throw deleteError;
    }

    // Get remaining count
    const { count: remainingCount, error: remainingError } = await supabase
      .from('product_claim_cache')
      .select('*', { count: 'exact', head: true });

    const result = {
      success: true,
      deletedCount: expiredCount || 0,
      remainingCount: remainingCount || 0,
      timestamp: new Date().toISOString()
    };

    console.log(`[CacheCleanup] Deleted ${result.deletedCount} expired entries. ${result.remainingCount} entries remaining.`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[CacheCleanup] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
