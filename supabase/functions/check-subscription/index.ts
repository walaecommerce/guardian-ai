import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  console.log(`[CHECK-SUBSCRIPTION] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

// Map product IDs to plan names and credit allotments
const PLAN_MAP: Record<string, { plan: string; scrape: number; analyze: number; fix: number }> = {
  "prod_UHjTdlsO5RUwtK": { plan: "starter", scrape: 50, analyze: 100, fix: 20 },
  "prod_UHjUUnk2kWv6VF": { plan: "pro", scrape: 200, analyze: 500, fix: 100 },
  "prod_UHjUHD5BsRtLHe": { plan: "agency", scrape: 1000, analyze: 2500, fix: 500 },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  // Anon client with user's auth header for getClaims
  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAdmin.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) throw new Error(`Auth error: ${claimsError?.message || 'Invalid token'}`);
    
    const userId = claimsData.claims.sub as string;
    const email = claimsData.claims.email as string;
    if (!email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId, email });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email, limit: 1 });

    if (customers.data.length === 0) {
      logStep("No Stripe customer found, user is on free plan");
      return new Response(JSON.stringify({ subscribed: false, plan: "free" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      logStep("No active subscription");
      // Reset to free tier credits
      await syncCredits(supabaseAdmin, userId, "free", 5, 10, 2);
      return new Response(JSON.stringify({ subscribed: false, plan: "free" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const subscription = subscriptions.data[0];
    const productId = subscription.items.data[0].price.product as string;
    const subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
    const planInfo = PLAN_MAP[productId] || { plan: "unknown", scrape: 5, analyze: 10, fix: 2 };

    logStep("Active subscription found", { productId, plan: planInfo.plan, subscriptionEnd });

    // Sync credits to match the active plan
    await syncCredits(supabaseAdmin, userId, planInfo.plan, planInfo.scrape, planInfo.analyze, planInfo.fix);

    return new Response(JSON.stringify({
      subscribed: true,
      plan: planInfo.plan,
      product_id: productId,
      subscription_end: subscriptionEnd,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

async function syncCredits(
  supabase: any,
  userId: string,
  plan: string,
  scrapeTotal: number,
  analyzeTotal: number,
  fixTotal: number
) {
  const creditTypes = [
    { credit_type: "scrape", total_credits: scrapeTotal },
    { credit_type: "analyze", total_credits: analyzeTotal },
    { credit_type: "fix", total_credits: fixTotal },
  ];

  for (const ct of creditTypes) {
    // Check existing row
    const { data: existing } = await supabase
      .from("user_credits")
      .select("id, total_credits, plan")
      .eq("user_id", userId)
      .eq("credit_type", ct.credit_type)
      .single();

    if (existing) {
      // Only update if plan changed
      if (existing.plan !== plan || existing.total_credits !== ct.total_credits) {
        await supabase
          .from("user_credits")
          .update({ total_credits: ct.total_credits, plan, used_credits: 0 })
          .eq("id", existing.id);
        logStep(`Updated ${ct.credit_type} credits`, { plan, total: ct.total_credits });
      }
    } else {
      await supabase
        .from("user_credits")
        .insert({ user_id: userId, credit_type: ct.credit_type, total_credits: ct.total_credits, used_credits: 0, plan });
      logStep(`Inserted ${ct.credit_type} credits`, { plan, total: ct.total_credits });
    }
  }
}
