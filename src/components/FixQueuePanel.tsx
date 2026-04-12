import { cn } from '@/lib/utils';
import { ImageAsset } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, Clock, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { formatContentType } from '@/utils/sessionResume';
import { Skeleton } from '@/components/ui/skeleton';

interface FixQueuePanelProps {
  /** All assets in the fix queue, in processing order */
  queue: ImageAsset[];
  /** Currently active image id */
  activeAssetId?: string;
  /** Progress counts */
  progress?: { current: number; total: number } | null;
}

const STATUS_CONFIG = {
  processing: { label: 'Processing', icon: Loader2, className: 'border-primary bg-primary/10 ring-2 ring-primary/30', iconClass: 'animate-spin text-primary', badgeVariant: 'default' as const },
  fixed: { label: 'Fixed', icon: CheckCircle, className: 'border-success/50 bg-success/5', iconClass: 'text-success', badgeVariant: 'default' as const },
  failed: { label: 'Needs Review', icon: XCircle, className: 'border-destructive/50 bg-destructive/5', iconClass: 'text-destructive', badgeVariant: 'destructive' as const },
  skipped: { label: 'Skipped', icon: AlertCircle, className: 'border-yellow-500/50 bg-yellow-500/5', iconClass: 'text-yellow-500', badgeVariant: 'secondary' as const },
  pending: { label: 'Pending', icon: Clock, className: 'border-muted-foreground/20 bg-muted/30 opacity-60', iconClass: 'text-muted-foreground', badgeVariant: 'secondary' as const },
};

export function FixQueuePanel({ queue, activeAssetId, progress }: FixQueuePanelProps) {
  if (queue.length === 0) return null;

  const fixedCount = queue.filter(a => a.batchFixStatus === 'fixed').length;
  const failedCount = queue.filter(a => a.batchFixStatus === 'failed').length;
  const pendingCount = queue.filter(a => a.batchFixStatus === 'pending').length;
  const processingAsset = queue.find(a => a.batchFixStatus === 'processing');

  return (
    <div className="space-y-3 p-4 rounded-lg border bg-card">
      {/* Header with counts */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Fix Queue</span>
          {progress && (
            <span className="text-xs text-muted-foreground">
              {progress.current} of {progress.total}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {fixedCount > 0 && (
            <Badge variant="default" className="text-[10px] h-5 bg-success hover:bg-success">
              {fixedCount} Fixed
            </Badge>
          )}
          {failedCount > 0 && (
            <Badge variant="destructive" className="text-[10px] h-5">
              {failedCount} Review
            </Badge>
          )}
          {pendingCount > 0 && (
            <Badge variant="secondary" className="text-[10px] h-5">
              {pendingCount} Pending
            </Badge>
          )}
        </div>
      </div>

      {/* Active image detail */}
      {processingAsset && (
        <div className="flex items-center gap-3 p-2 rounded-md bg-primary/5 border border-primary/20">
          <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 border border-primary/30">
            <img src={processingAsset.preview} alt="" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{processingAsset.name}</p>
            <div className="flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin text-primary" />
              <span className="text-[10px] text-primary font-medium">Processing now…</span>
              <Badge variant="outline" className="text-[10px] h-4">
                {formatContentType(processingAsset.analysisResult?.productCategory)}
              </Badge>
              {processingAsset.type === 'MAIN' && (
                <Badge className="text-[10px] h-4 bg-primary/80">Hero</Badge>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Queue strip */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {queue.map((asset, idx) => {
          const status = asset.batchFixStatus || 'pending';
          const config = STATUS_CONFIG[status];
          const StatusIcon = config.icon;
          const isActive = asset.id === activeAssetId;

          return (
            <div
              key={asset.id}
              className={cn(
                'relative flex-shrink-0 w-12 h-12 rounded-md overflow-hidden border-2 transition-all',
                config.className,
                isActive && 'scale-105'
              )}
              title={`${idx + 1}. ${asset.name} — ${config.label}`}
            >
              {status === 'pending' ? (
                <Skeleton className="w-full h-full" />
              ) : (
                <img src={asset.preview} alt="" className="w-full h-full object-cover" />
              )}
              {/* Status overlay */}
              <div className={cn(
                'absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center shadow-sm',
                status === 'fixed' && 'bg-success',
                status === 'failed' && 'bg-destructive',
                status === 'processing' && 'bg-primary',
                status === 'pending' && 'bg-muted',
              )}>
                <StatusIcon className={cn('w-2.5 h-2.5', config.iconClass)} />
              </div>
              {/* Queue number */}
              <div className="absolute bottom-0 left-0 px-1 text-[8px] font-bold bg-background/80 rounded-tr">
                {idx + 1}
              </div>
            </div>
          );
        })}
      </div>

      {/* Explainer text */}
      <p className="text-[10px] text-muted-foreground">
        Images are fixed sequentially. Up to 3 AI attempts per image — the best result is automatically selected.
      </p>
    </div>
  );
}
