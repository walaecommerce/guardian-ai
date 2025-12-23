import { useCallback, useState } from 'react';
import { Upload, Link, X, Image as ImageIcon, Loader2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ImageAsset, AssetType } from '@/types';

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
}: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);

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

  const toggleAssetType = (id: string) => {
    const updated = assets.map(a => {
      if (a.id === id) {
        return { ...a, type: (a.type === 'MAIN' ? 'SECONDARY' : 'MAIN') as AssetType };
      }
      // If setting to MAIN, demote others
      if (a.type === 'MAIN' && assets.find(x => x.id === id)?.type === 'SECONDARY') {
        return { ...a, type: 'SECONDARY' as AssetType };
      }
      return a;
    });
    onAssetsChange(updated);
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

      {/* Image Grid Preview */}
      {assets.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Uploaded Assets ({assets.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {assets.map((asset) => {
                // Extract category from asset name (format: CATEGORY_filename)
                const categoryMatch = asset.name.match(/^(MAIN|INFOGRAPHIC|LIFESTYLE|PRODUCT_IN_USE|SIZE_CHART|COMPARISON|PACKAGING|DETAIL|UNKNOWN)_/);
                const imageCategory = categoryMatch ? categoryMatch[1] : null;
                
                const getCategoryColor = (category: string | null) => {
                  switch (category) {
                    case 'MAIN': return 'bg-primary text-primary-foreground';
                    case 'INFOGRAPHIC': return 'bg-blue-500 text-white';
                    case 'LIFESTYLE': return 'bg-green-500 text-white';
                    case 'PRODUCT_IN_USE': return 'bg-purple-500 text-white';
                    case 'SIZE_CHART': return 'bg-orange-500 text-white';
                    case 'COMPARISON': return 'bg-yellow-500 text-black';
                    case 'PACKAGING': return 'bg-pink-500 text-white';
                    case 'DETAIL': return 'bg-cyan-500 text-white';
                    default: return 'bg-muted text-muted-foreground';
                  }
                };

                const formatCategory = (category: string | null) => {
                  if (!category) return null;
                  return category.replace(/_/g, ' ').split(' ').map(w => 
                    w.charAt(0) + w.slice(1).toLowerCase()
                  ).join(' ');
                };

                return (
                  <div
                    key={asset.id}
                    className="relative group aspect-square rounded-lg overflow-hidden border border-border bg-muted"
                  >
                    <img
                      src={asset.preview}
                      alt={asset.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    
                    {/* Type Badge (MAIN/SECONDARY) */}
                    <Badge
                      variant={asset.type === 'MAIN' ? 'default' : 'secondary'}
                      className="absolute top-2 left-2 cursor-pointer text-xs"
                      onClick={() => toggleAssetType(asset.id)}
                    >
                      {asset.type}
                    </Badge>

                    {/* AI Category Badge */}
                    {imageCategory && (
                      <div className={`absolute top-2 right-8 px-1.5 py-0.5 rounded text-[10px] font-medium ${getCategoryColor(imageCategory)}`}>
                        {formatCategory(imageCategory)}
                      </div>
                    )}

                    {/* Remove Button */}
                    <button
                      onClick={() => removeAsset(asset.id)}
                      className="absolute top-2 right-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>

                    {/* Analysis Status */}
                    {asset.isAnalyzing && (
                      <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      </div>
                    )}

                    {/* Score Badge */}
                    {asset.analysisResult && (
                      <div className={`
                        absolute bottom-2 left-2 px-2 py-1 rounded text-xs font-bold
                        ${asset.analysisResult.overallScore >= 85 
                          ? 'bg-success text-success-foreground'
                          : asset.analysisResult.overallScore >= 70
                          ? 'bg-warning text-warning-foreground'
                          : 'bg-destructive text-destructive-foreground'
                        }
                      `}>
                        {asset.analysisResult.overallScore}%
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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
    </div>
  );
}
