import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function getUserId(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer "))
    throw { status: 401, message: "Unauthorized" };

  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser();
  if (error || !user) throw { status: 401, message: "Unauthorized" };
  return user.id;
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const userId = await getUserId(req);
    const admin = getAdminClient();

    // GET — return masked key info (never full key)
    if (req.method === "GET") {
      const { data, error } = await admin
        .from("user_api_keys")
        .select("id, provider, key_hint, created_at, updated_at")
        .eq("user_id", userId)
        .eq("provider", "gemini")
        .maybeSingle();

      if (error) throw error;

      return new Response(
        JSON.stringify({ key: data ? { ...data, configured: true } : null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // POST — save or update key
    if (req.method === "POST") {
      const { apiKey } = await req.json();
      if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 10) {
        return new Response(
          JSON.stringify({ error: "Invalid API key" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const trimmed = apiKey.trim();
      const hint = "…" + trimmed.slice(-4);

      // Validate key by making a simple Gemini API call
      const testUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${trimmed}`;
      const testResp = await fetch(testUrl);
      if (!testResp.ok) {
        const errText = await testResp.text();
        console.error("[manage-api-key] Validation failed:", testResp.status, errText);
        return new Response(
          JSON.stringify({ error: "Invalid Gemini API key. Please check and try again." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Upsert
      const { error } = await admin
        .from("user_api_keys")
        .upsert(
          {
            user_id: userId,
            provider: "gemini",
            encrypted_key: trimmed,
            key_hint: hint,
          },
          { onConflict: "user_id,provider" },
        );

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, key_hint: hint }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // DELETE — remove key
    if (req.method === "DELETE") {
      const { error } = await admin
        .from("user_api_keys")
        .delete()
        .eq("user_id", userId)
        .eq("provider", "gemini");

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    if (err?.status === 401) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("[manage-api-key] Error:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
