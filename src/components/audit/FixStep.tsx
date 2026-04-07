import { BatchComparisonView } from '@/components/BatchComparisonView';
import { RecommendationsPanel } from '@/components/recommendations/RecommendationsPanel';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ImageAsset } from '@/types';
import { Wand2, Loader2, ArrowRight, CheckCircle, Sparkles } from 'lucide-react';

interface FixStepProps {
  assets: ImageAsset[];
  onViewDetails: (asset: ImageAsset) => void;
  onDownload: (url: string, filename: string) => void;
  onBatchFix: () => void;
  isBatchFixing: boolean;
  batchFixProgress: { current: number; total: number } | null;
  onGoToReview: () => void;
  listingTitle?: string;
  onApplyFix?: (assetId: string, prompt?: string) => void;
  onBatchEnhance?: () => void;
  isBatchEnhancing?: boolean;
  batchEnhanceProgress?: { current: number; total: number } | null;
}

export function FixStep({
  assets, onViewDetails, onDownload,
  onBatchFix, isBatchFixing, batchFixProgress, onGoToReview,
  listingTitle, onApplyFix,
  onBatchEnhance, isBatchEnhancing = false, batchEnhanceProgress,
}: FixStepProps) {
  const failedAssets = assets.filter(a => 
    (a.analysisResult?.status === 'FAIL' || a.analysisResult?.status === 'WARNING') && !a.fixedImage
  );
  const fixedAssets = assets.filter(a => a.fixedImage);
  const allFixed = failedAssets.length === 0 && fixedAssets.length > 0;
  const enhanceableCount = assets.filter(a => a.analysisResult && (!a.fixedImage || a.fixMethod !== 'enhancement')).length;

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold">
            {allFixed ? 'All Issues Fixed!' : `${failedAssets.length} Image${failedAssets.length !== 1 ? 's' : ''} Need Fixing`}
          </h3>
          <p className="text-sm text-muted-foreground">
            {allFixed 
              ? `${fixedAssets.length} image${fixedAssets.length !== 1 ? 's' : ''} corrected. Review before/after comparisons below.`
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
              {isBatchFixing ? 'Fixing...' : `Fix All (${failedAssets.length})`}
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
              {isBatchEnhancing ? 'Enhancing...' : `Enhance All (${enhanceableCount})`}
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

      {/* Batch fix progress */}
      {isBatchFixing && batchFixProgress && (
        <div className="space-y-2 p-4 rounded-lg border bg-card">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            Fixing {batchFixProgress.current} of {batchFixProgress.total}...
          </div>
          <Progress value={(batchFixProgress.current / batchFixProgress.total) * 100} className="h-2" />
        </div>
      )}

      {/* Batch enhance progress */}
      {isBatchEnhancing && batchEnhanceProgress && (
        <div className="space-y-2 p-4 rounded-lg border bg-card">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="w-4 h-4 animate-pulse text-purple-400" />
            Enhancing {batchEnhanceProgress.current} of {batchEnhanceProgress.total}...
          </div>
          <Progress value={(batchEnhanceProgress.current / batchEnhanceProgress.total) * 100} className="h-2" />
        </div>
      )}

      {/* Before/After grid */}
      <BatchComparisonView
        assets={assets}
        onViewDetails={onViewDetails}
        onDownload={onDownload}
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
