import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, XCircle, X } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useCredits } from '@/hooks/useCredits';

const CREDIT_TYPES = ['scrape', 'analyze', 'fix'] as const;

export function CreditWarningBanner() {
  const { remainingCredits, totalCredits, loading } = useCredits();
  const [dismissed, setDismissed] = useState(false);

  if (loading || dismissed) return null;

  const exhausted: string[] = [];
  const low: { type: string; remaining: number }[] = [];

  for (const type of CREDIT_TYPES) {
    const total = totalCredits(type);
    const remaining = remainingCredits(type);
    if (total === 0) continue;
    if (remaining === 0) {
      exhausted.push(type);
    } else if (remaining / total <= 0.2) {
      low.push({ type, remaining });
    }
  }

  if (exhausted.length === 0 && low.length === 0) return null;

  const isDestructive = exhausted.length > 0;

  return (
    <Alert
      variant={isDestructive ? 'destructive' : 'default'}
      className={`mx-6 mt-4 ${!isDestructive ? 'border-amber-500/50 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 [&>svg]:text-amber-600' : ''}`}
    >
      {isDestructive ? <XCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      <AlertTitle className="flex items-center justify-between">
        <span>{isDestructive ? 'Credits Exhausted' : 'Credits Running Low'}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2" onClick={() => setDismissed(true)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-4">
        <div className="space-y-0.5 text-sm">
          {exhausted.map(type => (
            <p key={type}>You've used all your <strong>{type}</strong> credits.</p>
          ))}
          {low.map(({ type, remaining }) => (
            <p key={type}>Only <strong>{remaining}</strong> {type} credit{remaining !== 1 ? 's' : ''} remaining.</p>
          ))}
        </div>
        <Button asChild size="sm" variant={isDestructive ? 'destructive' : 'outline'} className="shrink-0">
          <Link to="/pricing">View Plans</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
