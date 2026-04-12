import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ImageAsset } from '@/types';
import { ImportMetadata, isAuditGated } from '@/utils/importMetadata';
import { HeroConfirmationBanner } from '@/components/HeroConfirmationBanner';
import { AmazonGalleryPreview } from '@/components/AmazonGalleryPreview';
import {
  Package, ExternalLink, Pencil, Check, X, Trash2, Plus,
  Play, Image as ImageIcon, GripVertical, Loader2, ArrowRight,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CATEGORY_RULES } from '@/config/categoryRules';
import { extractImageCategory } from '@/utils/imageCategory';

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
  analyzingProgress?: { current: number; total: number };
  onAddMoreImages: () => void;
  importMetadata?: ImportMetadata | null;
  onConfirmHero?: (assetId: string) => void;
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
  analyzingProgress,
  onAddMoreImages,
  importMetadata,
  onConfirmHero,
}: ProductSummaryCardProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(listingTitle);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleSaveTitle = () => {
    onListingTitleChange(editTitle);
    setIsEditingTitle(false);
  };

  const handleRemoveImage = (assetId: string) => {
    const updated = assets.filter(a => a.id !== assetId);
    if (updated.length > 0 && !updated.some(a => a.type === 'MAIN')) {
      updated[0] = { ...updated[0], type: 'MAIN' };
    }
    onAssetsChange(updated);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = assets.findIndex(a => a.id === active.id);
    const newIndex = assets.findIndex(a => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...assets];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    // Reassign types based on position
    const updated = reordered.map((a, i) => ({
      ...a,
      type: i === 0 ? 'MAIN' as const : 'SECONDARY' as const,
    }));
    onAssetsChange(updated);
  };

  const secondaryCount = assets.filter(a => a.type !== 'MAIN').length;
  const categoryKeys = Object.keys(CATEGORY_RULES);

  return (
    <Card className="border-primary/20 bg-card/50 backdrop-blur-xl">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Package className="w-5 h-5 text-primary shrink-0" />
              <CardTitle className="text-lg">Product Summary</CardTitle>
              {productAsin && (
                <Badge variant="secondary" className="font-mono text-xs">
                  {productAsin}
                </Badge>
              )}
              {/* Category selector */}
              <Select value={selectedCategory} onValueChange={onCategoryChange}>
                <SelectTrigger className="h-7 w-auto min-w-[120px] text-xs border-border/50">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {categoryKeys.map(key => (
                    <SelectItem key={key} value={key} className="text-xs">
                      {key.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
        {/* Image gallery header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {assets.length} Images
            </p>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">
              MAIN + {secondaryCount} secondary
            </Badge>
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onAddMoreImages}>
            <Plus className="w-3 h-3 mr-1" />
            Add More
          </Button>
        </div>

        {/* Draggable image grid */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={assets.map(a => a.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
              {assets.map((asset, index) => (
                <SortableImageThumbnail
                  key={asset.id}
                  asset={asset}
                  index={index}
                  onRemove={() => handleRemoveImage(asset.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* Amazon Gallery Preview */}
        {assets.length > 0 && (
          <AmazonGalleryPreview assets={assets} />
        )}

        {/* Hero confirmation banner */}
        {onConfirmHero && (
          <HeroConfirmationBanner
            assets={assets}
            importMetadata={importMetadata || null}
            onConfirmHero={onConfirmHero}
          />
        )}

        {/* Import summary */}
        {importMetadata && (
          <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
            <span>{assets.length} images imported</span>
            {importMetadata.resolvedAsin && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                ASIN: {importMetadata.resolvedAsin}
              </Badge>
            )}
            {importMetadata.coverageNotes.map((note, i) => (
              <span key={i} className="text-amber-500">{note}</span>
            ))}
          </div>
        )}

        {/* Start Audit CTA */}
        <Button
          onClick={onRunAudit}
          disabled={isAnalyzing || assets.length === 0 || isAuditGated(assets, importMetadata || null)}
          size="lg"
          className={`w-full h-12 text-base font-bold transition-all ${
            !isAnalyzing && assets.length > 0
              ? 'bg-gradient-to-r from-primary to-accent shadow-[0_0_20px_hsl(187_100%_50%/0.3)] hover:shadow-[0_0_30px_hsl(187_100%_50%/0.4)]'
              : ''
          }`}
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Analyzing {analyzingProgress ? `${analyzingProgress.current}/${analyzingProgress.total}` : '...'}
            </>
          ) : (
            <>
              <Play className="w-5 h-5 mr-2" />
              Start Compliance Audit ({assets.length} images)
              <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

/* ─── Sortable Thumbnail ────────────────────────────────────── */

function SortableImageThumbnail({
  asset,
  index,
  onRemove,
}: {
  asset: ImageAsset;
  index: number;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: asset.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.6 : 1,
  };

  const isMain = index === 0;
  const categoryLabel = asset.analysisResult?.productCategory
    || extractImageCategory(asset);

  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = asset.preview;
  }, [asset.preview]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative aspect-square rounded-xl overflow-hidden border bg-muted/30 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_hsl(187_100%_50%/0.15)] ${
        isMain ? 'border-primary/40 ring-1 ring-primary/20' : 'border-border/50'
      } ${isDragging ? 'ring-2 ring-primary' : ''}`}
    >
      <img
        src={asset.preview}
        alt={asset.name}
        className="w-full h-full object-cover"
      />

      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-1 right-1 p-0.5 rounded bg-black/40 text-white/70 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-3 h-3" />
      </div>

      {/* Position badge */}
      {isMain ? (
        <Badge className="absolute top-1 left-1 text-[9px] px-1.5 py-0 bg-primary/90 text-primary-foreground font-bold">
          1st · Landing
        </Badge>
      ) : (
        <span className="absolute top-1 left-1 text-[9px] px-1 py-0 rounded bg-black/50 text-white/80 font-medium">
          {index + 1}
        </span>
      )}

      {/* Category + dimensions bottom bar */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-3 flex items-end justify-between">
        <span className="text-[9px] font-medium text-white/90 uppercase tracking-wider truncate">
          {categoryLabel}
        </span>
        {dims && (
          <span className="text-[8px] text-white/60 tabular-nums shrink-0">
            {dims.w}×{dims.h}
          </span>
        )}
      </div>

      {/* Hover overlay with actions */}
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="destructive"
                className="h-7 w-7"
                onClick={onRemove}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">Remove image</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
