import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp, Target, Lightbulb, BarChart3, Sparkles, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { CampaignStrategy, RoleCoverage, StrategyRecommendation } from '@/utils/campaignStrategy';
import type { ProductKnowledge } from '@/utils/productKnowledge';
import type { ListingContext } from '@/utils/listingContext';
import { buildGenerationBrief } from '@/utils/strategyBriefBuilder';

// ── Generating-roles persistence (survives navigation to Studio) ────
const GENERATING_KEY = 'guardian_generating_roles';

function getGeneratingRoles(sessionId: string | null | undefined): Set<string> {
  if (!sessionId) return new Set();
  try {
    const raw = localStorage.getItem(GENERATING_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (parsed.sessionId !== sessionId) return new Set();
    // Expire entries older than 30 minutes
    const roles: string[] = (parsed.roles || []).filter(
      (r: { ts: number }) => Date.now() - r.ts < 30 * 60 * 1000,
    ).map((r: { role: string }) => r.role);
    return new Set(roles);
  } catch { return new Set(); }
}

function addGeneratingRole(sessionId: string, role: string) {
  const existing = getGeneratingRoles(sessionId);
  const raw = localStorage.getItem(GENERATING_KEY);
  let roles: { role: string; ts: number }[] = [];
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed.sessionId === sessionId) roles = parsed.roles || [];
  } catch { /* ignore */ }
  if (!roles.find(r => r.role === role)) {
    roles.push({ role, ts: Date.now() });
  }
  localStorage.setItem(GENERATING_KEY, JSON.stringify({ sessionId, roles }));
}

function removeGeneratingRole(sessionId: string, role: string) {
  const raw = localStorage.getItem(GENERATING_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.sessionId !== sessionId) return;
    parsed.roles = (parsed.roles || []).filter((r: { role: string }) => r.role !== role);
    localStorage.setItem(GENERATING_KEY, JSON.stringify(parsed));
  } catch { /* ignore */ }
}

// ── Sub-components ──────────────────────────────────────────

interface CampaignStrategyPanelProps {
  strategy: CampaignStrategy;
  productKnowledge?: ProductKnowledge | null;
  listingContext?: ListingContext | null;
  sessionId?: string | null;
}

function PriorityBadge({ priority }: { priority: string }) {
  const config = {
    essential: { label: 'Essential', className: 'bg-destructive/15 text-destructive border-destructive/30' },
    recommended: { label: 'Recommended', className: 'bg-warning/15 text-warning border-warning/30' },
    optional: { label: 'Optional', className: 'bg-muted text-muted-foreground border-border' },
  }[priority] || { label: priority, className: 'bg-muted text-muted-foreground border-border' };

  return (
    <span className={`inline-flex items-center px-1.5 py-0 rounded-full text-[9px] font-medium border ${config.className}`}>
      {config.label}
    </span>
  );
}

function StatusIcon({ status, generating }: { status: RoleCoverage['status']; generating?: boolean }) {
  if (generating) {
    return <Loader2 className="w-3.5 h-3.5 text-primary shrink-0 animate-spin" />;
  }
  switch (status) {
    case 'covered':
      return <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />;
    case 'weak':
      return <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />;
    case 'missing':
      return <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />;
  }
}

function RoleCoverageItem({ role, generating }: { role: RoleCoverage; generating?: boolean }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <StatusIcon status={role.status} generating={generating} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium text-foreground">{role.label}</span>
          <PriorityBadge priority={role.priority} />
          {generating && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0 rounded-full text-[9px] font-medium border bg-primary/10 text-primary border-primary/30 animate-pulse">
              Generating in Studio
            </span>
          )}
        </div>
        {!generating && role.status === 'covered' && role.coveredBy.length > 0 && (
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
            {role.coveredBy.slice(0, 2).join(', ')}{role.coveredBy.length > 2 ? ` +${role.coveredBy.length - 2}` : ''}
          </p>
        )}
        {!generating && role.status === 'weak' && role.weakReason && (
          <p className="text-[10px] text-warning mt-0.5">{role.weakReason}</p>
        )}
      </div>
    </div>
  );
}

