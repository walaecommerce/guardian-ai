import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Loader2, Import, BarChart3, TrendingUp, TrendingDown, Minus,
  CheckCircle, XCircle, AlertTriangle, ImageIcon, Lightbulb, ShieldCheck,
} from 'lucide-react';
import { ImageAsset, ImageCategory } from '@/types';

// ── Types ────────────────────────────────────────────────────────

export interface CompetitorData {
  url: string;
  asin: string | null;
  title: string;
  assets: ImageAsset[];
  imageCount: number;
  passRate: number;
  overallScore: number;
  categories: Record<string, number>;
  violations: { severity: string; message: string }[];
}

export interface ComparisonReport {
  yourListing: ListingSummary;
  competitor: ListingSummary;
  missingCategories: string[];
  competitorWeaknesses: string[];
  recommendations: string[];
  imageCountAdvantage: 'yours' | 'competitor' | 'tied';
}

interface ListingSummary {
  title: string;
  imageCount: number;
  maxAllowed: number;
  passRate: number;
  overallScore: number;
  categories: Record<string, number>;
  totalViolations: number;
  criticalViolations: number;
}

interface CompetitorAuditProps {
  yourAssets: ImageAsset[];
  yourTitle: string;
  competitorData: CompetitorData | null;
  isImporting: boolean;
  importProgress: { current: number; total: number } | null;
  onImportCompetitor: (url: string) => void;
}

// ── Helpers ──────────────────────────────────────────────────────

const AMAZON_MAX_IMAGES = 9;

const ALL_CATEGORIES: string[] = [
  'PRODUCT_SHOT', 'INFOGRAPHIC', 'LIFESTYLE', 'PRODUCT_IN_USE',
  'SIZE_CHART', 'COMPARISON', 'PACKAGING', 'DETAIL',
];

const categoryLabel = (cat: string) =>
  cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

function buildSummary(assets: ImageAsset[], title: string): ListingSummary {
  const analyzed = assets.filter(a => a.analysisResult);
  const passed = analyzed.filter(a => a.analysisResult?.status === 'PASS').length;
  const scores = analyzed.map(a => a.analysisResult!.overallScore);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  const cats: Record<string, number> = {};
  assets.forEach(a => {
    const cat = a.name.split('_')[0] || 'UNKNOWN';
    cats[cat] = (cats[cat] || 0) + 1;
  });

  const allViolations = analyzed.flatMap(a => a.analysisResult?.violations || []);

  return {
    title,
    imageCount: assets.length,
    maxAllowed: AMAZON_MAX_IMAGES,
    passRate: analyzed.length ? Math.round((passed / analyzed.length) * 100) : 0,
    overallScore: avgScore,
    categories: cats,
    totalViolations: allViolations.length,
    criticalViolations: allViolations.filter(v => v.severity === 'critical').length,
  };
}

export function buildComparisonReport(
  yourAssets: ImageAsset[],
  yourTitle: string,
  competitor: CompetitorData,
): ComparisonReport {
  const yours = buildSummary(yourAssets, yourTitle);
  const theirs: ListingSummary = {
    title: competitor.title,
    imageCount: competitor.imageCount,
    maxAllowed: AMAZON_MAX_IMAGES,
    passRate: competitor.passRate,
    overallScore: competitor.overallScore,
    categories: competitor.categories,
    totalViolations: competitor.violations.length,
    criticalViolations: competitor.violations.filter(v => v.severity === 'critical').length,
  };

  // Categories they have that you don't
  const yourCats = new Set(Object.keys(yours.categories));
  const missingCategories = Object.keys(theirs.categories).filter(c => !yourCats.has(c));

  // Competitor weaknesses (their violations you can exploit)
  const competitorWeaknesses = competitor.violations
    .filter(v => v.severity === 'critical' || v.severity === 'warning')
    .map(v => v.message)
    .slice(0, 5);

  // Recommendations
  const recommendations: string[] = [];

  if (yours.imageCount < AMAZON_MAX_IMAGES) {
    recommendations.push(
      `You're using ${yours.imageCount}/${AMAZON_MAX_IMAGES} image slots. Add ${AMAZON_MAX_IMAGES - yours.imageCount} more images to maximize visibility.`
    );
  }

  missingCategories.forEach(cat => {
    recommendations.push(
      `Your competitor has ${categoryLabel(cat)} images that you're missing. Consider adding this content type.`
    );
  });

  if (theirs.criticalViolations > 0) {
    recommendations.push(
      `Your competitor has ${theirs.criticalViolations} critical violation(s). Ensure your listing is fully compliant to gain a competitive edge.`
    );
  }

  if (yours.overallScore < theirs.overallScore) {
    recommendations.push(
      `Your compliance score (${yours.overallScore}%) is lower than competitor's (${theirs.overallScore}%). Fix violations to overtake.`
    );
  } else if (yours.overallScore > theirs.overallScore) {
    recommendations.push(
      `Your compliance score (${yours.overallScore}%) exceeds competitor's (${theirs.overallScore}%). You have a compliance advantage!`
    );
  }

  if (theirs.imageCount > yours.imageCount) {
    recommendations.push(
      `Competitor uses ${theirs.imageCount} images vs your ${yours.imageCount}. More images typically improve conversion.`
    );
  }

  const imageCountAdvantage =
    yours.imageCount > theirs.imageCount ? 'yours' :
    yours.imageCount < theirs.imageCount ? 'competitor' : 'tied';

  return {
    yourListing: yours,
    competitor: theirs,
    missingCategories,
    competitorWeaknesses,
    recommendations,
    imageCountAdvantage,
  };
}

