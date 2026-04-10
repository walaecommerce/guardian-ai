import { useState } from 'react';
import { Bell, AlertTriangle, XCircle, Shield, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCredits } from '@/hooks/useCredits';
import { usePolicyUpdates } from '@/hooks/usePolicyUpdates';
import { cn } from '@/lib/utils';

interface Alert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  icon: React.ElementType;
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const { remainingCredits, totalCredits, loading: creditsLoading } = useCredits();
  const { highImpactUpdates } = usePolicyUpdates();

  const alerts: Alert[] = [];

  // Credit alerts
  if (!creditsLoading) {
    const types = ['scrape', 'analyze', 'fix'] as const;
    for (const type of types) {
      const total = totalCredits(type);
      const remaining = remainingCredits(type);
      if (total === 0) continue;
      if (remaining === 0) {
        alerts.push({
          id: `credit-exhausted-${type}`,
          type: 'critical',
          title: `${type.charAt(0).toUpperCase() + type.slice(1)} Credits Exhausted`,
          description: `You've used all your ${type} credits. Upgrade your plan to continue.`,
          icon: XCircle,
        });
      } else if (remaining / total <= 0.2) {
        alerts.push({
          id: `credit-low-${type}`,
          type: 'warning',
          title: `${type.charAt(0).toUpperCase() + type.slice(1)} Credits Low`,
          description: `Only ${remaining} of ${total} ${type} credits remaining.`,
          icon: AlertTriangle,
        });
      }
    }
  }

  // Policy alerts — use new contract fields (summary, affectedArea)
  if (highImpactUpdates.length > 0) {
    const first = highImpactUpdates[0];
    alerts.push({
      id: 'policy-update',
      type: 'warning',
      title: `${highImpactUpdates.length} Policy Update${highImpactUpdates.length > 1 ? 's' : ''}`,
      description: first.summary || first.change_description || first.title || 'New Amazon policy change detected',
      icon: Shield,
    });
  }

  const activeAlerts = alerts.filter(a => !dismissed.has(a.id));
  const hasCritical = activeAlerts.some(a => a.type === 'critical');
  const count = activeAlerts.length;

  const dismiss = (id: string) => setDismissed(prev => new Set(prev).add(id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
          <Bell className="w-4.5 h-4.5" />
          {count > 0 && (
            <span className={cn(
              'absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center',
              hasCritical ? 'bg-destructive text-destructive-foreground' : 'bg-warning text-warning-foreground'
            )}>
              {count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold">Notifications</p>
        </div>
        <ScrollArea className="max-h-64">
          {activeAlerts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">All clear — no alerts.</p>
          ) : (
            <div className="p-2 space-y-1">
              {activeAlerts.map(alert => (
                <div
                  key={alert.id}
                  className={cn(
                    'flex items-start gap-2.5 p-2.5 rounded-lg text-sm',
                    alert.type === 'critical' && 'bg-destructive/10',
                    alert.type === 'warning' && 'bg-warning/10',
                    alert.type === 'info' && 'bg-muted/50'
                  )}
                >
                  <alert.icon className={cn(
                    'w-4 h-4 mt-0.5 shrink-0',
                    alert.type === 'critical' && 'text-destructive',
                    alert.type === 'warning' && 'text-warning',
                    alert.type === 'info' && 'text-muted-foreground'
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground text-xs">{alert.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{alert.description}</p>
                  </div>
                  <button onClick={() => dismiss(alert.id)} className="shrink-0 text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
