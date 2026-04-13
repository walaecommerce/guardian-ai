import { ImageAsset } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Eye, Upload, FileWarning, ShieldAlert, Info } from 'lucide-react';
import { formatContentType } from '@/utils/sessionResume';
import { extractImageCategory } from '@/utils/imageCategory';
import { cn } from '@/lib/utils';

interface ManualReviewLaneProps {
  assets: ImageAsset[];
  onViewDetails: (asset: ImageAsset) => void;
}

/** Recommend a next action based on fixability tier and reason */
function getRecommendedAction(asset: ImageAsset): { label: string; description: string; icon: typeof Eye } {
  const tier = asset.fixabilityTier;
  const reason = (asset.batchSkipReason || asset.manualReviewAction || '').toLowerCase();

  if (reason.includes('blur') || reason.includes('resolution') || reason.includes('pixelat') || reason.includes('sharpness')) {
    return { label: 'Re-upload', description: 'Upload a higher-resolution source image', icon: Upload };
  }
  if (reason.includes('structured data') || reason.includes('size chart') || reason.includes('comparison')) {
    return { label: 'Edit externally', description: 'Edit in an image editor to preserve data accuracy', icon: FileWarning };
  }
  if (reason.includes('text/layout') || reason.includes('infographic')) {
    return { label: 'Review carefully', description: 'Verify text and layout before manual editing', icon: ShieldAlert };
  }
  if (asset.fixStopReason) {
    return { label: 'Review details', description: 'Check attempt history and retry stop reason', icon: Eye };
  }
  if (tier === 'warn_only') {
    return { label: 'Export with warning', description: 'Include in report with unresolved warning', icon: Info };
  }
  return { label: 'Review details', description: 'Open image details for manual review', icon: Eye };
}

function getTierBadge(asset: ImageAsset) {
  const tier = asset.fixabilityTier;
  if (tier === 'manual_review') return { label: 'Manual Review', variant: 'destructive' as const };
  if (tier === 'warn_only') return { label: 'Warn Only', variant: 'warning' as const };
  if (asset.fixStopReason) return { label: 'Retry Stopped', variant: 'destructive' as const };
  return { label: 'Skipped', variant: 'secondary' as const };
}

export function ManualReviewLane({ assets, onViewDetails }: ManualReviewLaneProps) {
  if (assets.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-warning" />
        <h4 className="text-sm font-semibold">Manual Review Required ({assets.length})</h4>
      </div>
      <p className="text-xs text-muted-foreground">
        These images were not auto-fixed because AI editing could damage their content. Review each and take the recommended action.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {assets.map(asset => {
          const contentType = extractImageCategory(asset);
          const tierBadge = getTierBadge(asset);
          const action = getRecommendedAction(asset);
          const ActionIcon = action.icon;
          const reason = asset.batchSkipReason || asset.fixStopReason || 'Requires manual review';

          return (
            <Card key={asset.id} className="border-warning/30 bg-warning/5">
              <CardContent className="p-3">
                <div className="flex gap-3">
                  {/* Thumbnail */}
                  <div className="w-16 h-16 rounded-md overflow-hidden flex-shrink-0 border border-border">
                    <img src={asset.preview} alt="" className="w-full h-full object-cover" />
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant={tierBadge.variant} className="text-[10px] h-4">
                        {tierBadge.label}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] h-4">
                        {formatContentType(contentType)}
                      </Badge>
                      {asset.type === 'MAIN' && (
                        <Badge className="text-[10px] h-4 bg-primary/80">Hero</Badge>
                      )}
                      {asset.analysisResult?.status && (
                        <Badge
                          variant={asset.analysisResult.status === 'FAIL' ? 'destructive' : asset.analysisResult.status === 'WARNING' ? 'warning' : 'success'}
                          className="text-[10px] h-4"
                        >
                          {asset.analysisResult.status}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">{reason}</p>
                    {asset.fixStopReason && asset.fixStopReason !== reason && (
                      <p className="text-[10px] text-destructive flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3" />
                        Retry stopped: {asset.fixStopReason}
                      </p>
                    )}
                    <div className="flex items-center gap-2 pt-0.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] px-2"
                        onClick={() => onViewDetails(asset)}
                      >
                        <ActionIcon className="w-3 h-3 mr-1" />
                        {action.label}
                      </Button>
                      <span className="text-[9px] text-muted-foreground">{action.description}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
