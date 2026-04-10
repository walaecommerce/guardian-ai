/**
 * Shared auth helper for edge functions.
 * Validates JWT and returns userId, or a 401 Response.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export interface AuthResult {
  userId: string;
  email?: string;
}

export async function requireAuth(
  req: Request,
  corsHeaders: Record<string, string>
): Promise<AuthResult | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    }
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error } = await supabaseAuth.auth.getUser(token);

  if (error || !userData?.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return {
    userId: userData.user.id,
    email: userData.user.email,
  };
}

/** Type guard: true if requireAuth returned an error Response */
export function isAuthError(result: AuthResult | Response): result is Response {
  return result instanceof Response;
}
