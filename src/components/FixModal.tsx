import { X, Download, CheckCircle, XCircle, ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ImageAsset } from '@/types';

interface FixModalProps {
  asset: ImageAsset | null;
  isOpen: boolean;
  onClose: () => void;
  onRetryFix: (assetId: string) => void;
  onDownload: (imageUrl: string, filename: string) => void;
}

export function FixModal({ asset, isOpen, onClose, onRetryFix, onDownload }: FixModalProps) {
  if (!asset) return null;

  const result = asset.analysisResult;
  const hasFixedImage = !!asset.fixedImage;

  const handleDownload = () => {
    if (asset.fixedImage) {
      onDownload(asset.fixedImage, `fixed-${asset.name}`);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Image Compliance Details</span>
            <Badge variant={asset.type === 'MAIN' ? 'default' : 'secondary'}>
              {asset.type}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-100px)]">
          <div className="space-y-6 pr-4">
            {/* Side by Side Comparison */}
            <div className="grid grid-cols-2 gap-4">
              {/* Original Image */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Original</span>
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

              {/* Fixed Image */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">AI-Fixed Version</span>
                  {hasFixedImage && (
                    <Badge variant="default" className="bg-success text-success-foreground">
                      Compliant
                    </Badge>
                  )}
                </div>
                <div className="aspect-square rounded-lg overflow-hidden border border-border bg-muted relative">
                  {asset.isGeneratingFix ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                      <Loader2 className="w-10 h-10 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">Generating fix...</p>
                    </div>
                  ) : hasFixedImage ? (
                    <img
                      src={asset.fixedImage}
                      alt="Fixed"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-muted-foreground/10 flex items-center justify-center">
                        <ArrowRight className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Click "Generate Fix" below
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Analysis Details */}
            {result && (
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

                {/* Content Consistency */}
                {result.contentConsistency && (
                  <div className="p-4 rounded-lg bg-muted">
                    <div className="flex items-center gap-2 mb-2">
                      {result.contentConsistency.isConsistent ? (
                        <CheckCircle className="w-4 h-4 text-success" />
                      ) : (
                        <XCircle className="w-4 h-4 text-destructive" />
                      )}
                      <span className="font-medium">Content Consistency</span>
                    </div>
                    {result.contentConsistency.packagingTextDetected && (
                      <p className="text-sm text-muted-foreground mb-2">
                        <span className="font-medium">Detected on package:</span>{' '}
                        {result.contentConsistency.packagingTextDetected}
                      </p>
                    )}
                    {result.contentConsistency.discrepancies.length > 0 && (
                      <div className="space-y-1">
                        {result.contentConsistency.discrepancies.map((d, i) => (
                          <p key={i} className="text-sm text-destructive">• {d}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Violations */}
                {result.violations.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="font-medium text-destructive">
                      Violations ({result.violations.length})
                    </h5>
                    <div className="space-y-2">
                      {result.violations.map((v, i) => (
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
                          <p className="text-xs text-muted-foreground mt-1">
                            💡 {v.recommendation}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Fix Recommendations */}
                {result.fixRecommendations.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="font-medium text-primary">Recommendations</h5>
                    <ul className="list-disc list-inside space-y-1">
                      {result.fixRecommendations.map((rec, i) => (
                        <li key={i} className="text-sm text-muted-foreground">{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-border">
              {!hasFixedImage && result?.status === 'FAIL' && (
                <Button
                  onClick={() => onRetryFix(asset.id)}
                  disabled={asset.isGeneratingFix}
                  className="flex-1"
                >
                  {asset.isGeneratingFix ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Generate Fix
                </Button>
              )}
              {hasFixedImage && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => onRetryFix(asset.id)}
                    disabled={asset.isGeneratingFix}
                    className="flex-1"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Regenerate
                  </Button>
                  <Button onClick={handleDownload} className="flex-1">
                    <Download className="w-4 h-4 mr-2" />
                    Download Fixed
                  </Button>
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
