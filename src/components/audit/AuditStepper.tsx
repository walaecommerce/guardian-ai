import { Check, Import, Search, Wand2, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AuditStep } from '@/hooks/useAuditSession';

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

  const canNavigateTo = (step: AuditStep): boolean => {
    switch (step) {
      case 'import': return true;
      case 'audit': return hasAssets;
      case 'fix': return hasResults;
      case 'review': return hasResults;
      default: return false;
    }
  };

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-center gap-0.5 min-w-0">
        {STEPS.map((step, idx) => {
          const isActive = step.id === currentStep;
          const isCompleted = completedSteps.has(step.id);
          const isPast = idx < currentIdx;
          const isClickable = canNavigateTo(step.id);
          const Icon = step.icon;

          return (
            <div key={step.id} className="flex items-center flex-1 min-w-0 last:flex-none">
              <button
                onClick={() => isClickable && onStepChange(step.id)}
                disabled={!isClickable}
                className={cn(
                  'flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all text-left group min-w-0',
                  isActive && 'bg-primary/10 border border-primary/20',
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

              {idx < STEPS.length - 1 && (
                <div className={cn(
                  'flex-1 h-px mx-0.5 min-w-2 transition-colors',
                  idx < currentIdx ? 'bg-primary/40' : 'bg-border'
                )} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
