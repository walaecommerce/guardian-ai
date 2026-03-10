import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Loader2, ShieldCheck, LayoutGrid, Palette, Eye, Heart, Sparkles,
  TrendingUp, AlertTriangle, Target,
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

// ── Gauge Ring ───────────────────────────────────────────────

function GaugeRing({ score, label, icon: Icon, delay = 0 }: {
  score: number; label: string; icon: React.ElementType; delay?: number;
}) {
  const [animated, setAnimated] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      let start = 0;
      const duration = 1200;
      const startTime = performance.now();
      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // ease-out
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
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-24 h-24" ref={ref}>
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
        </div>
      </div>
      <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground text-center">
        <Icon className="w-3 h-3 shrink-0" />
        <span className="leading-tight">{label}</span>
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
          return {
            base64,
            type: asset.type,
            category,
            analysisScore: asset.analysisResult?.overallScore,
          };
        })
      );

      const { data: result, error: fnError } = await supabase.functions.invoke('listing-scorecard', {
        body: { images, listingTitle },
      });

      if (fnError) throw new Error(fnError.message);
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
              Generate a 6-dimension analysis beyond compliance
            </p>
          </div>
          <Button onClick={generateScorecard} disabled={loading} size="lg">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {loading ? 'Analyzing...' : 'Generate Score Card'}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    );
  }

  const overallHealth = Math.round(
    (data.compliance + data.completeness + data.diversity +
     data.textReadability + data.emotionalAppeal + data.brandConsistency) / 6
  );

  const healthColor = overallHealth >= 85 ? 'text-green-500' : overallHealth >= 70 ? 'text-yellow-500' : 'text-red-500';
  const healthBg = overallHealth >= 85 ? 'bg-green-500/10' : overallHealth >= 70 ? 'bg-yellow-500/10' : 'bg-red-500/10';

  const dimensions = [
    { score: data.compliance, label: 'Compliance', icon: ShieldCheck },
    { score: data.completeness, label: 'Completeness', icon: LayoutGrid },
    { score: data.diversity, label: 'Diversity', icon: Palette },
    { score: data.textReadability, label: 'Readability', icon: Eye },
    { score: data.emotionalAppeal, label: 'Emotion', icon: Heart },
    { score: data.brandConsistency, label: 'Brand', icon: Sparkles },
  ];

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            Listing Health Score Card
          </span>
          <Badge variant="outline" className={`text-lg px-3 py-1 ${healthColor} ${healthBg} border-0`}>
            {overallHealth}%
          </Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Overall Listing Health — average of 6 dimensions
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Hexagonal grid of gauges */}
        <div className="grid grid-cols-3 gap-y-5 gap-x-2 justify-items-center max-w-sm mx-auto">
          {dimensions.map((d, i) => (
            <GaugeRing key={d.label} score={d.score} label={d.label} icon={d.icon} delay={i * 150} />
          ))}
        </div>

        <Separator />

        {/* Priority Actions */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Priority Actions (ranked by sales impact)
          </h4>
          <ol className="space-y-2">
            {data.priorityActions.map((action, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  i === 0 ? 'bg-red-500/15 text-red-500' :
                  i === 1 ? 'bg-yellow-500/15 text-yellow-500' :
                  'bg-blue-500/15 text-blue-500'
                }`}>
                  {i + 1}
                </span>
                <span>{action}</span>
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
