import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ScoreTrendBadgeProps {
  direction: 'up' | 'down' | 'same';
  prevScore: number;
  prevDate: string;
}

export function ScoreTrendBadge({ direction, prevScore, prevDate }: ScoreTrendBadgeProps) {
  const formattedDate = new Date(prevDate).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });

  const Icon = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : Minus;
  const color = direction === 'up' ? 'text-green-500' : direction === 'down' ? 'text-red-500' : 'text-muted-foreground';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center gap-0.5 ${color}`}>
          <Icon className="w-3.5 h-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">Previous score: {prevScore}% on {formattedDate}</p>
      </TooltipContent>
    </Tooltip>
  );
}
