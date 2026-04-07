import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Import, Loader2, Play, Wand2, Save, ChevronDown } from 'lucide-react';
import { MaxImagesOption } from '@/components/ImageUploader';
import { AuditStepper } from '@/components/audit/AuditStepper';
import { AuditStep } from '@/hooks/useAuditSession';
import { cn } from '@/lib/utils';

interface CommandBarProps {
  // URL & import
  amazonUrl: string;
  onAmazonUrlChange: (url: string) => void;
  onImportFromAmazon: (maxImages: MaxImagesOption) => void;
  isImporting: boolean;
  // Audit
  onRunAudit: () => void;
  isAnalyzing: boolean;
  analyzingProgress?: { current: number; total: number };
  // Fix
  onBatchFix: () => void;
  isBatchFixing: boolean;
  batchFixProgress: { current: number; total: number } | null;
  // Save
  onSaveReport: () => void;
  // Counts
  assetCount: number;
  analyzedCount: number;
  failedCount: number;
  fixedCount: number;
  // Stepper
  currentStep: AuditStep;
  onStepChange: (step: AuditStep) => void;
  completedSteps: Set<AuditStep>;
}

export function CommandBar({
  amazonUrl, onAmazonUrlChange, onImportFromAmazon, isImporting,
  onRunAudit, isAnalyzing, analyzingProgress,
  onBatchFix, isBatchFixing, batchFixProgress,
  onSaveReport,
  assetCount, analyzedCount, failedCount, fixedCount,
  currentStep, onStepChange, completedSteps,
}: CommandBarProps) {
  const [maxImages, setMaxImages] = useState<MaxImagesOption>('20');

  const hasAssets = assetCount > 0;
  const hasResults = analyzedCount > 0;
  const unfixedFailures = failedCount - fixedCount;

  return (
    <div className="sticky top-12 z-30 bg-background/95 backdrop-blur-xl border-b border-border">
      {/* URL Bar + Actions */}
      <div className="px-4 py-2.5 flex items-center gap-3">
        {/* URL Input */}
        <div className="flex items-center gap-2 flex-1 max-w-xl">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Paste Amazon product URL..."
              value={amazonUrl}
              onChange={e => onAmazonUrlChange(e.target.value)}
              disabled={isImporting}
              className="pl-9 h-9 bg-muted/30 border-muted text-sm"
            />
          </div>
          <Select value={maxImages} onValueChange={(v) => setMaxImages(v as MaxImagesOption)}>
            <SelectTrigger className="w-20 h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="20">20 max</SelectItem>
              <SelectItem value="50">50 max</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            size="sm" 
            onClick={() => onImportFromAmazon(maxImages)} 
            disabled={!amazonUrl || isImporting}
            className="h-9"
          >
            {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Import className="w-4 h-4 mr-1.5" />}
            {isImporting ? 'Importing...' : 'Import'}
          </Button>
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-border" />

        {/* Context-aware action buttons */}
        <div className="flex items-center gap-2">
          {hasAssets && !hasResults && (
            <Button size="sm" onClick={onRunAudit} disabled={isAnalyzing} className="h-9">
              {isAnalyzing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Play className="w-4 h-4 mr-1.5" />}
              {isAnalyzing ? 'Auditing...' : 'Run Audit'}
            </Button>
          )}

          {hasResults && unfixedFailures > 0 && (
            <Button size="sm" variant="destructive" onClick={onBatchFix} disabled={isBatchFixing} className="h-9">
              {isBatchFixing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1.5" />}
              Fix All ({unfixedFailures})
            </Button>
          )}

          {hasResults && (
            <Button size="sm" variant="outline" onClick={onSaveReport} className="h-9">
              <Save className="w-4 h-4 mr-1.5" />
              Save
            </Button>
          )}
        </div>

        {/* Status counters */}
        {hasAssets && (
          <>
            <div className="w-px h-6 bg-border" />
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="secondary" className="font-mono">{assetCount} imgs</Badge>
              {analyzedCount > 0 && (
                <Badge variant="outline" className="font-mono text-success border-success/30">{analyzedCount - failedCount} pass</Badge>
              )}
              {failedCount > 0 && (
                <Badge variant="outline" className="font-mono text-destructive border-destructive/30">{failedCount} fail</Badge>
              )}
              {fixedCount > 0 && (
                <Badge variant="outline" className="font-mono text-primary border-primary/30">{fixedCount} fixed</Badge>
              )}
            </div>
          </>
        )}
      </div>

      {/* Progress bar */}
      {(isAnalyzing && analyzingProgress) && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Auditing {analyzingProgress.current}/{analyzingProgress.total}
          </div>
          <Progress value={(analyzingProgress.current / analyzingProgress.total) * 100} className="h-1" />
        </div>
      )}

      {isBatchFixing && batchFixProgress && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Fixing {batchFixProgress.current}/{batchFixProgress.total}
          </div>
          <Progress value={(batchFixProgress.current / batchFixProgress.total) * 100} className="h-1" />
        </div>
      )}

      {/* Stepper */}
      <div className="px-4 pb-2">
        <AuditStepper
          currentStep={currentStep}
          onStepChange={onStepChange}
          completedSteps={completedSteps}
          hasAssets={hasAssets}
          hasResults={hasResults}
          hasFailures={failedCount > 0}
        />
      </div>

      {/* Mini progress indicator */}
      {hasAssets && (
        <div className="px-4 pb-2.5 flex items-center gap-4 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" />
            <span className="font-medium text-foreground">{assetCount}</span> imported
          </div>
          <div className="flex items-center gap-1.5">
            <span className={cn("inline-block w-1.5 h-1.5 rounded-full", analyzedCount > 0 ? "bg-success" : "bg-muted-foreground/30")} />
            <span className={cn("font-medium", analyzedCount > 0 && "text-foreground")}>{analyzedCount}</span> audited
          </div>
          <div className="flex items-center gap-1.5">
            <span className={cn("inline-block w-1.5 h-1.5 rounded-full", fixedCount > 0 ? "bg-chart-4" : "bg-muted-foreground/30")} />
            <span className={cn("font-medium", fixedCount > 0 && "text-foreground")}>{fixedCount}</span> fixed
          </div>
          {failedCount > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-destructive" />
              <span className="font-medium text-destructive">{failedCount - fixedCount}</span> remaining
            </div>
          )}
        </div>
      )}
    </div>
  );
}