// ── Component ────────────────────────────────────────────────────

export function CompetitorAudit({
  yourAssets,
  yourTitle,
  competitorData,
  isImporting,
  importProgress,
  onImportCompetitor,
}: CompetitorAuditProps) {
  const [competitorUrl, setCompetitorUrl] = useState('');
  const hasYourAudit = yourAssets.some(a => a.analysisResult);
  const report = competitorData && hasYourAudit
    ? buildComparisonReport(yourAssets, yourTitle, competitorData)
    : null;

  // ── Import section (no report yet) ──
  if (!report) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="w-5 h-5 text-primary" />
              Competitor Audit
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!hasYourAudit && (
              <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                <AlertTriangle className="w-4 h-4 inline mr-1" />
                Run a batch audit on your listing first, then import a competitor to compare.
              </div>
            )}

            <div className="flex gap-2">
              <Input
                placeholder="Paste competitor Amazon URL..."
                value={competitorUrl}
                onChange={e => setCompetitorUrl(e.target.value)}
                disabled={isImporting || !hasYourAudit}
              />
              <Button
                onClick={() => onImportCompetitor(competitorUrl)}
                disabled={!competitorUrl || isImporting || !hasYourAudit}
              >
                {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Import className="w-4 h-4 mr-1" />}
                {isImporting ? 'Importing...' : 'Import'}
              </Button>
            </div>

            {importProgress && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  Analyzing competitor image {importProgress.current} of {importProgress.total}...
                </p>
                <Progress value={(importProgress.current / importProgress.total) * 100} className="h-2" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Full comparison report ──
  const { yourListing, competitor } = report;

  return (
    <div className="space-y-6">
      {/* Header scores */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ScoreCard
          label="Your Listing"
          title={yourListing.title}
          score={yourListing.overallScore}
          passRate={yourListing.passRate}
          imageCount={yourListing.imageCount}
          maxImages={AMAZON_MAX_IMAGES}
          violations={yourListing.totalViolations}
          accent="primary"
        />
        <ScoreCard
          label="Competitor"
          title={competitor.title}
          score={competitor.overallScore}
          passRate={competitor.passRate}
          imageCount={competitor.imageCount}
          maxImages={AMAZON_MAX_IMAGES}
          violations={competitor.totalViolations}
          accent="secondary"
        />
      </div>

      {/* Image slot comparison bar */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ImageIcon className="w-4 h-4" />
            Image Slot Usage (Amazon allows {AMAZON_MAX_IMAGES})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SlotBar label="You" count={yourListing.imageCount} max={AMAZON_MAX_IMAGES} color="bg-primary" />
          <SlotBar label="Competitor" count={competitor.imageCount} max={AMAZON_MAX_IMAGES} color="bg-orange-500" />
        </CardContent>
      </Card>

      {/* Category comparison */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Image Category Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div className="font-medium text-muted-foreground">Category</div>
            <div className="grid grid-cols-2 gap-2 font-medium text-muted-foreground">
              <span>You</span>
              <span>Competitor</span>
            </div>
            {ALL_CATEGORIES.map(cat => {
              const yourCount = yourListing.categories[cat] || 0;
              const theirCount = competitor.categories[cat] || 0;
              const isMissing = theirCount > 0 && yourCount === 0;
              return (
                <div key={cat} className="contents">
                  <div className="flex items-center gap-1">
                    {categoryLabel(cat)}
                    {isMissing && <Badge variant="destructive" className="text-[10px] px-1 py-0">MISSING</Badge>}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <span className={yourCount === 0 ? 'text-muted-foreground' : ''}>{yourCount}</span>
                    <span className={theirCount === 0 ? 'text-muted-foreground' : ''}>{theirCount}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Competitor Weaknesses */}
      {report.competitorWeaknesses.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-green-500" />
              Competitor Weaknesses (Exploit These)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {report.competitorWeaknesses.map((w, i) => (
                <li key={i} className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      <Card className="border-primary/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-yellow-500" />
            Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {report.recommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <TrendingUp className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Re-import */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-2">
            <Input
              placeholder="Compare with another competitor..."
              value={competitorUrl}
              onChange={e => setCompetitorUrl(e.target.value)}
              disabled={isImporting}
            />
            <Button onClick={() => onImportCompetitor(competitorUrl)} disabled={!competitorUrl || isImporting} size="sm">
              {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Compare'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────

function ScoreCard({
  label, title, score, passRate, imageCount, maxImages, violations, accent,
}: {
  label: string; title: string; score: number; passRate: number;
  imageCount: number; maxImages: number; violations: number; accent: string;
}) {
  const scoreColor = score >= 85 ? 'text-green-500' : score >= 70 ? 'text-yellow-500' : 'text-red-500';

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <Badge variant={accent === 'primary' ? 'default' : 'secondary'} className="text-xs">
            {label}
          </Badge>
          <span className={`text-2xl font-bold ${scoreColor}`}>{score}%</span>
        </div>
        <p className="text-sm font-medium line-clamp-2">{title}</p>
        <Separator />
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <div className="font-bold text-lg">{imageCount}/{maxImages}</div>
            <div className="text-muted-foreground">Images</div>
          </div>
          <div>
            <div className="font-bold text-lg">{passRate}%</div>
            <div className="text-muted-foreground">Pass Rate</div>
          </div>
          <div>
            <div className="font-bold text-lg text-red-500">{violations}</div>
            <div className="text-muted-foreground">Violations</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SlotBar({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{count} / {max}</span>
      </div>
      <div className="h-3 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min((count / max) * 100, 100)}%` }}
        />
      </div>
    </div>
  );
}
