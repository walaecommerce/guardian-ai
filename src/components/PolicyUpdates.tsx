import { AlertTriangle, X, RefreshCw, Shield, Clock, ChevronDown, ChevronUp, ExternalLink, CheckCircle2, AlertCircle, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { PolicyUpdate, PolicyData } from '@/hooks/usePolicyUpdates';

// ── Confidence badge ────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const styles: Record<string, string> = {
    high: 'bg-green-500/15 text-green-600 border-green-500/30',
    medium: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30',
    low: 'bg-muted text-muted-foreground border-border',
  };
  return (
    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${styles[confidence] || styles.low}`}>
      {confidence}
    </Badge>
  );
}

// ── Affected area tag ───────────────────────────────────────

function AreaTag({ area }: { area: string }) {
  const icons: Record<string, string> = {
    title: '📝',
    image: '🖼️',
    claims: '✅',
    content: '📄',
    general: '📋',
  };
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
      {icons[area] || '📋'} {area}
    </span>
  );
}

// ── Banner for HIGH impact updates ──────────────────────────

interface PolicyBannerProps {
  updates: PolicyUpdate[];
  onDismiss: () => void;
}

export function PolicyBanner({ updates, onDismiss }: PolicyBannerProps) {
  if (updates.length === 0) return null;

  const latest = updates[0];
  const dateStr = latest.publishedDate
    ? new Date(latest.publishedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : latest.checkedAt
      ? `detected ${new Date(latest.checkedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      : 'recently';

  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3 flex items-start gap-3 animate-fade-in">
      <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">
          ⚠️ {latest.title || 'Amazon policy update detected'} — {dateStr}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {latest.summary || latest.change_description}
        </p>
        {latest.sourceUrl && (
          <a href={latest.sourceUrl} target="_blank" rel="noopener noreferrer"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1">
            <ExternalLink className="w-3 h-3" />
            {latest.sourceName || 'Source'}
          </a>
        )}
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

  // Determine status display
  const statusIcon = data?.status === 'error'
    ? <AlertCircle className="w-4 h-4 text-destructive" />
    : data?.status === 'no_updates'
      ? <CheckCircle2 className="w-4 h-4 text-green-600" />
      : <Shield className="w-4 h-4 text-primary" />;

  return (
    <Card>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CardHeader className="pb-2">
          <CollapsibleTrigger className="flex items-center justify-between w-full">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              {statusIcon}
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
            {/* Status messages */}
            {data?.status === 'error' && (
              <div className="flex items-center gap-2 text-xs text-destructive py-2">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Research unavailable{data.reason ? `: ${data.reason}` : ''}</span>
              </div>
            )}

            {data?.status === 'no_updates' && updates.length === 0 && (
              <div className="flex items-center gap-2 text-xs text-green-600 py-2">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>No policy changes detected in the last 90 days.</span>
              </div>
            )}

            {loading && !data && (
              <p className="text-xs text-muted-foreground py-2">
                Searching for policy updates…
              </p>
            )}

            {/* Update list */}
            {updates.map((u, i) => {
              const dateStr = u.publishedDate
                ? new Date(u.publishedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : u.checkedAt
                  ? `~${new Date(u.checkedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                  : '';

              return (
                <div key={i} className="flex items-start gap-2 text-xs py-1.5 border-b border-border last:border-0">
                  <Badge variant="outline" className={`shrink-0 text-[9px] px-1.5 py-0 ${impactStyles[u.impact] || ''}`}>
                    {u.impact}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground leading-tight">{u.title || u.policy_area}</p>
                    <p className="text-muted-foreground mt-0.5 leading-tight">{u.summary || u.change_description}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {u.affectedArea && <AreaTag area={u.affectedArea} />}
                      {u.confidence && <ConfidenceBadge confidence={u.confidence} />}
                      {dateStr && (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {dateStr}
                        </span>
                      )}
                      {u.sourceUrl && (
                        <a href={u.sourceUrl} target="_blank" rel="noopener noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-0.5">
                          <ExternalLink className="w-3 h-3" />
                          {u.sourceName || 'Source'}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="flex items-center justify-between pt-1">
              {data?.checkedAt && (
                <span className="text-[10px] text-muted-foreground">
                  Checked {new Date(data.checkedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
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
  const dateStr = update.publishedDate
    ? new Date(update.publishedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'Recent';

  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-yellow-500/15 text-yellow-600 border border-yellow-500/30">
      <AlertTriangle className="w-2.5 h-2.5" />
      NEW RULE — {dateStr}
    </span>
  );
}
