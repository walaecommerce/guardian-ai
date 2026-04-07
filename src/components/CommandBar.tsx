import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Search, Import, Loader2, Play, Wand2, Save, MoreVertical } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { MaxImagesOption } from '@/components/ImageUploader';
import { AuditStepper } from '@/components/audit/AuditStepper';
import { AuditStep } from '@/hooks/useAuditSession';
import { cn } from '@/lib/utils';

interface CommandBarProps {
  amazonUrl: string;
  onAmazonUrlChange: (url: string) => void;
  onImportFromAmazon: (maxImages: MaxImagesOption) => void;
  isImporting: boolean;
  onRunAudit: () => void;
  isAnalyzing: boolean;
  analyzingProgress?: { current: number; total: number };
  onBatchFix: () => void;
  isBatchFixing: boolean;
  batchFixProgress: { current: number; total: number } | null;
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

  // Whether there are any action items for the dropdown
  const hasActions = (hasAssets && !hasResults) || (hasResults && unfixedFailures > 0) || hasResults;

  const kbdClass = "ml-1.5 inline-flex items-center rounded border border-border bg-muted px-1 py-0.5 text-[10px] font-mono text-muted-foreground";

  return (
    <TooltipProvider delayDuration={300}>
    <div className="sticky top-12 z-30 bg-background/95 backdrop-blur-xl border-b border-border">
      {/* URL Bar + Actions */}
      <div className="px-3 sm:px-4 py-2 flex items-center gap-2 sm:gap-3">
        {/* URL Input — full width on mobile, capped on desktop */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0 max-w-xl">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Amazon URL..."
              value={amazonUrl}
              onChange={e => onAmazonUrlChange(e.target.value)}
              disabled={isImporting}
              className="pl-9 h-9 bg-muted/30 border-muted text-sm"
            />
          </div>
          <Select value={maxImages} onValueChange={(v) => setMaxImages(v as MaxImagesOption)}>
            <SelectTrigger className="w-16 sm:w-20 h-9 text-xs shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="20">20 max</SelectItem>
              <SelectItem value="50">50 max</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                onClick={() => onImportFromAmazon(maxImages)}
                disabled={!amazonUrl || isImporting}
                className="h-9 shrink-0"
              >
                {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Import className="w-4 h-4 sm:mr-1.5" />}
                <span className="hidden sm:inline">{isImporting ? 'Importing...' : 'Import'}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Import<kbd className={kbdClass}>⌘I</kbd></TooltipContent>
          </Tooltip>
        </div>

        {/* Desktop: inline action buttons */}
        <div className="hidden md:flex items-center gap-2">
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

        {/* Mobile: overflow dropdown */}
        {hasActions && (
          <div className="md:hidden shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {hasAssets && !hasResults && (
                  <DropdownMenuItem onClick={onRunAudit} disabled={isAnalyzing}>
                    {isAnalyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                    {isAnalyzing ? 'Auditing...' : 'Run Audit'}
                  </DropdownMenuItem>
                )}
                {hasResults && unfixedFailures > 0 && (
                  <DropdownMenuItem onClick={onBatchFix} disabled={isBatchFixing} className="text-destructive focus:text-destructive">
                    {isBatchFixing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
                    Fix All ({unfixedFailures})
                  </DropdownMenuItem>
                )}
                {hasResults && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onSaveReport}>
                      <Save className="w-4 h-4 mr-2" />
                      Save Report
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Desktop: status counters */}
        {hasAssets && (
          <div className="hidden lg:flex items-center gap-2 text-xs shrink-0">
            <div className="w-px h-6 bg-border" />
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
        )}
      </div>

      {/* Progress bar */}
      {(isAnalyzing && analyzingProgress) && (
        <div className="px-3 sm:px-4 pb-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Auditing {analyzingProgress.current}/{analyzingProgress.total}
          </div>
          <Progress value={(analyzingProgress.current / analyzingProgress.total) * 100} className="h-1" />
        </div>
      )}

      {isBatchFixing && batchFixProgress && (
        <div className="px-3 sm:px-4 pb-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Fixing {batchFixProgress.current}/{batchFixProgress.total}
          </div>
          <Progress value={(batchFixProgress.current / batchFixProgress.total) * 100} className="h-1" />
        </div>
      )}

      {/* Stepper */}
      <div className="px-3 sm:px-4 pb-2">
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
        <div className="px-3 sm:px-4 pb-2.5 flex items-center gap-3 sm:gap-4 text-[11px] text-muted-foreground flex-wrap">
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
    </TooltipProvider>
  );
}
