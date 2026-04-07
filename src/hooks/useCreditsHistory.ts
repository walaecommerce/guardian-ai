import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { format, subDays, eachDayOfInterval } from 'date-fns';

export interface DailyUsage {
  date: string;
  scrape: number;
  analyze: number;
  fix: number;
}

export function useCreditsHistory(days = 30) {
  const { user } = useAuth();
  const [data, setData] = useState<DailyUsage[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    if (!user) {
      setData([]);
      setLoading(false);
      return;
    }

    const since = subDays(new Date(), days);

    const { data: rows, error } = await supabase
      .from('credit_usage_log')
      .select('credit_type, consumed_at')
      .eq('user_id', user.id)
      .gte('consumed_at', since.toISOString())
      .order('consumed_at', { ascending: true });

    if (error || !rows) {
      setData([]);
      setLoading(false);
      return;
    }

    // Build a map of every day in the range
    const interval = eachDayOfInterval({ start: since, end: new Date() });
    const dayMap: Record<string, DailyUsage> = {};
    for (const d of interval) {
      const key = format(d, 'MMM dd');
      dayMap[key] = { date: key, scrape: 0, analyze: 0, fix: 0 };
    }

    // Aggregate
    for (const row of rows) {
      const key = format(new Date(row.consumed_at), 'MMM dd');
      if (dayMap[key] && (row.credit_type === 'scrape' || row.credit_type === 'analyze' || row.credit_type === 'fix')) {
        dayMap[key][row.credit_type]++;
      }
    }

    setData(Object.values(dayMap));
    setLoading(false);
  }, [user, days]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { data, loading, refresh: fetchHistory };
}
