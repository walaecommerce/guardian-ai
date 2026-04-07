import { AnalysisResults } from '@/components/AnalysisResults';
import { ComplianceReportCard } from '@/components/ComplianceReportCard';
import { ImageAsset, LogEntry } from '@/types';
import { CompetitorData } from '@/components/CompetitorAudit';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, Wand2, Search, CheckCircle2, XCircle, AlertTriangle, BarChart3 } from 'lucide-react';

interface AuditStepProps {
  assets: ImageAsset[];
  listingTitle: string;
  isAnalyzing: boolean;
  onRequestFix: (id: string) => void;
  onViewDetails: (asset: ImageAsset) => void;
  onReverify: (id: string) => void;
  onBatchFix: () => void;
  isBatchFixing: boolean;
  batchFixProgress: { current: number; total: number } | null;
  productAsin?: string;
  competitorData: CompetitorData | null;
  getMatchingPolicyUpdate?: (violationMessage: string, violationCategory: string) => any;
  onGoToFix: () => void;
  onRunAudit: () => void;
  onSelectAsset: (asset: ImageAsset) => void;
}

export function AuditStep({
  assets, listingTitle, isAnalyzing,
  onRequestFix, onViewDetails, onReverify, onBatchFix,
  isBatchFixing, batchFixProgress, productAsin, competitorData,
  getMatchingPolicyUpdate, onGoToFix, onRunAudit, onSelectAsset,
}: AuditStepProps) {
  const analyzedAssets = assets.filter(a => a.analysisResult);
  const passedAssets = analyzedAssets.filter(a => a.analysisResult?.status === 'PASS');
  const failedAssets = analyzedAssets.filter(a => a.analysisResult?.status === 'FAIL' || a.analysisResult?.status === 'WARNING');
  const hasResults = analyzedAssets.length > 0;
  const needsAudit = assets.length > 0 && !hasResults && !isAnalyzing;

  const scores = analyzedAssets.map(a => a.analysisResult?.overallScore || 0);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const criticalCount = analyzedAssets.flatMap(a => a.analysisResult?.violations || []).filter(v => v.severity === 'CRITICAL' || v.severity === 'critical').length;

  return (
    <div className="space-y-6">
      {/* Run audit prompt */}
      {needsAudit && (
        <div className="text-center py-12 space-y-3 border border-dashed border-primary/30 rounded-xl bg-primary/5">
          <Search className="w-10 h-10 text-primary mx-auto" />
          <p className="text-lg font-semibold">{assets.length} images ready for audit</p>
          <p className="text-sm text-muted-foreground">Click "Run Audit" in the command bar or below</p>
          <Button onClick={onRunAudit} size="lg" className="mt-2">
            Run Audit
          </Button>
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

      {/* Full-width results */}
      <AnalysisResults
        assets={assets}
        listingTitle={listingTitle}
        onRequestFix={onRequestFix}
        onViewDetails={(asset) => { onSelectAsset(asset); }}
        onReverify={onReverify}
        onBatchFix={onBatchFix}
        isBatchFixing={isBatchFixing}
        batchFixProgress={batchFixProgress}
        productAsin={productAsin}
        competitorData={competitorData}
        getMatchingPolicyUpdate={getMatchingPolicyUpdate}
      />

      {/* Bottom CTA bar */}
      {failedAssets.length > 0 && !isAnalyzing && (
        <div className="flex items-center justify-center gap-3 py-4">
          <Button onClick={onGoToFix} size="lg">
            <Wand2 className="w-4 h-4 mr-2" />
            Fix {failedAssets.length} Issue{failedAssets.length > 1 ? 's' : ''}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
}
