import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Loader2, Sparkles, ImagePlus, Zap, Type, Target,
  ArrowRight, Download, ChevronDown, ChevronUp,
} from 'lucide-react';
import { ImageAsset, AnalysisResult } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ── Types ────────────────────────────────────────────────────

export interface SuggestionsData {
  missing_image_types: {
    type: string;
    description: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    example_prompt: string;
  }[];
  title_improvements: {
    issue: string;
    suggestion: string;
  }[];
  quick_wins: {
    action: string;
    estimated_impact: string;
    effort: 'LOW' | 'MEDIUM' | 'HIGH';
  }[];
  competitive_gaps: {
    gap: string;
    recommendation: string;
  }[];
}

interface AIRecommendationsProps {
  assets: ImageAsset[];
  listingTitle: string;
  onImageGenerated?: (imageUrl: string, imageType: string) => void;
}

// ── Priority Colors ──────────────────────────────────────────

const priorityStyles: Record<string, string> = {
  HIGH: 'bg-red-500/15 text-red-600 border-red-500/30',
  MEDIUM: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30',
  LOW: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
};

const effortStyles: Record<string, { bg: string; label: string }> = {
  LOW: { bg: 'bg-green-500/15 text-green-600', label: '⚡ Low Effort' },
  MEDIUM: { bg: 'bg-yellow-500/15 text-yellow-600', label: '🔧 Medium Effort' },
  HIGH: { bg: 'bg-red-500/15 text-red-600', label: '🏗️ High Effort' },
};

// ── Component ────────────────────────────────────────────────

