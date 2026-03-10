import { useState, useEffect, useRef } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Wand2, Loader2, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ImageAsset, AnalysisResult } from '@/types';
import { ExportButton } from '@/components/ExportButton';

interface AnalysisResultsProps {
  assets: ImageAsset[];
  listingTitle: string;
  onRequestFix: (assetId: string) => void;
  onViewDetails: (asset: ImageAsset) => void;
  onReverify?: (assetId: string) => void;
  onBatchFix?: () => void;
  isBatchFixing?: boolean;
  productAsin?: string;
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

// ── Severity helpers ──

const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, critical: 0, HIGH: 1, high: 1, MEDIUM: 2, medium: 2, warning: 2, LOW: 3, low: 3, info: 4 };

const getSeverityBadgeClass = (severity: string) => {
  const s = severity.toUpperCase();
  if (s === 'CRITICAL') return 'bg-red-500 text-white';
  if (s === 'HIGH') return 'bg-orange-500 text-white';
  if (s === 'MEDIUM' || s === 'WARNING') return 'bg-yellow-500 text-black';
  return 'bg-blue-500 text-white';
};

// ── Violation Card with expandable recommendation ──

function ViolationItem({ violation, index }: { violation: AnalysisResult['violations'][0]; index: number }) {
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
        </div>
      </div>
      <p className="text-sm text-foreground mt-1">{violation.message}</p>

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

// ── Asset Result Card ──

function AssetResultCard({
  asset,
  onRequestFix,
  onViewDetails,
  onReverify,
}: {
  asset: ImageAsset;
  onRequestFix: (id: string) => void;
  onViewDetails: (asset: ImageAsset) => void;
  onReverify?: (id: string) => void;
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
        <Card className="asset-card overflow-hidden">
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
    <Card className="asset-card overflow-hidden">
      <div className="aspect-video relative bg-muted">
        <img src={asset.preview} alt={asset.name} className="w-full h-full object-cover" />

        {/* MAIN / SECONDARY badge */}
        <Badge className={`absolute top-2 left-2 font-bold ${
          asset.type === 'MAIN'
            ? 'bg-[hsl(33,100%,50%)] text-white hover:bg-[hsl(33,100%,45%)]'
            : 'bg-[hsl(213,27%,23%)] text-white hover:bg-[hsl(213,27%,20%)]'
        }`}>
          {asset.type}
        </Badge>

        {/* AI Category Badge */}
        {imageCategory && (
          <div className={`absolute top-10 left-2 px-2 py-0.5 rounded text-xs font-medium ${getCategoryColor(imageCategory)}`}>
            {formatCategory(imageCategory)}
          </div>
        )}

        {/* Status dot indicator */}
        <div className={`absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded text-xs font-bold ${
          result.status === 'PASS'
            ? 'bg-success text-success-foreground'
            : 'bg-destructive text-destructive-foreground'
        }`}>
          <div className={`w-2 h-2 rounded-full ${
            result.status === 'PASS' ? 'bg-green-300 animate-pulse' : 'bg-red-300 animate-pulse'
          }`} />
          {result.status === 'PASS' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
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
            <p className="text-xs text-muted-foreground">
              {sortedViolations.length} issue{sortedViolations.length !== 1 ? 's' : ''} found
            </p>
          </div>
          <ScoreGauge score={result.overallScore} size={60} />
        </div>

        {/* Violations sorted by severity with stagger */}
        {sortedViolations.length > 0 && (
          <div className="max-h-32 overflow-y-auto space-y-2">
            {sortedViolations.slice(0, 2).map((v, i) => (
              <ViolationItem key={i} violation={v} index={i} />
            ))}
            {sortedViolations.length > 2 && (
              <p className="text-xs text-muted-foreground py-1">
                +{sortedViolations.length - 2} more issues...
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => onViewDetails(asset)}>
            Details
          </Button>
          {asset.fixedImage && onReverify ? (
            <Button variant="secondary" size="sm" className="flex-1" onClick={() => onReverify(asset.id)} disabled={asset.isGeneratingFix}>
              {asset.isGeneratingFix ? <Loader2 className="w-4 h-4 animate-spin" /> : <><RotateCcw className="w-4 h-4 mr-1" />Re-verify</>}
            </Button>
          ) : result.status === 'FAIL' ? (
            <Button size="sm" className="flex-1" onClick={() => onRequestFix(asset.id)} disabled={asset.isGeneratingFix}>
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

// ── Main export ──

export function AnalysisResults({
  assets,
  listingTitle,
  onRequestFix,
  onViewDetails,
  onReverify,
  onBatchFix,
  isBatchFixing,
  productAsin
}: AnalysisResultsProps) {
  const analyzedAssets = assets.filter(a => a.analysisResult || a.isAnalyzing);

  if (analyzedAssets.length === 0) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-medium text-foreground mb-2">No Analysis Yet</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            Upload images and run a batch audit to see compliance results here.
          </p>
        </CardContent>
      </Card>
    );
  }

  const completedAssets = analyzedAssets.filter(a => a.analysisResult);
  const passCount = completedAssets.filter(a => a.analysisResult?.status === 'PASS').length;
  const failCount = completedAssets.filter(a => a.analysisResult?.status === 'FAIL').length;
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
              {failCount > 0 && onBatchFix && (
                <Button size="sm" onClick={onBatchFix} disabled={isBatchFixing} className="bg-primary hover:bg-primary/90">
                  {isBatchFixing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Fixing...</> : <><Wand2 className="w-4 h-4 mr-2" />Fix All ({failCount})</>}
                </Button>
              )}
              <ExportButton assets={assets} listingTitle={listingTitle} productAsin={productAsin} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex gap-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-500">{passCount}</p>
                <p className="text-xs text-muted-foreground">Passed</p>
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
            {completedAssets.length > 0 && <ScoreGauge score={avgScore} size={70} />}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {analyzedAssets.map((asset) => (
          <AssetResultCard key={asset.id} asset={asset} onRequestFix={onRequestFix} onViewDetails={onViewDetails} onReverify={onReverify} />
        ))}
      </div>
    </div>
  );
}
