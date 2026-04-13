import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;

    const { code } = await req.json();
    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Promo code is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Look up promo code
    const { data: promo, error: promoErr } = await admin
      .from('promo_codes')
      .select('*')
      .eq('code', code.trim().toUpperCase())
      .eq('active', true)
      .single();

    if (promoErr || !promo) {
      return new Response(JSON.stringify({ error: 'Invalid or expired promo code' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Check expiration
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'This promo code has expired' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Check max redemptions
    if (promo.max_redemptions !== null && promo.current_redemptions >= promo.max_redemptions) {
      return new Response(JSON.stringify({ error: 'This promo code has reached its maximum redemptions' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Check duplicate redemption
    const { data: existing } = await admin
      .from('promo_redemptions')
      .select('id')
      .eq('user_id', userId)
      .eq('promo_code_id', promo.id)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: 'You have already redeemed this promo code' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Grant credits via ledger
    const idemKey = `promo:${promo.id}:${userId}`;
    const { data: newBalance, error: grantErr } = await admin.rpc('grant_credit', {
      p_user_id: userId,
      p_credit_type: promo.credit_type,
      p_amount: promo.credit_amount,
      p_event_type: 'promo',
      p_description: `Promo code: ${promo.code}`,
      p_idempotency_key: idemKey,
    });

    if (grantErr) {
      console.error('[redeem-promo] Grant failed:', grantErr);
      return new Response(JSON.stringify({ error: 'Failed to apply promo credits' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 6. Get the ledger entry ID for the redemption record
    const { data: ledgerEntry } = await admin
      .from('credit_ledger')
      .select('id')
      .eq('idempotency_key', idemKey)
      .single();

    // 7. Record redemption with affiliate attribution snapshot
    await admin.from('promo_redemptions').insert({
      user_id: userId,
      promo_code_id: promo.id,
      ledger_entry_id: ledgerEntry?.id ?? null,
      affiliate_tag: promo.affiliate_tag ?? null,
      credits_granted: promo.credit_amount,
    });

    // 8. Increment redemption count
    await admin
      .from('promo_codes')
      .update({ current_redemptions: promo.current_redemptions + 1 })
      .eq('id', promo.id);

    // 9. Sync legacy user_credits
    const { data: legacyRow } = await admin
      .from('user_credits')
      .select('id, total_credits')
      .eq('user_id', userId)
      .eq('credit_type', promo.credit_type)
      .single();

    if (legacyRow) {
      await admin
        .from('user_credits')
        .update({ total_credits: legacyRow.total_credits + promo.credit_amount })
        .eq('id', legacyRow.id);
    }

    console.log(`[redeem-promo] ✅ ${promo.code} redeemed by ${userId}: +${promo.credit_amount} ${promo.credit_type}`);

    return new Response(JSON.stringify({
      success: true,
      creditType: promo.credit_type,
      amount: promo.credit_amount,
      newBalance: newBalance ?? 0,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[redeem-promo] Error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Redemption failed',
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
