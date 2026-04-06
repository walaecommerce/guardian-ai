import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2, Import, BarChart3, TrendingUp, TrendingDown, Minus,
  CheckCircle, XCircle, AlertTriangle, ImageIcon, Lightbulb, ShieldCheck,
  Swords, Trophy, Target, Zap, ChevronRight,
} from 'lucide-react';
import { ImageAsset, ImageCategory } from '@/types';
import { supabase } from '@/integrations/supabase/client';

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

export interface AIComparisonResult {
  score_comparison: {
    your_score: number;
    competitor_score: number;
    winner: 'you' | 'competitor' | 'tie';
  };
  image_count_comparison: {
    your_count: number;
    competitor_count: number;
    slots_you_are_missing: number;
  };
  image_types_competitor_has_you_dont: {
    type: string;
    description: string;
    recommendation: string;
  }[];
  competitor_violations: {
    violation: string;
    severity: string;
    your_opportunity: string;
  }[];
  your_advantages: string[];
  priority_actions: {
    action: string;
    reason: string;
    impact: 'HIGH' | 'MEDIUM' | 'LOW';
  }[];
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
  aiComparison: AIComparisonResult | null;
  isLoadingAIComparison: boolean;
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

  const yourCats = new Set(Object.keys(yours.categories));
  const missingCategories = Object.keys(theirs.categories).filter(c => !yourCats.has(c));

  const competitorWeaknesses = competitor.violations
    .filter(v => v.severity === 'critical' || v.severity === 'warning')
    .map(v => v.message)
    .slice(0, 5);

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
  aiComparison,
  isLoadingAIComparison,
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
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Swords className="w-5 h-5 text-primary" />
              Competitor Intelligence
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
                {isImporting ? 'Importing...' : 'Analyze'}
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

  // ── Full comparison report with AI insights ──
  const { yourListing, competitor } = report;

  return (
    <div className="space-y-6">
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="ai-intel">
            AI Intelligence
            {isLoadingAIComparison && <Loader2 className="w-3 h-3 ml-1 animate-spin" />}
          </TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW TAB ── */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          {/* Side by side score gauges */}
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

          {/* Image slot comparison */}
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
        </TabsContent>

        {/* ── AI INTELLIGENCE TAB ── */}
        <TabsContent value="ai-intel" className="space-y-4 mt-4">
          {isLoadingAIComparison && (
            <Card>
              <CardContent className="py-12 text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
                <p className="text-sm font-medium">AI analyzing competitive landscape...</p>
                <p className="text-xs text-muted-foreground mt-1">This may take a moment</p>
              </CardContent>
            </Card>
          )}

          {!isLoadingAIComparison && !aiComparison && (
            <Card>
              <CardContent className="py-12 text-center">
                <Swords className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">AI comparison will appear here once generated</p>
              </CardContent>
            </Card>
          )}

          {aiComparison && (
            <>
              {/* Winner banner */}
              <Card className={
                aiComparison.score_comparison.winner === 'you'
                  ? 'border-green-500/50 bg-green-500/5'
                  : aiComparison.score_comparison.winner === 'competitor'
                  ? 'border-orange-500/50 bg-orange-500/5'
                  : 'border-primary/30'
              }>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Trophy className={`w-6 h-6 ${
                        aiComparison.score_comparison.winner === 'you' ? 'text-green-500' :
                        aiComparison.score_comparison.winner === 'competitor' ? 'text-orange-500' :
                        'text-primary'
                      }`} />
                      <div>
                        <p className="font-semibold">
                          {aiComparison.score_comparison.winner === 'you'
                            ? 'You\'re winning!'
                            : aiComparison.score_comparison.winner === 'competitor'
                            ? 'Competitor is ahead'
                            : 'It\'s a tie'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Your Score: {aiComparison.score_comparison.your_score}% vs Competitor: {aiComparison.score_comparison.competitor_score}%
                        </p>
                      </div>
                    </div>
                    {aiComparison.image_count_comparison.slots_you_are_missing > 0 && (
                      <Badge variant="outline" className="text-orange-600 border-orange-300">
                        {aiComparison.image_count_comparison.slots_you_are_missing} missing slots
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Your advantages (green) */}
              {aiComparison.your_advantages.length > 0 && (
                <Card className="border-green-500/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2 text-green-600">
                      <CheckCircle className="w-4 h-4" />
                      Your Advantages
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {aiComparison.your_advantages.map((adv, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                          <span>{adv}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Image types they have you don't (orange) */}
              {aiComparison.image_types_competitor_has_you_dont.length > 0 && (
                <Card className="border-orange-500/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2 text-orange-600">
                      <Target className="w-4 h-4" />
                      Gaps — Competitor Has, You Don't
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {aiComparison.image_types_competitor_has_you_dont.map((gap, i) => (
                        <div key={i} className="p-3 rounded-md bg-orange-500/5 border border-orange-500/20">
                          <p className="text-sm font-medium text-orange-700">{gap.type}</p>
                          <p className="text-xs text-muted-foreground mt-1">{gap.description}</p>
                          <p className="text-xs mt-1 flex items-center gap-1">
                            <ChevronRight className="w-3 h-3 text-orange-500" />
                            <span className="text-orange-600 font-medium">{gap.recommendation}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Competitor violations to exploit (red) */}
              {aiComparison.competitor_violations.length > 0 && (
                <Card className="border-red-500/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-600">
                      <XCircle className="w-4 h-4" />
                      Competitor Violations You Can Exploit
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {aiComparison.competitor_violations.map((cv, i) => (
                        <div key={i} className="p-3 rounded-md bg-red-500/5 border border-red-500/20">
                          <div className="flex items-center gap-2">
                            <Badge variant="destructive" className="text-[10px]">{cv.severity}</Badge>
                            <p className="text-sm font-medium">{cv.violation}</p>
                          </div>
                          <p className="text-xs text-green-600 mt-1 font-medium">
                            💡 {cv.your_opportunity}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Priority actions sorted by impact */}
              {aiComparison.priority_actions.length > 0 && (
                <Card className="border-primary/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Zap className="w-4 h-4 text-yellow-500" />
                      Priority Actions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {[...aiComparison.priority_actions]
                        .sort((a, b) => {
                          const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
                          return (order[a.impact] ?? 2) - (order[b.impact] ?? 2);
                        })
                        .map((action, i) => (
                          <div key={i} className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50">
                            <Badge
                              variant={action.impact === 'HIGH' ? 'destructive' : action.impact === 'MEDIUM' ? 'default' : 'secondary'}
                              className="text-[10px] mt-0.5 shrink-0"
                            >
                              {action.impact}
                            </Badge>
                            <div>
                              <p className="text-sm font-medium">{action.action}</p>
                              <p className="text-xs text-muted-foreground">{action.reason}</p>
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ── DETAILS TAB ── */}
        <TabsContent value="details" className="space-y-4 mt-4">
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
        </TabsContent>
      </Tabs>

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
