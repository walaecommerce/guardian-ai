import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface LedgerEntry {
  id: string;
  user_id: string;
  credit_type: string;
  amount: number;
  balance_after: number;
  event_type: string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Hook to fetch credit ledger entries for a user (or all users for admin).
 */
export function useCreditLedger(targetUserId?: string, limit = 50) {
  const { user, isAdmin } = useAuth();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  const fetchLedger = useCallback(async (pageNum = 0) => {
    const userId = targetUserId || user?.id;
    if (!userId) {
      setEntries([]);
      setLoading(false);
      return;
    }

    const from = pageNum * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('credit_ledger')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    // If admin viewing a specific user, filter by that user
    if (targetUserId) {
      query = query.eq('user_id', targetUserId);
    } else {
      query = query.eq('user_id', userId);
    }

    const { data, count, error } = await query;

    if (!error && data) {
      setEntries(data as unknown as LedgerEntry[]);
      setTotal(count ?? 0);
    }
    setPage(pageNum);
    setLoading(false);
  }, [user, targetUserId, limit]);

  useEffect(() => {
    fetchLedger(0);
  }, [fetchLedger]);

  return {
    entries,
    loading,
    total,
    page,
    pageSize: limit,
    fetchPage: fetchLedger,
    refresh: () => fetchLedger(page),
  };
}
