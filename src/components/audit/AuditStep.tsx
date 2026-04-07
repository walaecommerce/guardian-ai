import { AnalysisResults } from '@/components/AnalysisResults';
import { ComplianceReportCard } from '@/components/ComplianceReportCard';
import { ActivityLog } from '@/components/ActivityLog';
import { ImageAsset, LogEntry } from '@/types';
import { CompetitorData } from '@/components/CompetitorAudit';
import { Button } from '@/components/ui/button';
import { ArrowRight, Wand2 } from 'lucide-react';

interface AuditStepProps {
  assets: ImageAsset[];
  listingTitle: string;
  isAnalyzing: boolean;
  logs: LogEntry[];
  onClearLogs: () => void;
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
}

export function AuditStep({
  assets, listingTitle, isAnalyzing, logs, onClearLogs,
  onRequestFix, onViewDetails, onReverify, onBatchFix,
  isBatchFixing, batchFixProgress, productAsin, competitorData,
  getMatchingPolicyUpdate, onGoToFix, onRunAudit,
}: AuditStepProps) {
  const analyzedAssets = assets.filter(a => a.analysisResult);
  const failedAssets = analyzedAssets.filter(a => a.analysisResult?.status === 'FAIL' || a.analysisResult?.status === 'WARNING');
  const hasResults = analyzedAssets.length > 0;
  const needsAudit = assets.length > 0 && !hasResults && !isAnalyzing;

  return (
    <div className="space-y-6">
      {/* Run audit prompt if images loaded but no results yet */}
      {needsAudit && (
        <div className="text-center py-8 space-y-3 border border-dashed border-primary/30 rounded-xl bg-primary/5">
          <p className="text-lg font-semibold">{assets.length} images ready for audit</p>
          <p className="text-sm text-muted-foreground">Click below to run the compliance check</p>
          <Button onClick={onRunAudit} size="lg" className="mt-2">
            Run Audit
          </Button>
        </div>
      )}

      {/* Two-column layout: results + sidebar info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main results area */}
        <div className="lg:col-span-2">
          <AnalysisResults
            assets={assets}
            listingTitle={listingTitle}
            onRequestFix={onRequestFix}
            onViewDetails={onViewDetails}
            onReverify={onReverify}
            onBatchFix={onBatchFix}
            isBatchFixing={isBatchFixing}
            batchFixProgress={batchFixProgress}
            productAsin={productAsin}
            competitorData={competitorData}
            getMatchingPolicyUpdate={getMatchingPolicyUpdate}
          />
        </div>

        {/* Sidebar: Compliance card + activity log */}
        <div className="space-y-4">
          {(hasResults || isAnalyzing) && (
            <ComplianceReportCard assets={assets} isAnalyzing={isAnalyzing} />
          )}

          {/* CTA to fix step */}
          {failedAssets.length > 0 && !isAnalyzing && (
            <Button onClick={onGoToFix} className="w-full" size="lg">
              <Wand2 className="w-4 h-4 mr-2" />
              Fix {failedAssets.length} Issue{failedAssets.length > 1 ? 's' : ''}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}

          <ActivityLog logs={logs} onClear={onClearLogs} />
        </div>
      </div>
    </div>
  );
}