function RecommendationItem({
  rec, index, onGenerate, generating,
}: {
  rec: StrategyRecommendation;
  index: number;
  onGenerate?: (rec: StrategyRecommendation) => void;
  generating?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-border/50 last:border-0">
      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold shrink-0 mt-0.5">
        {index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium text-foreground">{rec.label}</span>
          <PriorityBadge priority={rec.priority} />
          {generating && (
            <Badge variant="outline" className="text-[9px] h-4 gap-1 border-primary/30 text-primary animate-pulse">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              In Studio
            </Badge>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{rec.rationale}</p>
      </div>
      {onGenerate && (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 h-7 text-[11px] gap-1"
          onClick={() => onGenerate(rec)}
          disabled={generating}
        >
          {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {generating ? 'In Studio' : 'Create'}
        </Button>
      )}
    </div>
  );
}

// ── Main panel ──────────────────────────────────────────────

export function CampaignStrategyPanel({ strategy, productKnowledge, listingContext, sessionId }: CampaignStrategyPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [generatingRoles, setGeneratingRoles] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const { toast } = useToast();

  // Load generating roles from localStorage on mount and when strategy changes (covers return from Studio)
  useEffect(() => {
    const roles = getGeneratingRoles(sessionId);
    // Auto-clear roles that are now covered
    const coveredRoles = new Set(
      strategy.roleCoverage.filter(rc => rc.status === 'covered').map(rc => rc.role),
    );
    let cleaned = false;
    roles.forEach(role => {
      if (coveredRoles.has(role)) {
        removeGeneratingRole(sessionId!, role);
        cleaned = true;
      }
    });
    if (cleaned) {
      setGeneratingRoles(getGeneratingRoles(sessionId));
    } else {
      setGeneratingRoles(roles);
    }
  }, [sessionId, strategy]);

  if (!strategy.isActionable) return null;

  const totalRoles = strategy.roleCoverage.length;
  const coveragePercent = totalRoles > 0 ? Math.round((strategy.coveredCount / totalRoles) * 100) : 0;
  const generatingCount = generatingRoles.size;

  const handleGenerate = (rec: StrategyRecommendation) => {
    if (sessionId) {
      addGeneratingRole(sessionId, rec.role);
      setGeneratingRoles(prev => new Set([...prev, rec.role]));
    }
    const brief = buildGenerationBrief(rec, productKnowledge, listingContext, sessionId);
    toast({
      title: `Generating: ${rec.label}`,
      description: 'Opening Studio with a prefilled brief…',
    });
    navigate('/studio', { state: { brief } });
  };

  return (
    <Card className="border-border/50">
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                <CardTitle className="text-sm">Image Strategy</CardTitle>
                <Badge variant="secondary" className="text-[10px] h-4">
                  {strategy.confidence} confidence
                </Badge>
                {generatingCount > 0 && (
                  <Badge variant="outline" className="text-[10px] h-4 gap-1 border-primary/30 text-primary animate-pulse">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    {generatingCount} in Studio
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-success font-medium">{strategy.coveredCount} covered</span>
                  {strategy.missingCount > 0 && (
                    <span className="text-destructive font-medium">{strategy.missingCount} missing</span>
                  )}
                  {strategy.weakCount > 0 && (
                    <span className="text-warning font-medium">{strategy.weakCount} weak</span>
                  )}
                </div>
                {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="px-4 pb-4 pt-0 space-y-4">
            {/* Product positioning */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <BarChart3 className="w-3.5 h-3.5 shrink-0" />
              <span>{strategy.productPositioning}</span>
              {strategy.productType && (
                <Badge variant="outline" className="text-[10px] h-4">{strategy.productType.replace(/_/g, ' ')}</Badge>
              )}
            </div>

            {/* Role coverage */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Role Coverage ({coveragePercent}%)
              </h4>
              <div className="space-y-0.5">
                {strategy.roleCoverage.map(rc => (
                  <RoleCoverageItem
                    key={rc.role}
                    role={rc}
                    generating={generatingRoles.has(rc.role)}
                  />
                ))}
              </div>
            </div>

            {/* Recommendations */}
            {strategy.recommendations.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Lightbulb className="w-3.5 h-3.5 text-primary" />
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Recommended Next Images
                  </h4>
                </div>
                <div className="space-y-0">
                  {strategy.recommendations.map((rec, i) => (
                    <RecommendationItem
                      key={rec.role}
                      rec={rec}
                      index={i}
                      onGenerate={handleGenerate}
                      generating={generatingRoles.has(rec.role)}
                    />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
