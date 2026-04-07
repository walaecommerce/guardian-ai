import { useMemo, useState } from 'react';
import { useAuditSession, AuditStep } from '@/hooks/useAuditSession';
import { CommandBar } from '@/components/CommandBar';
import { ImportStep } from '@/components/audit/ImportStep';
import { AuditStep as AuditStepView } from '@/components/audit/AuditStep';
import { FixStep } from '@/components/audit/FixStep';
import { ReviewStep } from '@/components/audit/ReviewStep';
import { FixModal } from '@/components/FixModal';
import { ImageDetailDrawer } from '@/components/ImageDetailDrawer';
import { ActivityPanel } from '@/components/ActivityPanel';
import { PolicyBanner } from '@/components/PolicyUpdates';
import { SessionHistory } from '@/components/SessionHistory';
import { AuditHistoryEntry } from '@/components/ComplianceHistory';
import { usePolicyUpdates } from '@/hooks/usePolicyUpdates';
import { useToast } from '@/hooks/use-toast';
import { ImageAsset } from '@/types';

const Index = () => {
  const session = useAuditSession();
  const { highImpactUpdates, getMatchingUpdate } = usePolicyUpdates();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [drawerAsset, setDrawerAsset] = useState<ImageAsset | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { toast } = useToast();

  const completedSteps = useMemo(() => {
    const completed = new Set<AuditStep>();
    if (session.assets.length > 0) completed.add('import');
    if (session.assets.some(a => a.analysisResult)) completed.add('audit');
    if (session.assets.some(a => a.fixedImage)) completed.add('fix');
    return completed;
  }, [session.assets]);

  const analyzedCount = session.assets.filter(a => a.analysisResult).length;
  const failedCount = session.assets.filter(a => 
    a.analysisResult?.status === 'FAIL' || a.analysisResult?.status === 'WARNING'
  ).length;
  const fixedCount = session.assets.filter(a => a.fixedImage).length;

  const handleSelectAsset = (asset: ImageAsset) => {
    setDrawerAsset(asset);
    setDrawerOpen(true);
  };

  const handleLoadAudit = (entry: AuditHistoryEntry) => {
    session.setListingTitle(entry.listingTitle);
    session.addLog('info', `📂 Loaded audit from ${new Date(entry.date).toLocaleDateString()}: ${entry.listingTitle}`);
    session.setCurrentStep('audit');
    toast({ title: 'Audit Loaded', description: `Loaded "${entry.listingTitle}" from history` });
  };

  // Keep drawer asset in sync with updated assets state
  const currentDrawerAsset = drawerAsset 
    ? session.assets.find(a => a.id === drawerAsset.id) || drawerAsset 
    : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Policy Banner */}
      {!bannerDismissed && highImpactUpdates.length > 0 && (
        <PolicyBanner updates={highImpactUpdates} onDismiss={() => setBannerDismissed(true)} />
      )}

      {/* Sticky Command Bar */}
      <CommandBar
        amazonUrl={session.amazonUrl}
        onAmazonUrlChange={session.setAmazonUrl}
        onImportFromAmazon={session.handleImportFromAmazon}
        isImporting={session.isImporting}
        onRunAudit={session.handleRunAudit}
        isAnalyzing={session.isAnalyzing}
        analyzingProgress={session.analyzingProgress}
        onBatchFix={session.handleBatchFix}
        isBatchFixing={session.isBatchFixing}
        batchFixProgress={session.batchFixProgress}
        onSaveReport={session.handleSaveReport}
        assetCount={session.assets.length}
        analyzedCount={analyzedCount}
        failedCount={failedCount}
        fixedCount={fixedCount}
        currentStep={session.currentStep}
        onStepChange={session.setCurrentStep}
        completedSteps={completedSteps}
      />

      {/* Full-width workspace */}
      <main className="flex-1 px-6 py-5 pb-16">
        {session.currentStep === 'import' && (
          <ImportStep
            assets={session.assets}
            listingTitle={session.listingTitle}
            amazonUrl={session.amazonUrl}
            isImporting={session.isImporting}
            onAssetsChange={session.setAssets}
            onListingTitleChange={session.setListingTitle}
            onAmazonUrlChange={session.setAmazonUrl}
            onImportFromAmazon={session.handleImportFromAmazon}
            onRunAudit={session.handleRunAudit}
            isAnalyzing={session.isAnalyzing}
            analyzingProgress={session.analyzingProgress}
            auditComplete={session.auditComplete}
            failedDownloads={session.failedDownloads}
            isRetrying={session.isRetrying}
            onRetryFailedDownloads={session.handleRetryFailedDownloads}
            titlePulse={session.titlePulse}
            assetGridRef={session.assetGridRef}
            selectedCategory={session.selectedCategory}
            onCategoryChange={session.setSelectedCategory}
            bulkProgress={session.bulkProgress}
            onBulkImport={session.handleBulkImport}
          />
        )}

        {session.currentStep === 'audit' && (
          <AuditStepView
            assets={session.assets}
            listingTitle={session.listingTitle}
            isAnalyzing={session.isAnalyzing}
            onRequestFix={(id) => session.handleRequestFix(id)}
            onViewDetails={session.handleViewDetails}
            onReverify={session.handleReverify}
            onBatchFix={session.handleBatchFix}
            isBatchFixing={session.isBatchFixing}
            batchFixProgress={session.batchFixProgress}
            productAsin={session.productAsin || undefined}
            competitorData={session.competitorData}
            getMatchingPolicyUpdate={getMatchingUpdate}
            onGoToFix={() => session.setCurrentStep('fix')}
            onRunAudit={session.handleRunAudit}
            onSelectAsset={handleSelectAsset}
          />
        )}

        {session.currentStep === 'fix' && (
          <FixStep
            assets={session.assets}
            onViewDetails={session.handleViewDetails}
            onDownload={session.handleDownload}
            onBatchFix={session.handleBatchFix}
            isBatchFixing={session.isBatchFixing}
            batchFixProgress={session.batchFixProgress}
            onGoToReview={() => session.setCurrentStep('review')}
          />
        )}

        {session.currentStep === 'review' && (
          <ReviewStep
            assets={session.assets}
            listingTitle={session.listingTitle}
            productAsin={session.productAsin}
            productIdentity={session.productIdentity}
            styleConsistency={session.styleConsistency}
            isAnalyzingStyle={session.isAnalyzingStyle}
            competitorData={session.competitorData}
            aiComparison={session.aiComparison}
            isLoadingAIComparison={session.isLoadingAIComparison}
            isImportingCompetitor={session.isImportingCompetitor}
            competitorProgress={session.competitorProgress}
            isAnalyzing={session.isAnalyzing}
            onSaveReport={session.handleSaveReport}
            onApplyFix={(assetId, prompt) => session.handleRequestFix(assetId, undefined, prompt)}
            onImportCompetitor={session.handleImportCompetitor}
            onLoadAudit={handleLoadAudit}
          />
        )}

        {/* Session history at bottom */}
        <div className="mt-6">
          <SessionHistory currentSessionId={session.currentSessionId || undefined} />
        </div>
      </main>

      {/* Right slide-in drawer for image details */}
      <ImageDetailDrawer
        asset={currentDrawerAsset}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onRequestFix={(id) => session.handleRequestFix(id)}
        onReverify={session.handleReverify}
        onDownload={session.handleDownload}
        onViewFullDetails={(asset) => {
          session.setSelectedAsset(asset);
          session.setShowFixModal(true);
        }}
      />

      {/* Full details modal */}
      <FixModal
        asset={session.selectedAsset}
        isOpen={session.showFixModal}
        onClose={() => { session.setShowFixModal(false); session.setFixProgress(null); }}
        onRetryFix={(id, prevImage, customPrompt) => session.handleRequestFix(id, prevImage, customPrompt)}
        onDownload={session.handleDownload}
        fixProgress={session.fixProgress || undefined}
      />

      {/* Bottom activity panel */}
      <ActivityPanel logs={session.logs} onClear={() => session.setLogs([])} />
    </div>
  );
};

export default Index;
