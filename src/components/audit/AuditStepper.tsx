import { Check, Import, Search, Wand2, FileText, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AuditStep } from '@/hooks/useAuditSession';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface StepConfig {
  id: AuditStep;
  label: string;
  icon: React.ElementType;
  description: string;
}

const STEPS: StepConfig[] = [
  { id: 'import', label: 'Import', icon: Import, description: 'Add images' },
  { id: 'audit', label: 'Audit', icon: Search, description: 'Run compliance check' },
  { id: 'fix', label: 'Fix', icon: Wand2, description: 'Repair violations' },
  { id: 'review', label: 'Review', icon: FileText, description: 'Export & report' },
];

const STEP_ORDER: AuditStep[] = ['import', 'audit', 'fix', 'review'];

function getStepIndex(step: AuditStep) {
  return STEP_ORDER.indexOf(step);
}

/** Returns a human-readable reason why a step is disabled, or null if navigable */
function getDisabledReason(step: AuditStep, hasAssets: boolean, hasResults: boolean): string | null {
  switch (step) {
    case 'import': return null;
    case 'audit': return hasAssets ? null : 'Import images first';
    case 'fix': return hasResults ? null : 'Run an audit first';
    case 'review': return hasResults ? null : 'Run an audit first';
    default: return null;
  }
}

interface AuditStepperProps {
  currentStep: AuditStep;
  onStepChange: (step: AuditStep) => void;
  completedSteps: Set<AuditStep>;
  hasAssets: boolean;
  hasResults: boolean;
  hasFailures: boolean;
}

export function AuditStepper({ currentStep, onStepChange, completedSteps, hasAssets, hasResults, hasFailures }: AuditStepperProps) {
  const currentIdx = getStepIndex(currentStep);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="w-full overflow-x-auto">
        <div className="flex items-center gap-0.5 min-w-0">
          {STEPS.map((step, idx) => {
            const isActive = step.id === currentStep;
            const isCompleted = completedSteps.has(step.id);
            const disabledReason = getDisabledReason(step.id, hasAssets, hasResults);
            const isClickable = !disabledReason;
            const Icon = step.icon;

            const button = (
              <button
                onClick={() => isClickable && onStepChange(step.id)}
                disabled={!isClickable}
                aria-current={isActive ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all text-left group min-w-0',
                  isActive && 'bg-primary/10 border border-primary/20 shadow-sm',
                  !isActive && isClickable && 'hover:bg-muted/50 cursor-pointer',
                  !isClickable && 'opacity-40 cursor-not-allowed'
                )}
              >
                <div className={cn(
                  'flex items-center justify-center w-7 h-7 rounded-full shrink-0 transition-all',
                  isActive && 'bg-primary text-primary-foreground',
                  isCompleted && !isActive && 'bg-success/20 text-success border border-success/30',
                  !isActive && !isCompleted && 'bg-muted text-muted-foreground'
                )}>
                  {isCompleted && !isActive ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Icon className="w-3.5 h-3.5" />
                  )}
                </div>
                <div className="min-w-0 hidden md:block">
                  <p className={cn(
                    'text-xs font-medium truncate',
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  )}>{step.label}</p>
                  <p className="text-[10px] text-muted-foreground/70 truncate leading-tight">{step.description}</p>
                </div>
                {/* Show label on small screens only for active step */}
                <span className={cn(
                  'text-xs font-medium truncate md:hidden',
                  isActive ? 'text-primary' : 'sr-only'
                )}>{step.label}</span>
              </button>
            );

            return (
              <div key={step.id} className="flex items-center flex-1 min-w-0 last:flex-none">
                {disabledReason ? (
                  <Tooltip>
                    <TooltipTrigger asChild>{button}</TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      {disabledReason}
                    </TooltipContent>
                  </Tooltip>
                ) : button}

                {idx < STEPS.length - 1 && (
                  <div className={cn(
                    'flex-1 flex items-center justify-center min-w-2 mx-0.5',
                  )}>
                    <ChevronRight className={cn(
                      'w-3.5 h-3.5 transition-colors',
                      idx < currentIdx ? 'text-primary/60' : 'text-border'
                    )} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
