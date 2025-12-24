import { ImageAsset } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LayoutGrid, Star } from 'lucide-react';

interface AmazonGalleryPreviewProps {
  assets: ImageAsset[];
}

export function AmazonGalleryPreview({ assets }: AmazonGalleryPreviewProps) {
  if (assets.length === 0) return null;

  // Amazon shows up to 7 images in the gallery (1 main + 6 thumbnails)
  const mainImage = assets[0];
  const thumbnails = assets.slice(1, 7);
  const remainingCount = Math.max(0, assets.length - 7);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-primary" />
          Amazon Gallery Preview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3">
          {/* Main Image (Large) */}
          <div className="relative flex-shrink-0">
            <div className="w-32 h-32 rounded-lg overflow-hidden border-2 border-amber-400 bg-white">
              <img
                src={mainImage.preview}
                alt="Main product image"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="absolute -top-1 -left-1 w-5 h-5 bg-amber-400 rounded-br-lg flex items-center justify-center shadow-md">
              <Star className="w-3 h-3 text-amber-900 fill-amber-900" />
            </div>
            <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-400 text-amber-900">
              MAIN
            </div>
          </div>

          {/* Thumbnails Column */}
          <div className="flex flex-col gap-1.5 flex-1">
            <div className="text-[10px] text-muted-foreground font-medium mb-0.5">
              Gallery Thumbnails
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {thumbnails.map((asset, idx) => (
                <div
                  key={asset.id}
                  className="relative aspect-square rounded border border-border bg-white overflow-hidden group"
                >
                  <img
                    src={asset.preview}
                    alt={`Gallery image ${idx + 2}`}
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] text-center py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {idx + 2}
                  </div>
                </div>
              ))}
              
              {/* Empty slots */}
              {Array.from({ length: Math.max(0, 6 - thumbnails.length) }).map((_, idx) => (
                <div
                  key={`empty-${idx}`}
                  className="aspect-square rounded border border-dashed border-muted-foreground/30 bg-muted/30 flex items-center justify-center"
                >
                  <span className="text-[9px] text-muted-foreground">{thumbnails.length + idx + 2}</span>
                </div>
              ))}
            </div>
            
            {/* Extra images indicator */}
            {remainingCount > 0 && (
              <div className="text-[10px] text-muted-foreground mt-1">
                +{remainingCount} more image{remainingCount > 1 ? 's' : ''} (shown on hover in Amazon listing)
              </div>
            )}
          </div>
        </div>

        {/* Position guide */}
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-[10px] text-muted-foreground">
            <span className="font-medium">Tip:</span> Amazon shows the main image prominently. Thumbnails 2-7 appear on the left. Drag images above to reorder.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
