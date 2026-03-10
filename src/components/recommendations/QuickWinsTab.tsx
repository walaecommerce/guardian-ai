import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { ArrowRight } from 'lucide-react';
import { QuickWin } from './types';

const effortStyles: Record<string, { bg: string; label: string }> = {
  LOW: { bg: 'bg-green-500/15 text-green-600', label: '⚡ Low Effort' },
  MEDIUM: { bg: 'bg-yellow-500/15 text-yellow-600', label: '🔧 Medium' },
  HIGH: { bg: 'bg-destructive/15 text-destructive', label: '🏗️ High' },
};

interface Props {
  items: QuickWin[];
}

export function QuickWinsTab({ items }: Props) {
  const [completed, setCompleted] = useState<Set<number>>(new Set());

  const sorted = [...items].sort((a, b) => {
    const order = { LOW: 0, MEDIUM: 1, HIGH: 2 };
    return (order[a.effort] ?? 1) - (order[b.effort] ?? 1);
  });

  const toggle = (idx: number) => {
    setCompleted(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const pct = items.length ? Math.round((completed.size / items.length) * 100) : 0;

  if (!items.length) {
    return <p className="text-sm text-muted-foreground text-center py-8">✅ No quick wins identified — your listing is well optimized!</p>;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{completed.size} of {items.length} completed</span>
          <span>{pct}%</span>
        </div>
        <Progress value={pct} className="h-2" />
      </div>

      {sorted.map((item, i) => {
        const style = effortStyles[item.effort] || effortStyles.MEDIUM;
        const done = completed.has(i);
        return (
          <Card key={i} className={done ? 'opacity-60' : ''}>
            <CardContent className="pt-3 pb-3">
              <div className="flex items-start gap-3">
                <Checkbox checked={done} onCheckedChange={() => toggle(i)} className="mt-0.5" />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm font-medium ${done ? 'line-through' : ''}`}>{item.action}</p>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${style.bg}`}>
                      {style.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <ArrowRight className="w-3 h-3 shrink-0" />
                    {item.estimated_impact}
                  </p>
                  <p className="text-xs text-muted-foreground/80">{item.how_to_do_it}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
