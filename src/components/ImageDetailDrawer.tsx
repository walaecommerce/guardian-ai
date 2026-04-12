import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ImageAsset, FixMethod } from '@/types';
import { BeforeAfterSlider } from '@/components/BeforeAfterSlider';
import { 
  CheckCircle, XCircle, AlertTriangle, Wand2, Download, 
  RotateCcw, Loader2, Layers, RefreshCw, Paintbrush, Scissors, X, Sparkles,
  Eye, Cpu, Tag, Link2, ExternalLink, ShieldCheck, ShieldAlert, ShieldX, Activity
} from 'lucide-react';
import {
  extractEvidence,
  groupFindings,
  buildDeterministicRuleIdSet,
  getSourceBadgeLabel,
  getSourceBadgeClass,
} from '@/utils/evidenceHelpers';

const FIX_METHOD_CONFIG: Record<FixMethod, { label: string; icon: React.ElementType; className: string }> = {
  'bg-segmentation': { label: 'A1 · BG Seg', icon: Layers, className: 'bg-cyan-500/90 text-white' },
  'full-regeneration': { label: 'A2 · Regen', icon: RefreshCw, className: 'bg-violet-500/90 text-white' },
  'surgical-edit': { label: 'T1 · Surgical', icon: Scissors, className: 'bg-emerald-500/90 text-white' },
  'enhancement': { label: 'Enhanced', icon: Sparkles, className: 'bg-purple-500/90 text-white' },
};

interface ImageDetailDrawerProps {
  asset: ImageAsset | null;
  isOpen: boolean;
  onClose: () => void;
  onRequestFix: (assetId: string) => void;
  onReverify: (assetId: string) => void;
  onDownload: (url: string, filename: string) => void;
  onViewFullDetails: (asset: ImageAsset) => void;
}

