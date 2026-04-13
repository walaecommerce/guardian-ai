import { useState, useEffect, useCallback, useRef } from 'react';
import { useCreditGate } from '@/hooks/useCreditGate';
import { useCredits } from '@/hooks/useCredits';
import { RATE_LIMITS } from '@/config/models';
import { useParams, Link } from 'react-router-dom';

import { AnalysisResults } from '@/components/AnalysisResults';
import { ComplianceReportCard } from '@/components/ComplianceReportCard';
import { BatchComparisonView } from '@/components/BatchComparisonView';
import { FixModal } from '@/components/FixModal';
import { ActivityLog } from '@/components/ActivityLog';
import { ManualReviewLane, isManualReviewAsset } from '@/components/ManualReviewLane';
import { ImageAsset, LogEntry, AnalysisResult, FixAttempt, FixProgressState, ProductIdentityCard } from '@/types';
import { runFixOrchestration, buildFixReviewPayload } from '@/utils/fixOrchestrator';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSessionLoader } from '@/hooks/useSessionLoader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  ArrowLeft, 
  Save, 
  ExternalLink, 
  Package, 
  AlertCircle,
  CheckCircle2,
  XCircle,
  Wrench,
  Loader2,
  Sparkles,
  Wand2
} from 'lucide-react';
import { uploadImage } from '@/services/imageStorage';
import { extractAsin } from '@/services/amazonScraper';

