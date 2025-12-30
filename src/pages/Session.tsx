import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Header } from '@/components/Header';
import { AnalysisResults } from '@/components/AnalysisResults';
import { ComplianceReportCard } from '@/components/ComplianceReportCard';
import { BatchComparisonView } from '@/components/BatchComparisonView';
import { FixModal } from '@/components/FixModal';
import { ActivityLog } from '@/components/ActivityLog';
import { ImageAsset, LogEntry, AnalysisResult, FixAttempt, FixProgressState } from '@/types';
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
  Wrench
} from 'lucide-react';
import { uploadImage } from '@/services/imageStorage';
import { extractAsin } from '@/services/amazonScraper';

const Session = () => {
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

  const analyzeAsset = async (asset: ImageAsset): Promise<AnalysisResult | null> => {
    try {
      const base64 = await fileToBase64(asset.file);
      
      const { data, error } = await supabase.functions.invoke('analyze-image', {
        body: { imageBase64: base64, imageType: asset.type, listingTitle }
      });

      if (error) throw error;
      return data as AnalysisResult;
    } catch (error) {
      console.error('Analysis error:', error);
      return null;
    }
  };

  const handleRunAudit = async () => {
    if (assets.length === 0) return;
    
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
      
      const result = await analyzeAsset(asset);
      
      setAssets(prev => prev.map(a => 
        a.id === asset.id ? { ...a, isAnalyzing: false, analysisResult: result || undefined } : a
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
        addLog('error', `❌ Failed to analyze ${asset.name}`);
      }

      if (i < assets.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
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

    const { error } = await supabase.from('compliance_reports').insert([{
      amazon_url: amazonUrl || null,
      product_asin: productAsin || extractAsin(amazonUrl) || null,
      listing_title: listingTitle || null,
      total_images: analyzedAssets.length,
      passed_count: passedCount,
      failed_count: failedCount,
      average_score: avgScore,
      report_data: reportData,
      fixed_images_count: fixedCount
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
      let previousCritique: string | undefined;
      let lastGeneratedImage: string | undefined = previousGeneratedImage;
      let finalImage: string | undefined;
      const maxAttempts = 3;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        addLog('processing', `🖼️ Generation attempt ${attempt}/${maxAttempts}...`);
        
        try {
          setFixProgress(prev => prev ? {
            ...prev,
            attempt,
            currentStep: 'generating',
            thinkingSteps: [...prev.thinkingSteps, `🖼️ Generation attempt ${attempt}/${maxAttempts}...`]
          } : prev);

          const { data: genData, error: genError } = await supabase.functions.invoke('generate-fix', {
            body: { 
              imageBase64: originalBase64, 
              imageType: asset.type,
              generativePrompt: customPrompt || asset.analysisResult?.generativePrompt,
              mainImageBase64,
              previousCritique,
              previousGeneratedImage: lastGeneratedImage,
              productTitle: listingTitle || undefined,
              productAsin: productAsin || extractAsin(amazonUrl) || undefined,
              customPrompt,
              spatialAnalysis: asset.analysisResult?.spatialAnalysis
            }
          });

          if (genError) throw genError;
          if (genData?.error) throw new Error(genData.error);
          if (!genData?.fixedImage) throw new Error('No image generated');

          addLog('success', `✨ AI generation complete`);
          lastGeneratedImage = genData.fixedImage;

          const newAttempt: FixAttempt = {
            attempt,
            generatedImage: genData.fixedImage,
            status: 'verifying'
          };

          setFixProgress(prev => prev ? {
            ...prev,
            currentStep: 'verifying',
            intermediateImage: genData.fixedImage,
            attempts: [...prev.attempts, newAttempt],
            thinkingSteps: [...prev.thinkingSteps, '✨ Generation complete, verifying...']
          } : prev);

          addLog('processing', `🔍 Verifying product identity...`);

          const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-image', {
            body: { 
              originalImageBase64: originalBase64,
              generatedImageBase64: genData.fixedImage,
              imageType: asset.type,
              mainImageBase64,
              spatialAnalysis: asset.analysisResult?.spatialAnalysis,
            }
          });

          if (verifyError) throw verifyError;

          const score = verifyData?.score || 0;
          const passed = verifyData?.isSatisfactory === true;

          setFixProgress(prev => {
            if (!prev) return prev;
            const updatedAttempts = [...prev.attempts];
            const lastIdx = updatedAttempts.length - 1;
            if (lastIdx >= 0) {
              updatedAttempts[lastIdx] = {
                ...updatedAttempts[lastIdx],
                verification: verifyData as any,
                status: passed ? 'passed' : 'failed',
              };
            }
            return {
              ...prev,
              attempts: updatedAttempts,
              thinkingSteps: [...prev.thinkingSteps, 
                passed ? `✅ Verification passed (${score}%)` : `⚠️ Score ${score}%, retrying...`
              ]
            };
          });

          if (passed) {
            addLog('success', `✅ Verification passed: ${score}%`);
            finalImage = genData.fixedImage;
            break;
          } else {
            addLog('warning', `⚠️ Verification score: ${score}% - ${verifyData?.critique || 'Needs improvement'}`);
            previousCritique = verifyData?.critique;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Generation failed';
          addLog('error', `Attempt ${attempt} failed: ${msg}`);
          if (attempt === maxAttempts) throw err;
        }

        if (!finalImage && attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      if (!finalImage && lastGeneratedImage) {
        addLog('info', '📋 Using best available generation');
        finalImage = lastGeneratedImage;
      }

      if (finalImage) {
        setFixProgress(prev => prev ? { ...prev, currentStep: 'complete' } : prev);
        
        setAssets(prev => prev.map(a => 
          a.id === assetId ? { ...a, isGeneratingFix: false, fixedImage: finalImage } : a
        ));

        // Update database
        const sessionImageId = assetSessionMap.get(assetId);
        if (sessionImageId && currentSessionId) {
          const uploaded = await uploadImage(finalImage, currentSessionId, `fixed_${assetId}`);
          if (uploaded) {
            await supabase
              .from('session_images')
              .update({
                fixed_image_url: uploaded.url,
                status: 'fixed'
              })
              .eq('id', sessionImageId);
          }

          await supabase
            .from('enhancement_sessions')
            .update({
              fixed_count: assets.filter(a => a.fixedImage || a.id === assetId).length
            })
            .eq('id', currentSessionId);
        }
        
        addLog('success', `🎉 Fix complete for ${asset.name}`);
        toast({ title: 'Fix Generated', description: 'AI-corrected image is ready and saved' });
      }
    } catch (error) {
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
    const failedAssets = assets.filter(a => a.analysisResult?.status === 'FAIL' && !a.fixedImage);
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
  const failedCount = assets.filter(a => a.analysisResult?.status === 'FAIL').length;
  const fixedCount = assets.filter(a => a.fixedImage).length;

  // Loading state
  if (isLoadingSession) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
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
        <Header />
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-6">
        {/* Back Navigation & Session Info */}
        <div className="mb-6">
          <Link 
            to="/" 
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
          
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
                      <Badge variant="outline" className={getStatusColor(sessionStatus)}>
                        {sessionStatus.replace('_', ' ')}
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
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      {passedCount} passed
                    </span>
                    <span className="flex items-center gap-1">
                      <XCircle className="h-4 w-4 text-red-500" />
                      {failedCount} failed
                    </span>
                    {fixedCount > 0 && (
                      <span className="flex items-center gap-1">
                        <Wrench className="h-4 w-4 text-blue-500" />
                        {fixedCount} fixed
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
                  {isAnalyzing ? 'Analyzing...' : 'Run Audit'}
                </Button>
                {failedCount > 0 && (
                  <Button 
                    onClick={handleBatchFix} 
                    disabled={isBatchFixing}
                    variant="outline"
                    className="w-full"
                  >
                    {isBatchFixing ? 'Fixing...' : `Fix All Failed (${failedCount})`}
                  </Button>
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
                {assets.some(a => a.analysisResult) && (
                  <Button onClick={handleSaveReport} variant="outline" size="sm">
                    <Save className="h-4 w-4 mr-2" />
                    Save Report
                  </Button>
                )}
              </div>
              <TabsContent value="results">
                <AnalysisResults
                  assets={assets}
                  listingTitle={listingTitle}
                  onRequestFix={(id) => handleRequestFix(id)}
                  onViewDetails={handleViewDetails}
                  onBatchFix={handleBatchFix}
                  isBatchFixing={isBatchFixing}
                  productAsin={productAsin || undefined}
                />
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
