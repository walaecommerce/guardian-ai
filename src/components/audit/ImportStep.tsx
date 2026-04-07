import { ImageUploader, MaxImagesOption } from '@/components/ImageUploader';
import { BulkUrlImport } from '@/components/BulkUrlImport';
import { ImageAsset, FailedDownload } from '@/types';
import { Upload, Link, Sparkles } from 'lucide-react';

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
}

export function ImportStep({
  assets, listingTitle, amazonUrl, isImporting,
  onAssetsChange, onListingTitleChange, onAmazonUrlChange,
  onImportFromAmazon, onRunAudit, isAnalyzing, analyzingProgress,
  auditComplete, failedDownloads, isRetrying, onRetryFailedDownloads,
  titlePulse, assetGridRef, selectedCategory, onCategoryChange,
  bulkProgress, onBulkImport,
}: ImportStepProps) {
  return (
    <div className="space-y-6">
      {/* Hero prompt when empty */}
      {assets.length === 0 && (
        <div className="text-center py-12 space-y-4">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Start Your Compliance Audit</h2>
            <p className="text-muted-foreground mt-1 max-w-md mx-auto">
              Paste an Amazon product URL or upload images to begin. Our AI will classify, audit, and fix your listing images.
            </p>
          </div>
        </div>
      )}

      {/* Main uploader */}
      <div className="max-w-3xl mx-auto">
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
      </div>

      {/* Bulk import - collapsible for power users */}
      <div className="max-w-3xl mx-auto">
        <BulkUrlImport
          isImporting={isImporting}
          onBulkImport={onBulkImport}
          bulkProgress={bulkProgress}
        />
      </div>
    </div>
  );
}
