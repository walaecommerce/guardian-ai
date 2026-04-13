import { AnalysisResults } from '@/components/AnalysisResults';
import { ComplianceReportCard } from '@/components/ComplianceReportCard';
import { EmptyState } from '@/components/EmptyState';
import { ProductIdentityPanel } from '@/components/ProductIdentityPanel';
import { CampaignStrategyPanel } from '@/components/CampaignStrategyPanel';
import { ImageAsset, LogEntry, ProductIdentityCard } from '@/types';
import { MultiImageIdentityProfile } from '@/utils/identityProfile';
import type { ProductKnowledge } from '@/utils/productKnowledge';
import type { CampaignStrategy } from '@/utils/campaignStrategy';
import { CompetitorData } from '@/components/CompetitorAudit';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, Wand2, Search, CheckCircle2, XCircle, AlertTriangle, BarChart3, Loader2, Import } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface AuditStepProps {
  assets: ImageAsset[];
  listingTitle: string;
  isAnalyzing: boolean;
  onRequestFix: (id: string) => void;
  onRequestEnhance?: (id: string) => void;
  onViewDetails: (asset: ImageAsset) => void;
  onReverify: (id: string) => void;
  onBatchFix: () => void;
  isBatchFixing: boolean;
  batchFixProgress: { current: number; total: number } | null;
  productAsin?: string;
  competitorData: CompetitorData | null;
  getMatchingPolicyUpdate?: (violationMessage: string, violationCategory: string) => any;
  onGoToFix: () => void;
  onGoToImport?: () => void;
  onRunAudit: () => void;
  onSelectAsset: (asset: ImageAsset) => void;
  onRetryFailedAnalysis: () => void;
  aiCreditsExhausted?: boolean;
  productIdentity?: ProductIdentityCard | null;
  identityProfile?: MultiImageIdentityProfile | null;
  productKnowledge?: ProductKnowledge | null;
  campaignStrategy?: CampaignStrategy | null;
}

