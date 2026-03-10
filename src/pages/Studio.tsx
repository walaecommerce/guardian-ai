import { useState, useCallback } from 'react';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Loader2, Sparkles, Download, Send, RotateCcw, Check, X,
  Image as ImageIcon, Camera, LayoutGrid, Ruler, FlaskConical,
  Grid2X2, Columns2, Package, ChevronDown, ChevronUp, Wand2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { AnalysisResult } from '@/types';

// ── Template definitions ────────────────────────────────────

interface Template {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
}

const TEMPLATES: Template[] = [
  { id: 'hero', name: 'Hero Shot', description: 'Pure white background, product centered', icon: <Camera className="w-5 h-5" /> },
  { id: 'lifestyle', name: 'Lifestyle in Use', description: 'Product being used by person', icon: <ImageIcon className="w-5 h-5" /> },
  { id: 'infographic', name: 'Infographic Callout', description: 'Product with text callouts', icon: <LayoutGrid className="w-5 h-5" /> },
  { id: 'size_reference', name: 'Size Reference', description: 'Product next to common object', icon: <Ruler className="w-5 h-5" /> },
  { id: 'ingredients', name: 'Ingredients Closeup', description: 'Macro shot of key ingredients', icon: <FlaskConical className="w-5 h-5" /> },
  { id: 'benefits_grid', name: 'Benefits Grid', description: '2×2 grid showing 4 key benefits', icon: <Grid2X2 className="w-5 h-5" /> },
  { id: 'before_after', name: 'Before/After Split', description: 'Problem vs solution', icon: <Columns2 className="w-5 h-5" /> },
  { id: 'bundle', name: 'Bundle Shot', description: 'Multiple products together', icon: <Package className="w-5 h-5" /> },
];

const CLAIM_OPTIONS = ['Gluten Free', 'Non-GMO', 'Keto', 'Vegan', 'Organic', 'Sugar Free', 'High Protein', 'All Natural', 'Dairy Free', 'Plant Based'];

const HISTORY_KEY = 'guardian-studio-history';
const MAX_HISTORY = 20;

interface GeneratedImage {
  id: string;
  image: string;
  prompt: string;
  template: string;
  productName: string;
  score: number | null;
  status: 'generated' | 'analyzing' | 'analyzed';
  analysisResult?: AnalysisResult;
  date: string;
}

function getHistory(): GeneratedImage[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch { return []; }
}
function saveHistory(items: GeneratedImage[]) {
  // Don't store full base64 in history - just metadata
  const slim = items.slice(0, MAX_HISTORY).map(i => ({
    ...i, image: i.image.substring(0, 100) + '...',
  }));
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(slim)); } catch { /* full */ }
}

// ── Component ───────────────────────────────────────────────

