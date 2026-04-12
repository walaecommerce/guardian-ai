import { useState, useEffect, useRef } from 'react';
import { CATEGORY_RULES, GEMINI_CATEGORY_MAP, type ProductCategory } from '@/config/categoryRules';
import { CheckCircle, XCircle, AlertTriangle, Wand2, Loader2, RotateCcw, ChevronDown, ChevronUp, Layers, RefreshCw, Scissors, AlertOctagon, Sparkles, Shield, ShieldCheck, ShieldAlert, ShieldX, Activity, ExternalLink, Eye, Cpu, Tag, Link2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ImageAsset, AnalysisResult, FixMethod, DeterministicFindingSummary } from '@/types';
import {
  extractEvidence,
  groupFindings,
  buildDeterministicRuleIdSet,
  getSourceBadgeLabel,
  getSourceBadgeClass,
  getSourceTierLabel,
  getSourceTierBadgeClass,
  getSurfaceLabels,
  type EvidenceDisplay,
  type FindingGroup,
} from '@/utils/evidenceHelpers';
import { getPolicySummary, type PolicySummary } from '@/utils/policySummary';

const getFixMethodConfig = (method: FixMethod) => {
  switch (method) {
    case 'bg-segmentation':
      return { label: 'A1 · BG Seg', icon: Layers, className: 'bg-cyan-500/90 text-white' };
    case 'full-regeneration':
      return { label: 'A2 · Regen', icon: RefreshCw, className: 'bg-violet-500/90 text-white' };
    case 'surgical-edit':
      return { label: 'T1 · Surgical', icon: Scissors, className: 'bg-emerald-500/90 text-white' };
    case 'enhancement':
      return { label: 'Enhanced', icon: Sparkles, className: 'bg-purple-500/90 text-white' };
  }
};
import { ExportButton } from '@/components/ExportButton';
import { CompetitorData } from '@/components/CompetitorAudit';
import { ScoreTrendBadge } from '@/components/ScoreTrendBadge';
import { getScoreTrend } from '@/components/ComplianceHistory';
import { NewRuleTag } from '@/components/PolicyUpdates';
import { PolicyUpdate } from '@/hooks/usePolicyUpdates';

interface AnalysisResultsProps {
  assets: ImageAsset[];
  listingTitle: string;
  onRequestFix: (assetId: string) => void;
  onRequestEnhance?: (assetId: string) => void;
  onViewDetails: (asset: ImageAsset) => void;
  onReverify?: (assetId: string) => void;
  onBatchFix?: () => void;
  onRetryAudit?: () => void;
  isBatchFixing?: boolean;
  batchFixProgress?: { current: number; total: number } | null;
  productAsin?: string;
  competitorData?: CompetitorData | null;
  getMatchingPolicyUpdate?: (message: string, category: string) => PolicyUpdate | null;
  aiCreditsExhausted?: boolean;
}

// ── Score Gauge with animated counter + circular ring ──

