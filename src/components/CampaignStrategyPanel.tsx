import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp, Target, Lightbulb, BarChart3 } from 'lucide-react';
import type { CampaignStrategy, RoleCoverage, StrategyRecommendation } from '@/utils/campaignStrategy';

interface CampaignStrategyPanelProps {
  strategy: CampaignStrategy;
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

function StatusIcon({ status }: { status: RoleCoverage['status'] }) {
  switch (status) {
    case 'covered':
      return <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />;
    case 'weak':
      return <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />;
    case 'missing':
      return <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />;
  }
}

function RoleCoverageItem({ role }: { role: RoleCoverage }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <StatusIcon status={role.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium text-foreground">{role.label}</span>
          <PriorityBadge priority={role.priority} />
        </div>
        {role.status === 'covered' && role.coveredBy.length > 0 && (
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
            {role.coveredBy.slice(0, 2).join(', ')}{role.coveredBy.length > 2 ? ` +${role.coveredBy.length - 2}` : ''}
          </p>
        )}
        {role.status === 'weak' && role.weakReason && (
          <p className="text-[10px] text-warning mt-0.5">{role.weakReason}</p>
        )}
      </div>
    </div>
  );
}

function RecommendationItem({ rec, index }: { rec: StrategyRecommendation; index: number }) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-border/50 last:border-0">
      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold shrink-0 mt-0.5">
        {index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium text-foreground">{rec.label}</span>
          <PriorityBadge priority={rec.priority} />
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{rec.rationale}</p>
      </div>
    </div>
  );
}

export function CampaignStrategyPanel({ strategy }: CampaignStrategyPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (!strategy.isActionable) return null;

  const totalRoles = strategy.roleCoverage.length;
  const coveragePercent = totalRoles > 0 ? Math.round((strategy.coveredCount / totalRoles) * 100) : 0;

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
              </div>
              <div className="flex items-center gap-3">
                {/* Compact stats */}
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
                  <RoleCoverageItem key={rc.role} role={rc} />
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
                    <RecommendationItem key={rec.role} rec={rec} index={i} />
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
