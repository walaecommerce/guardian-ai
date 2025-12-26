import { useState, useEffect, useMemo } from 'react';
import { X, Download, CheckCircle, XCircle, ArrowRight, Loader2, RefreshCw, SlidersHorizontal, Sparkles, Eye, PenLine, Wand2, ChevronDown, ChevronUp, ImagePlus, Palette, Zap, Mountain, Camera, Wrench, TrendingUp } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Card, CardContent } from '@/components/ui/card';
import { ImageAsset, FixProgressState, FixAttempt, OptimizeMode, ImageCategory } from '@/types';
import { BeforeAfterSlider } from '@/components/BeforeAfterSlider';
import { FixActivityLog } from '@/components/FixActivityLog';
import { FixAttemptHistory } from '@/components/FixAttemptHistory';
import { getPresetsForCategory, ENHANCEMENT_PRESETS, EnhancementPreset } from '@/data/amazonGuidelines';

interface FixModalProps {
  asset: ImageAsset | null;
  isOpen: boolean;
  onClose: () => void;
  onRetryFix: (assetId: string, previousGeneratedImage?: string, customPrompt?: string) => void;
  onDownload: (imageUrl: string, filename: string) => void;
  fixProgress?: FixProgressState;
  mode?: OptimizeMode;
  mainProductImage?: string; // Main product image for reference
}

// Icon mapping for enhancement presets
const PRESET_ICONS: Record<string, React.ReactNode> = {
  '🎯': <Zap className="w-4 h-4" />,
  '🖼️': <ImagePlus className="w-4 h-4" />,
  '📦': <ImagePlus className="w-4 h-4" />,
  '✨': <Sparkles className="w-4 h-4" />,
  '📐': <SlidersHorizontal className="w-4 h-4" />,
  '⚡': <Zap className="w-4 h-4" />,
  '✅': <CheckCircle className="w-4 h-4" />,
  '↔️': <ArrowRight className="w-4 h-4" />,
  '🌟': <Sparkles className="w-4 h-4" />,
};

// Marketing upgrade presets for lifestyle backgrounds (legacy, keeping for backward compat)
const MARKETING_PRESETS = [
  {
    id: 'white_studio',
    label: 'Pure White Studio',
    icon: Zap,
    description: 'Amazon-compliant white background',
    prompt: 'Pure white studio background (RGB 255,255,255). Professional product photography lighting. Sharp shadows eliminated. Product centered and occupying 85% of frame.'
  },
  {
    id: 'lifestyle_kitchen',
    label: 'Kitchen Counter',
    icon: Camera,
    description: 'Modern kitchen lifestyle shot',
    prompt: 'Place product on elegant marble kitchen counter. Soft natural lighting from window. Blurred modern kitchen background. Lifestyle product photography style.'
  },
  {
    id: 'lifestyle_nature',
    label: 'Natural Setting',
    icon: Mountain,
    description: 'Outdoor/nature backdrop',
    prompt: 'Product in natural outdoor setting with soft bokeh greenery background. Golden hour lighting. Organic, eco-friendly aesthetic. Professional lifestyle photography.'
  },
  {
    id: 'lifestyle_minimal',
    label: 'Minimalist Surface',
    icon: Palette,
    description: 'Clean minimalist backdrop',
    prompt: 'Product on clean matte surface with subtle gradient background. Scandinavian aesthetic. Soft diffused studio lighting. High-end product catalog style.'
  }
];