function ScoreGauge({ score, size = 80 }: { score: number; size?: number }) {
  const [displayScore, setDisplayScore] = useState(0);
  const strokeWidth = size > 60 ? 8 : 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (displayScore / 100) * circumference;

  const getScoreColor = (s: number) => {
    if (s >= 85) return 'text-green-500';
    if (s >= 70) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getStrokeColor = (s: number) => {
    if (s >= 85) return 'stroke-green-500';
    if (s >= 70) return 'stroke-yellow-500';
    return 'stroke-red-500';
  };

  const getBorderColor = (s: number) => {
    if (s >= 85) return 'border-green-500';
    if (s >= 70) return 'border-yellow-500';
    return 'border-red-500';
  };

  useEffect(() => {
    const duration = 1200;
    const startTime = performance.now();
    let raf: number;
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayScore(Math.round(score * eased));
      if (progress < 1) {
        raf = requestAnimationFrame(animate);
      }
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  return (
    <div className={`relative rounded-full border-2 ${getBorderColor(score)}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle
          className="stroke-muted"
          strokeWidth={strokeWidth}
          fill="none"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className={`transition-all duration-1000 ease-out ${getStrokeColor(score)}`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: offset,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`font-bold ${getScoreColor(score)}`} style={{ fontSize: size > 60 ? '1.25rem' : '0.875rem' }}>
          {displayScore}
        </span>
        <span className="text-muted-foreground" style={{ fontSize: size > 60 ? '0.625rem' : '0.5rem' }}>/100</span>
      </div>
    </div>
  );
}

// ── Severity helpers (imported from shared module) ──

import { SEVERITY_ORDER, getSeverityBadgeClass } from '@/utils/severityHelpers';

// ── Compact Evidence Row ──

function EvidenceRow({ evidence }: { evidence: EvidenceDisplay }) {
  const hasDetails = evidence.whyTriggered || evidence.measuredValue !== null || evidence.ocrSnippet || evidence.boundingBoxSummary;
  if (!hasDetails && !evidence.ruleId && !evidence.fixLikelihood) return null;

  return (
    <div className="mt-1.5 space-y-1 text-[11px] text-muted-foreground bg-muted/30 rounded px-2 py-1.5 border border-border/50">
      {/* Rule ID + Source + Tier */}
      <div className="flex items-center gap-2 flex-wrap">
        {evidence.ruleId && (
          <span className="font-mono font-semibold text-foreground/70">{evidence.ruleId}</span>
        )}
        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[10px] font-medium border ${getSourceBadgeClass(evidence.findingSource)}`}>
          {evidence.findingSource === 'deterministic' ? <Cpu className="w-2.5 h-2.5" /> : evidence.findingSource === 'category-specific' ? <Tag className="w-2.5 h-2.5" /> : evidence.findingSource === 'consistency' ? <Link2 className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
          {getSourceBadgeLabel(evidence.findingSource)}
        </span>
        {evidence.sourceTier && (
          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[10px] font-medium border ${getSourceTierBadgeClass(evidence.sourceTier)}`}>
            {getSourceTierLabel(evidence.sourceTier)}
          </span>
        )}
        {evidence.surfaces && evidence.surfaces.length > 0 && (
          <span className="text-[10px] text-muted-foreground/70">
            {getSurfaceLabels(evidence.surfaces).join(' · ')}
          </span>
        )}
        {evidence.sourceUrl && (
          <a href={evidence.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary/70 hover:text-primary">
            <ExternalLink className="w-2.5 h-2.5" /> Source
          </a>
        )}
        {evidence.fixLikelihood && (
          <span className="text-[10px] text-primary/80 font-medium">⚡ {evidence.fixLikelihood}</span>
        )}
      </div>
      {/* Why triggered */}
      {evidence.whyTriggered && (
        <p className="leading-snug"><span className="font-medium text-foreground/60">Why:</span> {evidence.whyTriggered}</p>
      )}
      {/* Measured vs Threshold */}
      {evidence.measuredValue !== null && (
        <p className="leading-snug">
          <span className="font-medium text-foreground/60">Measured:</span> {String(evidence.measuredValue)}
          {evidence.threshold !== null && <> · <span className="font-medium text-foreground/60">Threshold:</span> {String(evidence.threshold)}</>}
        </p>
      )}
      {/* OCR */}
      {evidence.ocrSnippet && (
        <p className="leading-snug"><span className="font-medium text-foreground/60">OCR:</span> "{evidence.ocrSnippet}"</p>
      )}
      {/* Bounding box */}
      {evidence.boundingBoxSummary && (
        <p className="leading-snug text-muted-foreground/70">{evidence.boundingBoxSummary}</p>
      )}
    </div>
  );
}

// ── Violation Card with expandable recommendation + evidence ──

function ViolationItem({ violation, index, matchingUpdate, evidence }: {
  violation: AnalysisResult['violations'][0];
  index: number;
  matchingUpdate?: PolicyUpdate | null;
  evidence?: EvidenceDisplay;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="p-3 rounded-lg border border-border bg-card animate-fade-in"
      style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'backwards' }}
    >
      <div className="flex items-start gap-2">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${getSeverityBadgeClass(violation.severity)}`}>
            {violation.severity}
          </span>
          <span className="text-xs font-bold text-foreground">{violation.category}</span>
          {matchingUpdate && <NewRuleTag update={matchingUpdate} />}
        </div>
      </div>
      <p className="text-sm text-foreground mt-1">{violation.message}</p>

      {/* Inline evidence */}
      {evidence && <EvidenceRow evidence={evidence} />}

      {violation.recommendation && (
        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground mt-2 hover:text-foreground transition-colors">
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Recommendation
          </CollapsibleTrigger>
          <CollapsibleContent>
            <p className="text-xs italic text-muted-foreground mt-1 pl-4 border-l-2 border-primary/30">
              💡 {violation.recommendation}
            </p>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

// ── Policy Status Badge ──

function PolicyStatusBadge({ status }: { status: 'pass' | 'warning' | 'fail' }) {
  const config = {
    pass: { icon: ShieldCheck, label: 'Policy Pass', className: 'bg-green-500/15 text-green-400 border-green-500/30' },
    warning: { icon: ShieldAlert, label: 'Policy Warning', className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
    fail: { icon: ShieldX, label: 'Policy Fail', className: 'bg-red-500/15 text-red-400 border-red-500/30' },
  }[status];
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${config.className}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

// ── Deterministic Findings Panel ──

function DeterministicFindingsPanel({ findings }: { findings: DeterministicFindingSummary[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!findings || findings.length === 0) return null;

  const failed = findings.filter(f => !f.passed);
  const passed = findings.filter(f => f.passed);

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5 px-2 rounded-md hover:bg-muted/50">
        <span className="flex items-center gap-1.5">
          <Activity className="w-3 h-3" />
          Pre-checks: {passed.length} passed, {failed.length} failed
        </span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-1.5 mt-1.5">
        {failed.map((f, i) => (
          <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded-md border border-destructive/20 bg-destructive/5 text-xs">
            <XCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
            <div className="min-w-0">
              <span className="font-semibold text-destructive">{f.rule_id}</span>
              <p className="text-muted-foreground leading-snug">{f.message}</p>
              {f.evidence && (
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                  Measured: {f.evidence.measured_value} · Threshold: {f.evidence.threshold}
                </p>
              )}
            </div>
          </div>
        ))}
        {passed.map((f, i) => (
          <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded-md border border-green-500/20 bg-green-500/5 text-xs">
            <CheckCircle className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <span className="font-semibold text-green-400">{f.rule_id}</span>
              <p className="text-muted-foreground leading-snug">{f.message}</p>
            </div>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── Asset Result Card ──

function AssetResultCard({
  asset,
  onRequestFix,
  onRequestEnhance,
  onViewDetails,
  onReverify,
  getMatchingPolicyUpdate,
}: {
  asset: ImageAsset;
  onRequestFix: (id: string) => void;
  onRequestEnhance?: (id: string) => void;
  onViewDetails: (asset: ImageAsset) => void;
  onReverify?: (assetId: string) => void;
  getMatchingPolicyUpdate?: (message: string, category: string) => PolicyUpdate | null;
}) {
  const result = asset.analysisResult;

  const categoryMatch = asset.name.match(/^(MAIN|INFOGRAPHIC|LIFESTYLE|PRODUCT_IN_USE|SIZE_CHART|COMPARISON|PACKAGING|DETAIL|UNKNOWN)_/);
  const imageCategory = categoryMatch ? categoryMatch[1] : null;

  const getCategoryColor = (category: string | null) => {
    switch (category) {
      case 'MAIN': return 'bg-primary text-primary-foreground';
      case 'INFOGRAPHIC': return 'bg-blue-500 text-white';
      case 'LIFESTYLE': return 'bg-green-500 text-white';
      case 'PRODUCT_IN_USE': return 'bg-purple-500 text-white';
      case 'SIZE_CHART': return 'bg-orange-500 text-white';
      case 'COMPARISON': return 'bg-yellow-500 text-black';
      case 'PACKAGING': return 'bg-pink-500 text-white';
      case 'DETAIL': return 'bg-cyan-500 text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const formatCategory = (category: string | null) => {
    if (!category) return null;
    return category.replace(/_/g, ' ').split(' ').map(w =>
      w.charAt(0) + w.slice(1).toLowerCase()
    ).join(' ');
  };

  if (!result) {
    if (asset.isAnalyzing) {
      return (
        <Card className="asset-card overflow-hidden glass-card">
          <div className="aspect-video relative bg-muted shimmer">
            <img src={asset.preview} alt={asset.name} className="w-full h-full object-cover opacity-50" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          </div>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground text-center">Analyzing...</p>
          </CardContent>
        </Card>
      );
    }
    return null;
  }

  // Sort violations by severity
  const sortedViolations = [...(result.violations || [])].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
  );

  return (
    <Card className="asset-card overflow-hidden glass-card hover:translate-y-[-2px] hover:shadow-[0_8px_30px_-8px_hsl(var(--primary)/0.3)] transition-all duration-200">
      <div className="aspect-video relative bg-muted">
        <img src={asset.preview} alt={asset.name} className="w-full h-full object-cover" />

        {/* Content type badge (primary label) */}
        {imageCategory && (
          <div className={`absolute top-2 left-2 px-2 py-0.5 rounded text-xs font-medium ${getCategoryColor(imageCategory)}`}>
            {formatCategory(imageCategory)}
          </div>
        )}

        {/* Role badge (small, secondary) */}
        <Badge className={`absolute ${imageCategory ? 'top-9' : 'top-2'} left-2 text-[9px] px-1.5 py-0 font-bold ${
          asset.type === 'MAIN'
            ? 'bg-[hsl(33,100%,50%)] text-white hover:bg-[hsl(33,100%,45%)]'
            : 'bg-[hsl(213,27%,23%)]/60 text-white/80 hover:bg-[hsl(213,27%,20%)]/70'
        }`}>
          {asset.type === 'MAIN' ? '★ MAIN' : 'SEC'}
        </Badge>

        {/* Product Category Badge (from analysis) */}
        {result.productCategory && (() => {
          const catKey = GEMINI_CATEGORY_MAP[result.productCategory] || result.productCategory;
          const catRule = CATEGORY_RULES[catKey as ProductCategory];
          return catRule ? (
            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded text-xs font-medium bg-card/90 text-foreground border border-border backdrop-blur-sm">
              {catRule.icon} {catRule.name}
            </div>
          ) : null;
        })()}

        {/* Status dot indicator */}
        <div className={`absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded text-xs font-bold ${
          result.status === 'PASS'
            ? 'bg-success text-success-foreground'
            : result.status === 'WARNING'
              ? 'bg-[hsl(38,92%,50%)] text-white'
              : 'bg-destructive text-destructive-foreground'
        }`}>
          <div className={`w-2 h-2 rounded-full ${
            result.status === 'PASS' ? 'bg-green-300 animate-pulse' : result.status === 'WARNING' ? 'bg-yellow-200 animate-pulse' : 'bg-red-300 animate-pulse'
          }`} />
          {result.status === 'PASS' ? <CheckCircle className="w-3 h-3" /> : result.status === 'WARNING' ? <AlertTriangle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
          {result.status}
        </div>

        {/* Score in corner */}
        <div className={`absolute bottom-2 left-2 px-2 py-1 rounded text-xs font-bold ${
          result.overallScore >= 85
            ? 'bg-green-500 text-white'
            : result.overallScore >= 70
              ? 'bg-yellow-500 text-black'
              : 'bg-red-500 text-white'
        }`}>
          {result.overallScore}%
        </div>
      </div>

      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium truncate max-w-[150px]">{asset.name}</p>
            <div className="flex items-center gap-1.5">
              <p className="text-xs text-muted-foreground">
                {sortedViolations.length} issue{sortedViolations.length !== 1 ? 's' : ''} found
              </p>
              {asset.fixedImage && asset.fixMethod && (() => {
                const config = getFixMethodConfig(asset.fixMethod);
                const Icon = config.icon;
                return (
                  <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${config.className}`}>
                    <Icon className="w-2.5 h-2.5" />
                    {config.label}
                  </span>
                );
              })()}
            </div>
          </div>
          <ScoreGauge score={result.overallScore} size={60} />
        </div>

        {/* Policy vs Quality side-by-side */}
        {(result.policyStatus || result.qualityScore !== undefined) && (
          <div className="flex items-center gap-2 text-xs">
            {result.policyStatus && <PolicyStatusBadge status={result.policyStatus} />}
            {result.qualityScore !== undefined && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-muted/50 text-[10px] font-medium">
                <Activity className="w-3 h-3 text-muted-foreground" />
                Quality: <span className={`font-bold ${result.qualityScore >= 85 ? 'text-green-400' : result.qualityScore >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>{result.qualityScore}</span>
              </span>
            )}
          </div>
        )}

        {/* Deterministic Pre-check Findings */}
        {result.deterministicFindings && result.deterministicFindings.length > 0 && (
          <DeterministicFindingsPanel findings={result.deterministicFindings} />
        )}
        {/* Scoring Rationale */}
        {result.scoringRationale && (
          <p className="text-xs text-muted-foreground italic leading-relaxed border-l-2 border-primary/30 pl-2">
            {result.scoringRationale}
          </p>
        )}

        {/* Evidence-grouped violations */}
        {sortedViolations.length > 0 && (() => {
          const detRuleIds = buildDeterministicRuleIdSet(result.deterministicFindings);
          return (
            <div className="max-h-40 overflow-y-auto space-y-2">
              {sortedViolations.slice(0, 2).map((v, i) => (
                <ViolationItem
                  key={i}
                  violation={v}
                  index={i}
                  matchingUpdate={getMatchingPolicyUpdate?.(v.message, v.category)}
                  evidence={extractEvidence(v, detRuleIds)}
                />
              ))}
              {sortedViolations.length > 2 && (
                <p className="text-xs text-muted-foreground py-1">
                  +{sortedViolations.length - 2} more issues...
                </p>
              )}
            </div>
          );
        })()}

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => onViewDetails(asset)}>
            Details
          </Button>
          {asset.fixedImage && onReverify ? (
            <Button variant="secondary" size="sm" className="flex-1" onClick={() => onReverify(asset.id)} disabled={asset.isGeneratingFix}>
              {asset.isGeneratingFix ? <Loader2 className="w-4 h-4 animate-spin" /> : <><RotateCcw className="w-4 h-4 mr-1" />Re-verify</>}
            </Button>
          ) : result.status === 'FAIL' || result.status === 'WARNING' ? (
            <Button size="sm" className="flex-1" onClick={() => { onViewDetails(asset); onRequestFix(asset.id); }} disabled={asset.isGeneratingFix}>
              {asset.isGeneratingFix ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Wand2 className="w-4 h-4 mr-1" />Fix</>}
            </Button>
          ) : (
            <Button variant="secondary" size="sm" className="flex-1" onClick={() => onViewDetails(asset)} disabled={asset.isGeneratingFix}>
              {asset.isGeneratingFix ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Wand2 className="w-4 h-4 mr-1" />Enhance</>}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Policy Context Banner ──

function PolicyContextBanner({ summary }: { summary: PolicySummary }) {
  return (
    <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground mb-3 px-2 py-1.5 rounded-md bg-muted/30 border border-border/50">
      <span className="font-mono font-semibold text-foreground/70">v{summary.policyVersion}</span>
      <span className="inline-flex items-center gap-1">
        <span>{summary.categoryIcon}</span>
        <span className="font-medium text-foreground/80">{summary.categoryLabel}</span>
      </span>
      <span>{summary.totalApplicableRules} rules</span>
      <span className="inline-flex items-center gap-1 px-1.5 py-0 rounded-full border bg-blue-500/15 text-blue-400 border-blue-500/30">
        <Cpu className="w-2.5 h-2.5" />
        {summary.deterministicRuleCount + summary.hybridRuleCount} pre-checks
      </span>
      {summary.categorySpecificRuleCount > 0 && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0 rounded-full border bg-orange-500/15 text-orange-400 border-orange-500/30">
          <Tag className="w-2.5 h-2.5" />
          {summary.categorySpecificRuleCount} category
        </span>
      )}
      {summary.complianceRuleCount > 0 && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0 rounded-full border bg-primary/10 text-primary border-primary/20 text-[10px] font-medium">
          {summary.complianceRuleCount} compliance
        </span>
      )}
      {summary.optimizationRuleCount > 0 && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0 rounded-full border bg-accent/10 text-accent-foreground border-accent/20 text-[10px] font-medium">
          {summary.optimizationRuleCount} optimization
        </span>
      )}
      {summary.sources[0]?.url && (
        <a href={summary.sources[0].url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary/70 hover:text-primary">
          <ExternalLink className="w-2.5 h-2.5" /> Source
        </a>
      )}
    </div>
  );
}

// ── Main export ──

export function AnalysisResults({
  assets,
  listingTitle,
  onRequestFix,
  onViewDetails,
  onReverify,
  onBatchFix,
  onRetryAudit,
  isBatchFixing,
  batchFixProgress,
  productAsin,
  competitorData,
  getMatchingPolicyUpdate,
  aiCreditsExhausted,
}: AnalysisResultsProps) {
  const analyzedAssets = assets.filter(a => a.analysisResult || a.isAnalyzing);
  const failedAssets = assets.filter(a => a.analysisError && !a.analysisResult && !a.isAnalyzing);
  const allFailed = failedAssets.length > 0 && analyzedAssets.length === 0;

  // FEATURE 3: Violation Trend Badges (must be before early returns)
  const [trend, setTrend] = useState<{ prevScore: number; prevDate: string; direction: 'up' | 'down' | 'same' } | null>(null);
  useEffect(() => {
    getScoreTrend(listingTitle).then(setTrend);
  }, [listingTitle]);

  // Determine the most common error reason
  const primaryError = allFailed
    ? failedAssets.reduce((acc, a) => {
        const err = a.analysisError || 'Unknown error';
        acc[err] = (acc[err] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    : null;
  const topErrorMsg = primaryError
    ? Object.entries(primaryError).sort((a, b) => b[1] - a[1])[0]?.[0]
    : null;

  if (allFailed && !aiCreditsExhausted) {
    return (
      <Card className="glass-card h-full flex items-center justify-center min-h-[400px]">
        <CardContent className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
            <AlertOctagon className="w-8 h-8 text-destructive/70" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2 tracking-tight">Audit Failed</h3>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed mb-1">
            All {failedAssets.length} images failed to analyze.
          </p>
          {topErrorMsg && (
            <p className="text-sm text-destructive font-medium mb-4">
              Reason: {topErrorMsg}
            </p>
          )}
          {onRetryAudit && (
            <Button onClick={onRetryAudit} className="mt-2">
              <RotateCcw className="w-4 h-4 mr-2" />
              Retry Audit
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (analyzedAssets.length === 0) {
    return (
      <Card className="glass-card h-full flex items-center justify-center min-h-[400px]">
        <CardContent className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-primary/30" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2 tracking-tight">No Audit Results Yet</h3>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
            Upload images and run a batch audit to see compliance results here.
          </p>
        </CardContent>
      </Card>
    );
  }

  const completedAssets = analyzedAssets.filter(a => a.analysisResult);
  const passCount = completedAssets.filter(a => a.analysisResult?.status === 'PASS').length;
  const warningCount = completedAssets.filter(a => a.analysisResult?.status === 'WARNING').length;
  const failCount = completedAssets.filter(a => a.analysisResult?.status === 'FAIL').length;
  const fixableCount = failCount + warningCount;
  const avgScore = completedAssets.length > 0
    ? Math.round(completedAssets.reduce((sum, a) => sum + (a.analysisResult?.overallScore || 0), 0) / completedAssets.length)
    : 0;


  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Analysis Summary</CardTitle>
            <div className="flex items-center gap-2">
              {fixableCount > 0 && onBatchFix && (
                <Button size="sm" onClick={onBatchFix} disabled={isBatchFixing} className="bg-primary hover:bg-primary/90">
                  {isBatchFixing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Fixing...</> : <><Wand2 className="w-4 h-4 mr-2" />Fix All ({fixableCount})</>}
                </Button>
              )}
              <ExportButton assets={assets} listingTitle={listingTitle} productAsin={productAsin} competitorData={competitorData} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Policy context banner */}
          {completedAssets.length > 0 && (() => {
            const detectedCat = completedAssets[0]?.analysisResult?.productCategory;
            const catKey = detectedCat ? (GEMINI_CATEGORY_MAP[detectedCat] || detectedCat) as ProductCategory : 'GENERAL_MERCHANDISE' as ProductCategory;
            const summary = getPolicySummary('main', catKey);
            return <PolicyContextBanner summary={summary} />;
          })()}
          <div className="flex items-center justify-between">
            <div className="flex gap-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-500">{passCount}</p>
                <p className="text-xs text-muted-foreground">Passed</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-[hsl(38,92%,50%)]">{warningCount}</p>
                <p className="text-xs text-muted-foreground">Warning</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-500">{failCount}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-muted-foreground">{analyzedAssets.length - completedAssets.length}</p>
                <p className="text-xs text-muted-foreground">Processing</p>
              </div>
            </div>
            {completedAssets.length > 0 && (
              <div className="flex items-center gap-2">
                <ScoreGauge score={avgScore} size={70} />
                {trend && (
                  <ScoreTrendBadge
                    direction={trend.direction}
                    prevScore={trend.prevScore}
                    prevDate={trend.prevDate}
                  />
                )}
              </div>
            )}

            {/* Batch fix progress */}
            {isBatchFixing && batchFixProgress && (
              <div className="mt-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Fixing {batchFixProgress.current} of {batchFixProgress.total} failed images...
                </p>
                <Progress value={(batchFixProgress.current / batchFixProgress.total) * 100} className="h-2" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {analyzedAssets.map((asset) => (
          <AssetResultCard key={asset.id} asset={asset} onRequestFix={onRequestFix} onViewDetails={onViewDetails} onReverify={onReverify} getMatchingPolicyUpdate={getMatchingPolicyUpdate} />
        ))}
      </div>
    </div>
  );
}
