import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PolicyUpdate {
  date: string;
  policy_area: string;
  change_description: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  source_url?: string;
  keywords: string[];
}

export interface CurrentRulesSummary {
  main_image: string[];
  secondary_image: string[];
  prohibited_content: string[];
}

export interface PolicyData {
  updates: PolicyUpdate[];
  last_checked: string;
  source_summary?: string;
  current_rules_summary?: CurrentRulesSummary;
}

const CACHE_KEY = 'guardian_policy_updates';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getCached(): PolicyData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return data as PolicyData;
  } catch {
    return null;
  }
}

function setCache(data: PolicyData) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
  } catch { /* quota exceeded */ }
}

export function usePolicyUpdates() {
  const [data, setData] = useState<PolicyData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchUpdates = useCallback(async (force = false) => {
    if (!force) {
      const cached = getCached();
      if (cached) {
        setData(cached);
        return;
      }
    }

    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('check-policy-updates');
      if (error) {
        console.warn('Policy update check failed (non-critical):', error.message);
        return;
      }
      if (result && !result.error) {
        const policyData = result as PolicyData;
        setData(policyData);
        setCache(policyData);
      }
    } catch (e) {
      console.warn('Policy update check failed (non-critical):', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUpdates();
  }, [fetchUpdates]);

  const highImpactUpdates = data?.updates?.filter(u => u.impact === 'HIGH') || [];

  // Check if a violation message matches any recent policy keyword
  const getMatchingUpdate = useCallback((violationMessage: string, violationCategory: string): PolicyUpdate | null => {
    if (!data?.updates) return null;
    const lowerMsg = (violationMessage + ' ' + violationCategory).toLowerCase();
    return data.updates.find(u =>
      u.keywords?.some(kw => lowerMsg.includes(kw.toLowerCase()))
    ) || null;
  }, [data]);

  return { data, loading, highImpactUpdates, getMatchingUpdate, refresh: () => fetchUpdates(true) };
}