export function AIRecommendations({ assets, listingTitle, onImageGenerated }: AIRecommendationsProps) {
  const [data, setData] = useState<SuggestionsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingImage, setGeneratingImage] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<Record<string, string>>({});
  const [editingPrompt, setEditingPrompt] = useState<string | null>(null);
  const [customPrompts, setCustomPrompts] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const hasAnalyzedAssets = assets.some(a => a.analysisResult);

  const generateSuggestions = async () => {
    setLoading(true);
    setError(null);

    try {
      const analyzedAssets = assets.filter(a => a.analysisResult);
      const categories = [...new Set(assets.map(a => a.name.split('_')[0]))];

      const auditData = analyzedAssets.map(a => ({
        name: a.name,
        type: a.type,
        category: a.name.split('_')[0],
        score: a.analysisResult!.overallScore,
        status: a.analysisResult!.status,
        violations: a.analysisResult!.violations.map(v => ({
          severity: v.severity,
          category: v.category,
          message: v.message,
        })),
        fixRecommendations: a.analysisResult!.fixRecommendations,
      }));

      const { data: result, error: fnError } = await supabase.functions.invoke('listing-suggestions', {
        body: {
          auditData,
          listingTitle,
          imageCount: assets.length,
          categories,
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

  const handleGenerateImage = async (type: string, prompt: string) => {
    setGeneratingImage(type);
    try {
      const finalPrompt = customPrompts[type] || prompt;
      const { data: result, error: fnError } = await supabase.functions.invoke('generate-suggested-image', {
        body: { prompt: finalPrompt, imageType: type },
      });

      if (fnError) throw new Error(fnError.message);
      if (result?.error) throw new Error(result.error);

      if (result?.imageUrl) {
        setGeneratedImages(prev => ({ ...prev, [type]: result.imageUrl }));
        onImageGenerated?.(result.imageUrl, type);
        toast({ title: 'Image Generated', description: `${type} image created successfully` });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Image generation failed';
      toast({ title: 'Generation Failed', description: msg, variant: 'destructive' });
    } finally {
      setGeneratingImage(null);
    }
  };

  const downloadImage = (dataUrl: string, type: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `guardian-${type.toLowerCase()}-${Date.now()}.png`;
    link.click();
  };

  if (!hasAnalyzedAssets) return null;

  // Pre-generation state
  if (!data) {
    return (
      <Card className="border-primary/20">
        <CardContent className="pt-6 flex flex-col items-center gap-4">
          <div className="text-center space-y-1">
            <h3 className="text-lg font-semibold flex items-center gap-2 justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
              AI Optimization Recommendations
            </h3>
            <p className="text-sm text-muted-foreground">
              Get AI-powered suggestions to improve conversion rate and search ranking
            </p>
          </div>
          <Button onClick={generateSuggestions} disabled={loading} size="lg">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {loading ? 'Analyzing listing...' : 'Generate Recommendations'}
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
    (data.competitive_gaps?.length || 0);

  return (
    <div className="space-y-4">
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              AI Optimization Recommendations
            </span>
            <Badge variant="outline" className="text-sm">
              {totalSuggestions} suggestions
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="missing" className="w-full">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="missing" className="text-xs">
                <ImagePlus className="w-3 h-3 mr-1" />
                Missing ({data.missing_image_types?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="quickwins" className="text-xs">
                <Zap className="w-3 h-3 mr-1" />
                Quick Wins ({data.quick_wins?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="title" className="text-xs">
                <Type className="w-3 h-3 mr-1" />
                Title ({data.title_improvements?.length || 0})
              </TabsTrigger>
            </TabsList>

            {/* Missing Images Tab */}
            <TabsContent value="missing" className="space-y-3 mt-3">
              {(data.missing_image_types || []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  ✅ All recommended image types are present!
                </p>
              ) : (
                (data.missing_image_types || []).map((item, i) => (
                  <Card key={i} className="border-dashed">
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">{item.type.replace(/_/g, ' ')}</span>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${priorityStyles[item.priority]}`}>
                              {item.priority}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{item.description}</p>
                        </div>
                      </div>

                      {/* Prompt editor */}
                      <div className="space-y-2">
                        <button
                          className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
                          onClick={() => setEditingPrompt(editingPrompt === item.type ? null : item.type)}
                        >
                          {editingPrompt === item.type ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          {editingPrompt === item.type ? 'Hide' : 'Edit'} prompt
                        </button>
                        {editingPrompt === item.type && (
                          <Textarea
                            className="text-xs min-h-[80px]"
                            value={customPrompts[item.type] ?? item.example_prompt}
                            onChange={e => setCustomPrompts(prev => ({ ...prev, [item.type]: e.target.value }))}
                          />
                        )}
                      </div>

                      {/* Generated image preview */}
                      {generatedImages[item.type] && (
                        <div className="space-y-2">
                          <img
                            src={generatedImages[item.type]}
                            alt={`Generated ${item.type}`}
                            className="w-full max-h-48 object-contain rounded-md border"
                          />
                          <Button
                            variant="outline" size="sm" className="w-full"
                            onClick={() => downloadImage(generatedImages[item.type], item.type)}
                          >
                            <Download className="w-3 h-3 mr-1" /> Download Image
                          </Button>
                        </div>
                      )}

                      <Button
                        size="sm"
                        className="w-full"
                        disabled={generatingImage === item.type}
                        onClick={() => handleGenerateImage(item.type, item.example_prompt)}
                      >
                        {generatingImage === item.type ? (
                          <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Generating...</>
                        ) : generatedImages[item.type] ? (
                          <><Sparkles className="w-3 h-3 mr-1" /> Regenerate</>
                        ) : (
                          <><ImagePlus className="w-3 h-3 mr-1" /> Generate This Image</>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            {/* Quick Wins Tab */}
            <TabsContent value="quickwins" className="space-y-2 mt-3">
              {(data.quick_wins || [])
                .sort((a, b) => {
                  const order = { LOW: 0, MEDIUM: 1, HIGH: 2 };
                  return (order[a.effort] ?? 1) - (order[b.effort] ?? 1);
                })
                .map((item, i) => {
                  const style = effortStyles[item.effort] || effortStyles.MEDIUM;
                  return (
                    <Card key={i}>
                      <CardContent className="pt-3 pb-3">
                        <div className="flex items-start gap-3">
                          <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium ${style.bg}`}>
                            {style.label}
                          </span>
                          <div className="flex-1 space-y-0.5">
                            <p className="text-sm font-medium">{item.action}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <ArrowRight className="w-3 h-3" />
                              {item.estimated_impact}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
            </TabsContent>

            {/* Title Improvements Tab */}
            <TabsContent value="title" className="space-y-2 mt-3">
              {(data.title_improvements || []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  ✅ No title improvements needed
                </p>
              ) : (
                (data.title_improvements || []).map((item, i) => (
                  <Card key={i}>
                    <CardContent className="pt-3 pb-3 space-y-1.5">
                      <div className="flex items-start gap-2">
                        <Badge variant="destructive" className="text-[10px] shrink-0">Issue</Badge>
                        <p className="text-sm">{item.issue}</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Badge variant="default" className="text-[10px] shrink-0 bg-green-600">Fix</Badge>
                        <p className="text-sm text-muted-foreground">{item.suggestion}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}

              {(data.competitive_gaps || []).length > 0 && (
                <>
                  <Separator className="my-3" />
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Target className="w-4 h-4 text-primary" />
                    Competitive Gaps
                  </h4>
                  {data.competitive_gaps.map((item, i) => (
                    <Card key={i}>
                      <CardContent className="pt-3 pb-3 space-y-1">
                        <p className="text-sm font-medium">{item.gap}</p>
                        <p className="text-xs text-muted-foreground">{item.recommendation}</p>
                      </CardContent>
                    </Card>
                  ))}
                </>
              )}
            </TabsContent>
          </Tabs>

          <Separator className="my-4" />
          <Button variant="outline" size="sm" onClick={generateSuggestions} disabled={loading} className="w-full">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Refresh Recommendations
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
