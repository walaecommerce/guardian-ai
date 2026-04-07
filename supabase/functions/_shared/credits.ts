import { createClient } from "npm:@supabase/supabase-js@2.57.2";

type CreditType = 'scrape' | 'analyze' | 'fix';

/**
 * Check remaining credits for a user + type.
 */
export async function checkCredits(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  creditType: CreditType,
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('user_credits')
    .select('total_credits, used_credits')
    .eq('user_id', userId)
    .eq('credit_type', creditType)
    .single();

  if (error || !data) return 0;
  return Math.max(0, data.total_credits - data.used_credits);
}

/**
 * Atomically consume 1 credit. Returns remaining count.
 * Throws with status 402 if exhausted.
 */
export async function useCredit(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  creditType: CreditType,
  edgeFunction?: string,
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

  // Atomic: only increment if used < total
  const { data, error } = await supabaseAdmin.rpc('use_credit', {
    p_user_id: userId,
    p_credit_type: creditType,
  });

  let remaining = 0;

  // Fallback if RPC doesn't exist yet — do manual update
  if (error?.code === '42883' || error?.message?.includes('function')) {
    // Function doesn't exist, use manual approach
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
      .eq('used_credits', row.used_credits); // optimistic lock

    if (updateErr) {
      throw { status: 402, message: `Failed to deduct credit` };
    }

    remaining = row.total_credits - row.used_credits - 1;
  } else if (error) {
    throw { status: 402, message: error.message };
  } else {
    remaining = data ?? 0;
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
