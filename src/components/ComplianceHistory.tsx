import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { History, Trash2, RotateCcw } from 'lucide-react';
import { ImageAsset } from '@/types';

const STORAGE_KEY = 'guardian-audits';
const MAX_ENTRIES = 20;

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

export function saveAuditToHistory(assets: ImageAsset[], listingTitle: string) {
  const analyzed = assets.filter(a => a.analysisResult);
  if (analyzed.length === 0) return;

  const passed = analyzed.filter(a => a.analysisResult?.status === 'PASS').length;
  const failed = analyzed.filter(a => a.analysisResult?.status === 'FAIL').length;
  const passRate = Math.round((passed / analyzed.length) * 100);

  const entry: AuditHistoryEntry = {
    id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
    date: new Date().toISOString(),
    listingTitle: listingTitle || 'Untitled Listing',
    totalImages: analyzed.length,
    passed,
    failed,
    passRate,
    overallStatus: failed > 0 ? 'FAIL' : 'PASS',
    assets: analyzed.map(a => ({
      name: a.name,
      type: a.type,
      score: a.analysisResult?.overallScore,
      status: a.analysisResult?.status,
      violations: a.analysisResult?.violations,
    })),
  };

  const existing = getAuditHistory();
  const updated = [entry, ...existing].slice(0, MAX_ENTRIES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return entry;
}

export function getAuditHistory(): AuditHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getScoreTrend(listingTitle: string): { prevScore: number; prevDate: string; direction: 'up' | 'down' | 'same' } | null {
  const history = getAuditHistory();
  // Find entries matching this title (at least 2 previous = 3+ total including current)
  const matching = history.filter(h => h.listingTitle === listingTitle);
  if (matching.length < 2) return null; // Need at least 2 previous entries (3+ audits total)

  const previous = matching[0]; // Most recent previous
  const older = matching[1];

  const direction = previous.passRate > older.passRate ? 'up'
    : previous.passRate < older.passRate ? 'down'
    : 'same';

  return {
    prevScore: previous.passRate,
    prevDate: previous.date,
    direction,
  };
}

interface ComplianceHistoryProps {
  onLoadAudit: (entry: AuditHistoryEntry) => void;
}

export function ComplianceHistory({ onLoadAudit }: ComplianceHistoryProps) {
  const [history, setHistory] = useState<AuditHistoryEntry[]>([]);

  useEffect(() => {
    setHistory(getAuditHistory());
  }, []);

  const handleClear = () => {
    localStorage.removeItem(STORAGE_KEY);
    setHistory([]);
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  if (history.length === 0) {
    return (
      <Card className="glass-card min-h-[400px] flex items-center justify-center">
        <CardContent className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <History className="w-8 h-8 text-primary/30" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2 tracking-tight">No Reports Yet</h3>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
            Completed audits will be saved here for future reference.
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
          <Button variant="ghost" size="sm" onClick={handleClear} className="text-xs text-muted-foreground">
            <Trash2 className="w-3 h-3 mr-1" />
            Clear
          </Button>
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
                    <RotateCcw className="w-3 h-3 text-muted-foreground" />
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
