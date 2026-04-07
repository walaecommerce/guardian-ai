import { BatchComparisonView } from '@/components/BatchComparisonView';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ImageAsset } from '@/types';
import { Wand2, Loader2, ArrowRight, CheckCircle } from 'lucide-react';

interface FixStepProps {
  assets: ImageAsset[];
  onViewDetails: (asset: ImageAsset) => void;
  onDownload: (url: string, filename: string) => void;
  onBatchFix: () => void;
  isBatchFixing: boolean;
  batchFixProgress: { current: number; total: number } | null;
  onGoToReview: () => void;
}

export function FixStep({
  assets, onViewDetails, onDownload,
  onBatchFix, isBatchFixing, batchFixProgress, onGoToReview,
}: FixStepProps) {
  const failedAssets = assets.filter(a => 
    (a.analysisResult?.status === 'FAIL' || a.analysisResult?.status === 'WARNING') && !a.fixedImage
  );
  const fixedAssets = assets.filter(a => a.fixedImage);
  const allFixed = failedAssets.length === 0 && fixedAssets.length > 0;

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
              disabled={isBatchFixing}
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

      {/* Before/After grid */}
      <BatchComparisonView
        assets={assets}
        onViewDetails={onViewDetails}
        onDownload={onDownload}
      />
    </div>
  );
}
