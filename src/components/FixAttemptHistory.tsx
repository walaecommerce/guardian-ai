import { cn } from '@/lib/utils';
import { FixAttempt } from '@/types';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface FixAttemptHistoryProps {
  attempts: FixAttempt[];
  currentAttempt: number;
  onSelectAttempt?: (attempt: FixAttempt) => void;
  selectedAttemptIndex?: number;
}

export function FixAttemptHistory({ 
  attempts, 
  currentAttempt, 
  onSelectAttempt,
  selectedAttemptIndex 
}: FixAttemptHistoryProps) {
  if (attempts.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground font-medium">Attempts:</span>
      <div className="flex items-center gap-1.5">
        {attempts.map((attempt, idx) => {
          const isSelected = selectedAttemptIndex === idx;
          const isCurrent = attempt.attempt === currentAttempt;
          
          return (
            <button
              key={attempt.attempt}
              onClick={() => onSelectAttempt?.(attempt)}
              className={cn(
                "relative group transition-all duration-200",
                "w-12 h-12 rounded-lg overflow-hidden border-2",
                isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
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
            </button>
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
  );
}
