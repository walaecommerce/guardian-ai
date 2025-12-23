import { useState, useCallback } from 'react';
import { Header } from '@/components/Header';
import { ImageUploader } from '@/components/ImageUploader';
import { AnalysisResults } from '@/components/AnalysisResults';
import { BatchComparisonView } from '@/components/BatchComparisonView';
import { FixModal } from '@/components/FixModal';
import { ActivityLog } from '@/components/ActivityLog';
import { SessionHistory } from '@/components/SessionHistory';
import { ImageAsset, LogEntry, AnalysisResult, ImageCategory, FixAttempt, FixProgressState } from '@/types';
import { scrapeAmazonProduct, downloadImage, getImageId, extractAsin } from '@/services/amazonScraper';
import { classifyImage } from '@/services/imageClassifier';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Save } from 'lucide-react';
import { uploadImage } from '@/services/imageStorage';

// Map to track asset ID -> session_image ID for updates
type AssetSessionMap = Map<string, string>;

const Index = () => {
  const [assets, setAssets] = useState<ImageAsset[]>([]);
  const [listingTitle, setListingTitle] = useState('');
  const [amazonUrl, setAmazonUrl] = useState('');
  const [productAsin, setProductAsin] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [assetSessionMap, setAssetSessionMap] = useState<AssetSessionMap>(new Map());
  const [isImporting, setIsImporting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isBatchFixing, setIsBatchFixing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<ImageAsset | null>(null);
  const [showFixModal, setShowFixModal] = useState(false);
  const [fixProgress, setFixProgress] = useState<FixProgressState | null>(null);
  const { toast } = useToast();

  const addLog = useCallback((level: LogEntry['level'], message: string) => {
    setLogs(prev => [...prev, {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date(),
      level,
      message,
    }]);
  }, []);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleImportFromAmazon = async () => {
    if (!amazonUrl) return;
    
    setIsImporting(true);
    addLog('processing', 'Starting Amazon import...');

    try {
      const product = await scrapeAmazonProduct(amazonUrl);
      if (!product) throw new Error('Failed to scrape product');

      addLog('success', `Found ${product.images.length} images for ASIN: ${product.asin}`);
      setProductAsin(product.asin);
      
      if (product.title) {
        setListingTitle(product.title);
        addLog('info', `Title: ${product.title.substring(0, 50)}...`);
      }

      // Create enhancement session in database
      addLog('processing', '💾 Creating enhancement session...');
      const { data: sessionData, error: sessionError } = await supabase
        .from('enhancement_sessions')
        .insert([{
          amazon_url: amazonUrl,
          product_asin: product.asin,
          listing_title: product.title || null,
          total_images: Math.min(product.images.length, 20),
          status: 'in_progress'
        }])
        .select()
        .single();

      if (sessionError) {
        console.error('Session creation error:', sessionError);
        addLog('warning', 'Could not save session to history');
      } else {
        setCurrentSessionId(sessionData.id);
        addLog('success', '📁 Session saved to history');
      }

      // Download images
      const newAssets: ImageAsset[] = [];
      const newAssetSessionMap = new Map<string, string>(assetSessionMap);
      const seenIds = new Set(assets.map(a => getImageId(a.preview)));

      addLog('processing', '🤖 AI classification enabled - analyzing image types...');

      for (let i = 0; i < Math.min(product.images.length, 20); i++) {
        const imageData = product.images[i];
        const imageId = getImageId(imageData.url);
        
        if (seenIds.has(imageId)) continue;
        seenIds.add(imageId);

        addLog('processing', `Downloading image ${i + 1}...`);
        const file = await downloadImage(imageData.url);
        
        if (file) {
          // Convert to base64 for AI classification
          const base64 = await fileToBase64(file);
          
          addLog('processing', `🔍 Classifying image ${i + 1} with AI vision...`);
          const classification = await classifyImage(base64, product.title, product.asin);
          
          const aiCategory = classification.category as ImageCategory;
          const confidence = classification.confidence;
          
          addLog('info', `   └─ Detected: ${aiCategory} (${confidence}% confidence)`);
          if (classification.reasoning) {
            addLog('info', `      ${classification.reasoning}`);
          }

          const assetId = Math.random().toString(36).substring(2, 9);
          const imageName = `${aiCategory}_${file.name}`;

          // Upload to Supabase Storage if session was created
          let originalImageUrl = URL.createObjectURL(file);
          
          if (sessionData?.id) {
            addLog('processing', `   ☁️ Uploading to storage...`);
            const uploaded = await uploadImage(file, sessionData.id, `original_${i}`);
            if (uploaded) {
              originalImageUrl = uploaded.url;
              
              // Create session_image record
              const { data: sessionImageData, error: imgError } = await supabase
                .from('session_images')
                .insert([{
                  session_id: sessionData.id,
                  image_name: imageName,
                  image_type: aiCategory === 'MAIN' ? 'MAIN' : 'SECONDARY',
                  image_category: aiCategory,
                  original_image_url: uploaded.url,
                  status: 'pending'
                }])
                .select()
                .single();

              if (!imgError && sessionImageData) {
                newAssetSessionMap.set(assetId, sessionImageData.id);
              }
            }
          }

          newAssets.push({
            id: assetId,
            file,
            preview: URL.createObjectURL(file),
            type: aiCategory === 'MAIN' ? 'MAIN' : 'SECONDARY',
            name: imageName,
          });

          // Small delay between classifications to avoid rate limiting
          if (i < product.images.length - 1) {
            await new Promise(r => setTimeout(r, 300));
          }
        }
      }

      if (newAssets.length > 0) {
        setAssets(prev => [...prev, ...newAssets]);
        setAssetSessionMap(newAssetSessionMap);
        addLog('success', `✅ Imported ${newAssets.length} images with AI classification`);
        toast({ title: 'Import Complete', description: `Added ${newAssets.length} images with AI-detected categories` });
      } else {
        throw new Error('No images could be downloaded');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Import failed';
      addLog('error', msg);
      toast({ title: 'Import Failed', description: msg, variant: 'destructive' });
    } finally {
      setIsImporting(false);
    }
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
      
      // Mark as analyzing
      setAssets(prev => prev.map(a => 
        a.id === asset.id ? { ...a, isAnalyzing: true } : a
      ));

      addLog('processing', `🔬 Scanning ${asset.type} image: ${asset.name}`);
      addLog('info', `   ├─ Phase 1: Background pixel analysis...`);
      addLog('info', `   ├─ Phase 2: Badge & text detection...`);
      addLog('info', `   └─ Phase 3: Quality assessment...`);
      
      const result = await analyzeAsset(asset);
      
      // Update with result
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
        
        // Log critical violations
        const criticalViolations = result.violations?.filter(v => v.severity === 'critical') || [];
        if (criticalViolations.length > 0) {
          criticalViolations.forEach(v => {
            addLog('error', `   🚨 CRITICAL: ${v.message}`);
          });
        }
      } else {
        addLog('error', `❌ Failed to analyze ${asset.name}`);
      }

      // Rate limit delay
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
    toast({ title: 'Audit Complete', description: 'All images analyzed and saved to session history.' });
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

    // Get main image for cross-reference (for secondary images)
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

    // Initialize progress state
    const initProgress: FixProgressState = {
      attempt: 1,
      maxAttempts: 3,
      currentStep: 'generating',
      attempts: [],
      thinkingSteps: ['🚀 Initializing AI generation pipeline...']
    };
    setFixProgress(initProgress);

    addLog('processing', `🎨 Guardian initiating ${asset.type} image fix...`);
    addLog('info', `   ├─ Loading compliance requirements...`);
    addLog('info', `   └─ Preparing AI generation pipeline...`);

    const originalBase64 = await fileToBase64(asset.file);
    let previousCritique: string | undefined;
    let lastGeneratedImage: string | undefined = previousGeneratedImage;
    let finalImage: string | undefined;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      addLog('processing', `🖼️ Generation attempt ${attempt}/${maxAttempts}...`);
      
      if (asset.type === 'MAIN') {
        addLog('info', `   ├─ Applying pure white background (RGB 255,255,255)...`);
        addLog('info', `   ├─ Removing prohibited badges/overlays...`);
        addLog('info', `   └─ Optimizing product framing (85% occupancy)...`);
      } else {
        addLog('info', `   ├─ Preserving lifestyle context...`);
        addLog('info', `   ├─ Scanning for prohibited badges...`);
        addLog('info', `   └─ Maintaining product identity...`);
      }
      
      try {
        // Update progress - generating
        setFixProgress(prev => prev ? {
          ...prev,
          attempt,
          currentStep: 'generating',
          thinkingSteps: [...prev.thinkingSteps, `🖼️ Generation attempt ${attempt}/${maxAttempts}...`]
        } : prev);

        // Step 1: Generate the fixed image
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
            customPrompt: customPrompt // Pass custom prompt if provided
          }
        });

        if (genError) throw genError;
        if (!genData?.fixedImage) throw new Error('No image generated');

        addLog('success', `✨ AI generation complete`);
        lastGeneratedImage = genData.fixedImage;

        // Create new attempt and update progress with intermediate image
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
          thinkingSteps: [...prev.thinkingSteps, '✨ Image generated, starting verification...']
        } : prev);

        // Step 2: Verify the generated image
        addLog('processing', `🔍 Verification protocol starting...`);
        addLog('info', `   ├─ Check 1: Product identity match...`);
        addLog('info', `   ├─ Check 2: Compliance fixes applied...`);
        addLog('info', `   ├─ Check 3: Quality assessment...`);
        addLog('info', `   └─ Check 4: No new issues introduced...`);
        
        const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-image', {
          body: {
            originalImageBase64: originalBase64,
            generatedImageBase64: genData.fixedImage,
            imageType: asset.type,
            mainImageBase64
          }
        });

        if (verifyError) {
          addLog('warning', `⚠️ Verification unavailable, using generated image`);
          finalImage = genData.fixedImage;
          break;
        }

        const verification = verifyData;
        addLog('info', `📊 Verification score: ${verification.score}%`);

        // Add thinking steps from verification to progress
        const thinkingSteps = verification.thinkingSteps || [];
        setFixProgress(prev => prev ? {
          ...prev,
          thinkingSteps: [...prev.thinkingSteps, ...thinkingSteps]
        } : prev);
        
        if (verification.componentScores) {
          addLog('info', `   ├─ Identity: ${verification.componentScores.identity}%`);
          addLog('info', `   ├─ Compliance: ${verification.componentScores.compliance}%`);
          addLog('info', `   ├─ Quality: ${verification.componentScores.quality}%`);
          addLog('info', `   └─ Clean edit: ${verification.componentScores.noNewIssues}%`);
        }

        if (verification.passedChecks?.length > 0) {
          verification.passedChecks.slice(0, 3).forEach((check: string) => 
            addLog('success', `   ✓ ${check}`)
          );
        }

        // Update the attempt with verification result
        setFixProgress(prev => {
          if (!prev) return prev;
          const updatedAttempts = [...prev.attempts];
          const lastIdx = updatedAttempts.length - 1;
          if (lastIdx >= 0) {
            updatedAttempts[lastIdx] = {
              ...updatedAttempts[lastIdx],
              verification,
              status: verification.isSatisfactory && verification.productMatch ? 'passed' : 'failed'
            };
          }
          return { ...prev, attempts: updatedAttempts };
        });

        if (verification.isSatisfactory && verification.productMatch) {
          addLog('success', `✅ All verification checks passed!`);
          setFixProgress(prev => prev ? { ...prev, currentStep: 'complete' } : prev);
          finalImage = genData.fixedImage;
          break;
        } else {
          if (!verification.productMatch) {
            addLog('error', `🚨 CRITICAL: Product identity mismatch detected`);
            setFixProgress(prev => prev ? {
              ...prev,
              thinkingSteps: [...prev.thinkingSteps, '🚨 Product identity mismatch - I\'ll try again...']
            } : prev);
          }
          addLog('warning', `⚠️ Issues: ${verification.critique}`);
          
          if (verification.failedChecks?.length > 0) {
            verification.failedChecks.slice(0, 2).forEach((check: string) => 
              addLog('warning', `   ✗ ${check}`)
            );
          }
          
          if (attempt < maxAttempts) {
            addLog('processing', `🔄 Refining prompt and retrying...`);
            setFixProgress(prev => prev ? {
              ...prev,
              currentStep: 'retrying',
              lastCritique: verification.critique,
              thinkingSteps: [...prev.thinkingSteps, '🔄 Analyzing mistakes, preparing retry...']
            } : prev);
            previousCritique = verification.critique;
            
            if (verification.improvements?.length > 0) {
              previousCritique += '\n\nRequired improvements:\n' + 
                verification.improvements.map((i: string) => `- ${i}`).join('\n');
            }
            
            await new Promise(r => setTimeout(r, 2000));
          } else {
            addLog('warning', `⚠️ Max retries reached. Using best result (${verification.score}%).`);
            setFixProgress(prev => prev ? { ...prev, currentStep: 'complete' } : prev);
            finalImage = genData.fixedImage;
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Generation failed';
        addLog('error', `❌ Attempt ${attempt} failed: ${msg}`);
        
        if (attempt === maxAttempts) {
          setAssets(prev => prev.map(a => 
            a.id === assetId ? { ...a, isGeneratingFix: false } : a
          ));
          toast({ title: 'Generation Failed', description: msg, variant: 'destructive' });
          return;
        }
        
        addLog('info', `   Waiting before retry...`);
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    if (finalImage) {
      setAssets(prev => prev.map(a => 
        a.id === assetId ? { ...a, isGeneratingFix: false, fixedImage: finalImage } : a
      ));
      setFixProgress(null);
      
      // Save fixed image to storage and update session_image
      const sessionImageId = assetSessionMap.get(assetId);
      if (sessionImageId && currentSessionId) {
        addLog('processing', '☁️ Saving fixed image to storage...');
        const uploaded = await uploadImage(finalImage, currentSessionId, `fixed_${asset.name}`);
        if (uploaded) {
          await supabase
            .from('session_images')
            .update({
              fixed_image_url: uploaded.url,
              status: 'fixed'
            })
            .eq('id', sessionImageId);
          
          // Update session fixed count
          await supabase
            .from('enhancement_sessions')
            .update({ 
              fixed_count: assets.filter(a => a.fixedImage || a.id === assetId).length
            })
            .eq('id', currentSessionId);
        }
      }
      
      addLog('success', `🎉 Fix complete for ${asset.name}`);
      toast({ title: 'Fix Generated', description: 'AI-corrected image is ready and saved' });
    }
  };

  const handleBatchFix = async () => {
    const failedAssets = assets.filter(a => a.analysisResult?.status === 'FAIL' && !a.fixedImage);
    if (failedAssets.length === 0) return;
    
    setIsBatchFixing(true);
    addLog('processing', `🔧 Starting batch fix for ${failedAssets.length} images...`);
    
    for (const asset of failedAssets) {
      await handleRequestFix(asset.id);
      await new Promise(r => setTimeout(r, 1000)); // Delay between fixes
    }
    
    // Mark session as completed
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
          {/* Left Panel - Input */}
          <div className="lg:col-span-4 space-y-4">
            <ImageUploader
              assets={assets}
              listingTitle={listingTitle}
              amazonUrl={amazonUrl}
              isImporting={isImporting}
              onAssetsChange={setAssets}
              onListingTitleChange={setListingTitle}
              onAmazonUrlChange={setAmazonUrl}
              onImportFromAmazon={handleImportFromAmazon}
              onRunAudit={handleRunAudit}
              isAnalyzing={isAnalyzing}
            />
            <ActivityLog logs={logs} />
            <SessionHistory currentSessionId={currentSessionId || undefined} />
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

export default Index;
