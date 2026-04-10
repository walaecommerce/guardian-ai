import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PolicyUpdate {
  title: string;
  summary: string;
  sourceUrl: string;
  sourceName: string;
  publishedDate: string;
  checkedAt: string;
  confidence: 'high' | 'medium' | 'low';
  affectedArea: 'title' | 'image' | 'claims' | 'content' | 'general';
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  keywords: string[];
  // Legacy compat
  date?: string;
  policy_area?: string;
  change_description?: string;
  source_url?: string;
}

export interface CurrentRulesSummary {
  main_image: string[];
  secondary_image: string[];
  prohibited_content: string[];
}

export interface PolicyData {
  status: 'updates_found' | 'no_updates' | 'error';
  updates: PolicyUpdate[];
  checkedAt: string;
  last_checked?: string;
  source_summary?: string;
  current_rules_summary?: CurrentRulesSummary;
  reason?: string;
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
        setData({
          status: 'error',
          updates: [],
          checkedAt: new Date().toISOString(),
          reason: error.message,
        });
        return;
      }
      if (result && !result.error) {
        const policyData = result as PolicyData;
        // Ensure status field exists
        if (!policyData.status) {
          policyData.status = (policyData.updates?.length > 0) ? 'updates_found' : 'no_updates';
        }
        policyData.checkedAt = policyData.checkedAt || policyData.last_checked || new Date().toISOString();
        setData(policyData);
        setCache(policyData);
      }
    } catch (e) {
      console.warn('Policy update check failed (non-critical):', e);
      setData({
        status: 'error',
        updates: [],
        checkedAt: new Date().toISOString(),
        reason: 'Research unavailable',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUpdates();
  }, [fetchUpdates]);

  const highImpactUpdates = data?.updates?.filter(u => u.impact === 'HIGH') || [];

  const getMatchingUpdate = useCallback((violationMessage: string, violationCategory: string): PolicyUpdate | null => {
    if (!data?.updates) return null;
    const lowerMsg = (violationMessage + ' ' + violationCategory).toLowerCase();
    return data.updates.find(u =>
      u.keywords?.some(kw => lowerMsg.includes(kw.toLowerCase()))
    ) || null;
  }, [data]);

  return { data, loading, highImpactUpdates, getMatchingUpdate, refresh: () => fetchUpdates(true) };
}
