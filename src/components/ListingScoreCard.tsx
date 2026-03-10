import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Loader2, ShieldCheck, LayoutGrid, Palette, Eye, Heart, Sparkles,
  TrendingUp, Target,
} from 'lucide-react';
import { ImageAsset } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ── Types ────────────────────────────────────────────────────

export interface ScorecardData {
  compliance: number;
  completeness: number;
  diversity: number;
  textReadability: number;
  emotionalAppeal: number;
  brandConsistency: number;
  priorityActions: string[];
}

interface ListingScoreCardProps {
  assets: ImageAsset[];
  listingTitle: string;
}

// ── Weights ──────────────────────────────────────────────────

const WEIGHTS = {
  compliance: 0.30,
  completeness: 0.20,
  diversity: 0.15,
  textReadability: 0.15,
  emotionalAppeal: 0.10,
  brandConsistency: 0.10,
};

// ── Dimension metadata ───────────────────────────────────────

const DIMENSIONS: {
  key: keyof typeof WEIGHTS;
  label: string;
  icon: React.ElementType;
  tooltip: string;
}[] = [
  {
    key: 'compliance',
    label: 'Compliance',
    icon: ShieldCheck,
    tooltip: 'Amazon image policy compliance — pure white backgrounds, no prohibited badges, correct product framing.',
  },
  {
    key: 'completeness',
    label: 'Completeness',
    icon: LayoutGrid,
    tooltip: 'Image slot usage — Amazon allows 9 images. Using all 9 slots maximizes listing visibility and conversion.',
  },
  {
    key: 'diversity',
    label: 'Diversity',
    icon: Palette,
    tooltip: 'Image type variety — hero shot, lifestyle, infographic, ingredients close-up, size reference, brand story.',
  },
  {
    key: 'textReadability',
    label: 'Readability',
    icon: Eye,
    tooltip: 'Text readability on mobile — font size, contrast, density. Most Amazon shoppers browse on phones.',
  },
  {
    key: 'emotionalAppeal',
    label: 'Emotion',
    icon: Heart,
    tooltip: 'Emotional appeal — aspirational lifestyle imagery, appetizing food presentation, professional photography quality.',
  },
  {
    key: 'brandConsistency',
    label: 'Brand',
    icon: Sparkles,
    tooltip: 'Brand consistency — unified color palette, typography, and visual style across all listing images.',
  },
];

// ── Animated Gauge Ring ──────────────────────────────────────

