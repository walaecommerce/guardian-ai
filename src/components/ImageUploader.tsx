import { useCallback, useState } from 'react';
import { Upload, Link, X, Image as ImageIcon, Loader2, Shield, Crop, Star, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ImageAsset, AssetType, FailedDownload } from '@/types';
import { ImageCropper } from '@/components/ImageCropper';
import { SortableImageCard } from '@/components/SortableImageCard';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';

interface ImageUploaderProps {
  assets: ImageAsset[];
  listingTitle: string;
  amazonUrl: string;
  isImporting: boolean;
  onAssetsChange: (assets: ImageAsset[]) => void;
  onListingTitleChange: (title: string) => void;
  onAmazonUrlChange: (url: string) => void;
  onImportFromAmazon: () => void;
  onRunAudit: () => void;
  isAnalyzing: boolean;
  failedDownloads?: FailedDownload[];
  isRetrying?: boolean;
  onRetryFailedDownloads?: () => void;
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
  failedDownloads = [],
  isRetrying = false,
  onRetryFailedDownloads,
}: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [assetToCrop, setAssetToCrop] = useState<ImageAsset | null>(null);

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

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
            <Button 
              onClick={onImportFromAmazon}
              disabled={!amazonUrl || isImporting}
              variant="secondary"
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

      {/* Image Grid Preview with Drag & Drop */}
      {assets.length > 0 && (
        <Card>
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
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={assets.map(a => a.id)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-3 gap-3">
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
            </DndContext>
          </CardContent>
        </Card>
      )}

      {/* Listing Title */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Listing Title</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Enter your Amazon listing title for content consistency check..."
            value={listingTitle}
            onChange={(e) => onListingTitleChange(e.target.value)}
            className="min-h-[80px]"
          />
        </CardContent>
      </Card>

      {/* Run Audit Button */}
      <Button
        onClick={onRunAudit}
        disabled={assets.length === 0 || isAnalyzing}
        className="w-full h-12 text-base font-semibold"
        size="lg"
      >
        {isAnalyzing ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Analyzing...
          </>
        ) : (
          <>
            <Shield className="w-5 h-5 mr-2" />
            Run Batch Audit
          </>
        )}
      </Button>

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
