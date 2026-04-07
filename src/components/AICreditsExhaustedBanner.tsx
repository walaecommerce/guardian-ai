import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, X } from 'lucide-react';

interface AICreditsExhaustedBannerProps {
  visible: boolean;
}

export function AICreditsExhaustedBanner({ visible }: AICreditsExhaustedBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (!visible || dismissed) return null;

  return (
    <Alert variant="destructive" className="mx-6 mt-3 relative">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>AI Credits Exhausted</AlertTitle>
      <AlertDescription>
        Your workspace AI balance has run out. Add more credits in{' '}
        <strong>Settings → Cloud &amp; AI balance</strong> to continue analyzing images.
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
