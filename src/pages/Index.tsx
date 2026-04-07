import { useMemo } from 'react';
import { useAuditSession, AuditStep } from '@/hooks/useAuditSession';
import { AuditStepper } from '@/components/audit/AuditStepper';
import { ImportStep } from '@/components/audit/ImportStep';
import { AuditStep as AuditStepView } from '@/components/audit/AuditStep';
import { FixStep } from '@/components/audit/FixStep';
import { ReviewStep } from '@/components/audit/ReviewStep';
import { FixModal } from '@/components/FixModal';
import { PolicyBanner } from '@/components/PolicyUpdates';
import { SessionHistory } from '@/components/SessionHistory';
import { AuditHistoryEntry } from '@/components/ComplianceHistory';
import { usePolicyUpdates } from '@/hooks/usePolicyUpdates';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
  const session = useAuditSession();
  const { data: policyData, loading: policyLoading, highImpactUpdates, getMatchingUpdate } = usePolicyUpdates();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const { toast } = useToast();

  // Determine completed steps based on state
  const completedSteps = useMemo(() => {
    const completed = new Set<AuditStep>();
    if (session.assets.length > 0) completed.add('import');
    if (session.assets.some(a => a.analysisResult)) completed.add('audit');
    if (session.assets.some(a => a.fixedImage)) completed.add('fix');
    return completed;
  }, [session.assets]);

  const hasAssets = session.assets.length > 0;
  const hasResults = session.assets.some(a => a.analysisResult);
  const hasFailures = session.assets.some(a => 
    a.analysisResult?.status === 'FAIL' || a.analysisResult?.status === 'WARNING'
  );

  const handleLoadAudit = (entry: AuditHistoryEntry) => {
    session.setListingTitle(entry.listingTitle);
    session.addLog('info', `📂 Loaded audit from ${new Date(entry.date).toLocaleDateString()}: ${entry.listingTitle}`);
    session.setCurrentStep('audit');
    toast({ title: 'Audit Loaded', description: `Loaded "${entry.listingTitle}" from history` });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 container mx-auto px-4 py-4 space-y-4">
        {/* Policy Banner */}
        {!bannerDismissed && highImpactUpdates.length > 0 && (
          <PolicyBanner updates={highImpactUpdates} onDismiss={() => setBannerDismissed(true)} />
        )}

        {/* Stepper Navigation */}
        <div className="border rounded-xl bg-card/50 p-2">
          <AuditStepper
            currentStep={session.currentStep}
            onStepChange={session.setCurrentStep}
            completedSteps={completedSteps}
            hasAssets={hasAssets}
            hasResults={hasResults}
            hasFailures={hasFailures}
          />
        </div>

        {/* Step Content */}
        <div className="min-h-[60vh]">
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
              logs={session.logs}
              onClearLogs={() => session.setLogs([])}
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
        </div>

        {/* Session history - compact at bottom */}
        <SessionHistory currentSessionId={session.currentSessionId || undefined} />
      </main>

      <FixModal
        asset={session.selectedAsset}
        isOpen={session.showFixModal}
        onClose={() => { session.setShowFixModal(false); session.setFixProgress(null); }}
        onRetryFix={(id, prevImage, customPrompt) => session.handleRequestFix(id, prevImage, customPrompt)}
        onDownload={session.handleDownload}
        fixProgress={session.fixProgress || undefined}
      />
    </div>
  );
};

export default Index;
