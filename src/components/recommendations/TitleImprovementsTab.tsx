import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, ShieldCheck, ShieldAlert, Info } from 'lucide-react';
import { TitleImprovement } from './types';
import { useState, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { analyzeTitleCompliance, TitleRuleFinding } from '@/utils/titleAnalyzer';

interface Props {
  items: TitleImprovement[];
  listingTitle?: string;
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === 'critical') return <ShieldAlert className="w-3.5 h-3.5 text-destructive" />;
  if (severity === 'warning') return <ShieldAlert className="w-3.5 h-3.5 text-yellow-600" />;
  return <Info className="w-3.5 h-3.5 text-muted-foreground" />;
}

export function TitleImprovementsTab({ items, listingTitle }: Props) {
  const [copied, setCopied] = useState<number | null>(null);
  const { toast } = useToast();

  // Run deterministic title compliance check
  const compliance = useMemo(() => {
    if (!listingTitle) return null;
    return analyzeTitleCompliance(listingTitle);
  }, [listingTitle]);

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopied(idx);
    toast({ title: 'Copied', description: 'Suggestion copied to clipboard' });
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Deterministic Title Compliance Section */}
      {compliance && (
        <Card className={compliance.passed ? 'border-green-500/30 bg-green-500/5' : 'border-destructive/30 bg-destructive/5'}>
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-center gap-2">
              {compliance.passed
                ? <ShieldCheck className="w-4 h-4 text-green-600" />
                : <ShieldAlert className="w-4 h-4 text-destructive" />}
              <span className="text-sm font-semibold">
                Title Compliance — {compliance.score}%
              </span>
              {compliance.criticalCount > 0 && (
                <Badge variant="destructive" className="text-[10px]">
                  {compliance.criticalCount} critical
                </Badge>
              )}
              {compliance.warningCount > 0 && (
                <Badge variant="outline" className="text-[10px] bg-yellow-500/10 text-yellow-600">
                  {compliance.warningCount} warnings
                </Badge>
              )}
            </div>

            <div className="space-y-1.5">
              {compliance.findings.map((f: TitleRuleFinding) => (
                <div key={f.ruleId} className="flex items-start gap-2 text-xs">
                  <SeverityIcon severity={f.passed ? 'info' : f.severity} />
                  <div className="flex-1">
                    <span className={`font-medium ${f.passed ? 'text-green-600' : f.severity === 'critical' ? 'text-destructive' : 'text-yellow-600'}`}>
                      {f.passed ? '✓' : '✗'} {f.ruleName}
                    </span>
                    <p className="text-muted-foreground">{f.message}</p>
                    {!f.passed && (
                      <p className="text-muted-foreground/80 italic mt-0.5">
                        💡 {f.guidance}
                        <span className="text-[10px] ml-1 text-muted-foreground/60">— {f.reference}</span>
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI-generated title suggestions */}
      {items.length === 0 && !compliance ? (
        <p className="text-sm text-muted-foreground text-center py-8">✅ No title improvements needed!</p>
      ) : items.length === 0 ? null : (
        <>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">AI Suggestions</p>
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
                  {item.evidence && (
                    <p className="text-[10px] text-muted-foreground/70 italic">📎 {item.evidence}</p>
                  )}
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
        </>
      )}
    </div>
  );
}
