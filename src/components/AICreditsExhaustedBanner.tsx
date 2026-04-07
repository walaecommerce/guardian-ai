import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PauseCircle, X } from 'lucide-react';

interface AICreditsExhaustedBannerProps {
  visible: boolean;
  analyzedCount?: number;
  totalCount?: number;
}

export function AICreditsExhaustedBanner({ visible, analyzedCount, totalCount }: AICreditsExhaustedBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (!visible || dismissed) return null;

  const remaining = totalCount && analyzedCount != null ? totalCount - analyzedCount : undefined;

  return (
    <Alert className="mx-6 mt-3 relative border-primary/30 bg-primary/5">
      <PauseCircle className="h-4 w-4 text-primary" />
      <AlertTitle className="text-foreground">Audit Paused</AlertTitle>
      <AlertDescription className="text-muted-foreground">
        Your workspace AI balance ran out.
        {remaining != null && remaining > 0 && (
          <> <strong>{analyzedCount}</strong> of <strong>{totalCount}</strong> images were analyzed — <strong>{remaining}</strong> remaining.</>
        )}
        {' '}Top up in <strong>Settings → Cloud &amp; AI balance</strong> and retry.
      </AlertDescription>
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
