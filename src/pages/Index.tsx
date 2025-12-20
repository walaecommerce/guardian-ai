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

    setAssets(prev => prev.map(a => 
      a.id === assetId ? { ...a, isGeneratingFix: true } : a
    ));
    addLog('processing', `Generating fix for ${asset.name}...`);

    try {
      const base64 = await fileToBase64(asset.file);
      
      const { data, error } = await supabase.functions.invoke('generate-fix', {
        body: { 
          imageBase64: base64, 
          imageType: asset.type,
          generativePrompt: asset.analysisResult?.generativePrompt 
        }
      });

      if (error) throw error;

      setAssets(prev => prev.map(a => 
        a.id === assetId ? { ...a, isGeneratingFix: false, fixedImage: data.fixedImage } : a
      ));
      addLog('success', `Fix generated for ${asset.name}`);
      toast({ title: 'Fix Generated', description: 'AI-corrected image is ready' });
    } catch (error) {
      setAssets(prev => prev.map(a => 
        a.id === assetId ? { ...a, isGeneratingFix: false } : a
      ));
      const msg = error instanceof Error ? error.message : 'Generation failed';
      addLog('error', msg);
      toast({ title: 'Generation Failed', description: msg, variant: 'destructive' });
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
