import { useCallback, useState } from 'react';
import { Upload, Link, X, Image as ImageIcon, Loader2, Shield, Crop, Star, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImageAsset, AssetType, FailedDownload } from '@/types';
import { ImageCropper } from '@/components/ImageCropper';
import { SortableImageCard } from '@/components/SortableImageCard';
import { AmazonGalleryPreview } from '@/components/AmazonGalleryPreview';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';

export type MaxImagesOption = '20' | '50' | 'all';

interface ImageUploaderProps {
  assets: ImageAsset[];
  listingTitle: string;
  amazonUrl: string;
  isImporting: boolean;
  onAssetsChange: (assets: ImageAsset[]) => void;
  onListingTitleChange: (title: string) => void;
  onAmazonUrlChange: (url: string) => void;
  onImportFromAmazon: (maxImages: MaxImagesOption) => void;
  onRunAudit: () => void;
  isAnalyzing: boolean;
  analyzingProgress?: { current: number; total: number };
  auditComplete?: { passed: number; failed: number } | null;
  failedDownloads?: FailedDownload[];
  isRetrying?: boolean;
  onRetryFailedDownloads?: () => void;
  titlePulse?: boolean;
  assetGridRef?: React.RefObject<HTMLDivElement>;
  selectedCategory?: string;
  onCategoryChange?: (category: string) => void;
}

