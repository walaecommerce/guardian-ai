import { cn } from '@/lib/utils';
import { FixAttempt, BestAttemptSelection } from '@/types';
import { CheckCircle, XCircle, Loader2, Trophy, Ban, ArrowUp, ArrowDown, Minus, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { getRetryReasonLabel, getStrategyLabel, getScoreDelta } from '@/utils/fixAttemptHelpers';

interface FixAttemptHistoryProps {
  attempts: FixAttempt[];
  currentAttempt: number;
  onSelectAttempt?: (attempt: FixAttempt) => void;
  selectedAttemptIndex?: number;
  bestAttemptSelection?: BestAttemptSelection;
  stopReason?: string;
  /** Show in review mode (post-fix, no placeholders) */
  reviewMode?: boolean;
}

export function FixAttemptHistory({ 
  attempts, 
  currentAttempt, 
  onSelectAttempt,
  selectedAttemptIndex,
  bestAttemptSelection,
  stopReason,
  reviewMode = false,
}: FixAttemptHistoryProps) {
  if (attempts.length === 0) return null;

  return (
    <TooltipProvider>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-medium">
            {reviewMode ? 'Fix Attempts' : 'Attempts'} ({attempts.length})
          </span>
          <span className="text-[10px] text-muted-foreground">
            Up to 3 AI attempts — best result auto-selected
          </span>
        </div>

        {/* Attempt cards */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {attempts.map((attempt, idx) => {
            const isSelected = selectedAttemptIndex === idx;
            const isBest = attempt.isBestAttempt;
            const strategy = getStrategyLabel(attempt.strategyUsed);
            const retryReason = getRetryReasonLabel(attempt);
            const scoreDelta = getScoreDelta(attempts, idx);
            const score = attempt.verification?.score;
            const identityOk = attempt.verification?.productMatch !== false;
            
            return (
              <div key={attempt.attempt} className="flex-shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onSelectAttempt?.(attempt)}
                      className={cn(
                        "relative group transition-all duration-200 rounded-lg border-2 overflow-hidden",
                        "w-[90px] flex flex-col",
                        isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                        isBest && "ring-2 ring-yellow-400 ring-offset-1 ring-offset-background",
                        attempt.status === 'passed' && "border-success",
                        attempt.status === 'failed' && "border-destructive/50",
                        attempt.status === 'verifying' && "border-primary animate-pulse",
                        attempt.status === 'generating' && "border-muted-foreground",
                        !isSelected && "hover:scale-[1.02]"
                      )}
                    >
                      {/* Thumbnail */}
                      <div className="relative w-full h-16">
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
                          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-yellow-400 flex items-center justify-center shadow-sm z-10">
                            <Trophy className="w-3 h-3 text-yellow-900" />
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
                      </div>

                      {/* Metadata below thumbnail */}
                      <div className="px-1.5 py-1 space-y-0.5 bg-background">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold">Attempt {attempt.attempt}</span>
                          {score !== undefined && (
                            <span className={cn(
                              "text-[10px] font-bold",
                              score >= 80 ? "text-success" : "text-destructive"
                            )}>
                              {score}%
                            </span>
                          )}
                        </div>
                        
                        {/* Strategy */}
                        {strategy && (
                          <Badge variant="outline" className="text-[8px] h-3.5 px-1 w-full justify-center truncate">
                            {strategy}
                          </Badge>
                        )}

                        {/* Score delta */}
                        {scoreDelta !== null && (
                          <div className="flex items-center justify-center gap-0.5">
                            {scoreDelta > 0 ? (
                              <ArrowUp className="w-2.5 h-2.5 text-success" />
                            ) : scoreDelta < 0 ? (
                              <ArrowDown className="w-2.5 h-2.5 text-destructive" />
                            ) : (
                              <Minus className="w-2.5 h-2.5 text-muted-foreground" />
                            )}
                            <span className={cn(
                              "text-[9px] font-medium",
                              scoreDelta > 0 ? "text-success" : scoreDelta < 0 ? "text-destructive" : "text-muted-foreground"
                            )}>
                              {scoreDelta > 0 ? '+' : ''}{scoreDelta}
                            </span>
                          </div>
                        )}

                        {/* Identity indicator */}
                        <div className="flex items-center justify-center gap-1">
                          {identityOk ? (
                            <ShieldCheck className="w-2.5 h-2.5 text-success" />
                          ) : (
                            <ShieldAlert className="w-2.5 h-2.5 text-destructive" />
                          )}
                          <span className="text-[8px] text-muted-foreground">
                            {identityOk ? 'Identity OK' : 'Identity drift'}
                          </span>
                        </div>
                      </div>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs space-y-1">
                    <p className="font-medium">Attempt {attempt.attempt}: {strategy || 'Default'}</p>
                    {score !== undefined && <p>Score: {score}%</p>}
                    {retryReason && <p className="text-muted-foreground">Retry reason: {retryReason}</p>}
                    {isBest && bestAttemptSelection && <p className="text-yellow-500">✓ {bestAttemptSelection.selectedReason}</p>}
                    {attempt.retryDecision?.rationale && <p className="text-muted-foreground italic">{attempt.retryDecision.rationale}</p>}
                  </TooltipContent>
                </Tooltip>
              </div>
            );
          })}
          
          {/* Placeholder for upcoming attempts (live mode only) */}
          {!reviewMode && currentAttempt <= 3 && attempts.every(a => a.status !== 'passed') && (
            Array.from({ length: Math.max(0, 3 - attempts.length) }).map((_, idx) => (
              <div
                key={`placeholder-${idx}`}
                className="w-[90px] h-[90px] rounded-lg border-2 border-dashed border-muted-foreground/20 flex items-center justify-center flex-shrink-0"
              >
                <span className="text-xs text-muted-foreground/40">
                  #{attempts.length + idx + 1}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Stop reason banner */}
        {stopReason && (
          <div className="flex items-center gap-1.5 text-xs text-warning bg-warning/10 px-3 py-1.5 rounded">
            <Ban className="w-3 h-3 flex-shrink-0" />
            <span>Stopped: {stopReason}</span>
          </div>
        )}

        {/* Best attempt selection reason — PROMINENT */}
        {bestAttemptSelection && (
          <div className={cn(
            "flex items-center gap-2 text-sm px-3 py-2 rounded-md border",
            bestAttemptSelection.selectionType === 'safety-driven'
              ? "bg-warning/10 border-warning/30"
              : "bg-success/5 border-success/30"
          )}>
            <Trophy className="w-4 h-4 text-yellow-500 flex-shrink-0" />
            <div className="flex-1">
              <span className="font-medium text-xs">Selected Output: </span>
              <span className="text-xs text-muted-foreground">{bestAttemptSelection.selectedReason}</span>
            </div>
            {bestAttemptSelection.selectionType === 'safety-driven' && (
              <Badge variant="outline" className="text-[10px] border-warning text-warning">
                Safety pick
              </Badge>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