const Session = () => {
  const { refresh: refreshCredits } = useCredits();
  const { guard: creditGate } = useCreditGate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { loadSession, isLoading: isLoadingSession, error: loadError } = useSessionLoader();
  const [assets, setAssets] = useState<ImageAsset[]>([]);
  const [listingTitle, setListingTitle] = useState('');
  const [amazonUrl, setAmazonUrl] = useState('');
  const [productAsin, setProductAsin] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [assetSessionMap, setAssetSessionMap] = useState<Map<string, string>>(new Map());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isBatchFixing, setIsBatchFixing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<ImageAsset | null>(null);
  const [showFixModal, setShowFixModal] = useState(false);
  const [fixProgress, setFixProgress] = useState<FixProgressState | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string>('');
  const [sessionCreatedAt, setSessionCreatedAt] = useState<string>('');
  const [productIdentity, setProductIdentity] = useState<ProductIdentityCard | null>(null);
  const { toast } = useToast();

  const addLog = useCallback((level: LogEntry['level'], message: string) => {
    setLogs(prev => [...prev, {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date(),
      level,
      message,
    }]);
  }, []);

  // Load session on mount
  useEffect(() => {
    if (!sessionId) return;

    const load = async () => {
      addLog('processing', '📂 Loading session from history...');
      const data = await loadSession(sessionId);
      
      if (data) {
        setAssets(data.assets);
        setAssetSessionMap(data.assetSessionMap);
        setCurrentSessionId(data.session.id);
        setListingTitle(data.session.listing_title || '');
        setAmazonUrl(data.session.amazon_url || '');
        setProductAsin(data.session.product_asin);
        setSessionStatus(data.session.status);
        setSessionCreatedAt(data.session.created_at);
        if (data.productIdentity) setProductIdentity(data.productIdentity);
        
        addLog('success', `✅ Loaded ${data.assets.length} images from session`);
        addLog('info', `📦 Product: ${data.session.listing_title || 'Untitled'}`);
        
        toast({
          title: 'Session Loaded',
          description: `Restored ${data.assets.length} images from your previous work`
        });
      }
    };

    load();
  }, [sessionId, loadSession, addLog, toast]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const analyzeAsset = async (asset: ImageAsset): Promise<{ result: AnalysisResult | null; error?: string }> => {
    try {
      const base64 = await fileToBase64(asset.file);
      
      const { data, error } = await supabase.functions.invoke('analyze-image', {
        body: { imageBase64: base64, imageType: asset.type, listingTitle }
      });

      if (error) {
        let errorMsg = 'Analysis failed';
        try {
          if ((error as any)?.context?.json) {
            const body = await (error as any).context.json();
            errorMsg = body?.error || body?.message || errorMsg;
          } else if (error instanceof Error) {
            errorMsg = error.message;
          }
        } catch { /* use default */ }
        const status = (error as any)?.context?.status;
        if (status === 402) errorMsg = 'AI credits exhausted';
        return { result: null, error: errorMsg };
      }
      return { result: data as AnalysisResult };
    } catch (error: any) {
      console.error('Analysis error:', error);
      return { result: null, error: error?.message || 'Analysis failed' };
    }
  };

  const handleRunAudit = async () => {
    if (assets.length === 0) return;
    if (!creditGate('analyze')) return;
    
    setIsAnalyzing(true);
    addLog('processing', `🔍 Guardian initializing batch audit...`);
    addLog('info', `📦 ${assets.length} images queued for compliance check`);

    let passedCount = 0;
    let failedCount = 0;
    const scores: number[] = [];

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      
      setAssets(prev => prev.map(a => 
        a.id === asset.id ? { ...a, isAnalyzing: true } : a
      ));

      addLog('processing', `🔬 Scanning ${asset.type} image: ${asset.name}`);
      
      const { result, error: analysisError } = await analyzeAsset(asset);
      
      setAssets(prev => prev.map(a => 
        a.id === asset.id ? { ...a, isAnalyzing: false, analysisResult: result || undefined, analysisError: result ? undefined : (analysisError || 'Analysis failed') } : a
      ));

      if (result) {
        const statusLog = result.status === 'PASS' ? 'success' : 'warning';
        const emoji = result.status === 'PASS' ? '✅' : '⚠️';
        addLog(statusLog, `${emoji} ${asset.name}: Score ${result.overallScore}% - ${result.status}`);
        
        if (result.status === 'PASS') passedCount++;
        else failedCount++;
        scores.push(result.overallScore);
        
        // Update session_image in database
        const sessionImageId = assetSessionMap.get(asset.id);
        if (sessionImageId) {
          const imageStatus = result.status === 'PASS' ? 'passed' : 'failed';
          await supabase
            .from('session_images')
            .update({
              analysis_result: JSON.parse(JSON.stringify(result)),
              status: imageStatus
            })
            .eq('id', sessionImageId);
        }
      } else {
        addLog('error', `❌ Failed to analyze ${asset.name}${analysisError ? ': ' + analysisError : ''}`);
      }

      // Rate limit delays
      if (i < assets.length - 1) {
        const imageNumber = i + 1; // 1-indexed count of completed images
        
        // Every N images, do a cooldown
        if (imageNumber % RATE_LIMITS.batchCooldownEvery === 0) {
          const cooldownSec = Math.round(RATE_LIMITS.batchCooldownDuration / 1000);
          addLog('info', `⏳ Rate limit cooldown after ${imageNumber} images...`);
          for (let sec = cooldownSec; sec > 0; sec--) {
            addLog('processing', `   Cooldown: resuming in ${sec}s...`);
            await new Promise(r => setTimeout(r, 1000));
          }
          addLog('success', `   ✓ Cooldown complete, resuming...`);
        } else {
          // Standard delay between images
          const delaySec = Math.round(RATE_LIMITS.delayBetweenRequests / 1000);
          addLog('info', `⏳ Rate limit pause (${delaySec}s)...`);
          await new Promise(r => setTimeout(r, RATE_LIMITS.delayBetweenRequests));
        }
      }
    }

    // Update session summary
    if (currentSessionId) {
      const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
      await supabase
        .from('enhancement_sessions')
        .update({
          passed_count: passedCount,
          failed_count: failedCount,
          average_score: avgScore
        })
        .eq('id', currentSessionId);
    }

    addLog('success', '🎯 Guardian batch audit complete');
    setIsAnalyzing(false);
    toast({ title: 'Audit Complete', description: 'All images analyzed and saved.' });
    refreshCredits();
  };

  const handleSaveReport = async () => {
    const analyzedAssets = assets.filter(a => a.analysisResult);
    if (analyzedAssets.length === 0) {
      toast({ title: 'No Analysis', description: 'Run an audit first before saving', variant: 'destructive' });
      return;
    }

    const passedCount = analyzedAssets.filter(a => a.analysisResult?.status === 'PASS').length;
    const failedCount = analyzedAssets.filter(a => a.analysisResult?.status === 'FAIL').length;
    const fixedCount = assets.filter(a => a.fixedImage).length;
    const scores = analyzedAssets.map(a => a.analysisResult?.overallScore || 0);
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

    const reportData = JSON.parse(JSON.stringify({
      images: analyzedAssets.map(a => ({
        name: a.name,
        type: a.type,
        score: a.analysisResult?.overallScore,
        status: a.analysisResult?.status,
        violations: a.analysisResult?.violations,
        hasFixedImage: !!a.fixedImage
      }))
    }));

    const { data: { user: currentUser } } = await supabase.auth.getUser();
    const { error } = await supabase.from('compliance_reports').insert([{
      amazon_url: amazonUrl || null,
      product_asin: productAsin || extractAsin(amazonUrl) || null,
      listing_title: listingTitle || null,
      total_images: analyzedAssets.length,
      passed_count: passedCount,
      failed_count: failedCount,
      average_score: avgScore,
      report_data: reportData,
      fixed_images_count: fixedCount,
      user_id: currentUser?.id
    }]);

    if (error) {
      addLog('error', `Failed to save report: ${error.message}`);
      toast({ title: 'Save Failed', description: error.message, variant: 'destructive' });
    } else {
      addLog('success', '💾 Compliance report saved to history');
      toast({ title: 'Report Saved', description: 'You can view it in Report History' });
    }
  };

  const handleRequestFix = async (assetId: string, previousGeneratedImage?: string, customPrompt?: string) => {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;

    // Fixability check — mirror the main audit workspace logic
    const { classifyAssetFixability } = await import('@/utils/fixability');
    const fixability = classifyAssetFixability(asset);
    if (fixability.tier === 'manual_review' || fixability.tier === 'warn_only') {
      addLog('warning', `⏭️ ${asset.name}: ${fixability.reason}`);
      const unresolvedState = fixability.tier === 'manual_review' ? 'manual_review' as const : 'warn_only' as const;
      setAssets(prev => prev.map(a => a.id === assetId ? {
        ...a,
        fixabilityTier: fixability.tier,
        unresolvedState,
        batchFixStatus: 'skipped' as const,
        batchSkipReason: fixability.reason,
      } : a));

      // Persist to DB
      const sessionImageId = assetSessionMap.get(assetId);
      if (sessionImageId && currentSessionId) {
        supabase.from('session_images').update({
          status: 'skipped',
          fix_attempts: { skipped: true, skipReason: fixability.reason, fixabilityTier: fixability.tier, unresolvedState } as any,
        }).eq('id', sessionImageId).then(() => {});
      }

      toast({
        title: fixability.tier === 'manual_review' ? 'Manual Review Required' : 'Cannot Auto-Fix',
        description: fixability.reason,
        variant: 'destructive',
        duration: 6000,
      });
      return;
    }

    if (!creditGate('fix')) return;

    try {
      const mainAsset = assets.find(a => a.type === 'MAIN' && a.id !== assetId);
      let mainImageBase64: string | undefined;
      
      if (asset.type === 'SECONDARY' && mainAsset) {
        mainImageBase64 = await fileToBase64(mainAsset.fixedImage ? 
          await fetch(mainAsset.fixedImage).then(r => r.blob()).then(b => new File([b], 'main.jpg')) : 
          mainAsset.file
        );
        addLog('info', `🔗 Cross-referencing with MAIN product image`);
      }

      setAssets(prev => prev.map(a => 
        a.id === assetId ? { ...a, isGeneratingFix: true } : a
      ));

      const initProgress: FixProgressState = {
        attempt: 1,
        maxAttempts: 3,
        currentStep: 'generating',
        attempts: [],
        thinkingSteps: ['🚀 Initializing AI generation pipeline...']
      };
      setFixProgress(initProgress);

      addLog('processing', `🎨 Guardian initiating ${asset.type} image fix...`);

      const originalBase64 = await fileToBase64(asset.file);

      const result = await runFixOrchestration(
        {
          asset,
          originalBase64,
          mainImageBase64,
          listingTitle: listingTitle || undefined,
          productAsin: productAsin || extractAsin(amazonUrl) || undefined,
          customPrompt,
          previousGeneratedImage,
          productIdentity,
        },
        {
          onProgress: setFixProgress,
          onLog: addLog,
        },
      );

      const { finalImage, allAttempts, bestAttemptSelection, stopReason, lastStrategy, lastFixMethod } = result;

      if (finalImage) {
        setAssets(prev => prev.map(a => 
          a.id === assetId ? { 
            ...a, 
            isGeneratingFix: false, 
            fixedImage: finalImage,
            fixMethod: lastFixMethod,
            fixAttempts: allAttempts.length > 0 ? allAttempts : undefined,
            bestAttemptSelection,
            selectedAttemptIndex: bestAttemptSelection?.selectedAttemptIndex,
            fixStopReason: stopReason,
            lastFixStrategy: lastStrategy,
          } : a
        ));
        setFixProgress(null);

        // Persist to DB
        const sessionImageId = assetSessionMap.get(assetId);
        if (sessionImageId && currentSessionId) {
          const uploaded = await uploadImage(finalImage, currentSessionId, `fixed_${asset.name}`);
          if (uploaded) {
            const fixReviewData = buildFixReviewPayload(allAttempts, bestAttemptSelection, stopReason, lastStrategy);
            await supabase.from('session_images').update({
              fixed_image_url: uploaded.url,
              status: 'fixed',
              fix_attempts: fixReviewData as any,
            }).eq('id', sessionImageId);
            await supabase.from('enhancement_sessions').update({ 
              fixed_count: assets.filter(a => a.fixedImage || a.id === assetId).length
            }).eq('id', currentSessionId);
          }
        }
        
        addLog('success', `🎉 Fix complete for ${asset.name}`);
        toast({ title: 'Fix Generated', description: 'AI-corrected image is ready and saved' });
        refreshCredits();
      } else {
        // No acceptable fix — persist as retry-stopped / auto-fix-failed
        const unresolvedState = stopReason ? 'retry_stopped' as const : 'auto_fix_failed' as const;
        setAssets(prev => prev.map(a => 
          a.id === assetId ? { 
            ...a, 
            isGeneratingFix: false,
            fixStopReason: stopReason || 'No acceptable fix produced after all attempts',
            batchFixStatus: 'failed' as const,
            unresolvedState,
            fixAttempts: allAttempts.length > 0 ? allAttempts : undefined,
            lastFixStrategy: lastStrategy,
          } : a
        ));
        setFixProgress(null);

        // Persist to DB
        const sessionImageId = assetSessionMap.get(assetId);
        if (sessionImageId && currentSessionId) {
          const fixReviewData = buildFixReviewPayload(allAttempts, bestAttemptSelection, stopReason, lastStrategy, unresolvedState);
          await supabase.from('session_images').update({
            status: 'failed',
            fix_attempts: fixReviewData as any,
          }).eq('id', sessionImageId);
        }

        addLog('warning', `⚠️ ${asset.name}: ${stopReason || 'No acceptable fix produced after all attempts'}`);
        toast({ title: 'Fix Incomplete', description: stopReason || 'No acceptable fix after all attempts. Image needs manual review.', variant: 'destructive' });
      }
    } catch (error: any) {
      if (error.isPayment) {
        toast({ title: 'Credits Exhausted', description: error.message, variant: 'destructive' });
        setAssets(prev => prev.map(a => a.id === assetId ? { ...a, isGeneratingFix: false } : a));
        setFixProgress(null);
        return;
      }
      const msg = error instanceof Error ? error.message : 'Fix failed';
      addLog('error', `❌ Fix failed: ${msg}`);
      setAssets(prev => prev.map(a => 
        a.id === assetId ? { ...a, isGeneratingFix: false } : a
      ));
      setFixProgress(null);
      toast({ title: 'Fix Failed', description: msg, variant: 'destructive' });
    }
  };

  const handleBatchFix = async () => {
    // Exclude manual-review/skipped assets from batch fix — consistent with main audit workspace
    const failedAssets = assets.filter(a => 
      (a.analysisResult?.status === 'FAIL' || a.analysisResult?.status === 'WARNING') && !a.fixedImage
      && !isManualReviewAsset(a)
    );
    if (failedAssets.length === 0) return;
    
    setIsBatchFixing(true);
    addLog('processing', `🔧 Starting batch fix for ${failedAssets.length} images...`);
    
    for (const asset of failedAssets) {
      await handleRequestFix(asset.id);
      await new Promise(r => setTimeout(r, 1000));
    }
    
    if (currentSessionId) {
      await supabase
        .from('enhancement_sessions')
        .update({ status: 'completed' })
        .eq('id', currentSessionId);
    }
    
    setIsBatchFixing(false);
    addLog('success', `✅ Batch fix complete!`);
    toast({ title: 'Batch Fix Complete', description: `Fixed ${failedAssets.length} images` });
    refreshCredits();
  };

  const handleReverify = async (assetId: string) => {
    const asset = assets.find(a => a.id === assetId);
    if (!asset || !asset.fixedImage) return;

    setAssets(prev => prev.map(a => 
      a.id === assetId ? { ...a, isGeneratingFix: true } : a
    ));
    addLog('processing', `🔍 Re-verifying fixed image: ${asset.name}...`);

    try {
      const originalBase64 = await fileToBase64(asset.file);
      
      // Get main image for cross-reference
      const mainAsset = assets.find(a => a.type === 'MAIN' && a.id !== assetId);
      let mainImageBase64: string | undefined;
      if (asset.type === 'SECONDARY' && mainAsset) {
        mainImageBase64 = await fileToBase64(mainAsset.fixedImage ? 
          await fetch(mainAsset.fixedImage).then(r => r.blob()).then(b => new File([b], 'main.jpg')) : 
          mainAsset.file
        );
      }

      const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-image', {
        body: { 
          originalImageBase64: originalBase64,
          generatedImageBase64: asset.fixedImage,
          imageType: asset.type,
          mainImageBase64,
          spatialAnalysis: asset.analysisResult?.spatialAnalysis,
        }
      });

      if (verifyError) throw verifyError;

      const score = verifyData?.score || 0;
      const passed = verifyData?.isSatisfactory === true;
      
      addLog(passed ? 'success' : 'warning', `${passed ? '✅' : '⚠️'} Re-verification: ${score}% - ${passed ? 'PASS' : 'FAIL'}`);
      
      if (verifyData?.passedChecks?.length > 0) {
        verifyData.passedChecks.slice(0, 3).forEach((check: string) => 
          addLog('info', `   ✓ ${check}`)
        );
      }
      if (verifyData?.failedChecks?.length > 0) {
        verifyData.failedChecks.slice(0, 3).forEach((check: string) => 
          addLog('warning', `   ✗ ${check}`)
        );
      }
      
      toast({ 
        title: passed ? 'Verification Passed' : 'Verification Issues Found',
        description: `Score: ${score}% - ${verifyData?.critique || (passed ? 'Image meets standards' : 'Some improvements needed')}`,
        variant: passed ? 'default' : 'destructive'
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Verification failed';
      addLog('error', `❌ Re-verification failed: ${msg}`);
      toast({ title: 'Verification Failed', description: msg, variant: 'destructive' });
    } finally {
      setAssets(prev => prev.map(a => 
        a.id === assetId ? { ...a, isGeneratingFix: false } : a
      ));
    }
  };

  const handleViewDetails = (asset: ImageAsset) => {
    setSelectedAsset(asset);
    setShowFixModal(true);
  };

  const handleDownload = (imageUrl: string, filename: string) => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = filename;
    link.click();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'in_progress': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const passedCount = assets.filter(a => a.analysisResult?.status === 'PASS').length;
  const manualReviewAssets = assets.filter(isManualReviewAsset);
  const failedCount = assets.filter(a => a.analysisResult?.status === 'FAIL' && !manualReviewAssets.some(m => m.id === a.id)).length;
  const fixedCount = assets.filter(a => a.fixedImage).length;

  // Loading state
  if (isLoadingSession) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <main className="flex-1 container mx-auto px-4 py-6">
          <div className="space-y-6">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-32 w-full" />
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-4 space-y-4">
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
              <div className="lg:col-span-8">
                <Skeleton className="h-96 w-full" />
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Error state
  if (loadError) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <main className="flex-1 container mx-auto px-4 py-6">
          <Card className="max-w-md mx-auto mt-20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                Session Not Found
              </CardTitle>
              <CardDescription>{loadError}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link to="/">
                <Button className="w-full">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Home
                </Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const isStudioOrigin = (productIdentity as any)?.origin === 'studio';
  const studioMeta = isStudioOrigin ? productIdentity as any : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      
      
      <main className="flex-1 container mx-auto px-4 py-6">
        {/* Back Navigation & Session Info */}
        <div className="mb-6">
          <Link 
            to={isStudioOrigin ? "/studio" : "/"} 
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            {isStudioOrigin ? 'Back to Studio' : 'Back to Home'}
          </Link>
          
          {isStudioOrigin && (
            <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg border border-primary/20 bg-primary/5">
              <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
              <p className="text-sm text-foreground">
                This session was created from <strong>Studio</strong> ({studioMeta?.templateName || studioMeta?.template}).
                Run the fixer below to improve compliance, then download the result.
              </p>
            </div>
          )}
          
          <Card className="bg-muted/30 border-border/50">
            <CardContent className="py-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Package className="h-6 w-6 text-primary mt-0.5" />
                  <div>
                    <h1 className="text-lg font-semibold">{listingTitle || 'Untitled Session'}</h1>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-muted-foreground">
                      {productAsin && (
                        <span className="font-mono">{productAsin}</span>
                      )}
                      {isStudioOrigin && (
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                          Studio
                        </Badge>
                      )}
                      <Badge variant="outline" className={getStatusColor(sessionStatus)}>
                        {sessionStatus === 'in_progress' ? 'In Progress' : sessionStatus === 'completed' ? 'Completed' : sessionStatus.charAt(0).toUpperCase() + sessionStatus.slice(1)}
                      </Badge>
                      {sessionCreatedAt && (
                        <span>
                          Created {new Date(sessionCreatedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      {passedCount} passed
                    </span>
                    <span className="flex items-center gap-1">
                      <XCircle className="h-4 w-4 text-destructive" />
                      {failedCount} failed
                    </span>
                    {fixedCount > 0 && (
                      <span className="flex items-center gap-1">
                        <Wrench className="h-4 w-4 text-primary" />
                        {fixedCount} fixed
                      </span>
                    )}
                    {manualReviewAssets.length > 0 && (
                      <span className="flex items-center gap-1 text-warning">
                        <AlertCircle className="h-4 w-4" />
                        {manualReviewAssets.length} review
                      </span>
                    )}
                  </div>
                  
                  {amazonUrl && (
                    <a 
                      href={amazonUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      View on Amazon <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
          {/* Left Panel */}
          <div className="lg:col-span-4 space-y-4">
            {/* Quick Actions */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button 
                  onClick={handleRunAudit} 
                  disabled={assets.length === 0 || isAnalyzing}
                  className="w-full"
                >
                  {isAnalyzing ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analyzing…</>
                  ) : assets.some(a => a.analysisResult) ? (
                    'Re-run Audit'
                  ) : isStudioOrigin ? (
                    <><Sparkles className="w-4 h-4 mr-2" />Analyze Compliance</>
                  ) : (
                    'Run Audit'
                  )}
                </Button>
                {failedCount > 0 && (
                  <Button 
                    onClick={handleBatchFix} 
                    disabled={isBatchFixing}
                    variant={isStudioOrigin ? 'default' : 'outline'}
                    className="w-full"
                  >
                    {isBatchFixing ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Fixing…</>
                    ) : isStudioOrigin ? (
                      <><Wand2 className="w-4 h-4 mr-2" />Fix Compliance Issues</>
                    ) : (
                      `Fix All Failed (${failedCount})`
                    )}
                  </Button>
                )}
                {assets.some(a => a.analysisResult) && failedCount === 0 && (
                  <p className="text-xs text-center text-green-600 font-medium py-1">
                    ✓ All images passed — save or export your report.
                  </p>
                )}
                {failedCount > 0 && fixedCount >= failedCount && (
                  <p className="text-xs text-center text-primary font-medium py-1">
                    ✓ All issues fixed — save your results.
                  </p>
                )}
                {assets.some(a => a.analysisResult) && (
                  <Button 
                    onClick={handleSaveReport} 
                    variant="outline"
                    className="w-full"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Save to History
                  </Button>
                )}
                {assets.length === 0 && !isStudioOrigin && (
                  <div className="text-center py-2 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      No images loaded. Try importing again from the audit page.
                    </p>
                    <Link to="/audit">
                      <Button variant="outline" size="sm" className="text-xs">
                        <ArrowLeft className="h-3 w-3 mr-1" /> Try Again from Audit
                      </Button>
                    </Link>
                  </div>
                )}
                {assets.length === 0 && isStudioOrigin && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    The Studio image didn't load. Go back to Studio and try again.
                  </p>
                )}
              </CardContent>
            </Card>
            
            {/* Compliance Report Card */}
            {(assets.some(a => a.analysisResult) || isAnalyzing) && (
              <ComplianceReportCard 
                assets={assets} 
                isAnalyzing={isAnalyzing}
              />
            )}
            
            <ActivityLog logs={logs} />
          </div>

          {/* Right Panel - Results */}
          <div className="lg:col-span-8">
            <Tabs defaultValue="results" className="w-full">
              <div className="flex items-center justify-between mb-4">
                <TabsList>
                  <TabsTrigger value="results">Analysis Results</TabsTrigger>
                  <TabsTrigger value="comparison">Before / After</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="results">
                {assets.length === 0 ? (
                  <Card className="py-12">
                    <CardContent className="text-center">
                      <Package className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground mb-3">This session has no images yet</p>
                      <Link to="/audit">
                        <Button variant="outline" size="sm">
                          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                          Start a New Audit
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-6">
                    {/* Manual Review lane — consistent with /audit workspace */}
                    <ManualReviewLane assets={manualReviewAssets} onViewDetails={handleViewDetails} />

                    <AnalysisResults
                      assets={assets}
                      listingTitle={listingTitle}
                      onRequestFix={(id) => handleRequestFix(id)}
                      onViewDetails={handleViewDetails}
                      onReverify={handleReverify}
                      onBatchFix={handleBatchFix}
                      onRetryAudit={handleRunAudit}
                      isBatchFixing={isBatchFixing}
                      productAsin={productAsin || undefined}
                    />
                  </div>
                )}
              </TabsContent>
              <TabsContent value="comparison">
                <BatchComparisonView
                  assets={assets}
                  onViewDetails={handleViewDetails}
                  onDownload={handleDownload}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>

      <FixModal
        asset={selectedAsset}
        isOpen={showFixModal}
        onClose={() => { setShowFixModal(false); setFixProgress(null); }}
        onRetryFix={(id, prevImage, customPrompt) => handleRequestFix(id, prevImage, customPrompt)}
        onDownload={handleDownload}
        fixProgress={fixProgress || undefined}
      />
    </div>
  );
};

export default Session;
