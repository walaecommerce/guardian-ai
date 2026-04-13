import { useState } from 'react';
import { ClientReportGenerator } from '@/components/ClientReportGenerator';
import { CompetitorAudit, CompetitorData, AIComparisonResult } from '@/components/CompetitorAudit';
import { ComplianceHistory, AuditHistoryEntry } from '@/components/ComplianceHistory';
import { ExportButton } from '@/components/ExportButton';
import { EmptyState } from '@/components/EmptyState';
import { ManualReviewLane, isManualReviewAsset } from '@/components/ManualReviewLane';
import { ImageAsset } from '@/types';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Save, Swords, Loader2, Import, FileBarChart, GitCompare, Search, CheckCircle, AlertTriangle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface ReviewStepProps {
  assets: ImageAsset[];
  listingTitle: string;
  productAsin: string | null;
  competitorData: CompetitorData | null;
  aiComparison: AIComparisonResult | null;
  isLoadingAIComparison: boolean;
  isImportingCompetitor: boolean;
  competitorProgress: { current: number; total: number } | null;
  onSaveReport: () => void;
  onImportCompetitor: (url: string) => void;
  onLoadAudit: (entry: AuditHistoryEntry) => void;
  onGoToAudit?: () => void;
  onViewDetails?: (asset: ImageAsset) => void;
}

function CompetitorUrlInput({
  isImporting, hasAudit, importProgress, onImportCompetitor,
}: {
  isImporting: boolean;
  hasAudit: boolean;
  importProgress: { current: number; total: number } | null;
  onImportCompetitor: (url: string) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState('');

  if (!enabled) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Swords className="w-4 h-4 text-muted-foreground" />
              <Label className="text-sm font-medium cursor-pointer">Enable Competitor Analysis</Label>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Swords className="w-4 h-4 text-primary" />
            <Label className="text-sm font-semibold">Competitor Product URL</Label>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Paste competitor Amazon URL..."
            value={url}
            onChange={e => setUrl(e.target.value)}
            disabled={isImporting || !hasAudit}
            className="text-sm"
          />
          <Button
            size="sm"
            onClick={() => onImportCompetitor(url)}
            disabled={!url || isImporting || !hasAudit}
          >
            {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Import className="w-4 h-4 mr-1" />}
            {isImporting ? 'Analyzing...' : 'Analyze'}
          </Button>
        </div>
        {!hasAudit && (
          <p className="text-xs text-muted-foreground">Run your audit first before comparing</p>
        )}
        {importProgress && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Analyzing competitor image {importProgress.current}/{importProgress.total}…
            </p>
            <Progress value={(importProgress.current / importProgress.total) * 100} className="h-1.5" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ReviewStep({
  assets, listingTitle, productAsin,
  competitorData, aiComparison, isLoadingAIComparison,
  isImportingCompetitor, competitorProgress,
  onSaveReport, onImportCompetitor, onLoadAudit, onGoToAudit,
  onViewDetails,
}: ReviewStepProps) {
  const [subTab, setSubTab] = useState('reports');
  const hasResults = assets.some(a => a.analysisResult);

  const analyzedAssets = assets.filter(a => a.analysisResult);
  const unresolvedAssets = assets.filter(isManualReviewAsset);
  const passedCount = analyzedAssets.filter(a => a.analysisResult?.status === 'PASS').length;
  const failedCount = analyzedAssets.filter(a =>
    (a.analysisResult?.status === 'FAIL' || a.analysisResult?.status === 'WARNING')
    && !unresolvedAssets.some(u => u.id === a.id)
  ).length;
  const fixedCount = assets.filter(a => a.fixedImage).length;
  const scores = analyzedAssets.map(a => a.analysisResult?.overallScore || 0);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const allClean = failedCount === 0 && unresolvedAssets.length === 0;

  if (!hasResults) {
    return (
      <EmptyState
        icon={Search}
        title="No Results to Review"
        description="Run a compliance audit first. Once complete, you can save reports, export results, and compare with competitors."
        actionLabel={onGoToAudit ? "Run an Audit First" : undefined}
        onAction={onGoToAudit}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Completion summary */}
      <Card className={allClean ? 'border-success/20 bg-success/5' : 'border-warning/20 bg-warning/5'}>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3">
            {allClean ? (
              <CheckCircle className="w-5 h-5 text-success flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0" />
            )}
            <div className="flex-1">
              <p className="text-sm font-semibold">
                {allClean
                  ? 'All Clear — Export or Save Your Report'
                  : unresolvedAssets.length > 0 && failedCount === 0
                    ? `${unresolvedAssets.length} image${unresolvedAssets.length !== 1 ? 's' : ''} need manual review`
                    : `${failedCount} issue${failedCount !== 1 ? 's' : ''} still need fixing${unresolvedAssets.length > 0 ? `, ${unresolvedAssets.length} need review` : ''}`
                }
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {analyzedAssets.length} images · {avgScore}% avg score
                {fixedCount > 0 && ` · ${fixedCount} fixed`}
                {unresolvedAssets.length > 0 && ` · ${unresolvedAssets.length} unresolved`}
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
              <Badge variant="outline" className="text-xs">{passedCount} passed</Badge>
              {failedCount > 0 && <Badge variant="destructive" className="text-xs">{failedCount} failed</Badge>}
              {fixedCount > 0 && <Badge className="bg-primary/15 text-primary border-primary/30 text-xs">{fixedCount} fixed</Badge>}
              {unresolvedAssets.length > 0 && (
                <Badge variant="warning" className="text-xs">
                  <AlertTriangle className="w-3 h-3 mr-0.5" />
                  {unresolvedAssets.length} review
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Unresolved / Manual Review section */}
      {unresolvedAssets.length > 0 && onViewDetails && (
        <ManualReviewLane assets={unresolvedAssets} onViewDetails={onViewDetails} />
      )}

      {/* Top action bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold">Review & Export</h3>
        <div className="flex items-center gap-2">
          <ClientReportGenerator assets={assets} listingTitle={listingTitle} productAsin={productAsin} competitorData={aiComparison} />
          <Button onClick={onSaveReport} variant="outline" size="sm">
            <Save className="h-4 w-4 mr-2" />
            Save to History
          </Button>
        </div>
      </div>

      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="reports" className="gap-1.5">
            <FileBarChart className="w-3.5 h-3.5" />
            Reports & History
          </TabsTrigger>
          <TabsTrigger value="compare" className="gap-1.5">
            <GitCompare className="w-3.5 h-3.5" />
            Competitor Analysis
          </TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: Reports ─── */}
        <TabsContent value="reports" className="mt-4">
          <ComplianceHistory onLoadAudit={onLoadAudit} />
        </TabsContent>

        {/* ─── Tab 2: Competitor ─── */}
        <TabsContent value="compare" className="space-y-4 mt-4">
          <CompetitorUrlInput
            isImporting={isImportingCompetitor}
            hasAudit={hasResults}
            importProgress={competitorProgress}
            onImportCompetitor={onImportCompetitor}
          />
          <CompetitorAudit
            yourAssets={assets}
            yourTitle={listingTitle}
            competitorData={competitorData}
            isImporting={isImportingCompetitor}
            importProgress={competitorProgress}
            onImportCompetitor={onImportCompetitor}
            aiComparison={aiComparison}
            isLoadingAIComparison={isLoadingAIComparison}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
