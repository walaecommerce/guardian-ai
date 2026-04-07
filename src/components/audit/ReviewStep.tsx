import { useState } from 'react';
import { ListingScoreCard } from '@/components/ListingScoreCard';
import { RecommendationsPanel } from '@/components/recommendations/RecommendationsPanel';
import { ClientReportGenerator } from '@/components/ClientReportGenerator';
import { ProductIdentityPanel } from '@/components/ProductIdentityPanel';
import { StyleConsistencyPanel } from '@/components/StyleConsistencyPanel';
import { CompetitorAudit, CompetitorData, AIComparisonResult } from '@/components/CompetitorAudit';
import { ComplianceHistory, AuditHistoryEntry } from '@/components/ComplianceHistory';
import { ComplianceReportCard } from '@/components/ComplianceReportCard';
import { ImageAsset, ProductIdentityCard, StyleConsistencyResult } from '@/types';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Save, Swords, Loader2, Import, ClipboardCheck, GitCompare, FileBarChart } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface ReviewStepProps {
  assets: ImageAsset[];
  listingTitle: string;
  productAsin: string | null;
  productIdentity: ProductIdentityCard | null;
  styleConsistency: StyleConsistencyResult | null;
  isAnalyzingStyle: boolean;
  competitorData: CompetitorData | null;
  aiComparison: AIComparisonResult | null;
  isLoadingAIComparison: boolean;
  isImportingCompetitor: boolean;
  competitorProgress: { current: number; total: number } | null;
  isAnalyzing: boolean;
  onSaveReport: () => void;
  onApplyFix: (assetId: string, prompt?: string) => void;
  onImportCompetitor: (url: string) => void;
  onLoadAudit: (entry: AuditHistoryEntry) => void;
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
              Analyzing competitor image {importProgress.current}/{importProgress.total}...
            </p>
            <Progress value={(importProgress.current / importProgress.total) * 100} className="h-1.5" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ReviewStep({
  assets, listingTitle, productAsin, productIdentity, styleConsistency,
  isAnalyzingStyle, competitorData, aiComparison, isLoadingAIComparison,
  isImportingCompetitor, competitorProgress, isAnalyzing,
  onSaveReport, onApplyFix, onImportCompetitor, onLoadAudit,
}: ReviewStepProps) {
  const [subTab, setSubTab] = useState('audit');
  const hasResults = assets.some(a => a.analysisResult);

  return (
    <div className="space-y-4">
      {/* Top action bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold">Review & Export</h3>
        {hasResults && (
          <div className="flex items-center gap-2">
            <ClientReportGenerator assets={assets} listingTitle={listingTitle} productAsin={productAsin} competitorData={aiComparison} />
            <Button onClick={onSaveReport} variant="outline" size="sm">
              <Save className="h-4 w-4 mr-2" />
              Save Report
            </Button>
          </div>
        )}
      </div>

      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="audit" className="gap-1.5">
            <ClipboardCheck className="w-3.5 h-3.5" />
            Audit
          </TabsTrigger>
          <TabsTrigger value="compare" className="gap-1.5">
            <GitCompare className="w-3.5 h-3.5" />
            Fix & Compare
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5">
            <FileBarChart className="w-3.5 h-3.5" />
            Reports
          </TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: Audit ─── */}
        <TabsContent value="audit" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              {productIdentity && <ProductIdentityPanel identity={productIdentity} />}
              <ListingScoreCard assets={assets} listingTitle={listingTitle} />
            </div>
            <div className="space-y-4">
              <ComplianceReportCard assets={assets} isAnalyzing={isAnalyzing} />
              <StyleConsistencyPanel
                result={styleConsistency}
                loading={isAnalyzingStyle}
                imageCount={assets.filter(a => a.analysisResult).length}
              />
            </div>
          </div>
        </TabsContent>

        {/* ─── Tab 2: Fix & Compare ─── */}
        <TabsContent value="compare" className="space-y-4 mt-4">
          <RecommendationsPanel
            assets={assets}
            listingTitle={listingTitle}
            onApplyFix={(assetId, prompt) => onApplyFix(assetId, prompt)}
          />
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

        {/* ─── Tab 3: Reports ─── */}
        <TabsContent value="reports" className="mt-4">
          <ComplianceHistory onLoadAudit={onLoadAudit} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
