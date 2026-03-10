import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Check } from 'lucide-react';
import { TitleImprovement } from './types';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

interface Props {
  items: TitleImprovement[];
}

export function TitleImprovementsTab({ items }: Props) {
  const [copied, setCopied] = useState<number | null>(null);
  const { toast } = useToast();

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopied(idx);
    toast({ title: 'Copied', description: 'Suggestion copied to clipboard' });
    setTimeout(() => setCopied(null), 2000);
  };

  if (!items.length) {
    return <p className="text-sm text-muted-foreground text-center py-8">✅ No title improvements needed!</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <Card key={i}>
          <CardContent className="pt-4 space-y-3">
            <div className="space-y-2">
              <div className="flex items-start gap-1.5">
                <Badge variant="destructive" className="text-[10px] shrink-0 mt-0.5">Issue</Badge>
                <p className="text-sm">{item.issue}</p>
              </div>

              <div className="rounded-md bg-muted/50 p-2.5 space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">Current:</span> {item.current_example}
                </p>
                <p className="text-xs">
                  <span className="font-medium text-green-600">Suggested:</span> {item.suggested_fix}
                </p>
              </div>

              <p className="text-xs text-muted-foreground">{item.reason}</p>
            </div>

            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => handleCopy(item.suggested_fix, i)}
            >
              {copied === i ? (
                <><Check className="w-3 h-3 mr-1" /> Copied!</>
              ) : (
                <><Copy className="w-3 h-3 mr-1" /> Copy Suggestion</>
              )}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
