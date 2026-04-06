import { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5">
        <Icon className="w-8 h-8 text-primary/30" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2 tracking-tight">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm text-center leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-6" size="sm">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