export function AuditStep({
  assets, listingTitle, isAnalyzing,
  onRequestFix, onRequestEnhance, onViewDetails, onReverify, onBatchFix,
  isBatchFixing, batchFixProgress, productAsin, competitorData,
  getMatchingPolicyUpdate, onGoToFix, onGoToImport, onRunAudit, onSelectAsset,
  onRetryFailedAnalysis, aiCreditsExhausted, productIdentity, identityProfile,
  productKnowledge, campaignStrategy,
}: AuditStepProps) {
  const analyzedAssets = assets.filter(a => a.analysisResult);
  const passedAssets = analyzedAssets.filter(a => a.analysisResult?.status === 'PASS');
  const failedAssets = analyzedAssets.filter(a => a.analysisResult?.status === 'FAIL' || a.analysisResult?.status === 'WARNING');
  const errorAssets = assets.filter(a => a.analysisError);
  const hasResults = analyzedAssets.length > 0;
  const needsAudit = assets.length > 0 && !hasResults && !isAnalyzing && errorAssets.length === 0;
  const noImages = assets.length === 0;

  const scores = analyzedAssets.map(a => a.analysisResult?.overallScore || 0);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const criticalCount = analyzedAssets.flatMap(a => a.analysisResult?.violations || []).filter(v => v.severity?.toLowerCase() === 'critical').length;

  // No images at all — guide back to import
  if (noImages) {
    return (
      <EmptyState
        icon={Import}
        title="No Images Imported"
        description="Go back to the Import step to add images before running an audit."
        actionLabel={onGoToImport ? "Go to Import" : undefined}
        onAction={onGoToImport}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Run audit prompt */}
      {needsAudit && (
        <div className="text-center py-12 space-y-3 border border-dashed border-primary/30 rounded-xl bg-primary/5">
          <Search className="w-10 h-10 text-primary mx-auto" />
          <p className="text-lg font-semibold">{assets.length} images ready for audit</p>
          <p className="text-sm text-muted-foreground">
            Run AI compliance checks on all your images
          </p>
          <Button onClick={onRunAudit} size="lg" className="mt-2">
            <Search className="w-4 h-4 mr-2" />
            Run Compliance Audit
          </Button>
        </div>
      )}

      {/* Pre-audit / in-progress image gallery */}
      {(needsAudit || (isAnalyzing && analyzedAssets.length < assets.length)) && (
        <div className="space-y-3">
          {/* Progress indicator */}
          {isAnalyzing && (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
              <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0" />
              <div className="flex-1 space-y-1.5">
                <p className="text-sm font-medium text-foreground">
                  Analyzing image {analyzedAssets.length + 1} of {assets.length}…
                </p>
                <Progress value={assets.length > 0 ? (analyzedAssets.length / assets.length) * 100 : 0} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {analyzedAssets.length} analyzed · {passedAssets.length} passed · {failedAssets.length} failed
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
          {assets.map((asset) => {
            const hasResult = !!asset.analysisResult;
            const isPassing = asset.analysisResult?.status === 'PASS';
            const hasError = !!asset.analysisError;
            return (
              <button
                key={asset.id}
                onClick={() => onSelectAsset(asset)}
                className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted group focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <img src={asset.preview} alt={asset.name} className="w-full h-full object-cover" />

                {/* Type badge */}
                <span className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  asset.type === 'MAIN' ? 'bg-amber-400 text-amber-900' : 'bg-muted text-muted-foreground'
                }`}>
                  {asset.type === 'MAIN' ? 'MAIN' : 'SEC'}
                </span>

                {/* Analysis status overlay */}
                {isAnalyzing && !hasResult && !hasError && (
                  <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                )}

                {/* Error overlay */}
                {hasError && !hasResult && (
                  <div className="absolute inset-0 bg-destructive/10 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-destructive" />
                  </div>
                )}

                {/* Pass/Fail badge after analysis */}
                {hasResult && (
                  <div className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center ${
                    isPassing ? 'bg-green-500' : 'bg-destructive'
                  }`}>
                    {isPassing
                      ? <CheckCircle2 className="w-3 h-3 text-white" />
                      : <XCircle className="w-3 h-3 text-white" />}
                  </div>
                )}

                {/* File name on hover */}
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-[10px] text-white truncate">{asset.name}</p>
                </div>
              </button>
            );
          })}
        </div>
        </div>
      )}

      {/* Partial failure banner — hidden when pause is due to credits exhaustion */}
      {!isAnalyzing && errorAssets.length > 0 && !aiCreditsExhausted && (
        <div className="flex flex-col gap-2 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-destructive">
              {analyzedAssets.length > 0
                ? `${analyzedAssets.length} of ${assets.length} images analyzed. ${errorAssets.length} failed.`
                : `${errorAssets.length} image(s) failed to analyze.`}
            </p>
            <Button variant="outline" size="sm" onClick={onRetryFailedAnalysis} disabled={isAnalyzing}>
              Retry Failed ({errorAssets.length})
            </Button>
          </div>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {errorAssets.slice(0, 5).map(a => (
              <li key={a.id}>• {a.name}: {a.analysisError}</li>
            ))}
            {errorAssets.length > 5 && <li>…and {errorAssets.length - 5} more</li>}
          </ul>
        </div>
      )}

      {/* Compliance Scorecard Summary */}
      {hasResults && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-border/50">
            <CardContent className="p-4 text-center">
              <div className={`text-3xl font-bold ${avgScore >= 80 ? 'text-green-500' : avgScore >= 50 ? 'text-yellow-500' : 'text-destructive'}`}>
                {avgScore}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">Overall Score</p>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4 text-center">
              <div className="flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span className="text-2xl font-bold text-foreground">{passedAssets.length}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Passed</p>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4 text-center">
              <div className="flex items-center justify-center gap-1.5">
                <XCircle className="w-5 h-5 text-destructive" />
                <span className="text-2xl font-bold text-foreground">{failedAssets.length}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Need Fixing</p>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4 text-center">
              <div className="flex items-center justify-center gap-1.5">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                <span className="text-2xl font-bold text-foreground">{criticalCount}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Critical Issues</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Product Identity Summary */}
      {hasResults && productIdentity && (
        <ProductIdentityPanel identity={productIdentity} profile={identityProfile} />
      )}

      {/* Campaign Image Strategy */}
      {hasResults && campaignStrategy && (
        <CampaignStrategyPanel strategy={campaignStrategy} />
      )}

      {/* Full-width results */}
      <AnalysisResults
        assets={assets}
        listingTitle={listingTitle}
        onRequestFix={onRequestFix}
        onRequestEnhance={onRequestEnhance}
        onViewDetails={(asset) => { onSelectAsset(asset); }}
        onReverify={onReverify}
        onBatchFix={onBatchFix}
        onRetryAudit={onRunAudit}
        isBatchFixing={isBatchFixing}
        batchFixProgress={batchFixProgress}
        productAsin={productAsin}
        competitorData={competitorData}
        getMatchingPolicyUpdate={getMatchingPolicyUpdate}
        aiCreditsExhausted={aiCreditsExhausted}
        productKnowledge={productKnowledge}
      />

      {/* Bottom CTA bar — contextual based on results */}
      {hasResults && !isAnalyzing && (
        <div className="flex items-center justify-center gap-3 py-4">
          {failedAssets.length > 0 ? (
            <Button onClick={onGoToFix} size="lg">
              <Wand2 className="w-4 h-4 mr-2" />
              Fix {failedAssets.length} Issue{failedAssets.length > 1 ? 's' : ''}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={() => onGoToFix()} size="lg" variant="outline">
              <CheckCircle2 className="w-4 h-4 mr-2" />
              All Passed — Save & Export
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
