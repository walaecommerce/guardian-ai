import { Check, Loader2, Circle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  detail?: string;
  score?: number;
}

interface FixProgressStepsProps {
  steps: ProgressStep[];
  attempt: number;
  maxAttempts: number;
}

export function FixProgressSteps({ steps, attempt, maxAttempts }: FixProgressStepsProps) {
  const getStepIcon = (status: ProgressStep['status']) => {
    switch (status) {
      case 'completed':
        return <Check className="w-4 h-4 text-success" />;
      case 'in_progress':
        return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Circle className="w-3 h-3 text-muted-foreground" />;
    }
  };

  const getStepColor = (status: ProgressStep['status']) => {
    switch (status) {
      case 'completed':
        return 'text-success';
      case 'in_progress':
        return 'text-primary';
      case 'failed':
        return 'text-destructive';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <div className="space-y-4">
      {/* Attempt Indicator */}
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">
          Generation Attempt {attempt}/{maxAttempts}
        </span>
        <div className="flex gap-1">
          {Array.from({ length: maxAttempts }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "w-2 h-2 rounded-full",
                i < attempt 
                  ? i === attempt - 1 
                    ? "bg-primary animate-pulse" 
                    : "bg-muted-foreground"
                  : "bg-muted"
              )}
            />
          ))}
        </div>
      </div>

      {/* Progress Steps */}
      <div className="space-y-2">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={cn(
              "flex items-start gap-3 py-2 px-3 rounded-lg transition-all duration-300",
              step.status === 'in_progress' && "bg-primary/5",
              step.status === 'completed' && "bg-success/5",
              step.status === 'failed' && "bg-destructive/5"
            )}
          >
            {/* Step Connector Line */}
            <div className="relative flex flex-col items-center">
              <div className="w-6 h-6 flex items-center justify-center">
                {getStepIcon(step.status)}
              </div>
              {index < steps.length - 1 && (
                <div 
                  className={cn(
                    "w-0.5 h-4 mt-1",
                    step.status === 'completed' ? "bg-success/30" : "bg-muted"
                  )}
                />
              )}
            </div>

            {/* Step Content */}
            <div className="flex-1 min-w-0">
              <p className={cn("text-sm font-medium", getStepColor(step.status))}>
                {step.label}
              </p>
              {step.detail && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {step.detail}
                </p>
              )}
              {step.score !== undefined && (
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        step.score >= 80 ? "bg-success" : 
                        step.score >= 60 ? "bg-warning" : "bg-destructive"
                      )}
                      style={{ width: `${step.score}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium">{step.score}%</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
