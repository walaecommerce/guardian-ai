import { BatchComparisonView } from '@/components/BatchComparisonView';
import { RecommendationsPanel } from '@/components/recommendations/RecommendationsPanel';
import { FixQueuePanel } from '@/components/FixQueuePanel';
import { ManualReviewLane, isManualReviewAsset } from '@/components/ManualReviewLane';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/EmptyState';
import { ImageAsset } from '@/types';
import { Wand2, Loader2, ArrowRight, CheckCircle, Sparkles, Search, AlertTriangle } from 'lucide-react';

interface FixStepProps {
  assets: ImageAsset[];
  onViewDetails: (asset: ImageAsset) => void;
  onDownload: (url: string, filename: string) => void;
  onBatchFix: () => void;
  isBatchFixing: boolean;
  batchFixProgress: { current: number; total: number } | null;
  onGoToReview: () => void;
  onGoToAudit?: () => void;
  listingTitle?: string;
  onApplyFix?: (assetId: string, prompt?: string) => void;
  onBatchEnhance?: () => void;
  isBatchEnhancing?: boolean;
  batchEnhanceProgress?: { current: number; total: number } | null;
}

export function FixStep({
  assets, onViewDetails, onDownload,
  onBatchFix, isBatchFixing, batchFixProgress, onGoToReview, onGoToAudit,
  listingTitle, onApplyFix,
  onBatchEnhance, isBatchEnhancing = false, batchEnhanceProgress,
}: FixStepProps) {
  // Classify manual-review/skipped/failed images using unified check
  const manualReviewAssets = assets.filter(isManualReviewAsset);

  const failedAssets = assets.filter(a => 
    (a.analysisResult?.status === 'FAIL' || a.analysisResult?.status === 'WARNING') && !a.fixedImage
    && !manualReviewAssets.some(m => m.id === a.id)
  );
  const fixedAssets = assets.filter(a => a.fixedImage);
  const analyzedAssets = assets.filter(a => a.analysisResult);
  const allFixed = failedAssets.length === 0 && fixedAssets.length > 0;
  const enhanceableCount = assets.filter(a => a.type !== 'MAIN' && a.analysisResult && (!a.fixedImage || a.fixMethod !== 'enhancement')).length;
  const hasNoResults = analyzedAssets.length === 0;

  // Build fix queue for visualization
  const fixQueueAssets = assets.filter(a => a.batchFixStatus);

  // If no analyzed assets, show helpful empty state
  if (hasNoResults) {
    return (
      <EmptyState
        icon={Search}
        title="No Audit Results Yet"
        description="Run a compliance audit first to identify issues that need fixing."
        actionLabel={onGoToAudit ? "Go to Audit" : undefined}
        onAction={onGoToAudit}
      />
    );
  }

  // If all passed and no fixes needed (but may still have manual review)
  if (failedAssets.length === 0 && fixedAssets.length === 0 && manualReviewAssets.length === 0) {
    return (
      <div className="text-center py-12 space-y-3 border border-dashed border-success/30 rounded-xl bg-success/5">
        <CheckCircle className="w-10 h-10 text-success mx-auto" />
        <p className="text-lg font-semibold">All Images Passed!</p>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          No compliance issues found. Save a report or export your results.
        </p>
        <Button onClick={onGoToReview} size="lg" className="mt-2">
          Save & Export Results
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary counts bar */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        {failedAssets.length > 0 && (
          <Badge variant="destructive" className="text-[11px]">
            <Wand2 className="w-3 h-3 mr-1" />
            {failedAssets.length} Auto-fixable
          </Badge>
        )}
        {fixedAssets.length > 0 && (
          <Badge variant="success" className="text-[11px]">
            <CheckCircle className="w-3 h-3 mr-1" />
            {fixedAssets.length} Fixed
          </Badge>
        )}
        {manualReviewAssets.length > 0 && (
          <Badge variant="warning" className="text-[11px]">
            <AlertTriangle className="w-3 h-3 mr-1" />
            {manualReviewAssets.length} Manual Review
          </Badge>
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold">
            {allFixed ? 'All Issues Fixed!' : `${failedAssets.length} Image${failedAssets.length !== 1 ? 's' : ''} Need Fixing`}
          </h3>
          <p className="text-sm text-muted-foreground">
            {allFixed 
              ? 'All issues corrected. Review the before/after results, then save your report.'
              : 'Click "Fix" on individual images or fix all at once.'
            }
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!allFixed && failedAssets.length > 0 && (
            <Button
              onClick={onBatchFix}
              disabled={isBatchFixing || isBatchEnhancing}
              variant="destructive"
              size="lg"
            >
              {isBatchFixing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4 mr-2" />
              )}
              {isBatchFixing ? `Fixing ${batchFixProgress ? `${batchFixProgress.current}/${batchFixProgress.total}` : '...'}` : `Fix All (${failedAssets.length})`}
            </Button>
          )}

          {onBatchEnhance && enhanceableCount > 0 && (
            <Button
              onClick={onBatchEnhance}
              disabled={isBatchEnhancing || isBatchFixing}
              variant="secondary"
              size="lg"
            >
              {isBatchEnhancing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              {isBatchEnhancing ? `Enhancing ${batchEnhanceProgress ? `${batchEnhanceProgress.current}/${batchEnhanceProgress.total}` : '...'}` : `Enhance All (${enhanceableCount})`}
            </Button>
          )}

          {fixedAssets.length > 0 && (
            <Button onClick={onGoToReview} variant="default" size="lg">
              <CheckCircle className="w-4 h-4 mr-2" />
              Review & Export
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>

      {/* Batch fix queue visualization */}
      {isBatchFixing && fixQueueAssets.length > 0 && (
        <FixQueuePanel
          queue={fixQueueAssets}
          activeAssetId={fixQueueAssets.find(a => a.batchFixStatus === 'processing')?.id}
          progress={batchFixProgress}
        />
      )}

      {/* Batch enhance progress (kept simple) */}
      {isBatchEnhancing && batchEnhanceProgress && (
        <div className="space-y-2 p-4 rounded-lg border bg-card">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="w-4 h-4 animate-pulse text-accent" />
            Enhancing image {batchEnhanceProgress.current} of {batchEnhanceProgress.total}…
          </div>
          <Progress value={(batchEnhanceProgress.current / batchEnhanceProgress.total) * 100} className="h-2" />
        </div>
      )}

      {/* Manual Review Required lane — visually separate from auto-fix */}
      <ManualReviewLane assets={manualReviewAssets} onViewDetails={onViewDetails} />

      {/* Before/After grid */}
      <BatchComparisonView
        assets={assets}
        onViewDetails={onViewDetails}
        onDownload={onDownload}
        isBatchFixing={isBatchFixing}
      />

      {/* Recommendations (moved from Review) */}
      {listingTitle && onApplyFix && (
        <RecommendationsPanel
          assets={assets}
          listingTitle={listingTitle}
          onApplyFix={(assetId, prompt) => onApplyFix(assetId, prompt)}
        />
      )}
    </div>
  );
}
