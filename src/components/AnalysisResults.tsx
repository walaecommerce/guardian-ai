import { CheckCircle, XCircle, AlertTriangle, Wand2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ImageAsset, AnalysisResult } from '@/types';
import { useEffect, useState } from 'react';
import { ExportButton } from '@/components/ExportButton';

interface AnalysisResultsProps {
  assets: ImageAsset[];
  listingTitle: string;
  onRequestFix: (assetId: string) => void;
  onViewDetails: (asset: ImageAsset) => void;
}

function ScoreGauge({ score, size = 80 }: { score: number; size?: number }) {
  const [displayScore, setDisplayScore] = useState(0);
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (displayScore / 100) * circumference;

  const getScoreColor = (s: number) => {
    if (s >= 85) return 'text-success';
    if (s >= 70) return 'text-warning';
    return 'text-destructive';
  };

  const getStrokeColor = (s: number) => {
    if (s >= 85) return 'stroke-success';
    if (s >= 70) return 'stroke-warning';
    return 'stroke-destructive';
  };

  useEffect(() => {
    const duration = 1000;
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayScore(Math.round(score * eased));
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }, [score]);

  return (
    <div className="score-gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        {/* Background circle */}
        <circle
          className="stroke-muted"
          strokeWidth={strokeWidth}
          fill="none"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        {/* Progress circle */}
        <circle
          className={`score-gauge-circle transition-all duration-1000 ${getStrokeColor(score)}`}
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
        <span className={`text-xl font-bold ${getScoreColor(score)}`}>
          {displayScore}
        </span>
      </div>
    </div>
  );
}

function ViolationItem({ violation }: { violation: AnalysisResult['violations'][0] }) {
  const getIcon = () => {
    switch (violation.severity) {
      case 'critical':
        return <XCircle className="w-4 h-4 text-destructive shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-warning shrink-0" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-muted-foreground shrink-0" />;
    }
  };

  return (
    <div className="flex gap-2 py-2 border-b border-border last:border-0">
      {getIcon()}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="outline" className="text-xs">
            {violation.category}
          </Badge>
          <Badge
            variant={violation.severity === 'critical' ? 'destructive' : 'secondary'}
            className="text-xs"
          >
            {violation.severity}
          </Badge>
        </div>
        <p className="text-sm text-foreground">{violation.message}</p>
        <p className="text-xs text-muted-foreground mt-1">
          💡 {violation.recommendation}
        </p>
      </div>
    </div>
  );
}

function AssetResultCard({
  asset,
  onRequestFix,
  onViewDetails,
}: {
  asset: ImageAsset;
  onRequestFix: (id: string) => void;
  onViewDetails: (asset: ImageAsset) => void;
}) {
  const result = asset.analysisResult;

  if (!result) {
    if (asset.isAnalyzing) {
      return (
        <Card className="asset-card overflow-hidden">
          <div className="aspect-video relative bg-muted shimmer">
            <img
              src={asset.preview}
              alt={asset.name}
              className="w-full h-full object-cover opacity-50"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          </div>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground text-center">
              Analyzing...
            </p>
          </CardContent>
        </Card>
      );
    }
    return null;
  }

  return (
    <Card className="asset-card overflow-hidden">
      {/* Image Preview */}
      <div className="aspect-video relative bg-muted">
        <img
          src={asset.preview}
          alt={asset.name}
          className="w-full h-full object-cover"
        />
        <Badge
          variant={asset.type === 'MAIN' ? 'default' : 'secondary'}
          className="absolute top-2 left-2"
        >
          {asset.type}
        </Badge>
        <div
          className={`absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded text-xs font-bold
            ${result.status === 'PASS'
              ? 'bg-success text-success-foreground'
              : 'bg-destructive text-destructive-foreground'
            }`}
        >
          {result.status === 'PASS' ? (
            <CheckCircle className="w-3 h-3" />
          ) : (
            <XCircle className="w-3 h-3" />
          )}
          {result.status}
        </div>
      </div>

      <CardContent className="p-4 space-y-4">
        {/* Score */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium truncate max-w-[150px]">
              {asset.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {result.violations.length} issue{result.violations.length !== 1 ? 's' : ''} found
            </p>
          </div>
          <ScoreGauge score={result.overallScore} size={60} />
        </div>

        {/* Violations Summary */}
        {result.violations.length > 0 && (
          <div className="max-h-32 overflow-y-auto">
            {result.violations.slice(0, 2).map((v, i) => (
              <ViolationItem key={i} violation={v} />
            ))}
            {result.violations.length > 2 && (
              <p className="text-xs text-muted-foreground py-2">
                +{result.violations.length - 2} more issues...
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onViewDetails(asset)}
          >
            Details
          </Button>
          {result.status === 'FAIL' && (
            <Button
              size="sm"
              className="flex-1"
              onClick={() => onRequestFix(asset.id)}
              disabled={asset.isGeneratingFix}
            >
              {asset.isGeneratingFix ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Wand2 className="w-4 h-4 mr-1" />
                  Fix
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function AnalysisResults({ assets, listingTitle, onRequestFix, onViewDetails }: AnalysisResultsProps) {
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

  // Calculate summary stats
  const completedAssets = analyzedAssets.filter(a => a.analysisResult);
  const passCount = completedAssets.filter(a => a.analysisResult?.status === 'PASS').length;
  const failCount = completedAssets.filter(a => a.analysisResult?.status === 'FAIL').length;
  const avgScore = completedAssets.length > 0
    ? Math.round(completedAssets.reduce((sum, a) => sum + (a.analysisResult?.overallScore || 0), 0) / completedAssets.length)
    : 0;

  return (
    <div className="space-y-4">
      {/* Summary Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Analysis Summary</CardTitle>
            <ExportButton assets={assets} listingTitle={listingTitle} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex gap-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-success">{passCount}</p>
                <p className="text-xs text-muted-foreground">Passed</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-destructive">{failCount}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-muted-foreground">
                  {analyzedAssets.length - completedAssets.length}
                </p>
                <p className="text-xs text-muted-foreground">Processing</p>
              </div>
            </div>
            {completedAssets.length > 0 && (
              <ScoreGauge score={avgScore} size={70} />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Asset Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-stagger-fade-in">
        {analyzedAssets.map((asset) => (
          <AssetResultCard
            key={asset.id}
            asset={asset}
            onRequestFix={onRequestFix}
            onViewDetails={onViewDetails}
          />
        ))}
      </div>
    </div>
  );
}
