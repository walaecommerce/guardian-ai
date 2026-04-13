import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface CreditRow {
  credit_type: string;
  total_credits: number;
  used_credits: number;
  plan: string;
}

export interface LedgerEntry {
  id: string;
  credit_type: string;
  amount: number;
  balance_after: number;
  event_type: string;
  description: string | null;
  created_at: string;
}

export type CreditType = 'scrape' | 'analyze' | 'fix' | 'enhance';

export function useCredits() {
  const { user, isAdmin } = useAuth();
  const [credits, setCredits] = useState<CreditRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCredits = useCallback(async () => {
    if (!user) {
      setCredits([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('user_credits')
      .select('credit_type, total_credits, used_credits, plan')
      .eq('user_id', user.id);

    if (!error && data) {
      setCredits(data);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  const remainingCredits = useCallback((type: CreditType) => {
    const row = credits.find(c => c.credit_type === type);
    if (!row) return 0;
    return Math.max(0, row.total_credits - row.used_credits);
  }, [credits]);

  const hasCredits = useCallback((type: CreditType) => {
    if (isAdmin) return true;
    return remainingCredits(type) > 0;
  }, [remainingCredits, isAdmin]);

  const totalCredits = useCallback((type: CreditType) => {
    const row = credits.find(c => c.credit_type === type);
    return row?.total_credits ?? 0;
  }, [credits]);

  const currentPlan = credits.length > 0 ? credits[0].plan : 'free';

  return {
    credits,
    loading,
    remainingCredits,
    hasCredits,
    totalCredits,
    currentPlan,
    refresh: fetchCredits,
  };
}
