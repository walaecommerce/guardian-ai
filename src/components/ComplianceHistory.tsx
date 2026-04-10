import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { History, Trash2, RotateCcw, Loader2 } from 'lucide-react';
import { ImageAsset } from '@/types';
import { supabase } from '@/integrations/supabase/client';

export interface AuditHistoryEntry {
  id: string;
  date: string;
  listingTitle: string;
  totalImages: number;
  passed: number;
  failed: number;
  passRate: number;
  overallStatus: 'PASS' | 'FAIL';
  assets: Array<{
    name: string;
    type: string;
    score?: number;
    status?: string;
    violations?: any[];
  }>;
}

/**
 * Save audit to compliance_reports (server-side persistence).
 */
export async function saveAuditToHistory(assets: ImageAsset[], listingTitle: string) {
  const analyzed = assets.filter(a => a.analysisResult);
  if (analyzed.length === 0) return;

  const passed = analyzed.filter(a => a.analysisResult?.status === 'PASS').length;
  const failed = analyzed.filter(a => a.analysisResult?.status === 'FAIL').length;
  const passRate = Math.round((passed / analyzed.length) * 100);
  const scores = analyzed.map(a => a.analysisResult!.overallScore);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const reportData = {
    assets: analyzed.map(a => ({
      name: a.name,
      type: a.type,
      score: a.analysisResult?.overallScore,
      status: a.analysisResult?.status,
      violations: a.analysisResult?.violations,
    })),
  };

  await supabase.from('compliance_reports').insert([{
    user_id: user.id,
    listing_title: listingTitle || 'Untitled Listing',
    total_images: analyzed.length,
    passed_count: passed,
    failed_count: failed,
    average_score: avgScore,
    report_data: JSON.parse(JSON.stringify(reportData)),
  }]);
}

/**
 * Get score trend from compliance_reports by listing title.
 */
export async function getScoreTrend(listingTitle: string): Promise<{ prevScore: number; prevDate: string; direction: 'up' | 'down' | 'same' } | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('compliance_reports')
    .select('average_score, created_at')
    .eq('user_id', user.id)
    .eq('listing_title', listingTitle)
    .order('created_at', { ascending: false })
    .limit(2);

  if (!data || data.length < 2) return null;

  const recent = data[0];
  const older = data[1];
  const recentScore = Math.round((recent.average_score as number) || 0);
  const olderScore = Math.round((older.average_score as number) || 0);

  const direction = recentScore > olderScore ? 'up' : recentScore < olderScore ? 'down' : 'same';

  return {
    prevScore: recentScore,
    prevDate: recent.created_at,
    direction,
  };
}

interface ComplianceHistoryProps {
  onLoadAudit: (entry: AuditHistoryEntry) => void;
}

export function ComplianceHistory({ onLoadAudit }: ComplianceHistoryProps) {
  const [history, setHistory] = useState<AuditHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsLoading(false); return; }

      const { data } = await supabase
        .from('compliance_reports')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (data) {
        setHistory(data.map(r => {
          const rd = r.report_data as any;
          const passRate = r.total_images > 0 ? Math.round((r.passed_count / r.total_images) * 100) : 0;
          return {
            id: r.id,
            date: r.created_at,
            listingTitle: r.listing_title || 'Untitled',
            totalImages: r.total_images,
            passed: r.passed_count,
            failed: r.failed_count,
            passRate,
            overallStatus: r.failed_count > 0 ? 'FAIL' as const : 'PASS' as const,
            assets: rd?.assets || [],
          };
        }));
      }
      setIsLoading(false);
    })();
  }, []);

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <Card className="glass-card min-h-[400px] flex items-center justify-center">
        <CardContent className="text-center py-16">
          <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading report history…</p>
        </CardContent>
      </Card>
    );
  }

  if (history.length === 0) {
    return (
      <Card className="glass-card min-h-[400px] flex items-center justify-center">
        <CardContent className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <History className="w-8 h-8 text-primary/30" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2 tracking-tight">No Saved Reports</h3>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
            When you save an audit report, it will appear here so you can compare results over time.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            Audit History ({history.length})
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto max-h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs">Listing</TableHead>
                <TableHead className="text-xs text-center">Images</TableHead>
                <TableHead className="text-xs text-center">Pass Rate</TableHead>
                <TableHead className="text-xs text-center">Status</TableHead>
                <TableHead className="text-xs text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map(entry => (
                <TableRow
                  key={entry.id}
                  className="cursor-pointer hover:bg-muted/80"
                  onClick={() => onLoadAudit(entry)}
                >
                  <TableCell className="text-xs whitespace-nowrap">{formatDate(entry.date)}</TableCell>
                  <TableCell className="text-xs max-w-[160px] truncate">{entry.listingTitle}</TableCell>
                  <TableCell className="text-xs text-center">{entry.totalImages}</TableCell>
                  <TableCell className="text-xs text-center font-medium">{entry.passRate}%</TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant={entry.overallStatus === 'PASS' ? 'default' : 'destructive'}
                      className="text-[10px] px-1.5"
                    >
                      {entry.overallStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="h-6 text-xs gap-1">
                      <RotateCcw className="w-3 h-3" /> Load
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
