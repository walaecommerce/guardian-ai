import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is admin
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await anonClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = claims.claims.sub as string;

    // Check admin role
    const { data: roleData } = await anonClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: admin required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, targetUserId } = body;

    if (!action || !targetUserId) {
      return new Response(JSON.stringify({ error: "action and targetUserId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service role client for privileged operations
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (action === "reset_password") {
      // Get user email
      const { data: userData, error: userErr } = await serviceClient.auth.admin.getUserById(targetUserId);
      if (userErr || !userData?.user?.email) {
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Generate password reset link
      const { data: linkData, error: linkErr } = await serviceClient.auth.admin.generateLink({
        type: "recovery",
        email: userData.user.email,
      });

      if (linkErr) {
        return new Response(JSON.stringify({ error: linkErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Log admin action
      await anonClient.from("app_events").insert({
        user_id: callerId,
        event_type: "admin_password_reset",
        metadata: { target_user_id: targetUserId, target_email: userData.user.email },
      });

      return new Response(JSON.stringify({ success: true, email: userData.user.email }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "disable_user" || action === "enable_user") {
      const disabled = action === "disable_user";

      // Update profile
      const { error: profileErr } = await serviceClient
        .from("user_profiles")
        .update({ disabled })
        .eq("id", targetUserId);

      if (profileErr) {
        return new Response(JSON.stringify({ error: profileErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Ban/unban via Supabase Auth
      const { error: authErr } = await serviceClient.auth.admin.updateUserById(targetUserId, {
        ban_duration: disabled ? "876000h" : "none",
      });

      if (authErr) {
        console.error("Auth ban update failed:", authErr.message);
      }

      // Log admin action
      await anonClient.from("app_events").insert({
        user_id: callerId,
        event_type: disabled ? "admin_disable_user" : "admin_enable_user",
        metadata: { target_user_id: targetUserId },
      });

      return new Response(JSON.stringify({ success: true, disabled }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
