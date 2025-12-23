import { useState, useEffect } from 'react';
import { X, Download, CheckCircle, XCircle, ArrowRight, Loader2, RefreshCw, SlidersHorizontal, Columns2, Sparkles, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { ImageAsset, FixProgressState, FixAttempt } from '@/types';
import { BeforeAfterSlider } from '@/components/BeforeAfterSlider';
import { FixActivityLog } from '@/components/FixActivityLog';
import { FixAttemptHistory } from '@/components/FixAttemptHistory';

interface FixModalProps {
  asset: ImageAsset | null;
  isOpen: boolean;
  onClose: () => void;
  onRetryFix: (assetId: string, previousGeneratedImage?: string) => void;
  onDownload: (imageUrl: string, filename: string) => void;
  fixProgress?: FixProgressState;
}

export function FixModal({ asset, isOpen, onClose, onRetryFix, onDownload, fixProgress }: FixModalProps) {
  const [selectedAttemptIndex, setSelectedAttemptIndex] = useState<number | undefined>(undefined);
  const [viewMode, setViewMode] = useState<'live' | 'compare'>('live');

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

  const handleDownload = () => {
    if (asset.fixedImage) {
      onDownload(asset.fixedImage, `fixed-${asset.name}`);
    }
  };

  const handleSmartRegenerate = () => {
    // Pass the last generated image for error-aware regeneration
    const lastImage = fixProgress?.attempts[fixProgress.attempts.length - 1]?.generatedImage || asset.fixedImage;
    onRetryFix(asset.id, lastImage);
  };

  const selectedAttempt = selectedAttemptIndex !== undefined && fixProgress?.attempts[selectedAttemptIndex];
  const displayImage = selectedAttempt?.generatedImage || fixProgress?.intermediateImage || asset.fixedImage;

  // Component scores for display
  const componentScores = selectedAttempt?.verification?.componentScores || 
    fixProgress?.attempts[fixProgress.attempts.length - 1]?.verification?.componentScores;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <span>AI Image Optimization</span>
            <Badge variant={asset.type === 'MAIN' ? 'default' : 'secondary'}>
              {asset.type}
            </Badge>
            {isGenerating && (
              <Badge variant="outline" className="animate-pulse">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Processing...
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(95vh-120px)]">
          <div className="space-y-4 pr-4">
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
                      <Loader2 className="w-10 h-10 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">
                        {fixProgress?.currentStep === 'generating' ? 'Generating image...' : 'Starting...'}
                      </p>
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-muted-foreground/10 flex items-center justify-center">
                        <ArrowRight className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">Click "Generate Fix" below</p>
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
              <div className="grid grid-cols-4 gap-3">
                <ScoreBar label="Identity" score={componentScores.identity} />
                <ScoreBar label="Compliance" score={componentScores.compliance} />
                <ScoreBar label="Quality" score={componentScores.quality} />
                <ScoreBar label="Clean Edit" score={componentScores.noNewIssues} />
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

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-border">
              {!hasFixedImage && result?.status === 'FAIL' && (
                <Button
                  onClick={() => onRetryFix(asset.id)}
                  disabled={isGenerating}
                  className="flex-1"
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  Generate Fix
                </Button>
              )}
              {(hasFixedImage || fixProgress?.attempts.length) && (
                <>
                  <Button
                    variant="outline"
                    onClick={handleSmartRegenerate}
                    disabled={isGenerating}
                    className="flex-1"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Smart Regenerate
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
