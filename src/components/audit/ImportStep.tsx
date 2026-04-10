import { useState, useRef } from 'react';
import { ImageUploader, MaxImagesOption } from '@/components/ImageUploader';
import { BulkUrlImport } from '@/components/BulkUrlImport';
import { ProductSummaryCard } from '@/components/ProductSummaryCard';
import { ImageAsset, FailedDownload } from '@/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Link2, Upload, Loader2, Import, ArrowRight } from 'lucide-react';

interface ImportStepProps {
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
  failedDownloads: FailedDownload[];
  isRetrying: boolean;
  onRetryFailedDownloads: () => void;
  titlePulse: boolean;
  assetGridRef: React.RefObject<HTMLDivElement>;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  bulkProgress: { current: number; total: number } | null;
  onBulkImport: (urls: string[]) => void;
  productAsin: string | null;
  importError: string | null;
}

export function ImportStep({
  assets, listingTitle, amazonUrl, isImporting,
  onAssetsChange, onListingTitleChange, onAmazonUrlChange,
  onImportFromAmazon, onRunAudit, isAnalyzing, analyzingProgress,
  auditComplete, failedDownloads, isRetrying, onRetryFailedDownloads,
  titlePulse, assetGridRef, selectedCategory, onCategoryChange,
  bulkProgress, onBulkImport, productAsin, importError,
}: ImportStepProps) {
  const hasImages = assets.length > 0;
  const [maxImages, setMaxImages] = useState<MaxImagesOption>('20');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Phase A: No images yet — show prominent URL input
  if (!hasImages) {
    return (
      <div className="space-y-6">
        {/* Hero section */}
        <div className="text-center py-12 sm:py-16 space-y-4">
          <div className="mx-auto w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Sparkles className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Check Your Listing Images</h2>
            <p className="text-muted-foreground mt-2 max-w-lg mx-auto text-base">
              Paste an Amazon URL to import all listing images, then run an AI compliance audit. You'll get results in under a minute.
            </p>
          </div>
        </div>

        {/* URL Import Card */}
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="rounded-2xl border border-border/50 bg-card p-6 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Link2 className="w-4 h-4 text-primary" />
              Paste your Amazon product URL
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="https://www.amazon.com/dp/B0XXXXXXXX"
                value={amazonUrl}
                onChange={e => onAmazonUrlChange(e.target.value)}
                disabled={isImporting}
                className="flex-1 h-12 text-base"
              />
              <Select value={maxImages} onValueChange={(v) => setMaxImages(v as MaxImagesOption)}>
                <SelectTrigger className="w-20 h-12 text-xs shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">20 max</SelectItem>
                  <SelectItem value="50">50 max</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => onImportFromAmazon(maxImages)}
              disabled={!amazonUrl.trim() || isImporting}
              size="lg"
              className="w-full"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing product images...
                </>
              ) : (
                <>
                  <Import className="w-4 h-4 mr-2" />
                  Import from Amazon
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
            {importError && (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                <span className="text-sm text-destructive flex-1">{importError}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onImportFromAmazon(maxImages)}
                  disabled={isImporting}
                >
                  Retry Import
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground text-center">
              Supports all Amazon marketplaces (.com, .co.uk, .de, .ca, etc.)
            </p>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Or upload manually</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Manual upload zone */}
          <ImageUploader
            assets={assets}
            listingTitle={listingTitle}
            amazonUrl={amazonUrl}
            isImporting={isImporting}
            onAssetsChange={onAssetsChange}
            onListingTitleChange={onListingTitleChange}
            onAmazonUrlChange={onAmazonUrlChange}
            onImportFromAmazon={onImportFromAmazon}
            onRunAudit={onRunAudit}
            isAnalyzing={isAnalyzing}
            analyzingProgress={analyzingProgress}
            auditComplete={auditComplete}
            failedDownloads={failedDownloads}
            isRetrying={isRetrying}
            onRetryFailedDownloads={onRetryFailedDownloads}
            titlePulse={titlePulse}
            assetGridRef={assetGridRef}
            selectedCategory={selectedCategory}
            onCategoryChange={onCategoryChange}
          />

          {/* Bulk URL import */}
          <BulkUrlImport
            isImporting={isImporting}
            onBulkImport={onBulkImport}
            bulkProgress={bulkProgress}
          />
        </div>
      </div>
    );
  }

  // Phase B: Images imported — show product summary
  return (
    <div className="space-y-6">
      <ProductSummaryCard
        assets={assets}
        listingTitle={listingTitle}
        amazonUrl={amazonUrl}
        productAsin={productAsin}
        selectedCategory={selectedCategory}
        onCategoryChange={onCategoryChange}
        onListingTitleChange={onListingTitleChange}
        onAssetsChange={onAssetsChange}
        onRunAudit={onRunAudit}
        isAnalyzing={isAnalyzing}
        analyzingProgress={analyzingProgress}
        onAddMoreImages={() => fileInputRef.current?.click()}
      />

      {/* Hidden file input for adding more images */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          const newAssets: ImageAsset[] = files.map(file => ({
            id: Math.random().toString(36).substring(2, 9),
            file,
            preview: URL.createObjectURL(file),
            type: 'SECONDARY' as const,
            name: file.name,
          }));
          onAssetsChange([...assets, ...newAssets]);
          e.target.value = '';
        }}
      />

      {/* Retry failed downloads */}
      {failedDownloads.length > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
          <span className="text-sm text-destructive">
            {failedDownloads.length} image(s) failed to download
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={onRetryFailedDownloads}
            disabled={isRetrying}
          >
            {isRetrying ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
