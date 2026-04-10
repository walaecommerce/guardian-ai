import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Loader2, Sparkles, ImagePlus, Zap, Type, Image as ImageIcon, Lightbulb } from 'lucide-react';
import { ImageAsset } from '@/types';
import { extractImageCategory, getDominantProductCategory } from '@/utils/imageCategory';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SuggestionsData } from './types';
import { MissingImagesTab } from './MissingImagesTab';
import { QuickWinsTab } from './QuickWinsTab';
import { ImageImprovementsTab } from './ImageImprovementsTab';
import { TitleImprovementsTab } from './TitleImprovementsTab';

interface Props {
  assets: ImageAsset[];
  listingTitle: string;
  onImageGenerated?: (imageUrl: string, imageType: string) => void;
  onApplyFix?: (assetId: string, prompt: string) => void;
}

export function RecommendationsPanel({ assets, listingTitle, onImageGenerated, onApplyFix }: Props) {
  const [data, setData] = useState<SuggestionsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const hasAnalyzedAssets = assets.some(a => a.analysisResult);

  const generateSuggestions = async () => {
    setLoading(true);
    setError(null);

    try {
      const analyzedAssets = assets.filter(a => a.analysisResult);

      const auditResults = analyzedAssets.map(a => ({
        name: a.name,
        type: a.type,
        score: a.analysisResult!.overallScore,
        status: a.analysisResult!.status,
        violations: a.analysisResult!.violations.map(v => ({
          severity: v.severity,
          category: v.category,
          message: v.message,
        })),
        fixRecommendations: a.analysisResult!.fixRecommendations,
      }));

      // Run deterministic title analysis to pass to backend
      const { analyzeTitleCompliance } = await import('@/utils/titleAnalyzer');
      const titleCompliance = analyzeTitleCompliance(listingTitle);
      const titleRuleViolations = titleCompliance.findings.filter(f => !f.passed);

      // Compute missing coverage types deterministically (same logic as listing-scorecard)
      const COVERAGE_ALIASES: Record<string, string[]> = {
        'Hero / Main Image': ['PRODUCT_SHOT', 'MAIN', 'HERO'],
        'Lifestyle / In-Use Image': ['LIFESTYLE', 'PRODUCT_IN_USE', 'IN_USE'],
        'Infographic / Feature Callout': ['INFOGRAPHIC', 'CALLOUT', 'FEATURES'],
        'Detail / Supporting Image': ['DETAIL', 'PACKAGING', 'SIZE_CHART', 'COMPARISON', 'INGREDIENTS', 'CLOSEUP'],
      };

      const imageCategories = new Set<string>(
        assets.map(a => extractImageCategory(a))
      );

      const missingCoverageTypes: string[] = [];
      for (const [label, aliases] of Object.entries(COVERAGE_ALIASES)) {
        if (!aliases.some(alias => imageCategories.has(alias))) {
          missingCoverageTypes.push(label);
        }
      }

      const { data: result, error: fnError } = await supabase.functions.invoke('generate-suggestions', {
        body: {
          listingTitle,
          auditResults,
          imageCount: assets.length,
          titleRuleViolations,
          missingCoverageTypes,
        },
      });

      if (fnError) throw new Error(fnError.message);
      if (result?.error) throw new Error(result.error);
      setData(result as SuggestionsData);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to generate suggestions';
      setError(msg);
      toast({ title: 'Suggestions Error', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!hasAnalyzedAssets) return null;

  if (!data) {
    return (
      <Card className="glass-card border-primary/20">
        <CardContent className="pt-6 flex flex-col items-center gap-4">
          <div className="text-center space-y-1">
            <h3 className="text-lg font-semibold flex items-center gap-2 justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
              AI Improvement Suggestions
            </h3>
            <p className="text-sm text-muted-foreground">
              Get AI-powered recommendations to boost compliance and conversion
            </p>
          </div>
          <Button onClick={generateSuggestions} disabled={loading} size="lg">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {loading ? 'Analyzing listing...' : 'Generate Suggestions'}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    );
  }

  const totalSuggestions =
    (data.missing_image_types?.length || 0) +
    (data.quick_wins?.length || 0) +
    (data.title_improvements?.length || 0) +
    (data.image_improvements?.length || 0);

  return (
    <div className="space-y-4">
      {/* Strategy overview */}
      {data.overall_strategy && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-2">
              <Lightbulb className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold mb-1">Overall Strategy</p>
                <p className="text-xs text-muted-foreground">{data.overall_strategy}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-base">
              <Sparkles className="w-5 h-5 text-primary" />
              AI Suggestions
            </span>
            <Badge variant="outline" className="text-sm">
              {totalSuggestions} suggestions
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="missing" className="w-full">
            <TabsList className="w-full grid grid-cols-4">
              <TabsTrigger value="missing" className="text-xs">
                <ImagePlus className="w-3 h-3 mr-1" />
                Missing ({data.missing_image_types?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="quickwins" className="text-xs">
                <Zap className="w-3 h-3 mr-1" />
                Quick Wins ({data.quick_wins?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="images" className="text-xs">
                <ImageIcon className="w-3 h-3 mr-1" />
                Images ({data.image_improvements?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="title" className="text-xs">
                <Type className="w-3 h-3 mr-1" />
                Title ({data.title_improvements?.length || 0})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="missing" className="mt-3">
              <MissingImagesTab items={data.missing_image_types || []} onImageGenerated={onImageGenerated} listingTitle={listingTitle} category={getDominantProductCategory(assets)} />
            </TabsContent>
            <TabsContent value="quickwins" className="mt-3">
              <QuickWinsTab items={data.quick_wins || []} />
            </TabsContent>
            <TabsContent value="images" className="mt-3">
              <ImageImprovementsTab items={data.image_improvements || []} assets={assets} onApplyFix={onApplyFix} />
            </TabsContent>
            <TabsContent value="title" className="mt-3">
              <TitleImprovementsTab items={data.title_improvements || []} listingTitle={listingTitle} />
            </TabsContent>
          </Tabs>

          <Separator className="my-4" />
          <Button variant="outline" size="sm" onClick={generateSuggestions} disabled={loading} className="w-full">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Refresh Suggestions
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export { type SuggestionsData };
