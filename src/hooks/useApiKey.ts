import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface ApiKeyState {
  configured: boolean;
  keyHint: string;
  loading: boolean;
}

export function useApiKey() {
  const { user } = useAuth();
  const [state, setState] = useState<ApiKeyState>({ configured: false, keyHint: '', loading: true });

  const fetchKey = useCallback(async () => {
    if (!user) { setState({ configured: false, keyHint: '', loading: false }); return; }
    const { data, error } = await supabase.functions.invoke('manage-api-key', { method: 'GET' });
    if (!error && data?.key?.configured) {
      setState({ configured: true, keyHint: data.key.key_hint || '', loading: false });
    } else {
      setState({ configured: false, keyHint: '', loading: false });
    }
  }, [user]);

  useEffect(() => { fetchKey(); }, [fetchKey]);

  const saveKey = async (apiKey: string) => {
    const { data, error } = await supabase.functions.invoke('manage-api-key', {
      method: 'POST',
      body: { apiKey },
    });
    if (error || data?.error) throw new Error(data?.error || 'Failed to save key');
    await fetchKey();
    return data;
  };

  const deleteKey = async () => {
    const { error } = await supabase.functions.invoke('manage-api-key', { method: 'DELETE' });
    if (error) throw error;
    await fetchKey();
  };

  return { ...state, saveKey, deleteKey, refresh: fetchKey };
}
