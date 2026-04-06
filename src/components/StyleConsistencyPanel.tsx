import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Palette, Sun, Type, RotateCcw, Layers, Fingerprint,
  AlertTriangle, CheckCircle2, Loader2, TrendingUp,
  Lightbulb
} from 'lucide-react';
import { StyleConsistencyResult, StyleDimensionScore } from '@/types';

interface Props {
  result: StyleConsistencyResult | null;
  loading: boolean;
  imageCount: number;
}

const DIMENSION_CONFIG = {
  colorPalette: { label: 'Color Palette', icon: Palette, weight: '20%' },
  lighting: { label: 'Lighting', icon: Sun, weight: '15%' },
  typography: { label: 'Typography', icon: Type, weight: '15%' },
  productAngle: { label: 'Product Angle', icon: RotateCcw, weight: '15%' },
  background: { label: 'Background', icon: Layers, weight: '15%' },
  brandIdentity: { label: 'Brand Identity', icon: Fingerprint, weight: '20%' },
} as const;

function getScoreColor(score: number): string {
  if (score >= 85) return 'text-primary';
  if (score >= 70) return 'text-accent-foreground';
  if (score >= 50) return 'text-destructive/80';
  return 'text-destructive';
}

function getScoreLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Good';
  if (score >= 65) return 'Fair';
  if (score >= 50) return 'Needs Work';
  return 'Poor';
}

function getProgressColor(score: number): string {
  if (score >= 85) return 'bg-primary';
  if (score >= 70) return 'bg-accent-foreground';
  if (score >= 50) return 'bg-destructive/80';
  return 'bg-destructive';
}

function ScoreGauge({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 40;
  const dashOffset = circumference - (score / 100) * circumference;
  const color = score >= 85 ? 'hsl(var(--primary))' : score >= 70 ? 'hsl(var(--accent-foreground))' : 'hsl(var(--destructive))';

  return (
    <div className="relative w-28 h-28 mx-auto">
      <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted/20" />
        <circle
          cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={circumference} strokeDashoffset={dashOffset}
          strokeLinecap="round" className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-bold ${getScoreColor(score)}`}>{score}</span>
        <span className="text-[10px] text-muted-foreground">{getScoreLabel(score)}</span>
      </div>
    </div>
  );
}

export function StyleConsistencyPanel({ result, loading, imageCount }: Props) {
  if (loading) {
    return (
      <Card className="glass-card border-primary/20">
        <CardContent className="py-8 flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Analyzing style consistency across {imageCount} images...</p>
        </CardContent>
      </Card>
    );
  }

  if (!result) return null;

  const dimensions = result.dimensions;
  const allIssues = Object.values(dimensions).flatMap((d: StyleDimensionScore) => d.issues || []);

  return (
    <div className="space-y-4">
      {/* Overall Score Card */}
      <Card className="glass-card border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="w-5 h-5 text-primary" />
            Listing Style Coherence
            <Badge variant="outline" className="ml-auto text-xs">{imageCount} images</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-6">
            <ScoreGauge score={result.overallScore} />
            <div className="flex-1 space-y-2">
              <p className="text-sm text-foreground/80">{result.verdict}</p>
              {allIssues.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-destructive/80">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {allIssues.length} consistency issue{allIssues.length !== 1 ? 's' : ''} found
                </div>
              )}
              {allIssues.length === 0 && (
                <div className="flex items-center gap-1.5 text-xs text-primary">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  No major consistency issues
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Dimension Breakdown */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dimension Scores</p>
            <TooltipProvider>
              <div className="grid gap-2.5">
                {(Object.entries(DIMENSION_CONFIG) as [keyof typeof DIMENSION_CONFIG, typeof DIMENSION_CONFIG[keyof typeof DIMENSION_CONFIG]][]).map(([key, cfg]) => {
                  const dim = dimensions[key];
                  if (!dim) return null;
                  const Icon = cfg.icon;

                  return (
                    <Tooltip key={key}>
                      <TooltipTrigger asChild>
                        <div className="space-y-1 cursor-default">
                          <div className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5 text-foreground/80">
                              <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                              {cfg.label}
                              <span className="text-muted-foreground/60">({cfg.weight})</span>
                            </span>
                            <span className={`font-semibold ${getScoreColor(dim.score)}`}>{dim.score}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted/20 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${getProgressColor(dim.score)}`}
                              style={{ width: `${dim.score}%` }}
                            />
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs">
                        <p className="text-xs font-medium mb-1">{cfg.label}</p>
                        <p className="text-xs text-muted-foreground">{dim.assessment}</p>
                        {dim.issues?.length > 0 && (
                          <ul className="mt-1.5 space-y-0.5">
                            {dim.issues.map((issue, i) => (
                              <li key={i} className="text-xs text-destructive/70 flex items-start gap-1">
                                <span className="mt-0.5">•</span>
                                {issue}
                              </li>
                            ))}
                          </ul>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>

      {/* Recommendations */}
      {result.recommendations?.length > 0 && (
        <Card className="glass-card border-primary/10">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Lightbulb className="w-4 h-4 text-primary" />
              Consistency Improvements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {result.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                  <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">{i + 1}</Badge>
                  {rec}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Weakest Pairs */}
      {result.weakestPairs?.length > 0 && (
        <Card className="glass-card border-destructive/10">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="w-4 h-4 text-destructive/80" />
              Weakest Image Pairs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {result.weakestPairs.map((pair, i) => (
                <li key={i} className="text-xs text-foreground/70 flex items-start gap-2">
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    #{pair.imageA + 1} ↔ #{pair.imageB + 1}
                  </Badge>
                  <span>{pair.reason}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
