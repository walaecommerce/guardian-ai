import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ImageAsset } from '@/types';
import { 
  Package, ExternalLink, Pencil, Check, X, Trash2, Plus, 
  Play, Image as ImageIcon 
} from 'lucide-react';

interface ProductSummaryCardProps {
  assets: ImageAsset[];
  listingTitle: string;
  amazonUrl: string;
  productAsin: string | null;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  onListingTitleChange: (title: string) => void;
  onAssetsChange: (assets: ImageAsset[]) => void;
  onRunAudit: () => void;
  isAnalyzing: boolean;
  onAddMoreImages: () => void;
}

export function ProductSummaryCard({
  assets,
  listingTitle,
  amazonUrl,
  productAsin,
  selectedCategory,
  onCategoryChange,
  onListingTitleChange,
  onAssetsChange,
  onRunAudit,
  isAnalyzing,
  onAddMoreImages,
}: ProductSummaryCardProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(listingTitle);

  const handleSaveTitle = () => {
    onListingTitleChange(editTitle);
    setIsEditingTitle(false);
  };

  const handleRemoveImage = (assetId: string) => {
    const updated = assets.filter(a => a.id !== assetId);
    // Reassign MAIN if we removed the main image
    if (updated.length > 0 && !updated.some(a => a.type === 'MAIN')) {
      updated[0] = { ...updated[0], type: 'MAIN' };
    }
    onAssetsChange(updated);
  };

  const handleSetAsMain = (assetId: string) => {
    const updated = assets.map(a => ({
      ...a,
      type: a.id === assetId ? 'MAIN' as const : 'SECONDARY' as const,
    }));
    onAssetsChange(updated);
  };

  // Group: first MAIN, then rest
  const mainAsset = assets.find(a => a.type === 'MAIN');
  const secondaryAssets = assets.filter(a => a.type !== 'MAIN');

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-5 h-5 text-primary shrink-0" />
              <CardTitle className="text-lg">Product Summary</CardTitle>
              {productAsin && (
                <Badge variant="secondary" className="font-mono text-xs">
                  {productAsin}
                </Badge>
              )}
            </div>

            {/* Editable title */}
            {isEditingTitle ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="text-sm h-8"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSaveTitle()}
                />
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={handleSaveTitle}>
                  <Check className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setIsEditingTitle(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <button
                onClick={() => { setEditTitle(listingTitle); setIsEditingTitle(true); }}
                className="text-sm text-foreground hover:text-primary flex items-center gap-1.5 text-left group"
              >
                <span className="line-clamp-2">{listingTitle || 'Untitled Product'}</span>
                <Pencil className="w-3 h-3 text-muted-foreground group-hover:text-primary shrink-0" />
              </button>
            )}

            {amazonUrl && (
              <a
                href={amazonUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
              >
                View on Amazon <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Image gallery grid */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {assets.length} Images Imported
            </p>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onAddMoreImages}>
              <Plus className="w-3 h-3 mr-1" />
              Add More
            </Button>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {/* Main image first */}
            {mainAsset && (
              <ImageThumbnail
                asset={mainAsset}
                isMain
                onRemove={() => handleRemoveImage(mainAsset.id)}
                onSetMain={() => {}}
              />
            )}
            {secondaryAssets.map(asset => (
              <ImageThumbnail
                key={asset.id}
                asset={asset}
                isMain={false}
                onRemove={() => handleRemoveImage(asset.id)}
                onSetMain={() => handleSetAsMain(asset.id)}
              />
            ))}
          </div>
        </div>

        {/* Start Audit CTA */}
        <Button
          onClick={onRunAudit}
          disabled={isAnalyzing || assets.length === 0}
          size="lg"
          className="w-full"
        >
          <Play className="w-4 h-4 mr-2" />
          Start Compliance Audit ({assets.length} images)
        </Button>
      </CardContent>
    </Card>
  );
}

function ImageThumbnail({
  asset,
  isMain,
  onRemove,
  onSetMain,
}: {
  asset: ImageAsset;
  isMain: boolean;
  onRemove: () => void;
  onSetMain: () => void;
}) {
  const categoryLabel = asset.name.split('_')[0] || 'UNKNOWN';

  return (
    <div className="group relative aspect-square rounded-lg overflow-hidden border border-border/50 bg-muted/30">
      <img
        src={asset.preview}
        alt={asset.name}
        className="w-full h-full object-cover"
      />

      {/* Main badge */}
      {isMain && (
        <Badge className="absolute top-1 left-1 text-[9px] px-1 py-0 bg-primary/90 text-primary-foreground">
          MAIN
        </Badge>
      )}

      {/* Category label */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-3">
        <span className="text-[9px] font-medium text-white/90 uppercase tracking-wider">
          {categoryLabel}
        </span>
      </div>

      {/* Hover actions */}
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
        {!isMain && (
          <Button
            size="icon"
            variant="secondary"
            className="h-6 w-6"
            onClick={onSetMain}
            title="Set as Main"
          >
            <ImageIcon className="w-3 h-3" />
          </Button>
        )}
        <Button
          size="icon"
          variant="destructive"
          className="h-6 w-6"
          onClick={onRemove}
          title="Remove"
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}