// Progress step definitions for real-time display
const PROGRESS_STEPS = {
  generating: [
    { id: 'init', label: 'Initializing AI pipeline', icon: '🚀' },
    { id: 'analyze', label: 'Analyzing original image', icon: '🔍' },
    { id: 'detect', label: 'Detecting compliance issues', icon: '🎯' },
    { id: 'prepare', label: 'Preparing edit instructions', icon: '📝' },
    { id: 'generate', label: 'Generating fixed version', icon: '🎨' },
  ],
  verifying: [
    { id: 'identity', label: 'Checking product identity', icon: '🔗' },
    { id: 'background', label: 'Validating background', icon: '⬜' },
    { id: 'compliance', label: 'Compliance verification', icon: '✓' },
    { id: 'quality', label: 'Quality assessment', icon: '📊' },
    { id: 'final', label: 'Final validation', icon: '🏁' },
  ],
  retrying: [
    { id: 'critique', label: 'Analyzing previous attempt', icon: '💭' },
    { id: 'adjust', label: 'Adjusting parameters', icon: '🔧' },
    { id: 'retry', label: 'Preparing retry', icon: '🔄' },
  ],
};

export function FixModal({ asset, isOpen, onClose, onRetryFix, onDownload, fixProgress, mode = 'fix', mainProductImage }: FixModalProps) {
  const [selectedAttemptIndex, setSelectedAttemptIndex] = useState<number | undefined>(undefined);
  const [viewMode, setViewMode] = useState<'live' | 'compare'>('live');
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [showMarketingPresets, setShowMarketingPresets] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [currentProgressStep, setCurrentProgressStep] = useState(0);
  const [activeMode, setActiveMode] = useState<'fix' | 'enhance'>(mode);
  const [showEnhancementPresets, setShowEnhancementPresets] = useState(false);
  const [selectedEnhancementPreset, setSelectedEnhancementPreset] = useState<EnhancementPreset | null>(null);

  // Get category-specific enhancement presets
  const detectedCategory: ImageCategory = (asset?.analysisResult?.spatialAnalysis?.productZones?.[0]?.type === 'lifestyle-shot' 
    ? 'LIFESTYLE' 
    : asset?.type === 'MAIN' 
      ? 'PRODUCT_SHOT' 
      : 'INFOGRAPHIC') as ImageCategory;
  
  const applicablePresets = useMemo(() => {
    return getPresetsForCategory(detectedCategory);
  }, [detectedCategory]);

  // Animate progress steps
  useEffect(() => {
    if (!fixProgress?.currentStep || fixProgress.currentStep === 'complete') {
      setCurrentProgressStep(0);
      return;
    }
    
    const steps = PROGRESS_STEPS[fixProgress.currentStep as keyof typeof PROGRESS_STEPS];
    if (!steps) return;

    const interval = setInterval(() => {
      setCurrentProgressStep(prev => (prev + 1) % steps.length);
    }, 1500);

    return () => clearInterval(interval);
  }, [fixProgress?.currentStep]);

  // Default prompts based on image type
  const getDefaultPrompt = (type: string) => {
    if (type === 'MAIN') {
      return `Transform this product image into an Amazon MAIN image that is 100% compliant:

## CRITICAL REQUIREMENTS:
1. Replace ENTIRE background with PURE WHITE: RGB(255,255,255)
2. Preserve ALL product labels, text, and branding PRECISELY
3. Remove "Best Seller" badges, "Amazon's Choice" labels, star ratings
4. Product should occupy 85% of the frame, centered
5. High resolution, sharp focus throughout`;
    }
    return `Edit this SECONDARY Amazon product image while PRESERVING its context:

## CRITICAL REQUIREMENTS:
1. KEEP the lifestyle background/scene EXACTLY as is
2. The product shown must remain IDENTICAL
3. Remove only prohibited elements (badges, ratings, promotional overlays)
4. Preserve feature callouts, dimension annotations, comparison charts
5. Maintain original image quality`;
  };

  // Reset state when asset changes
  useEffect(() => {
    if (asset) {
      setCustomPrompt(asset.analysisResult?.generativePrompt || getDefaultPrompt(asset.type));
      setSelectedPreset(null);
      setSelectedEnhancementPreset(null);
      // Default to enhance mode for passed images, fix mode for failed
      setActiveMode(asset.analysisResult?.status === 'PASS' ? 'enhance' : 'fix');
    }
  }, [asset?.id]);

  // Reset selected attempt when progress changes
  useEffect(() => {
    if (fixProgress?.attempts.length) {
      setSelectedAttemptIndex(fixProgress.attempts.length - 1);
    }
  }, [fixProgress?.attempts.length]);

  if (!asset) return null;

  const result = asset.analysisResult;
  const hasFixedImage = !!asset.fixedImage;
  const isGenerating = asset.isGeneratingFix;
  const isPassed = result?.status === 'PASS';
  const isEnhanceMode = mode === 'enhance' || isPassed;

  const handleDownload = () => {
    if (asset.fixedImage) {
      onDownload(asset.fixedImage, `fixed-${asset.name}`);
    }
  };

  const handleSmartRegenerate = (withCustomPrompt = false) => {
    // Pass the last generated image for error-aware regeneration
    const lastImage = fixProgress?.attempts[fixProgress.attempts.length - 1]?.generatedImage || asset.fixedImage;
    onRetryFix(asset.id, lastImage, withCustomPrompt ? customPrompt : undefined);
  };

  const handleGenerateWithPrompt = () => {
    onRetryFix(asset.id, undefined, customPrompt);
  };

  const handlePresetSelect = (presetId: string) => {
    const preset = MARKETING_PRESETS.find(p => p.id === presetId);
    if (preset) {
      setSelectedPreset(presetId);
      setCustomPrompt(preset.prompt);
      setIsPromptExpanded(true);
    }
  };

  const handleGenerateWithPreset = () => {
    const preset = MARKETING_PRESETS.find(p => p.id === selectedPreset);
    if (preset) {
      onRetryFix(asset.id, undefined, preset.prompt);
    }
  };

  const handleEnhancementPresetSelect = (preset: EnhancementPreset) => {
    setSelectedEnhancementPreset(preset);
    setCustomPrompt(preset.promptTemplate);
    setIsPromptExpanded(true);
  };

  const handleGenerateWithEnhancementPreset = () => {
    if (selectedEnhancementPreset) {
      onRetryFix(asset.id, undefined, selectedEnhancementPreset.promptTemplate);
    }
  };

  const selectedAttempt = selectedAttemptIndex !== undefined && fixProgress?.attempts[selectedAttemptIndex];
  const displayImage = selectedAttempt?.generatedImage || fixProgress?.intermediateImage || asset.fixedImage;

  // Component scores for display
  const componentScores = selectedAttempt?.verification?.componentScores || 
    fixProgress?.attempts[fixProgress.attempts.length - 1]?.verification?.componentScores;

  // Get current progress info
  const currentStepInfo = fixProgress?.currentStep && 
    PROGRESS_STEPS[fixProgress.currentStep as keyof typeof PROGRESS_STEPS]?.[currentProgressStep];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <span>AI Image Optimization</span>
              <Badge variant={asset.type === 'MAIN' ? 'default' : 'secondary'}>
                {asset.type}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {detectedCategory}
              </Badge>
              {isGenerating && (
                <Badge variant="outline" className="animate-pulse">
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Processing...
                </Badge>
              )}
            </div>
            
            {/* Mode Toggle */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-muted">
              <Button
                variant={activeMode === 'fix' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveMode('fix')}
                className="h-7 px-3"
                disabled={isGenerating}
              >
                <Wrench className="w-3.5 h-3.5 mr-1.5" />
                Compliance Fix
              </Button>
              <Button
                variant={activeMode === 'enhance' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveMode('enhance')}
                className="h-7 px-3"
                disabled={isGenerating}
              >
                <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
                Enhance Quality
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(95vh-120px)]">
          <div className="space-y-4 pr-4">
            {/* Mode Description Banner */}
            <div className={`p-3 rounded-lg border ${activeMode === 'fix' ? 'bg-orange-500/5 border-orange-500/20' : 'bg-emerald-500/5 border-emerald-500/20'}`}>
              <div className="flex items-center gap-2">
                {activeMode === 'fix' ? (
                  <>
                    <Wrench className="w-4 h-4 text-orange-500" />
                    <div>
                      <p className="text-sm font-medium text-orange-600">Compliance Fix Mode</p>
                      <p className="text-xs text-muted-foreground">Fix Amazon guideline violations: background, badges, text overlays</p>
                    </div>
                  </>
                ) : (
                  <>
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    <div>
                      <p className="text-sm font-medium text-emerald-600">Quality Enhancement Mode</p>
                      <p className="text-xs text-muted-foreground">Improve product visibility, add callouts, enhance graphics</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Enhancement Presets - Only shown in enhance mode */}
            {activeMode === 'enhance' && applicablePresets.length > 0 && !isGenerating && (
              <Card className="border-emerald-500/20 bg-emerald-500/5">
                <CardContent className="py-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-emerald-500" />
                        <span className="font-medium text-sm">Category-Specific Enhancements</span>
                        <Badge variant="outline" className="text-xs">{detectedCategory}</Badge>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      {applicablePresets.slice(0, 6).map(preset => (
                        <button
                          key={preset.id}
                          onClick={() => handleEnhancementPresetSelect(preset)}
                          className={`p-3 rounded-lg border text-left transition-all ${
                            selectedEnhancementPreset?.id === preset.id
                              ? 'border-emerald-500 bg-emerald-500/10'
                              : 'border-border hover:border-emerald-500/50 hover:bg-muted/50'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">{preset.icon}</span>
                            <span className="font-medium text-sm">{preset.label}</span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">{preset.description}</p>
                        </button>
                      ))}
                    </div>
                    
                    {selectedEnhancementPreset && (
                      <Button 
                        className="w-full bg-emerald-600 hover:bg-emerald-700" 
                        onClick={handleGenerateWithEnhancementPreset}
                        disabled={isGenerating}
                      >
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate: {selectedEnhancementPreset.label}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Real-time Progress Indicator */}
            {isGenerating && fixProgress && (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="py-4">
                  <div className="space-y-3">
                    {/* Progress bar */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="font-medium">
                            Attempt {fixProgress.attempt}/{fixProgress.maxAttempts}
                          </span>
                          <span className="text-muted-foreground capitalize">
                            {fixProgress.currentStep.replace('_', ' ')}
                          </span>
                        </div>
                        <Progress 
                          value={(fixProgress.attempt / fixProgress.maxAttempts) * 100} 
                          className="h-2"
                        />
                      </div>
                    </div>

                    {/* Current step with animation */}
                    {currentStepInfo && (
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-background border border-border">
                        <div className="text-2xl animate-pulse">{currentStepInfo.icon}</div>
                        <div className="flex-1">
                          <p className="font-medium text-sm">{currentStepInfo.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {fixProgress.currentStep === 'generating' && 'AI is creating your optimized image...'}
                            {fixProgress.currentStep === 'verifying' && 'Checking compliance with Amazon standards...'}
                            {fixProgress.currentStep === 'retrying' && 'Learning from previous attempt...'}
                          </p>
                        </div>
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      </div>
                    )}

                    {/* Step progress dots */}
                    <div className="flex justify-center gap-2">
                      {(PROGRESS_STEPS[fixProgress.currentStep as keyof typeof PROGRESS_STEPS] || []).map((step, i) => (
                        <div 
                          key={step.id}
                          className={`w-2 h-2 rounded-full transition-all ${
                            i === currentProgressStep 
                              ? 'bg-primary w-4' 
                              : i < currentProgressStep 
                                ? 'bg-primary/60' 
                                : 'bg-muted'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Main Image Comparison Area */}
            <div className="grid grid-cols-2 gap-4">
              {/* Left: Original Image */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium flex items-center gap-1.5">
                    <Eye className="w-4 h-4" />
                    Original Image
                  </span>
                  {result && (
                    <Badge variant={result.status === 'PASS' ? 'default' : 'destructive'}>
                      {result.overallScore}% Score
                    </Badge>
                  )}
                </div>
                <div className="aspect-square rounded-lg overflow-hidden border border-border bg-muted">
                  <img
                    src={asset.preview}
                    alt="Original"
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>

              {/* Right: Generated/Fixed Image */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-primary" />
                    {isGenerating ? 'Generating...' : 'AI-Fixed Version'}
                  </span>
                  {selectedAttempt?.verification && (
                    <Badge variant={selectedAttempt.verification.isSatisfactory ? 'default' : 'destructive'}>
                      {selectedAttempt.verification.score}% Score
                    </Badge>
                  )}
                </div>
                <div className="aspect-square rounded-lg overflow-hidden border border-border bg-muted relative">
                  {displayImage ? (
                    <>
                      <img
                        src={displayImage}
                        alt="Generated"
                        className="w-full h-full object-contain"
                      />
                      {/* Overlay for current status */}
                      {isGenerating && fixProgress?.currentStep === 'verifying' && (
                        <div className="absolute inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center">
                          <div className="text-center space-y-2">
                            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
                            <p className="text-sm font-medium">Verifying image...</p>
                          </div>
                        </div>
                      )}
                    </>
                  ) : isGenerating ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                      <div className="relative">
                        <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                        <Sparkles className="w-6 h-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                      </div>
                      <p className="text-sm text-muted-foreground text-center">
                        {currentStepInfo?.label || 'Generating...'}
                      </p>
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-muted-foreground/10 flex items-center justify-center">
                        <ArrowRight className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">Click a button below to generate</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Attempt History Strip */}
            {fixProgress && fixProgress.attempts.length > 0 && (
              <FixAttemptHistory
                attempts={fixProgress.attempts}
                currentAttempt={fixProgress.attempt}
                selectedAttemptIndex={selectedAttemptIndex}
                onSelectAttempt={(attempt) => {
                  const idx = fixProgress.attempts.findIndex(a => a.attempt === attempt.attempt);
                  setSelectedAttemptIndex(idx);
                }}
              />
            )}

            {/* Component Scores Progress Bars */}
            {componentScores && (
              <div className="grid grid-cols-5 gap-3">
                <ScoreBar label="Identity" score={componentScores.identity} />
                <ScoreBar label="Compliance" score={componentScores.compliance} />
                <ScoreBar label="Text/Layout" score={componentScores.textLayout ?? componentScores.noNewIssues} />
                <ScoreBar label="No Additions" score={componentScores.noAdditions ?? 100} />
                <ScoreBar label="Quality" score={componentScores.quality} />
              </div>
            )}

            {/* Live AI Verification Log */}
            {(isGenerating || fixProgress?.thinkingSteps.length) && (
              <FixActivityLog entries={fixProgress?.thinkingSteps || []} />
            )}

            {/* Critique & Issues Section */}
            {selectedAttempt?.verification && !selectedAttempt.verification.isSatisfactory && (
              <div className="p-4 rounded-lg bg-destructive/5 border border-destructive/20">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="w-4 h-4 text-destructive" />
                  <span className="font-medium text-destructive">Verification Issues</span>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  {selectedAttempt.verification.critique}
                </p>
                {selectedAttempt.verification.failedChecks?.length > 0 && (
                  <div className="space-y-1">
                    {selectedAttempt.verification.failedChecks.map((check, i) => (
                      <p key={i} className="text-xs text-destructive">✗ {check}</p>
                    ))}
                  </div>
                )}
                {fixProgress?.currentStep !== 'complete' && (
                  <p className="text-xs text-muted-foreground mt-2 italic">
                    🔄 AI will retry with this feedback...
                  </p>
                )}
              </div>
            )}

            {/* Final Success State */}
            {hasFixedImage && !isGenerating && (
              <Tabs defaultValue="slider" className="w-full">
                <TabsList className="mb-3">
                  <TabsTrigger value="slider" className="gap-2">
                    <SlidersHorizontal className="w-4 h-4" />
                    Before/After Slider
                  </TabsTrigger>
                  <TabsTrigger value="details" className="gap-2">
                    <Eye className="w-4 h-4" />
                    Analysis Details
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="slider" className="mt-0">
                  <div className="aspect-video rounded-lg overflow-hidden border border-border bg-muted">
                    <BeforeAfterSlider
                      beforeImage={asset.preview}
                      afterImage={asset.fixedImage!}
                      beforeLabel="Original"
                      afterLabel="AI Fixed"
                      className="w-full h-full"
                    />
                  </div>
                </TabsContent>
                
                <TabsContent value="details" className="mt-0">
                  <AnalysisDetails result={result} />
                </TabsContent>
              </Tabs>
            )}

            {/* Analysis Details for non-fixed state */}
            {!hasFixedImage && result && (
              <AnalysisDetails result={result} />
            )}

            {/* Marketing Upgrade Presets - for SECONDARY images */}
            {asset.type === 'SECONDARY' && !isGenerating && (
              <Collapsible open={showMarketingPresets} onOpenChange={setShowMarketingPresets}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-between bg-gradient-to-r from-primary/5 to-transparent">
                    <span className="flex items-center gap-2">
                      <ImagePlus className="w-4 h-4 text-primary" />
                      <span className="font-medium">Marketing Upgrade Mode</span>
                      <Badge variant="outline" className="text-xs">NEW</Badge>
                    </span>
                    {showMarketingPresets ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <p className="text-sm text-muted-foreground mb-3">
                    Generate professional lifestyle backgrounds for your secondary images:
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {MARKETING_PRESETS.map(preset => (
                      <button
                        key={preset.id}
                        onClick={() => handlePresetSelect(preset.id)}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          selectedPreset === preset.id 
                            ? 'border-primary bg-primary/10' 
                            : 'border-border hover:border-primary/50 hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <preset.icon className={`w-4 h-4 ${selectedPreset === preset.id ? 'text-primary' : 'text-muted-foreground'}`} />
                          <span className="font-medium text-sm">{preset.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{preset.description}</p>
                      </button>
                    ))}
                  </div>
                  {selectedPreset && (
                    <Button 
                      className="w-full mt-3" 
                      onClick={handleGenerateWithPreset}
                      disabled={isGenerating}
                    >
                      <Wand2 className="w-4 h-4 mr-2" />
                      Generate {MARKETING_PRESETS.find(p => p.id === selectedPreset)?.label}
                    </Button>
                  )}
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Prompt Editor Section */}
            <Collapsible open={isPromptExpanded} onOpenChange={setIsPromptExpanded}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <PenLine className="w-4 h-4" />
                    Edit AI Generation Prompt
                  </span>
                  {isPromptExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <div className="space-y-2">
                  <Textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="Enter custom generation instructions..."
                    className="min-h-[120px] text-xs font-mono"
                    disabled={isGenerating}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setCustomPrompt(getDefaultPrompt(asset.type));
                        setSelectedPreset(null);
                      }}
                      disabled={isGenerating}
                    >
                      Reset to Default
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleSmartRegenerate(true)}
                      disabled={isGenerating}
                      className="ml-auto"
                    >
                      <Wand2 className="w-3 h-3 mr-1" />
                      Generate with Custom Prompt
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-border">
              {/* Mode-specific primary action */}
              {!hasFixedImage && !isGenerating && (
                <>
                  {activeMode === 'fix' && result?.status === 'FAIL' && (
                    <Button
                      onClick={() => onRetryFix(asset.id)}
                      disabled={isGenerating}
                      className="flex-1"
                    >
                      <Wrench className="w-4 h-4 mr-2" />
                      Fix Compliance Issues
                    </Button>
                  )}
                  
                  {activeMode === 'enhance' && (
                    <Button
                      onClick={selectedEnhancementPreset ? handleGenerateWithEnhancementPreset : handleGenerateWithPrompt}
                      disabled={isGenerating}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      {selectedEnhancementPreset ? `Apply: ${selectedEnhancementPreset.label}` : 'Enhance Image Quality'}
                    </Button>
                  )}
                  
                  {/* Show fix button in enhance mode for failed images */}
                  {activeMode === 'enhance' && result?.status === 'FAIL' && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setActiveMode('fix');
                        onRetryFix(asset.id);
                      }}
                      disabled={isGenerating}
                      className="flex-1"
                    >
                      <Wrench className="w-4 h-4 mr-2" />
                      Fix First
                    </Button>
                  )}
                </>
              )}

              {/* Loading state */}
              {isGenerating && (
                <Button disabled className="flex-1">
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {currentStepInfo?.label || 'Processing...'}
                </Button>
              )}

              {/* Post-fix actions */}
              {(hasFixedImage || (fixProgress?.attempts.length && fixProgress.attempts.length > 0)) && !isGenerating && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => handleSmartRegenerate(false)}
                    disabled={isGenerating}
                    className="flex-1"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Regenerate
                  </Button>
                  {hasFixedImage && (
                    <Button onClick={handleDownload} className="flex-1">
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                  )}
                </>
              )}
              <Button variant="ghost" onClick={onClose}>
                <X className="w-4 h-4 mr-2" />
                Close
              </Button>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={score >= 80 ? 'text-success font-medium' : 'text-destructive font-medium'}>
          {score}%
        </span>
      </div>
      <Progress 
        value={score} 
        className={`h-1.5 ${score >= 80 ? '[&>div]:bg-success' : '[&>div]:bg-destructive'}`}
      />
    </div>
  );
}

function AnalysisDetails({ result }: { result: any }) {
  if (!result) return null;

  return (
    <div className="space-y-4">
      <h4 className="font-medium text-foreground">Analysis Details</h4>
      
      {/* Main Image Analysis */}
      {result.mainImageAnalysis && (
        <div className="grid grid-cols-2 gap-3">
          <AnalysisItem
            label="Background"
            isCompliant={result.mainImageAnalysis.backgroundCheck.isCompliant}
            message={result.mainImageAnalysis.backgroundCheck.message}
          />
          <AnalysisItem
            label="Text Overlays"
            isCompliant={result.mainImageAnalysis.textOverlayCheck.isCompliant}
            message={result.mainImageAnalysis.textOverlayCheck.message}
          />
          <AnalysisItem
            label="Product Occupancy"
            isCompliant={result.mainImageAnalysis.productOccupancy.isCompliant}
            message={result.mainImageAnalysis.productOccupancy.message}
          />
          <AnalysisItem
            label="Image Quality"
            isCompliant={result.mainImageAnalysis.imageQuality.score >= 80}
            message={result.mainImageAnalysis.imageQuality.message}
          />
        </div>
      )}

      {/* Violations */}
      {result.violations?.length > 0 && (
        <div className="space-y-2">
          <h5 className="font-medium text-destructive">
            Violations ({result.violations.length})
          </h5>
          <div className="space-y-2">
            {result.violations.slice(0, 3).map((v: any, i: number) => (
              <div
                key={i}
                className="p-3 rounded-lg border border-destructive/20 bg-destructive/5"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs">
                    {v.category}
                  </Badge>
                  <Badge
                    variant={v.severity === 'critical' ? 'destructive' : 'secondary'}
                    className="text-xs"
                  >
                    {v.severity}
                  </Badge>
                </div>
                <p className="text-sm">{v.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fix Recommendations */}
      {result.fixRecommendations?.length > 0 && (
        <div className="space-y-2">
          <h5 className="font-medium text-primary">Recommendations</h5>
          <ul className="list-disc list-inside space-y-1">
            {result.fixRecommendations.slice(0, 3).map((rec: string, i: number) => (
              <li key={i} className="text-sm text-muted-foreground">{rec}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AnalysisItem({
  label,
  isCompliant,
  message,
}: {
  label: string;
  isCompliant: boolean;
  message: string;
}) {
  return (
    <div className="p-3 rounded-lg bg-muted">
      <div className="flex items-center gap-2 mb-1">
        {isCompliant ? (
          <CheckCircle className="w-4 h-4 text-success" />
        ) : (
          <XCircle className="w-4 h-4 text-destructive" />
        )}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}
