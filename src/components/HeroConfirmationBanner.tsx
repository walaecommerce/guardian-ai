import { ImageAsset } from '@/types';
import { ImportMetadata } from '@/utils/importMetadata';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Crown, AlertTriangle } from 'lucide-react';

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

  // Already confirmed
  if (importMetadata.heroConfirmed) {
    const hero = assets.find(a => a.id === importMetadata.confirmedHeroAssetId);
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-primary/20 bg-primary/5 text-sm">
        <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
        <span className="text-muted-foreground">
          Hero image confirmed
          {hero && (
            <> — <span className="font-medium text-foreground">{hero.name}</span></>
          )}
        </span>
      </div>
    );
  }

  // Single image — will be auto-confirmed
  if (assets.length <= 1) return null;

  // Needs confirmation
  const currentMain = assets.find(a => a.type === 'MAIN');

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
        {assets.map((asset, i) => (
          <button
            key={asset.id}
            onClick={() => onConfirmHero(asset.id)}
            className={`relative shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all hover:scale-105 ${
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
                <Crown className="w-3 h-3 text-primary" />
              </div>
            )}
            <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[8px] text-white text-center py-0.5">
              {i + 1}
            </span>
          </button>
        ))}
      </div>

      {currentMain && (
        <Button
          size="sm"
          onClick={() => onConfirmHero(currentMain.id)}
          className="w-full"
        >
          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
          Confirm image 1 as hero
        </Button>
      )}
    </div>
  );
}
