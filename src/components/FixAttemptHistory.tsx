import { cn } from '@/lib/utils';
import { FixAttempt, FixMethod, BestAttemptSelection } from '@/types';
import { CheckCircle, XCircle, Loader2, Sparkles, Paintbrush, Layers, RefreshCw, Scissors, Trophy, Ban } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface FixAttemptHistoryProps {
  attempts: FixAttempt[];
  currentAttempt: number;
  onSelectAttempt?: (attempt: FixAttempt) => void;
  selectedAttemptIndex?: number;
  bestAttemptSelection?: BestAttemptSelection;
  stopReason?: string;
}

const STRATEGY_LABELS: Record<string, string> = {
  'bg-cleanup': 'BG Clean',
  'crop-reframe': 'Crop',
  'overlay-removal': 'Overlay',
  'inpaint-edit': 'Inpaint',
  'full-regeneration': 'Regen',
};

export function FixAttemptHistory({ 
  attempts, 
  currentAttempt, 
  onSelectAttempt,
  selectedAttemptIndex,
  bestAttemptSelection,
  stopReason,
}: FixAttemptHistoryProps) {
  if (attempts.length === 0) return null;

  return (
    <TooltipProvider>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">Attempts:</span>
          <div className="flex items-center gap-1.5">
            {attempts.map((attempt, idx) => {
              const isSelected = selectedAttemptIndex === idx;
              const isBest = attempt.isBestAttempt;
              const strategyLabel = attempt.strategyUsed ? STRATEGY_LABELS[attempt.strategyUsed] || attempt.strategyUsed : '';
              
              const tooltipLines: string[] = [];
              if (attempt.strategyUsed) tooltipLines.push(`Strategy: ${attempt.strategyUsed}`);
              if (attempt.verification?.score !== undefined) tooltipLines.push(`Score: ${attempt.verification.score}%`);
              if (attempt.retryDecision) tooltipLines.push(`Retry: ${attempt.retryDecision.rationale}`);
              if (isBest && bestAttemptSelection) tooltipLines.push(`✓ ${bestAttemptSelection.selectedReason}`);

              return (
                <Tooltip key={attempt.attempt}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onSelectAttempt?.(attempt)}
                      className={cn(
                        "relative group transition-all duration-200",
                        "w-12 h-12 rounded-lg overflow-hidden border-2",
                        isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                        isBest && "ring-2 ring-yellow-400 ring-offset-1 ring-offset-background",
                        attempt.status === 'passed' && "border-success",
                        attempt.status === 'failed' && "border-destructive",
                        attempt.status === 'verifying' && "border-primary animate-pulse",
                        attempt.status === 'generating' && "border-muted-foreground",
                        !isSelected && "hover:scale-105"
                      )}
                    >
                      {attempt.generatedImage ? (
                        <img 
                          src={attempt.generatedImage} 
                          alt={`Attempt ${attempt.attempt}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center">
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      
                      {/* Best attempt crown */}
                      {isBest && (
                        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-yellow-400 flex items-center justify-center shadow-sm z-10">
                          <Trophy className="w-2.5 h-2.5 text-yellow-900" />
                        </div>
                      )}
                      
                      {/* Status badge */}
                      <div className={cn(
                        "absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center shadow-sm",
                        attempt.status === 'passed' && "bg-success",
                        attempt.status === 'failed' && "bg-destructive",
                        attempt.status === 'verifying' && "bg-primary",
                        attempt.status === 'generating' && "bg-muted"
                      )}>
                        {attempt.status === 'passed' && <CheckCircle className="w-3 h-3 text-success-foreground" />}
                        {attempt.status === 'failed' && <XCircle className="w-3 h-3 text-destructive-foreground" />}
                        {(attempt.status === 'verifying' || attempt.status === 'generating') && (
                          <Loader2 className="w-3 h-3 animate-spin text-primary-foreground" />
                        )}
                      </div>
                      
                      {/* Score badge */}
                      {attempt.verification?.score !== undefined && (
                        <div className={cn(
                          "absolute bottom-0 inset-x-0 py-0.5 text-[10px] font-bold text-center",
                          attempt.verification.score >= 80 ? "bg-success/90 text-success-foreground" : "bg-destructive/90 text-destructive-foreground"
                        )}>
                          {attempt.verification.score}%
                        </div>
                      )}
                      
                      {/* Attempt number */}
                      <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-background/80 flex items-center justify-center text-[10px] font-bold">
                        {attempt.attempt}
                      </div>

                      {/* Strategy label */}
                      {strategyLabel && (
                        <div className="absolute top-0.5 right-5 px-1 py-px rounded text-[7px] font-bold bg-primary/80 text-primary-foreground">
                          {strategyLabel}
                        </div>
                      )}
                    </button>
                  </TooltipTrigger>
                  {tooltipLines.length > 0 && (
                    <TooltipContent side="top" className="max-w-xs text-xs space-y-1">
                      {tooltipLines.map((line, i) => (
                        <p key={i}>{line}</p>
                      ))}
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            })}
            
            {/* Placeholder for upcoming attempts */}
            {currentAttempt <= 3 && attempts.every(a => a.status !== 'passed') && (
              Array.from({ length: 3 - attempts.length }).map((_, idx) => (
                <div
                  key={`placeholder-${idx}`}
                  className="w-12 h-12 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center"
                >
                  <span className="text-[10px] text-muted-foreground/50">
                    {attempts.length + idx + 1}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Stop reason banner */}
        {stopReason && (
          <div className="flex items-center gap-1.5 text-xs text-warning bg-warning/10 px-2 py-1 rounded">
            <Ban className="w-3 h-3 flex-shrink-0" />
            <span>Stopped: {stopReason}</span>
          </div>
        )}

        {/* Best attempt selection reason */}
        {bestAttemptSelection && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-2 py-1 rounded bg-muted/50">
            <Trophy className="w-3 h-3 text-yellow-500 flex-shrink-0" />
            <span>{bestAttemptSelection.selectedReason}</span>
            {bestAttemptSelection.selectionType === 'safety-driven' && (
              <span className="ml-auto text-[10px] font-medium text-warning">Safety pick</span>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
