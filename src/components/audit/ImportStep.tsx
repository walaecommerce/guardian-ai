import { ImageUploader, MaxImagesOption } from '@/components/ImageUploader';
import { BulkUrlImport } from '@/components/BulkUrlImport';
import { ImageAsset, FailedDownload } from '@/types';
import { Sparkles } from 'lucide-react';

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
  const hasImages = assets.length > 0;

  return (
    <div className="space-y-6">
      {/* Hero prompt when empty */}
      {!hasImages && (
        <div className="text-center py-16 space-y-4">
          <div className="mx-auto w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Sparkles className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Start Your Compliance Audit</h2>
            <p className="text-muted-foreground mt-2 max-w-lg mx-auto text-base">
              Paste an Amazon product URL in the command bar above, or upload images below. Our AI will classify, audit, and fix your listing images.
            </p>
          </div>
        </div>
      )}

      {/* Full-width uploader — no max-width constraint */}
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

      {/* Bulk import */}
      <BulkUrlImport
        isImporting={isImporting}
        onBulkImport={onBulkImport}
        bulkProgress={bulkProgress}
      />
    </div>
  );
}