export function ImageUploader({
  assets,
  listingTitle,
  amazonUrl,
  isImporting,
  onAssetsChange,
  onListingTitleChange,
  onAmazonUrlChange,
  onImportFromAmazon,
  onRunAudit,
  isAnalyzing,
  analyzingProgress,
  auditComplete,
  failedDownloads = [],
  isRetrying = false,
  onRetryFailedDownloads,
  titlePulse = false,
  assetGridRef,
  selectedCategory = 'AUTO',
  onCategoryChange,
}: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [assetToCrop, setAssetToCrop] = useState<ImageAsset | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [maxImages, setMaxImages] = useState<MaxImagesOption>('20');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const generateId = () => Math.random().toString(36).substring(2, 9);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    
    const imageFiles = Array.from(files).filter(file => 
      file.type.startsWith('image/')
    );

    const newAssets: ImageAsset[] = imageFiles.map((file, index) => ({
      id: generateId(),
      file,
      preview: URL.createObjectURL(file),
      type: (assets.length === 0 && index === 0 ? 'MAIN' : 'SECONDARY') as AssetType,
      name: file.name,
    }));

    onAssetsChange([...assets, ...newAssets]);
  }, [assets, onAssetsChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const removeAsset = (id: string) => {
    const updated = assets.filter(a => a.id !== id);
    // Reassign MAIN if needed
    if (updated.length > 0 && !updated.some(a => a.type === 'MAIN')) {
      updated[0].type = 'MAIN';
    }
    onAssetsChange(updated);
  };

  const openCropper = (asset: ImageAsset) => {
    setAssetToCrop(asset);
    setCropperOpen(true);
  };

  const handleCropComplete = (croppedBlob: Blob) => {
    if (!assetToCrop) return;
    
    const croppedFile = new File([croppedBlob], `cropped_${assetToCrop.name}`, { type: 'image/jpeg' });
    const croppedPreview = URL.createObjectURL(croppedBlob);
    
    const updated = assets.map(a => 
      a.id === assetToCrop.id 
        ? { ...a, file: croppedFile, preview: croppedPreview, name: `cropped_${a.name}` }
        : a
    );
    onAssetsChange(updated);
    setAssetToCrop(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      const oldIndex = assets.findIndex((a) => a.id === active.id);
      const newIndex = assets.findIndex((a) => a.id === over.id);

      const reordered = arrayMove(assets, oldIndex, newIndex);
      
      // Update types: first position is always MAIN, others are SECONDARY
      const updatedAssets = reordered.map((asset, idx) => ({
        ...asset,
        type: (idx === 0 ? 'MAIN' : 'SECONDARY') as AssetType,
      }));

      onAssetsChange(updatedAssets);
    }
  };

  const activeAsset = activeId ? assets.find(a => a.id === activeId) : null;

  return (
    <div className="space-y-4">
      {/* Amazon URL Import */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Link className="w-4 h-4 text-primary" />
            Import from Amazon
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Paste Amazon product URL..."
              value={amazonUrl}
              onChange={(e) => onAmazonUrlChange(e.target.value)}
              className="flex-1"
            />
            <Select value={maxImages} onValueChange={(v) => setMaxImages(v as MaxImagesOption)}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20 max</SelectItem>
                <SelectItem value="50">50 max</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <Button 
              onClick={() => onImportFromAmazon(maxImages)}
              disabled={!amazonUrl || isImporting}
            >
              {isImporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Import'
              )}
            </Button>
          </div>
          
          {/* Failed Downloads Alert */}
          {failedDownloads.length > 0 && (
            <Alert variant="destructive" className="mt-3">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>
                  {failedDownloads.length} image{failedDownloads.length > 1 ? 's' : ''} failed to download
                </span>
                {onRetryFailedDownloads && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={onRetryFailedDownloads}
                    disabled={isRetrying}
                    className="ml-2"
                  >
                    {isRetrying ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        Retrying...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Retry Failed
                      </>
                    )}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Drag & Drop Upload */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="w-4 h-4 text-primary" />
            Upload Images
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`
              relative border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer
              ${isDragging 
                ? 'border-primary bg-primary/5' 
                : 'border-border hover:border-primary/50 hover:bg-muted/50'
              }
            `}
          >
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => handleFiles(e.target.files)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <ImageIcon className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drag & drop images or click to browse
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              First image auto-assigned as MAIN
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Amazon Gallery Preview */}
      <AmazonGalleryPreview assets={assets} />

      {/* Image Grid Preview with Drag & Drop */}
      {assets.length > 0 && (
        <Card ref={assetGridRef as React.RefObject<HTMLDivElement>}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Uploaded Assets ({assets.length})</span>
              <span className="text-xs text-muted-foreground font-normal">
                Drag to reorder • First position = Landing image
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={assets.map(a => a.id)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {assets.map((asset, index) => (
                    <SortableImageCard
                      key={asset.id}
                      asset={asset}
                      index={index}
                      onRemove={removeAsset}
                      onCrop={openCropper}
                    />
                  ))}
                </div>
              </SortableContext>
              
              {/* Drag Overlay - follows the cursor */}
              <DragOverlay>
                {activeAsset ? (
                  <div className="w-32">
                    <SortableImageCard
                      asset={activeAsset}
                      index={0}
                      onRemove={() => {}}
                      onCrop={() => {}}
                      isOverlay
                    />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </CardContent>
        </Card>
      )}

      {/* Product Category */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Product Category</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedCategory} onValueChange={v => onCategoryChange?.(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Auto-Detect" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AUTO">🤖 Auto-Detect</SelectItem>
              <SelectItem value="FOOD_BEVERAGE">🍎 Food & Beverage</SelectItem>
              <SelectItem value="SUPPLEMENTS">💊 Health & Supplements</SelectItem>
              <SelectItem value="PET_SUPPLIES">🐾 Pet Supplies</SelectItem>
              <SelectItem value="BEAUTY_PERSONAL_CARE">✨ Beauty & Personal Care</SelectItem>
              <SelectItem value="ELECTRONICS">🔌 Electronics</SelectItem>
              <SelectItem value="GENERAL_MERCHANDISE">📦 General Merchandise</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1.5">
            {selectedCategory === 'AUTO' ? 'AI will detect category from product image' : 'Category-specific rules will be applied'}
          </p>
        </CardContent>
      </Card>

      {/* Listing Title */}
      <Card className={titlePulse ? 'ring-2 ring-green-500 transition-all duration-500' : 'transition-all duration-500'}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Listing Title</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Enter your Amazon listing title for content consistency check..."
            value={listingTitle}
            onChange={(e) => onListingTitleChange(e.target.value)}
            className={`min-h-[80px] ${titlePulse ? 'bg-green-50 dark:bg-green-950/20' : ''} transition-colors duration-500`}
          />
        </CardContent>
      </Card>

      {/* Run Audit Button - Sticky */}
      <div className="sticky bottom-0 z-10 bg-background pt-2 pb-1 -mx-1 px-1">
        {auditComplete ? (
          <div className="w-full h-12 flex items-center justify-center rounded-md bg-muted text-sm font-semibold text-foreground animate-fade-in">
            ✅ Audit Complete — {auditComplete.passed} passed, {auditComplete.failed} failed
          </div>
        ) : (
          <Button
            onClick={onRunAudit}
            disabled={assets.length === 0 || isAnalyzing}
            className="w-full h-12 text-base font-semibold"
            size="lg"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Analyzing {analyzingProgress ? `${analyzingProgress.current} of ${analyzingProgress.total}` : ''}...
              </>
            ) : (
              <>
                <Shield className="w-5 h-5 mr-2" />
                Run Batch Audit
              </>
            )}
          </Button>
        )}
        {isAnalyzing && analyzingProgress && (
          <div className="mt-2 w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500 ease-out rounded-full"
              style={{ width: `${(analyzingProgress.current / analyzingProgress.total) * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* Image Cropper Modal */}
      {assetToCrop && (
        <ImageCropper
          imageSrc={assetToCrop.preview}
          isOpen={cropperOpen}
          onClose={() => { setCropperOpen(false); setAssetToCrop(null); }}
          onCropComplete={handleCropComplete}
          aspectRatio={1}
        />
      )}
    </div>
  );
}
