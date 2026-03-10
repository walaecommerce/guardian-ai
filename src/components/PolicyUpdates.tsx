import { AlertTriangle, X, RefreshCw, Shield, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { PolicyUpdate, PolicyData } from '@/hooks/usePolicyUpdates';

// ── Banner for HIGH impact updates ──────────────────────────

interface PolicyBannerProps {
  updates: PolicyUpdate[];
  onDismiss: () => void;
}

export function PolicyBanner({ updates, onDismiss }: PolicyBannerProps) {
  if (updates.length === 0) return null;

  const latest = updates[0];
  const dateStr = new Date(latest.date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3 flex items-start gap-3 animate-fade-in">
      <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">
          ⚠️ Amazon updated their image policies on {dateStr}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {latest.change_description}. Your analysis includes these new rules.
        </p>
        {updates.length > 1 && (
          <p className="text-xs text-yellow-600 mt-1">
            +{updates.length - 1} more policy change{updates.length > 2 ? 's' : ''} detected
          </p>
        )}
      </div>
      <button onClick={onDismiss} className="shrink-0 text-muted-foreground hover:text-foreground">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Sidebar section ─────────────────────────────────────────

interface PolicySidebarProps {
  data: PolicyData | null;
  loading: boolean;
  onRefresh: () => void;
}

export function PolicySidebar({ data, loading, onRefresh }: PolicySidebarProps) {
  const [expanded, setExpanded] = useState(false);
  const updates = data?.updates?.slice(0, 5) || [];

  const impactStyles: Record<string, string> = {
    HIGH: 'bg-red-500/15 text-red-600',
    MEDIUM: 'bg-yellow-500/15 text-yellow-600',
    LOW: 'bg-blue-500/15 text-blue-600',
  };

  return (
    <Card>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CardHeader className="pb-2">
          <CollapsibleTrigger className="flex items-center justify-between w-full">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              Policy Updates
              {updates.length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5">{updates.length}</Badge>
              )}
            </CardTitle>
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-2">
            {updates.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                {loading ? 'Checking for policy updates...' : 'No recent policy changes detected.'}
              </p>
            ) : (
              updates.map((u, i) => {
                const dateStr = new Date(u.date).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric',
                });
                return (
                  <div key={i} className="flex items-start gap-2 text-xs py-1.5 border-b border-border last:border-0">
                    <Badge variant="outline" className={`shrink-0 text-[9px] px-1.5 py-0 ${impactStyles[u.impact] || ''}`}>
                      {u.impact}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground leading-tight">{u.policy_area}</p>
                      <p className="text-muted-foreground mt-0.5 leading-tight">{u.change_description}</p>
                      <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>{dateStr}</span>
                        {u.source_url && (
                          <a href={u.source_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-1">Source ↗</a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            <div className="flex items-center justify-between pt-1">
              {data?.last_checked && (
                <span className="text-[10px] text-muted-foreground">
                  Checked {new Date(data.last_checked).toLocaleDateString()}
                </span>
              )}
              <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading} className="h-6 text-xs px-2">
                <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// ── Violation tag for new rules ─────────────────────────────

interface NewRuleTagProps {
  update: PolicyUpdate;
}

export function NewRuleTag({ update }: NewRuleTagProps) {
  const dateStr = new Date(update.date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });

  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-yellow-500/15 text-yellow-600 border border-yellow-500/30">
      <AlertTriangle className="w-2.5 h-2.5" />
      NEW RULE — {dateStr}
    </span>
  );
}
