import { useEffect, useMemo, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuditSession, AuditStep } from '@/hooks/useAuditSession';
import { AuditStepper } from '@/components/audit/AuditStepper';
import { ImportStep } from '@/components/audit/ImportStep';
import { AuditStep as AuditStepView } from '@/components/audit/AuditStep';
import { FixStep } from '@/components/audit/FixStep';
import { ReviewStep } from '@/components/audit/ReviewStep';
import { FixModal } from '@/components/FixModal';
import { ImageDetailDrawer } from '@/components/ImageDetailDrawer';
import { AuditHistoryEntry } from '@/components/ComplianceHistory';
import { useToast } from '@/hooks/use-toast';
import { ImageAsset, LogEntry } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Terminal, ChevronDown, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { AICreditsExhaustedBanner } from '@/components/AICreditsExhaustedBanner';

function InlineActivityLog({ logs, onClear }: { logs: LogEntry[]; onClear: () => void }) {
  const [open, setOpen] = useState(false);
  if (logs.length === 0) return null;

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'success': return 'text-success';
      case 'error': return 'text-destructive';
      case 'warning': return 'text-warning';
      case 'processing': return 'text-primary';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="border border-border rounded-lg bg-card mt-6">
        <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Activity Log</span>
            <Badge variant="secondary" className="text-[10px] h-4">{logs.length}</Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); onClear(); }}>
              <Trash2 className="w-3 h-3" />
            </Button>
            <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ScrollArea className="h-48 border-t border-border">
            <div className="p-2 space-y-0.5 font-mono text-xs">
              {logs.map(log => (
                <div key={log.id} className="flex items-start gap-2 px-2 py-0.5 rounded hover:bg-muted/30">
                  <span className="text-muted-foreground/50 shrink-0 w-16">
                    {log.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className={cn('break-all', getLevelColor(log.level))}>
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

const Index = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const session = useAuditSession();
  const [drawerAsset, setDrawerAsset] = useState<ImageAsset | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { toast } = useToast();
  const hydratedRef = useRef(false);

  // Hydrate from session if ?session= param is present
  useEffect(() => {
    const sessionId = searchParams.get('session');
    if (sessionId && !hydratedRef.current) {
      hydratedRef.current = true;
      session.hydrateFromSession(sessionId).then((ok) => {
        if (ok) {
          // Clean up URL param after successful hydration
          setSearchParams({}, { replace: true });
          toast({ title: 'Session Restored', description: 'Continuing where you left off' });
        }
      });
    }
  }, [searchParams]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 'i') {
        e.preventDefault();
        if (session.amazonUrl && !session.isImporting) session.handleImportFromAmazon('20');
      } else if (ctrl && e.key === 'a') {
        e.preventDefault();
        if (session.assets.length > 0 && !session.isAnalyzing) session.handleRunAudit();
      } else if (ctrl && e.key === 'f') {
        e.preventDefault();
        if (!session.isBatchFixing) session.handleBatchFix();
      } else if (e.key === 'Escape') {
        setDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [session, drawerOpen]);

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

  const currentDrawerAsset = drawerAsset
    ? session.assets.find(a => a.id === drawerAsset.id) || drawerAsset
    : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Inline stepper + status */}
      <div className="px-6 pt-5 pb-3 flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <AuditStepper
            currentStep={session.currentStep}
            onStepChange={session.setCurrentStep}
            completedSteps={completedSteps}
            hasAssets={session.assets.length > 0}
            hasResults={analyzedCount > 0}
            hasFailures={failedCount > 0}
          />
        </div>
        {session.assets.length > 0 && (
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant="secondary" className="font-mono text-[10px] h-5 px-1.5">{session.assets.length} imgs</Badge>
            {analyzedCount > 0 && (
              <Badge variant="outline" className="font-mono text-[10px] h-5 px-1.5 text-success border-success/30">
                {analyzedCount - failedCount} pass
              </Badge>
            )}
            {failedCount > 0 && (
              <Badge variant="outline" className="font-mono text-[10px] h-5 px-1.5 text-destructive border-destructive/30">
                {failedCount} fail
              </Badge>
            )}
            {fixedCount > 0 && (
              <Badge variant="outline" className="font-mono text-[10px] h-5 px-1.5 text-primary border-primary/30">
                {fixedCount} fixed
              </Badge>
            )}
          </div>
        )}
      </div>

      <AICreditsExhaustedBanner
        visible={session.aiCreditsExhausted}
        analyzedCount={session.assets.filter(a => a.analysisResult).length}
        totalCount={session.assets.length}
        onResume={session.handleResumeAudit}
      />

      {/* Step content */}
      <main className="flex-1 px-6 pb-6">
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
            productAsin={session.productAsin}
            importError={session.importError}
            importMetadata={session.importMetadata}
            onConfirmHero={session.handleConfirmHero}
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
            getMatchingPolicyUpdate={() => null}
            onGoToFix={() => session.setCurrentStep(failedCount > 0 ? 'fix' : 'review')}
            onGoToImport={() => session.setCurrentStep('import')}
            onRunAudit={session.handleRunAudit}
            onSelectAsset={handleSelectAsset}
            onRetryFailedAnalysis={session.handleRetryFailedAnalysis}
            aiCreditsExhausted={session.aiCreditsExhausted}
            productIdentity={session.productIdentity}
            identityProfile={session.identityProfile}
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
            onGoToAudit={() => session.setCurrentStep('audit')}
            listingTitle={session.listingTitle}
            onApplyFix={(assetId, prompt) => session.handleRequestFix(assetId, undefined, prompt)}
            onBatchEnhance={session.handleBatchEnhance}
            isBatchEnhancing={session.isBatchEnhancing}
            batchEnhanceProgress={session.batchEnhanceProgress}
          />
        )}

        {session.currentStep === 'review' && (
          <ReviewStep
            assets={session.assets}
            listingTitle={session.listingTitle}
            productAsin={session.productAsin}
            competitorData={session.competitorData}
            aiComparison={session.aiComparison}
            isLoadingAIComparison={session.isLoadingAIComparison}
            isImportingCompetitor={session.isImportingCompetitor}
            competitorProgress={session.competitorProgress}
            onSaveReport={session.handleSaveReport}
            onImportCompetitor={session.handleImportCompetitor}
            onLoadAudit={handleLoadAudit}
            onGoToAudit={() => session.setCurrentStep('audit')}
          />
        )}

        {/* Inline activity log */}
        <InlineActivityLog logs={session.logs} onClear={() => session.setLogs([])} />
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
    </div>
  );
};

export default Index;
