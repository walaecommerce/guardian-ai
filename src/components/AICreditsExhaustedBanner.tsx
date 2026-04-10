import { useState, useEffect, useRef } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PauseCircle, Play, X, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface AICreditsExhaustedBannerProps {
  visible: boolean;
  analyzedCount?: number;
  totalCount?: number;
  onResume?: () => void;
}

export function AICreditsExhaustedBanner({ visible, analyzedCount, totalCount, onResume }: AICreditsExhaustedBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [creditsRestored, setCreditsRestored] = useState(false);
  const { user } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible || dismissed || !user) {
      setCreditsRestored(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    const check = async () => {
      const { data } = await supabase
        .from('user_credits')
        .select('total_credits, used_credits')
        .eq('user_id', user.id)
        .eq('credit_type', 'analyze')
        .maybeSingle();

      if (data && data.total_credits - data.used_credits > 0) {
        setCreditsRestored(true);
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    };

    check();
    intervalRef.current = setInterval(check, 15000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [visible, dismissed, user]);

  if (!visible || dismissed) return null;

  const remaining = totalCount && analyzedCount != null ? totalCount - analyzedCount : undefined;

  return (
    <Alert className={`mx-6 mt-3 relative ${creditsRestored ? 'border-green-500/30 bg-green-500/5' : 'border-primary/30 bg-primary/5'}`}>
      {creditsRestored ? (
        <CheckCircle2 className="h-4 w-4 text-green-500" />
      ) : (
        <PauseCircle className="h-4 w-4 text-primary" />
      )}
      <AlertTitle className="text-foreground">
        {creditsRestored ? 'Credits Restored — Ready to Resume' : 'Audit Paused'}
      </AlertTitle>
      <AlertDescription className="text-muted-foreground">
        {creditsRestored ? (
          <>Your credits have been restored. Click <strong>Resume Audit</strong> to continue analyzing the remaining images.</>
        ) : (
          <>
            Your analysis credits have been used up.
            {remaining != null && remaining > 0 && (
              <> <strong>{analyzedCount}</strong> of <strong>{totalCount}</strong> images were analyzed — <strong>{remaining}</strong> remaining.</>
            )}
            {' '}Upgrade your plan or wait for your next billing cycle to continue.
          </>
        )}
      </AlertDescription>
      <div className="flex items-center gap-2 mt-3">
        {onResume && remaining != null && remaining > 0 && (
          <Button
            size="sm"
            onClick={onResume}
            className={creditsRestored ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
          >
            {creditsRestored ? (
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            ) : (
              <Play className="h-3.5 w-3.5 mr-1.5" />
            )}
            Resume Audit ({remaining} remaining)
          </Button>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-6 w-6"
        onClick={() => setDismissed(true)}
      >
        <X className="h-3 w-3" />
      </Button>
    </Alert>
  );
}