function GaugeRing({ score, label, icon: Icon, tooltip, delay = 0, weight }: {
  score: number; label: string; icon: React.ElementType;
  tooltip: string; delay?: number; weight: number;
}) {
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const duration = 1200;
      const startTime = performance.now();
      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setAnimated(Math.round(eased * score));
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }, delay);
    return () => clearTimeout(timeout);
  }, [score, delay]);

  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animated / 100) * circumference;
  const color = animated >= 85 ? 'hsl(var(--chart-2))' : animated >= 70 ? 'hsl(45 93% 47%)' : 'hsl(0 84% 60%)';

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex flex-col items-center gap-1.5 cursor-help">
            <div className="relative w-[104px] h-[104px]">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 96 96">
                <circle cx="48" cy="48" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
                <circle
                  cx="48" cy="48" r={radius} fill="none"
                  stroke={color} strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={circumference} strokeDashoffset={offset}
                  style={{ transition: 'stroke-dashoffset 0.1s linear' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold" style={{ color }}>{animated}</span>
                <span className="text-[9px] text-muted-foreground font-medium">×{(weight * 100).toFixed(0)}%</span>
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground text-center">
              <Icon className="w-3 h-3 shrink-0" />
              <span className="leading-tight">{label}</span>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[220px] text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Large Health Score Ring ───────────────────────────────────

function HealthScoreRing({ score }: { score: number }) {
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    const duration = 1500;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimated(Math.round(eased * score));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [score]);

  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animated / 100) * circumference;
  const color = animated >= 85 ? 'hsl(var(--chart-2))' : animated >= 70 ? 'hsl(45 93% 47%)' : 'hsl(0 84% 60%)';
  const bgGlow = animated >= 85 ? 'shadow-green-500/20' : animated >= 70 ? 'shadow-yellow-500/20' : 'shadow-red-500/20';

  return (
    <div className={`relative w-36 h-36 mx-auto shadow-lg rounded-full ${bgGlow}`}>
      <svg className="w-full h-full -rotate-90" viewBox="0 0 144 144">
        <circle cx="72" cy="72" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
        <circle
          cx="72" cy="72" r={radius} fill="none"
          stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.1s linear' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold" style={{ color }}>{animated}</span>
        <span className="text-[10px] text-muted-foreground font-medium tracking-wide uppercase">Health</span>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────

export function ListingScoreCard({ assets, listingTitle }: ListingScoreCardProps) {
  const [data, setData] = useState<ScorecardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const hasAnalyzedAssets = assets.some(a => a.analysisResult);

  const generateScorecard = async () => {
    setLoading(true);
    setError(null);

    try {
      const images = await Promise.all(
        assets.slice(0, 9).map(async (asset) => {
          const base64 = await fileToBase64(asset.file);
          const category = asset.name.split('_')[0] || 'UNKNOWN';
          const result = asset.analysisResult as any;
          return {
            base64,
            type: asset.type,
            category,
            analysisScore: result?.overallScore,
            textReadabilityScore: result?.textReadabilityScore ?? null,
            emotionalAppealScore: result?.emotionalAppealScore ?? null,
          };
        })
      );

      const { data: result, error: fnError } = await supabase.functions.invoke('listing-scorecard', {
        body: { images, listingTitle },
      });

      if (fnError) throw new Error(fnError.message);
      if (result?.error) throw new Error(result.error);
      setData(result as ScorecardData);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Scorecard generation failed';
      setError(msg);
      toast({ title: 'Scorecard Error', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!hasAnalyzedAssets) return null;

  if (!data) {
    return (
      <Card className="border-primary/20">
        <CardContent className="pt-6 flex flex-col items-center gap-4">
          <div className="text-center space-y-1">
            <h3 className="text-lg font-semibold flex items-center gap-2 justify-center">
              <Target className="w-5 h-5 text-primary" />
              Listing Health Score Card
            </h3>
            <p className="text-sm text-muted-foreground">
              6-dimension analysis: compliance, completeness, diversity, readability, emotion, brand
            </p>
          </div>
          <Button onClick={generateScorecard} disabled={loading} size="lg">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {loading ? 'Analyzing All Dimensions...' : 'Generate Score Card'}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    );
  }

  // Weighted health score
  const overallHealth = Math.round(
    data.compliance * WEIGHTS.compliance +
    data.completeness * WEIGHTS.completeness +
    data.diversity * WEIGHTS.diversity +
    data.textReadability * WEIGHTS.textReadability +
    data.emotionalAppeal * WEIGHTS.emotionalAppeal +
    data.brandConsistency * WEIGHTS.brandConsistency
  );

  const healthLabel =
    overallHealth >= 85 ? 'Excellent' :
    overallHealth >= 70 ? 'Good' :
    overallHealth >= 50 ? 'Needs Work' : 'Poor';

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-base">
            <Target className="w-5 h-5 text-primary" />
            Listing Health Score Card
          </span>
          <Badge variant="outline" className="text-xs">
            {healthLabel}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Central health score */}
        <div className="text-center space-y-1">
          <HealthScoreRing score={overallHealth} />
          <p className="text-xs text-muted-foreground mt-2">
            Weighted average of 6 dimensions
          </p>
        </div>

        <Separator />

        {/* Hexagonal grid of 6 gauges */}
        <div className="grid grid-cols-3 gap-y-5 gap-x-2 justify-items-center max-w-md mx-auto">
          {DIMENSIONS.map((d, i) => (
            <GaugeRing
              key={d.key}
              score={data[d.key]}
              label={d.label}
              icon={d.icon}
              tooltip={d.tooltip}
              weight={WEIGHTS[d.key]}
              delay={i * 150}
            />
          ))}
        </div>

        <Separator />

        {/* Priority Actions */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Top 3 Priority Actions
          </h4>
          <ol className="space-y-2.5">
            {data.priorityActions.slice(0, 3).map((action, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  i === 0 ? 'bg-red-500/15 text-red-600' :
                  i === 1 ? 'bg-yellow-500/15 text-yellow-600' :
                  'bg-blue-500/15 text-blue-600'
                }`}>
                  {i + 1}
                </span>
                <span className="leading-relaxed">{action}</span>
              </li>
            ))}
          </ol>
        </div>

        <Button variant="outline" size="sm" onClick={generateScorecard} disabled={loading} className="w-full">
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
          Refresh Score Card
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
