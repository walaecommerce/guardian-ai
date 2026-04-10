/**
 * Shared helper to retrieve the user's BYOK Gemini API key from the database.
 * Falls back to the environment GOOGLE_GEMINI_API_KEY if no per-user key is stored.
 */
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

export interface AuthResult {
  userId: string;
  geminiApiKey: string;
}

/**
 * Authenticate the request and resolve the Gemini API key.
 * 1. Validates the JWT and extracts userId
 * 2. Looks up user_api_keys for a 'gemini' key
 * 3. Falls back to env GOOGLE_GEMINI_API_KEY
 * 4. Throws 403 if neither is available
 */
export async function resolveAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw { status: 401, message: "Unauthorized — sign in to use AI features" };
  }

  // Verify JWT
  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: claimsData, error: claimsErr } = await supabaseAuth.auth.getClaims(
    authHeader.replace("Bearer ", ""),
  );

  if (claimsErr || !claimsData?.claims?.sub) {
    throw { status: 401, message: "Unauthorized" };
  }

  const userId = claimsData.claims.sub as string;

  // Look up user's BYOK key
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: keyRow } = await admin
    .from("user_api_keys")
    .select("encrypted_key")
    .eq("user_id", userId)
    .eq("provider", "gemini")
    .maybeSingle();

  const geminiApiKey = keyRow?.encrypted_key || Deno.env.get("GOOGLE_GEMINI_API_KEY") || "";

  if (!geminiApiKey) {
    throw {
      status: 403,
      message: "No Gemini API key configured. Go to Settings → AI Provider to add your key.",
      errorType: "missing_api_key",
    };
  }

  return { userId, geminiApiKey };
}
