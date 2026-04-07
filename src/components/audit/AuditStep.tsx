import { AnalysisResults } from '@/components/AnalysisResults';
import { ComplianceReportCard } from '@/components/ComplianceReportCard';
import { ImageAsset, LogEntry } from '@/types';
import { CompetitorData } from '@/components/CompetitorAudit';
import { Button } from '@/components/ui/button';
import { ArrowRight, Wand2, Search } from 'lucide-react';

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
  const failedAssets = analyzedAssets.filter(a => a.analysisResult?.status === 'FAIL' || a.analysisResult?.status === 'WARNING');
  const hasResults = analyzedAssets.length > 0;
  const needsAudit = assets.length > 0 && !hasResults && !isAnalyzing;

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
