import { useState, useCallback } from 'react';
import { Header } from '@/components/Header';
import { ImageUploader } from '@/components/ImageUploader';
import { AnalysisResults } from '@/components/AnalysisResults';
import { FixModal } from '@/components/FixModal';
import { ActivityLog } from '@/components/ActivityLog';
import { ImageAsset, LogEntry, AnalysisResult } from '@/types';
import { scrapeAmazonProduct, downloadImage, getImageId } from '@/services/amazonScraper';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
  const [assets, setAssets] = useState<ImageAsset[]>([]);
  const [listingTitle, setListingTitle] = useState('');
  const [amazonUrl, setAmazonUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<ImageAsset | null>(null);
  const [showFixModal, setShowFixModal] = useState(false);
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

      addLog('success', `Found ${product.images.length} images`);
      if (product.title) {
        setListingTitle(product.title);
        addLog('info', `Title: ${product.title.substring(0, 50)}...`);
      }

      // Download images
      const newAssets: ImageAsset[] = [];
      const seenIds = new Set(assets.map(a => getImageId(a.preview)));

      for (let i = 0; i < Math.min(product.images.length, 20); i++) {
        const url = product.images[i];
        const imageId = getImageId(url);
        
        if (seenIds.has(imageId)) continue;
        seenIds.add(imageId);

        addLog('processing', `Downloading image ${i + 1}...`);
        const file = await downloadImage(url);
        
        if (file) {
          newAssets.push({
            id: Math.random().toString(36).substring(2, 9),
            file,
            preview: URL.createObjectURL(file),
            type: assets.length === 0 && newAssets.length === 0 ? 'MAIN' : 'SECONDARY',
            name: file.name,
          });
        }
      }

      if (newAssets.length > 0) {
        setAssets(prev => [...prev, ...newAssets]);
        addLog('success', `Imported ${newAssets.length} images`);
        toast({ title: 'Import Complete', description: `Added ${newAssets.length} images` });
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
    addLog('processing', `Starting batch audit of ${assets.length} images...`);

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      
      // Mark as analyzing
      setAssets(prev => prev.map(a => 
        a.id === asset.id ? { ...a, isAnalyzing: true } : a
      ));

      addLog('processing', `Analyzing ${asset.type}: ${asset.name}`);
      
      const result = await analyzeAsset(asset);
      
      // Update with result
      setAssets(prev => prev.map(a => 
        a.id === asset.id ? { ...a, isAnalyzing: false, analysisResult: result || undefined } : a
      ));

      if (result) {
        const status = result.status === 'PASS' ? 'success' : 'warning';
        addLog(status, `${asset.name}: ${result.overallScore}% - ${result.status}`);
      } else {
        addLog('error', `Failed to analyze ${asset.name}`);
      }

      // Rate limit delay
      if (i < assets.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    addLog('success', 'Batch audit complete');
    setIsAnalyzing(false);
    toast({ title: 'Audit Complete', description: 'All images analyzed' });
  };

  const handleRequestFix = async (assetId: string) => {
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
      a.id === assetId ? { ...a, isGeneratingFix: true, fixAttempts: [] } : a
    ));

    const originalBase64 = await fileToBase64(asset.file);
    let previousCritique: string | undefined;
    let finalImage: string | undefined;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      addLog('processing', `🎨 Generating fix (attempt ${attempt}/${maxAttempts})...`);
      
      try {
        // Step 1: Generate the fixed image
        const { data: genData, error: genError } = await supabase.functions.invoke('generate-fix', {
          body: { 
            imageBase64: originalBase64, 
            imageType: asset.type,
            generativePrompt: asset.analysisResult?.generativePrompt,
            mainImageBase64,
            previousCritique
          }
        });

        if (genError) throw genError;
        if (!genData?.fixedImage) throw new Error('No image generated');

        addLog('success', `✨ Image generated, verifying quality...`);

        // Step 2: Verify the generated image
        addLog('processing', `🔍 Scanning for compliance issues...`);
        
        const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-image', {
          body: {
            originalImageBase64: originalBase64,
            generatedImageBase64: genData.fixedImage,
            imageType: asset.type,
            mainImageBase64
          }
        });

        if (verifyError) {
          addLog('warning', `⚠️ Verification failed, using generated image`);
          finalImage = genData.fixedImage;
          break;
        }

        const verification = verifyData;
        addLog('info', `📊 Verification score: ${verification.score}%`);

        if (verification.passedChecks?.length > 0) {
          verification.passedChecks.slice(0, 2).forEach((check: string) => 
            addLog('success', `✓ ${check}`)
          );
        }

        if (verification.isSatisfactory) {
          addLog('success', `✅ Image passed verification!`);
          finalImage = genData.fixedImage;
          break;
        } else {
          addLog('warning', `⚠️ Issues found: ${verification.critique}`);
          
          if (attempt < maxAttempts) {
            addLog('processing', `🔄 I'll try again with improvements...`);
            previousCritique = verification.critique;
            
            if (verification.improvements?.length > 0) {
              previousCritique += '\n\nSpecific fixes needed:\n' + 
                verification.improvements.map((i: string) => `- ${i}`).join('\n');
            }
            
            // Small delay before retry
            await new Promise(r => setTimeout(r, 2000));
          } else {
            addLog('warning', `⚠️ Max attempts reached. Using best result.`);
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
        
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    if (finalImage) {
      setAssets(prev => prev.map(a => 
        a.id === assetId ? { ...a, isGeneratingFix: false, fixedImage: finalImage } : a
      ));
      addLog('success', `🎉 Fix complete for ${asset.name}`);
      toast({ title: 'Fix Generated', description: 'AI-corrected image is ready' });
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
          </div>

          {/* Right Panel - Results */}
          <div className="lg:col-span-8">
            <AnalysisResults
              assets={assets}
              onRequestFix={handleRequestFix}
              onViewDetails={handleViewDetails}
            />
          </div>
        </div>
      </main>

      <FixModal
        asset={selectedAsset}
        isOpen={showFixModal}
        onClose={() => setShowFixModal(false)}
        onRetryFix={handleRequestFix}
        onDownload={handleDownload}
      />
    </div>
  );
};

export default Index;