const Studio = () => {
  const [selectedTemplate, setSelectedTemplate] = useState('hero');
  const [productName, setProductName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedClaims, setSelectedClaims] = useState<string[]>([]);
  const [brandColors, setBrandColors] = useState<string[]>([]);
  const [colorInput, setColorInput] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [resolution, setResolution] = useState('2K');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [history] = useState<GeneratedImage[]>(getHistory);

  const { toast } = useToast();

  const toggleClaim = (claim: string) => {
    setSelectedClaims(prev =>
      prev.includes(claim) ? prev.filter(c => c !== claim) : [...prev, claim]
    );
  };

  const addColor = () => {
    if (colorInput.trim() && brandColors.length < 5) {
      setBrandColors(prev => [...prev, colorInput.trim()]);
      setColorInput('');
    }
  };

  // ── Build preview prompt ──────────────────────────────────
  const buildPrompt = useCallback(() => {
    const tmpl = TEMPLATES.find(t => t.id === selectedTemplate);
    const claimsStr = selectedClaims.join(', ');
    const colorsStr = brandColors.join(', ');

    const parts = [`Template: ${tmpl?.name || selectedTemplate}`];
    if (productName) parts.push(`Product: ${productName}`);
    if (description) parts.push(`Description: ${description}`);
    if (claimsStr) parts.push(`Claims: ${claimsStr}`);
    if (colorsStr) parts.push(`Colors: ${colorsStr}`);
    parts.push(`Aspect: ${aspectRatio}, Resolution: ${resolution}`);
    return parts.join('\n');
  }, [selectedTemplate, productName, description, selectedClaims, brandColors, aspectRatio, resolution]);

  // ── Generate ──────────────────────────────────────────────
  const generate = async () => {
    if (!productName.trim()) {
      toast({ title: 'Product name required', variant: 'destructive' });
      return;
    }

    setIsGenerating(true);

    try {
      const { data, error } = await supabase.functions.invoke('generate-studio-image', {
        body: {
          productName,
          description,
          claims: selectedClaims,
          colors: brandColors,
          template: selectedTemplate,
          aspectRatio,
          resolution,
          customPrompt: showAdvanced && customPrompt ? customPrompt : undefined,
        },
      });

      if (error) throw new Error(error.message || 'Generation failed');
      if (data?.error) throw new Error(data.error);

      const newImage: GeneratedImage = {
        id: crypto.randomUUID(),
        image: data.image,
        prompt: data.prompt,
        template: selectedTemplate,
        productName,
        score: null,
        status: 'generated',
        date: new Date().toISOString(),
      };

      setResults(prev => [newImage, ...prev].slice(0, 3));
      toast({ title: 'Image generated!', description: 'Running compliance check...' });

      // Auto-analyze
      analyzeGenerated(newImage);

    } catch (e) {
      toast({
        title: 'Generation failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Auto-compliance check ─────────────────────────────────
  const analyzeGenerated = async (img: GeneratedImage) => {
    setResults(prev => prev.map(r => r.id === img.id ? { ...r, status: 'analyzing' as const } : r));

    try {
      const imageType = img.template === 'hero' ? 'MAIN' : 'SECONDARY';
      const { data, error } = await supabase.functions.invoke('analyze-image', {
        body: {
          imageBase64: img.image,
          imageType,
          listingTitle: img.productName,
          guidelines: [],
        },
      });

      if (error || data?.error) {
        setResults(prev => prev.map(r => r.id === img.id ? { ...r, status: 'analyzed' as const, score: null } : r));
        return;
      }

      const analysis = data as AnalysisResult;
      setResults(prev => prev.map(r => r.id === img.id ? {
        ...r,
        status: 'analyzed' as const,
        score: analysis.overallScore,
        analysisResult: analysis,
      } : r));

      // Save to history
      const hist = getHistory();
      hist.unshift({ ...img, score: analysis.overallScore, status: 'analyzed' });
      saveHistory(hist);

    } catch {
      setResults(prev => prev.map(r => r.id === img.id ? { ...r, status: 'analyzed' as const } : r));
    }
  };

  // ── Download ──────────────────────────────────────────────
  const downloadImage = (img: GeneratedImage) => {
    const a = document.createElement('a');
    a.href = img.image;
    a.download = `studio-${img.template}-${img.productName.replace(/\s+/g, '-')}.png`;
    a.click();
  };

  const scoreColor = (score: number) => {
    if (score >= 85) return 'bg-green-500/15 text-green-600 border-green-500/30';
    if (score >= 70) return 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30';
    return 'bg-destructive/15 text-destructive border-destructive/30';
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 flex overflow-hidden" style={{ height: 'calc(100vh - 80px)' }}>

        {/* LEFT PANEL — Template Library */}
        <div className="w-[280px] border-r border-border bg-card flex-shrink-0">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Scene Templates</h3>
          </div>
          <ScrollArea className="h-[calc(100vh-140px)]">
            <div className="p-3 space-y-2">
              {TEMPLATES.map(tmpl => (
                <button
                  key={tmpl.id}
                  onClick={() => setSelectedTemplate(tmpl.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedTemplate === tmpl.id
                      ? 'border-primary bg-accent shadow-sm'
                      : 'border-transparent hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-md ${
                      selectedTemplate === tmpl.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}>
                      {tmpl.icon}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">{tmpl.name}</div>
                      <div className="text-xs text-muted-foreground">{tmpl.description}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* CENTER PANEL — Prompt Builder */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto p-6 space-y-5">
            <div>
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Image Generation Studio
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Create Amazon-compliant product images from scratch
              </p>
            </div>

            <Card>
              <CardContent className="pt-5 space-y-4">
                {/* Product Name */}
                <div className="space-y-1.5">
                  <Label className="text-sm">Product Name *</Label>
                  <Input
                    placeholder="e.g. FitJoy Protein Bars"
                    value={productName}
                    onChange={e => setProductName(e.target.value)}
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <Label className="text-sm">Product Description</Label>
                  <Textarea
                    className="min-h-[80px]"
                    placeholder="Describe your product, its packaging, key features..."
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                  />
                </div>

                {/* Claims */}
                <div className="space-y-1.5">
                  <Label className="text-sm">Key Claims</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {CLAIM_OPTIONS.map(claim => (
                      <button
                        key={claim}
                        onClick={() => toggleClaim(claim)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          selectedClaims.includes(claim)
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted text-muted-foreground border-border hover:border-primary/50'
                        }`}
                      >
                        {selectedClaims.includes(claim) && <Check className="w-3 h-3 inline mr-1" />}
                        {claim}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Brand Colors */}
                <div className="space-y-1.5">
                  <Label className="text-sm">Brand Colors</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      className="flex-1"
                      placeholder="e.g. #FF6600, Navy Blue"
                      value={colorInput}
                      onChange={e => setColorInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addColor()}
                    />
                    <Button variant="outline" size="sm" onClick={addColor}>Add</Button>
                  </div>
                  {brandColors.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {brandColors.map((c, i) => (
                        <Badge key={i} variant="secondary" className="gap-1 cursor-pointer" onClick={() => setBrandColors(prev => prev.filter((_, j) => j !== i))}>
                          {c} <X className="w-3 h-3" />
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Settings row */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Image Type</Label>
                    <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TEMPLATES.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Aspect Ratio</Label>
                    <Select value={aspectRatio} onValueChange={setAspectRatio}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1:1">1:1 Square</SelectItem>
                        <SelectItem value="16:9">16:9 Wide</SelectItem>
                        <SelectItem value="4:5">4:5 Portrait</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Resolution</Label>
                    <Select value={resolution} onValueChange={setResolution}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1K">1K</SelectItem>
                        <SelectItem value="2K">2K</SelectItem>
                        <SelectItem value="4K">4K</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Advanced */}
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  Advanced — View/Edit Raw Prompt
                </button>

                {showAdvanced && (
                  <div className="space-y-2">
                    <div className="bg-muted/50 rounded-md p-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                      {buildPrompt()}
                    </div>
                    <Textarea
                      className="min-h-[100px] text-xs font-mono"
                      placeholder="Override the auto-generated prompt..."
                      value={customPrompt}
                      onChange={e => setCustomPrompt(e.target.value)}
                    />
                  </div>
                )}

                <Button
                  onClick={generate}
                  disabled={isGenerating || !productName.trim()}
                  size="lg"
                  className="w-full"
                >
                  {isGenerating ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
                  ) : (
                    <><Wand2 className="w-4 h-4" /> Generate Image</>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* RIGHT PANEL — Generated Results */}
        <div className="w-[320px] border-l border-border bg-card flex-shrink-0">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Results</h3>
          </div>
          <ScrollArea className="h-[calc(100vh-140px)]">
            <div className="p-3 space-y-3">
              {results.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <ImageIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Generated images will appear here</p>
                </div>
              )}

              {results.map(img => (
                <Card key={img.id} className="overflow-hidden">
                  <div className="relative">
                    <img
                      src={img.image}
                      alt={img.productName}
                      className="w-full aspect-square object-contain bg-white"
                    />
                    {/* Score badge */}
                    <div className="absolute top-2 right-2">
                      {img.status === 'analyzing' && (
                        <Badge className="bg-muted text-muted-foreground">
                          <Loader2 className="w-3 h-3 animate-spin mr-1" /> Checking...
                        </Badge>
                      )}
                      {img.status === 'analyzed' && img.score !== null && (
                        <Badge className={scoreColor(img.score)}>
                          {img.score}%
                        </Badge>
                      )}
                    </div>
                    {/* Needs fix badge */}
                    {img.status === 'analyzed' && img.score !== null && img.score < 85 && (
                      <div className="absolute top-2 left-2">
                        <Badge variant="destructive" className="text-xs">Needs Fix</Badge>
                      </div>
                    )}
                  </div>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground capitalize">{img.template.replace('_', ' ')}</span>
                      <span className="text-xs text-muted-foreground">{new Date(img.date).toLocaleTimeString()}</span>
                    </div>

                    {/* Violation summary */}
                    {img.analysisResult && img.analysisResult.violations.length > 0 && (
                      <div className="space-y-1">
                        {img.analysisResult.violations.slice(0, 3).map((v, i) => (
                          <div key={i} className="text-xs flex items-start gap-1">
                            <span className={`inline-block w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 ${
                              v.severity === 'critical' ? 'bg-destructive' : v.severity === 'warning' ? 'bg-warning' : 'bg-muted-foreground'
                            }`} />
                            <span className="text-muted-foreground line-clamp-1">{v.message}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-1.5">
                      <Button variant="outline" size="sm" className="flex-1 text-xs h-7" onClick={() => downloadImage(img)}>
                        <Download className="w-3 h-3" /> Save
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1 text-xs h-7" onClick={() => {
                        setResults(prev => prev.map(r => r.id === img.id ? { ...r, status: 'generated' as const, score: null, analysisResult: undefined } : r));
                        generate();
                      }}>
                        <RotateCcw className="w-3 h-3" /> Redo
                      </Button>
                    </div>
                    {img.score !== null && img.score < 85 && (
                      <Button
                        variant="default"
                        size="sm"
                        className="w-full text-xs h-7"
                        onClick={() => {
                          toast({ title: 'Tip', description: 'Use the Single Audit page to fix this image with the AI auto-fixer' });
                        }}
                      >
                        <Wand2 className="w-3 h-3" /> Auto-Fix
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}

              {/* History filmstrip */}
              {history.length > 0 && (
                <>
                  <Separator className="my-2" />
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">History</h4>
                  <div className="space-y-1.5">
                    {history.slice(0, 10).map((h, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 cursor-default">
                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                          <ImageIcon className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-foreground truncate">{h.productName}</div>
                          <div className="text-xs text-muted-foreground capitalize">{h.template.replace('_', ' ')}</div>
                        </div>
                        {h.score !== null && (
                          <Badge variant="outline" className="text-xs">{h.score}%</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </div>
      </main>
    </div>
  );
};

export default Studio;
