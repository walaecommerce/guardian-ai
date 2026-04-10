import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Loader2, Play, Wand2, Save, Sparkles, Zap } from 'lucide-react';
import { AuditStepper } from '@/components/audit/AuditStepper';
import { AuditStep } from '@/hooks/useAuditSession';
import { cn } from '@/lib/utils';

interface CommandBarProps {
  onRunAudit: () => void;
  isAnalyzing: boolean;
  analyzingProgress?: { current: number; total: number };
  onBatchFix: () => void;
  isBatchFixing: boolean;
  batchFixProgress: { current: number; total: number } | null;
  onBatchEnhance: () => void;
  isBatchEnhancing: boolean;
  batchEnhanceProgress: { current: number; total: number } | null;
  enhanceableCount: number;
  onFixAndEnhance: () => void;
  onSaveReport: () => void;
  assetCount: number;
  analyzedCount: number;
  failedCount: number;
  fixedCount: number;
  currentStep: AuditStep;
  onStepChange: (step: AuditStep) => void;
  completedSteps: Set<AuditStep>;
}

export function CommandBar({
  onRunAudit, isAnalyzing, analyzingProgress,
  onBatchFix, isBatchFixing, batchFixProgress,
  onBatchEnhance, isBatchEnhancing, batchEnhanceProgress, enhanceableCount,
  onFixAndEnhance,
  onSaveReport,
  assetCount, analyzedCount, failedCount, fixedCount,
  currentStep, onStepChange, completedSteps,
}: CommandBarProps) {
  const hasAssets = assetCount > 0;
  const hasResults = analyzedCount > 0;
  const unfixedFailures = failedCount - fixedCount;
  const isBusy = isAnalyzing || isBatchFixing || isBatchEnhancing;

  // Contextual primary actions based on current step
  const primaryActions = useMemo(() => {
    const actions: React.ReactNode[] = [];

    if (currentStep === 'import' && hasAssets && !hasResults) {
      actions.push(
        <Button key="audit" size="sm" onClick={onRunAudit} disabled={isBusy} className="h-8 text-xs">
          {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
          {isAnalyzing ? 'Auditing…' : analyzedCount > 0 ? 'Re-run Audit' : 'Run Audit'}
        </Button>
      );
    }

    if ((currentStep === 'audit' || currentStep === 'fix') && hasResults) {
      // Show combo button when both fix + enhance are available
      if (unfixedFailures > 0 && enhanceableCount > 0) {
        actions.push(
          <Button key="combo" size="sm" onClick={onFixAndEnhance} disabled={isBusy} className="h-8 text-xs">
            {(isBatchFixing || isBatchEnhancing) ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Zap className="w-3.5 h-3.5 mr-1.5" />}
            Fix & Enhance All
          </Button>
        );
      }

      if (unfixedFailures > 0) {
        actions.push(
          <Button key="fix" size="sm" variant="destructive" onClick={onBatchFix} disabled={isBusy} className="h-8 text-xs">
            {isBatchFixing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Wand2 className="w-3.5 h-3.5 mr-1.5" />}
            Fix All ({unfixedFailures})
          </Button>
        );
      }

      if (enhanceableCount > 0) {
        actions.push(
          <Button key="enhance" size="sm" variant="outline" onClick={onBatchEnhance} disabled={isBusy} className="h-8 text-xs">
            {isBatchEnhancing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
            Enhance All ({enhanceableCount})
          </Button>
        );
      }
    }

    if (currentStep === 'review' && hasResults) {
      actions.push(
        <Button key="save" size="sm" variant="outline" onClick={onSaveReport} className="h-8 text-xs">
          <Save className="w-3.5 h-3.5 mr-1.5" />
          Save Report
        </Button>
      );
    }

    return actions;
  }, [currentStep, hasAssets, hasResults, unfixedFailures, enhanceableCount, isBusy, isAnalyzing, isBatchFixing, isBatchEnhancing, onRunAudit, onBatchFix, onBatchEnhance, onFixAndEnhance, onSaveReport]);

  // Active progress bar
  const activeProgress = isAnalyzing && analyzingProgress
    ? { label: `Auditing ${analyzingProgress.current}/${analyzingProgress.total}`, value: (analyzingProgress.current / analyzingProgress.total) * 100 }
    : isBatchFixing && batchFixProgress
    ? { label: `Fixing ${batchFixProgress.current}/${batchFixProgress.total}`, value: (batchFixProgress.current / batchFixProgress.total) * 100 }
    : isBatchEnhancing && batchEnhanceProgress
    ? { label: `Enhancing ${batchEnhanceProgress.current}/${batchEnhanceProgress.total}`, value: (batchEnhanceProgress.current / batchEnhanceProgress.total) * 100 }
    : null;

  return (
    <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-xl border-b border-border">
      <div className="px-4 py-2 flex items-center gap-3">
        {/* Stepper — takes available space */}
        <div className="flex-1 min-w-0">
          <AuditStepper
            currentStep={currentStep}
            onStepChange={onStepChange}
            completedSteps={completedSteps}
            hasAssets={hasAssets}
            hasResults={hasResults}
            hasFailures={failedCount > 0}
          />
        </div>

        {/* Status counters — desktop only */}
        {hasAssets && (
          <div className="hidden lg:flex items-center gap-1.5 shrink-0">
            <Badge variant="secondary" className="font-mono text-[10px] h-5 px-1.5">{assetCount} imgs</Badge>
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

        {/* Contextual primary actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {primaryActions}
        </div>
      </div>

      {/* Progress bar */}
      {activeProgress && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            {activeProgress.label}
          </div>
          <Progress value={activeProgress.value} className="h-1" />
        </div>
      )}
    </div>
  );
}
