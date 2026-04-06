import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface SubscriptionState {
  subscribed: boolean;
  plan: string;
  productId: string | null;
  subscriptionEnd: string | null;
  loading: boolean;
}

export function useSubscription() {
  const { user, session, isLoading: authLoading } = useAuth();
  const [state, setState] = useState<SubscriptionState>({
    subscribed: false,
    plan: 'free',
    productId: null,
    subscriptionEnd: null,
    loading: true,
  });

  const checkSubscription = useCallback(async () => {
    if (authLoading) return;

    if (!user || !session?.access_token) {
      setState({ subscribed: false, plan: 'free', productId: null, subscriptionEnd: null, loading: false });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('check-subscription');
      if (error) throw error;

      setState({
        subscribed: data.subscribed ?? false,
        plan: data.plan ?? 'free',
        productId: data.product_id ?? null,
        subscriptionEnd: data.subscription_end ?? null,
        loading: false,
      });
    } catch (err) {
      console.error('Subscription check failed:', err);
      setState(s => ({ ...s, loading: false }));
    }
  }, [authLoading, user, session]);

  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    if (!user || !session?.access_token || authLoading) return;
    const interval = setInterval(checkSubscription, 60_000);
    return () => clearInterval(interval);
  }, [authLoading, user, session, checkSubscription]);

  const startCheckout = useCallback(async (priceId: string) => {
    const { data, error } = await supabase.functions.invoke('create-checkout', {
      body: { priceId },
    });
    if (error) throw error;
    if (data?.url) {
      window.open(data.url, '_blank');
    }
  }, []);

  const openPortal = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke('customer-portal');
    if (error) throw error;
    if (data?.url) {
      window.open(data.url, '_blank');
    }
  }, []);

  return {
    ...state,
    checkSubscription,
    startCheckout,
    openPortal,
  };
}