export function ImageDetailDrawer({
  asset, isOpen, onClose, onRequestFix, onReverify, onDownload, onViewFullDetails,
}: ImageDetailDrawerProps) {
  if (!asset) return null;

  const result = asset.analysisResult;
  const score = result?.overallScore;
  const status = result?.status;
  const violations = result?.violations || [];
  const hasFix = !!asset.fixedImage;

  const getScoreColor = (s: number) => {
    if (s >= 85) return 'text-success';
    if (s >= 70) return 'text-warning';
    return 'text-destructive';
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[440px] sm:w-[480px] p-0 flex flex-col">
        <SheetHeader className="px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base truncate pr-4">{asset.name}</SheetTitle>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant={asset.type === 'MAIN' ? 'default' : 'secondary'} className="text-xs">
                {asset.type}
              </Badge>
              {result?.productCategory && (
                <Badge variant="outline" className="text-xs">{result.productCategory}</Badge>
              )}
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-5 space-y-5">
            {/* Image preview or Before/After */}
            {hasFix ? (
              <div className="rounded-lg overflow-hidden border border-border">
                <BeforeAfterSlider
                  beforeImage={asset.preview}
                  afterImage={asset.fixedImage!}
                />
              </div>
            ) : (
              <div className="rounded-lg overflow-hidden border border-border bg-muted/30">
                <img 
                  src={asset.preview} 
                  alt={asset.name} 
                  className="w-full h-auto max-h-[280px] object-contain"
                />
              </div>
            )}

            {/* Score + Status */}
            {result && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {status === 'PASS' ? (
                    <CheckCircle className="w-6 h-6 text-success" />
                  ) : (
                    <XCircle className="w-6 h-6 text-destructive" />
                  )}
                  <div>
                    <p className={`text-2xl font-bold ${getScoreColor(score || 0)}`}>{score}%</p>
                    <p className="text-xs text-muted-foreground">{status}</p>
                  </div>
                </div>

                {/* Fix method badge */}
                {asset.fixMethod && (
                  <Badge className={FIX_METHOD_CONFIG[asset.fixMethod].className}>
                    {(() => { const Icon = FIX_METHOD_CONFIG[asset.fixMethod!].icon; return <Icon className="w-3 h-3 mr-1" />; })()}
                    {FIX_METHOD_CONFIG[asset.fixMethod].label}
                  </Badge>
                )}
              </div>
            )}

            {/* Policy vs Quality side-by-side */}
            {result && (result.policyStatus || result.qualityScore !== undefined) && (
              <div className="flex items-center gap-2 flex-wrap">
                {result.policyStatus && (() => {
                  const cfg = {
                    pass: { icon: ShieldCheck, label: 'Policy Pass', cls: 'bg-green-500/15 text-green-400 border-green-500/30' },
                    warning: { icon: ShieldAlert, label: 'Policy Warning', cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
                    fail: { icon: ShieldX, label: 'Policy Fail', cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
                  }[result.policyStatus];
                  const Icon = cfg.icon;
                  return (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.cls}`}>
                      <Icon className="w-3 h-3" /> {cfg.label}
                    </span>
                  );
                })()}
                {result.qualityScore !== undefined && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-muted/50 text-[10px] font-medium">
                    <Activity className="w-3 h-3 text-muted-foreground" />
                    Quality: <span className={`font-bold ${result.qualityScore >= 85 ? 'text-green-400' : result.qualityScore >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>{result.qualityScore}</span>
                  </span>
                )}
              </div>
            )}

            <Separator />

            {/* Evidence-grouped violations */}
            {violations.length > 0 && (() => {
              const detRuleIds = buildDeterministicRuleIdSet(result?.deterministicFindings);
              const groups = groupFindings(violations, detRuleIds);
              return (
                <div className="space-y-4">
                  {groups.map((group) => (
                    <div key={group.label} className="space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {group.label} ({group.items.length})
                      </h4>
                      <div className="space-y-2">
                        {group.items.map(({ violation: v, evidence: ev }, i) => (
                          <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/30 border border-border">
                            {v.severity === 'critical' ? (
                              <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                            ) : v.severity === 'warning' ? (
                              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                            ) : (
                              <CheckCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant={v.severity === 'critical' ? 'destructive' : 'secondary'} className="text-[10px] h-4">
                                  {v.severity}
                                </Badge>
                                <span className="text-xs text-muted-foreground">{v.category}</span>
                                {ev.ruleId && (
                                  <span className="font-mono text-[10px] text-foreground/60">{ev.ruleId}</span>
                                )}
                                <span className={`inline-flex items-center gap-0.5 px-1 py-0 rounded-full text-[9px] font-medium border ${getSourceBadgeClass(ev.findingSource)}`}>
                                  {getSourceBadgeLabel(ev.findingSource)}
                                </span>
                              </div>
                              <p className="text-sm mt-1">{v.message}</p>
                              {/* Evidence details */}
                              {(ev.whyTriggered || ev.measuredValue !== null || ev.ocrSnippet) && (
                                <div className="mt-1 text-[11px] text-muted-foreground space-y-0.5">
                                  {ev.whyTriggered && <p><span className="font-medium">Why:</span> {ev.whyTriggered}</p>}
                                  {ev.measuredValue !== null && (
                                    <p>
                                      <span className="font-medium">Measured:</span> {String(ev.measuredValue)}
                                      {ev.threshold !== null && <> · <span className="font-medium">Threshold:</span> {String(ev.threshold)}</>}
                                    </p>
                                  )}
                                  {ev.ocrSnippet && <p><span className="font-medium">OCR:</span> "{ev.ocrSnippet}"</p>}
                                </div>
                              )}
                              {ev.fixLikelihood && (
                                <span className="text-[10px] text-primary/80 font-medium mt-1 inline-block">⚡ {ev.fixLikelihood}</span>
                              )}
                              {v.recommendation && (
                                <p className="text-xs text-muted-foreground mt-1">{v.recommendation}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {violations.length === 0 && result && (
              <div className="text-center py-6 space-y-2">
                <CheckCircle className="w-10 h-10 text-success mx-auto" />
                <p className="text-sm font-medium">No violations found</p>
                <p className="text-xs text-muted-foreground">This image meets all compliance requirements</p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Bottom actions */}
        <div className="shrink-0 border-t border-border p-4 flex items-center gap-2 bg-card">
          {result && status !== 'PASS' && !hasFix && (
            <Button 
              onClick={() => onRequestFix(asset.id)} 
              disabled={asset.isGeneratingFix}
              className="flex-1"
            >
              {asset.isGeneratingFix ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4 mr-2" />
              )}
              {asset.isGeneratingFix ? 'Fixing...' : 'Fix Image'}
            </Button>
          )}

          {hasFix && (
            <>
              <Button 
                onClick={() => onDownload(asset.fixedImage!, `fixed_${asset.name}`)} 
                variant="default"
                className="flex-1"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Fix
              </Button>
              <Button 
                onClick={() => onReverify(asset.id)} 
                variant="outline" 
                size="icon"
                disabled={asset.isGeneratingFix}
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </>
          )}

          <Button 
            onClick={() => { onClose(); onViewFullDetails(asset); }} 
            variant="outline" 
            size="sm"
          >
            Full Details
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
