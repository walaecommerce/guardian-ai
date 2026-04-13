import { createClient } from "npm:@supabase/supabase-js@2.57.2";

type CreditType = 'scrape' | 'analyze' | 'fix' | 'enhance';

/**
 * Check remaining credits for a user + type via the ledger.
 */
export async function checkCredits(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  creditType: CreditType,
): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc('get_credit_balance', {
    p_user_id: userId,
    p_credit_type: creditType,
  });

  if (error) {
    // Fallback to legacy table if RPC not available
    const { data: row, error: fetchErr } = await supabaseAdmin
      .from('user_credits')
      .select('total_credits, used_credits')
      .eq('user_id', userId)
      .eq('credit_type', creditType)
      .single();
    if (fetchErr || !row) return 0;
    return Math.max(0, row.total_credits - row.used_credits);
  }

  return data ?? 0;
}

/**
 * Atomically consume 1 credit using the ledger with idempotency.
 * Returns remaining count. Throws with status 402 if exhausted.
 *
 * @param idempotencyKey - unique key to prevent double-charge (e.g. `fix:${imageId}:${sessionId}`)
 */
export async function useCredit(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  creditType: CreditType,
  edgeFunction?: string,
  idempotencyKey?: string,
): Promise<{ remaining: number }> {
  // Check if user is admin — skip credit deduction
  const { data: roleData } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();

  if (roleData) {
    // Log but don't deduct
    await supabaseAdmin.from('credit_usage_log').insert({
      user_id: userId,
      credit_type: creditType,
      edge_function: edgeFunction ?? null,
    });
    return { remaining: 999999 };
  }

  // Generate idempotency key if not provided
  const idemKey = idempotencyKey ?? `${creditType}:${userId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

  // Use ledger-based atomic debit
  const { data, error } = await supabaseAdmin.rpc('debit_credit', {
    p_user_id: userId,
    p_credit_type: creditType,
    p_idempotency_key: idemKey,
    p_description: edgeFunction ? `Used by ${edgeFunction}` : null,
  });

  if (error) {
    // Fallback to legacy approach if RPC not available
    const { data: row, error: fetchErr } = await supabaseAdmin
      .from('user_credits')
      .select('id, total_credits, used_credits')
      .eq('user_id', userId)
      .eq('credit_type', creditType)
      .single();

    if (fetchErr || !row) {
      throw { status: 402, message: `No ${creditType} credits found` };
    }

    if (row.used_credits >= row.total_credits) {
      throw { status: 402, message: `No ${creditType} credits remaining. Upgrade your plan to continue.` };
    }

    const { error: updateErr } = await supabaseAdmin
      .from('user_credits')
      .update({ used_credits: row.used_credits + 1 })
      .eq('id', row.id)
      .eq('used_credits', row.used_credits);

    if (updateErr) {
      throw { status: 402, message: `Failed to deduct credit` };
    }

    // Also sync to legacy user_credits
    await supabaseAdmin.from('credit_usage_log').insert({
      user_id: userId,
      credit_type: creditType,
      edge_function: edgeFunction ?? null,
    });

    return { remaining: row.total_credits - row.used_credits - 1 };
  }

  const remaining = data ?? 0;

  if (remaining === -1) {
    throw { status: 402, message: `No ${creditType} credits remaining. Upgrade your plan to continue.` };
  }

  // Also update legacy user_credits for backward compat
  await supabaseAdmin
    .from('user_credits')
    .update({ used_credits: supabaseAdmin.rpc ? undefined : 0 })
    .eq('user_id', userId)
    .eq('credit_type', creditType);

  // Sync used_credits in legacy table
  const balance = remaining;
  const { data: legacyRow } = await supabaseAdmin
    .from('user_credits')
    .select('total_credits')
    .eq('user_id', userId)
    .eq('credit_type', creditType)
    .single();
  if (legacyRow) {
    await supabaseAdmin
      .from('user_credits')
      .update({ used_credits: legacyRow.total_credits - balance })
      .eq('user_id', userId)
      .eq('credit_type', creditType);
  }

  // Log consumption for usage history
  await supabaseAdmin.from('credit_usage_log').insert({
    user_id: userId,
    credit_type: creditType,
    edge_function: edgeFunction ?? null,
  });

  return { remaining };
}

/**
 * Helper: extract user ID from Authorization header via JWT claims.
 */
export async function getUserIdFromAuth(
  req: Request,
): Promise<string> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw { status: 401, message: 'Unauthorized' };
  }

  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: claimsData, error } = await supabaseAuth.auth.getClaims(
    authHeader.replace('Bearer ', ''),
  );

  if (error || !claimsData?.claims?.sub) {
    throw { status: 401, message: 'Unauthorized' };
  }

  return claimsData.claims.sub as string;
}

/**
 * Create a supabaseAdmin client using service role key.
 */
export function createAdminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}
