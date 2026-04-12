import { ImageAsset } from '@/types';
import { ImportMetadata } from '@/utils/importMetadata';
import { extractImageCategory, type ImageCategory } from '@/utils/imageCategory';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Crown, AlertTriangle, RefreshCw } from 'lucide-react';

const CONTENT_TYPE_LABELS: Record<string, string> = {
  PRODUCT_SHOT: 'Product Shot',
  INFOGRAPHIC: 'Infographic',
  LIFESTYLE: 'Lifestyle',
  PRODUCT_IN_USE: 'In Use',
  SIZE_CHART: 'Size Chart',
  COMPARISON: 'Comparison',
  PACKAGING: 'Packaging',
  DETAIL: 'Detail',
  APLUS: 'A+ Content',
  MAIN: 'Product Shot',
  UNKNOWN: 'Unclassified',
};

function getContentLabel(asset: ImageAsset): string {
  const cat = extractImageCategory(asset);
  return CONTENT_TYPE_LABELS[cat] || cat.replace(/_/g, ' ');
}

interface HeroConfirmationBannerProps {
  assets: ImageAsset[];
  importMetadata: ImportMetadata | null;
  onConfirmHero: (assetId: string) => void;
}

export function HeroConfirmationBanner({
  assets,
  importMetadata,
  onConfirmHero,
}: HeroConfirmationBannerProps) {
  if (!importMetadata) return null;

  // Already confirmed — show compact status with override option
  if (importMetadata.heroConfirmed) {
    const hero = assets.find(a => a.id === importMetadata.confirmedHeroAssetId);
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-primary/20 bg-primary/5 text-sm">
        <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
        <span className="text-muted-foreground flex-1">
          Hero confirmed
          {hero && (
            <> — <span className="font-medium text-foreground">{getContentLabel(hero)}</span></>
          )}
        </span>
        {assets.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {/* toggle override mode handled by parent */}}
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Change
          </Button>
        )}
      </div>
    );
  }

  // Single image — will be auto-confirmed
  if (assets.length <= 1) return null;

  // Needs confirmation
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            Confirm your hero (main) image
          </p>
          <p className="text-xs text-muted-foreground">
            Select which image is the primary listing image. This determines main-image policy checks and product identity extraction.
          </p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {assets.map((asset, i) => {
          const contentLabel = getContentLabel(asset);
          return (
            <button
              key={asset.id}
              onClick={() => onConfirmHero(asset.id)}
              className={`relative shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all hover:scale-105 cursor-pointer ${
                asset.type === 'MAIN'
                  ? 'border-primary ring-1 ring-primary/30'
                  : 'border-border/50 hover:border-primary/40'
              }`}
            >
              <img
                src={asset.preview}
                alt={asset.name}
                className="w-full h-full object-cover"
              />
              {asset.type === 'MAIN' && (
                <div className="absolute top-0.5 left-0.5">
                  <Crown className="w-3.5 h-3.5 text-primary drop-shadow" />
                </div>
              )}
              <div className="absolute bottom-0 inset-x-0 bg-black/70 text-[8px] text-white text-center py-0.5 leading-tight">
                {contentLabel}
              </div>
            </button>
          );
        })}
      </div>

      {/* Quick confirm current MAIN */}
      {assets.some(a => a.type === 'MAIN') && (
        <Button
          size="sm"
          onClick={() => {
            const main = assets.find(a => a.type === 'MAIN');
            if (main) onConfirmHero(main.id);
          }}
          className="w-full"
        >
          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
          Confirm current hero image
        </Button>
      )}
    </div>
  );
}
