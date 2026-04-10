import { useState, useCallback, useRef } from 'react';
import { useCreditGate } from '@/hooks/useCreditGate';
import { useCredits } from '@/hooks/useCredits';
import { useAuth } from '@/hooks/useAuth';
import { RATE_LIMITS } from '@/config/models';
import { ImageAsset, LogEntry, AnalysisResult, ImageCategory, FixAttempt, FixProgressState, FailedDownload, ProductIdentityCard, StyleConsistencyResult } from '@/types';
import { scrapeAmazonProduct, downloadImage, getImageId, extractAsin, getCanonicalImageKey } from '@/services/amazonScraper';
import { classifyImage } from '@/services/imageClassifier';
import { extractImageCategory } from '@/utils/imageCategory';
import { buildAssetFromDownload } from '@/utils/sessionAssetHelpers';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { uploadImage } from '@/services/imageStorage';
import { saveAuditToHistory } from '@/components/ComplianceHistory';
import { sendSlackNotification } from '@/components/NotificationSettings';
import { MaxImagesOption } from '@/components/ImageUploader';
import { CompetitorData, buildComparisonReport, AIComparisonResult } from '@/components/CompetitorAudit';

type AssetSessionMap = Map<string, string>;

export type AuditStep = 'import' | 'audit' | 'fix' | 'review';

export function useAuditSession() {
  const { guard: creditGate } = useCreditGate();
  const { refresh: refreshCredits } = useCredits();
  const { user } = useAuth();
  const [assets, setAssets] = useState<ImageAsset[]>([]);
  const [listingTitle, setListingTitle] = useState('');
  const [amazonUrl, setAmazonUrl] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('AUTO');
  const [productAsin, setProductAsin] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [assetSessionMap, setAssetSessionMap] = useState<AssetSessionMap>(new Map());
  const [isImporting, setIsImporting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzingProgress, setAnalyzingProgress] = useState<{ current: number; total: number } | undefined>(undefined);
  const [auditComplete, setAuditComplete] = useState<{ passed: number; failed: number } | null>(null);
  const [isBatchFixing, setIsBatchFixing] = useState(false);
  const [batchFixProgress, setBatchFixProgress] = useState<{ current: number; total: number } | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<ImageAsset | null>(null);
  const [showFixModal, setShowFixModal] = useState(false);
  const [fixProgress, setFixProgress] = useState<FixProgressState | null>(null);
  const [failedDownloads, setFailedDownloads] = useState<FailedDownload[]>([]);
  const [isRetrying, setIsRetrying] = useState(false);
  const [productIdentity, setProductIdentity] = useState<ProductIdentityCard | null>(null);
  const [styleConsistency, setStyleConsistency] = useState<StyleConsistencyResult | null>(null);
  const [isAnalyzingStyle, setIsAnalyzingStyle] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);
  const [competitorData, setCompetitorData] = useState<CompetitorData | null>(null);
  const [isImportingCompetitor, setIsImportingCompetitor] = useState(false);
  const [competitorProgress, setCompetitorProgress] = useState<{ current: number; total: number } | null>(null);
  const [aiComparison, setAiComparison] = useState<AIComparisonResult | null>(null);
  const [isLoadingAIComparison, setIsLoadingAIComparison] = useState(false);
  const [aiCreditsExhausted, setAiCreditsExhausted] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Stepper state
  const [currentStep, setCurrentStep] = useState<AuditStep>('import');

  const { toast } = useToast();
  const uploadSectionRef = useRef<HTMLDivElement>(null);
  const assetGridRef = useRef<HTMLDivElement>(null);
  const [titlePulse, setTitlePulse] = useState(false);

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

  const computeContentHash = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const analyzeStyleConsistency = useCallback(async (currentAssets: ImageAsset[]) => {
    const analyzedAssets = currentAssets.filter(a => a.analysisResult);
    if (analyzedAssets.length < 2) return;

    setIsAnalyzingStyle(true);
    addLog('processing', `🎨 Analyzing style consistency across ${analyzedAssets.length} images...`);

    try {
      const images = await Promise.all(analyzedAssets.map(async (asset) => {
        const base64 = await fileToBase64(asset.file);
        return {
          url: base64,
          type: asset.type,
          category: asset.analysisResult?.productCategory || 'unknown',
        };
      }));

      const { data, error } = await supabase.functions.invoke('analyze-style-consistency', {
        body: { images, listingTitle },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setStyleConsistency(data as StyleConsistencyResult);
      addLog('success', `✅ Style coherence score: ${data.overallScore}/100`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Style analysis failed';
      addLog('error', `❌ Style consistency analysis failed: ${msg}`);
    } finally {
      setIsAnalyzingStyle(false);
    }
  }, [addLog, listingTitle]);

  const handleImportFromAmazon = async (maxImages: MaxImagesOption = '20') => {
    if (!amazonUrl) return;
    if (!creditGate('scrape')) return;
    
    const maxCount = maxImages === 'all' ? Infinity : parseInt(maxImages, 10);
    setIsImporting(true);
    setImportError(null);

    // Exponential backoff retry for scraping
    let product: Awaited<ReturnType<typeof scrapeAmazonProduct>> | null = null;
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          addLog('warning', `⏳ Retry ${attempt}/${maxRetries - 1} — waiting ${delay / 1000}s...`);
          await new Promise(r => setTimeout(r, delay));
        }
        product = await scrapeAmazonProduct(amazonUrl, addLog);
        break; // success
      } catch (scrapeErr) {
        const msg = scrapeErr instanceof Error ? scrapeErr.message : 'Scrape failed';
        if (attempt < maxRetries - 1) {
          addLog('warning', `⚠️ Import attempt ${attempt + 1} failed: ${msg}`);
        } else {
          setImportError(msg);
          addLog('error', msg);
          toast({ title: 'Import Failed', description: `${msg}. You can retry.`, variant: 'destructive' });
          setIsImporting(false);
          return;
        }
      }
    }

    if (!product) {
      setIsImporting(false);
      return;
    }

    try {
      const imagesToProcess = product.images.slice(0, maxCount);
      setProductAsin(product.asin !== 'UNKNOWN' ? product.asin : null);
      
      if (product.title) {
        setListingTitle(product.title);
        setTitlePulse(true);
        setTimeout(() => setTitlePulse(false), 500);
      }

      addLog('processing', '💾 Creating enhancement session...');
      const { data: sessionData, error: sessionError } = await supabase
        .from('enhancement_sessions')
        .insert([{
          amazon_url: amazonUrl,
          product_asin: product.asin !== 'UNKNOWN' ? product.asin : null,
          listing_title: product.title || null,
          total_images: imagesToProcess.length,
          status: 'in_progress',
          user_id: user?.id
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

      const newAssets: ImageAsset[] = [];
      const newAssetSessionMap = new Map<string, string>(assetSessionMap);
      
      const seenCanonicalKeys = new Set(assets.map(a => a.sourceUrl ? getCanonicalImageKey(a.sourceUrl) : ''));
      const seenContentHashes = new Set(assets.filter(a => a.contentHash).map(a => a.contentHash!));
      
      let downloadedCount = 0;
      const newFailedDownloads: FailedDownload[] = [];

      addLog('processing', '🤖 AI classification enabled - analyzing image types...');

      for (let i = 0; i < imagesToProcess.length; i++) {
        const imageData = imagesToProcess[i];
        const canonicalKey = getCanonicalImageKey(imageData.url);
        
        if (seenCanonicalKeys.has(canonicalKey)) continue;
        seenCanonicalKeys.add(canonicalKey);

        addLog('processing', `Downloading image ${i + 1}/${imagesToProcess.length}...`);
        const file = await downloadImage(imageData.url);
        
        if (!file) {
          newFailedDownloads.push({ url: imageData.url, reason: 'Download failed', timestamp: new Date() });
          continue;
        }
        
        const contentHash = await computeContentHash(file);
        if (seenContentHashes.has(contentHash)) continue;
        seenContentHashes.add(contentHash);
        downloadedCount++;
        
        const base64 = await fileToBase64(file);
        
        addLog('processing', `🔍 Classifying image ${downloadedCount} with AI vision...`);
        let classification;
        try {
          classification = await classifyImage(base64, product.title, product.asin !== 'UNKNOWN' ? product.asin : undefined);
        } catch (classifyErr) {
          if (classifyErr instanceof Error && classifyErr.message === 'AI_CREDITS_EXHAUSTED') {
            toast({ title: 'AI Credits Exhausted', description: 'Classification credits are used up. Images will be imported without AI classification.', variant: 'destructive' });
            classification = { category: 'UNKNOWN' as ImageCategory, confidence: 0, reasoning: 'Credits exhausted' };
          } else {
            classification = { category: 'UNKNOWN' as ImageCategory, confidence: 0, reasoning: 'Classification failed' };
          }
        }
        
        const aiCategory = classification.category as ImageCategory;
        addLog('info', `   └─ Detected: ${aiCategory} (${classification.confidence}% confidence)`);

        const assetId = Math.random().toString(36).substring(2, 9);
        const imageName = `${aiCategory}_${file.name}`;

        let originalImageUrl = URL.createObjectURL(file);
        
        if (sessionData?.id) {
          addLog('processing', `   ☁️ Uploading to storage...`);
          const uploaded = await uploadImage(file, sessionData.id, `original_${downloadedCount}`);
          if (uploaded) {
            originalImageUrl = uploaded.url;
            
            const isFirstImage = newAssets.length === 0 && assets.length === 0;
            const { data: sessionImageData, error: imgError } = await supabase
              .from('session_images')
              .insert([{
                session_id: sessionData.id,
                image_name: imageName,
                image_type: isFirstImage ? 'MAIN' : 'SECONDARY',
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

        const isFirstImage = newAssets.length === 0 && assets.length === 0;
        
        newAssets.push({
          id: assetId,
          file,
          preview: URL.createObjectURL(file),
          type: isFirstImage ? 'MAIN' : 'SECONDARY',
          name: imageName,
          sourceUrl: imageData.url,
          contentHash,
        });

        if (i < imagesToProcess.length - 1) {
          await new Promise(r => setTimeout(r, 300));
        }
      }

      if (newFailedDownloads.length > 0) {
        addLog('warning', `⚠️ ${newFailedDownloads.length} image(s) failed to download`);
        setFailedDownloads(newFailedDownloads);
      } else {
        setFailedDownloads([]);
      }

      if (newAssets.length > 0) {
        setAssets(prev => [...prev, ...newAssets]);
        setAssetSessionMap(newAssetSessionMap);
        
        toast({
          title: '✅ Import Successful',
          description: `Imported ${newAssets.length} images from Amazon`,
        });

        // Auto-advance to audit step
        setCurrentStep('audit');
        refreshCredits();
      } else {
        throw new Error('No images could be downloaded');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Import failed';
      
      if (msg === 'NO_IMAGES') {
        addLog('warning', 'No product images found. Please upload manually.');
      } else {
        setImportError(msg);
        addLog('error', msg);
        toast({ title: 'Import Failed', description: msg, variant: 'destructive' });
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleBulkImport = async (urls: string[]) => {
    setIsImporting(true);
    setBulkProgress({ current: 0, total: urls.length });
    addLog('processing', `📦 Starting bulk import of ${urls.length} URLs...`);

    for (let i = 0; i < urls.length; i++) {
      setBulkProgress({ current: i + 1, total: urls.length });
      addLog('processing', `🔗 Importing URL ${i + 1}/${urls.length}: ${urls[i].substring(0, 60)}...`);
      
      setAmazonUrl(urls[i]);
      
      try {
        const product = await scrapeAmazonProduct(urls[i], addLog);
        const imagesToProcess = product.images.slice(0, 20);

        if (product.title && !listingTitle) {
          setListingTitle(product.title);
          setTitlePulse(true);
          setTimeout(() => setTitlePulse(false), 500);
        }

        if (product.asin !== 'UNKNOWN' && !productAsin) {
          setProductAsin(product.asin);
        }

        const newAssets: ImageAsset[] = [];
        const seenContentHashes = new Set(assets.filter(a => a.contentHash).map(a => a.contentHash!));

        for (let j = 0; j < imagesToProcess.length; j++) {
          const imageData = imagesToProcess[j];
          const file = await downloadImage(imageData.url);
          if (!file) continue;

          const contentHash = await computeContentHash(file);
          if (seenContentHashes.has(contentHash)) continue;
          seenContentHashes.add(contentHash);

          const base64 = await fileToBase64(file);
          const classification = await classifyImage(base64, product.title, product.asin !== 'UNKNOWN' ? product.asin : undefined);
          const aiCategory = classification.category as ImageCategory;

          const assetId = Math.random().toString(36).substring(2, 9);
          const isFirst = newAssets.length === 0 && assets.length === 0;

          newAssets.push({
            id: assetId,
            file,
            preview: URL.createObjectURL(file),
            type: isFirst ? 'MAIN' : 'SECONDARY',
            name: `${aiCategory}_${file.name}`,
            sourceUrl: imageData.url,
            contentHash,
          });
        }

        if (newAssets.length > 0) {
          setAssets(prev => [...prev, ...newAssets]);
          addLog('success', `✅ Imported ${newAssets.length} images from URL ${i + 1}`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Import failed';
        addLog('error', `❌ URL ${i + 1} failed: ${msg}`);
      }

      if (i < urls.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    setBulkProgress(null);
    setIsImporting(false);
    addLog('success', `🎯 Bulk import complete`);
    toast({ title: 'Bulk Import Complete', description: `Processed ${urls.length} URLs` });
    setCurrentStep('audit');

    setTimeout(() => {
      addLog('info', '🔍 Auto-starting batch audit after bulk import...');
      handleRunAudit();
    }, 1000);
  };

  const handleRetryFailedDownloads = async () => {
    if (failedDownloads.length === 0) return;
    
    setIsRetrying(true);
    addLog('processing', `🔄 Retrying ${failedDownloads.length} failed downloads...`);
    
    const seenContentHashes = new Set(assets.filter(a => a.contentHash).map(a => a.contentHash!));
    const stillFailed: FailedDownload[] = [];
    const newAssets: ImageAsset[] = [];
    
    for (const failed of failedDownloads) {
      addLog('processing', `Retrying: ${failed.url.split('/').pop()?.substring(0, 30)}...`);
      const file = await downloadImage(failed.url);
      
      if (!file) {
        stillFailed.push({ ...failed, timestamp: new Date() });
        continue;
      }
      
      const contentHash = await computeContentHash(file);
      if (seenContentHashes.has(contentHash)) {
        addLog('info', `   Skipped (duplicate content)`);
        continue;
      }
      seenContentHashes.add(contentHash);
      
      const base64 = await fileToBase64(file);
      const classification = await classifyImage(base64, listingTitle, productAsin || undefined);
      const aiCategory = classification.category as ImageCategory;
      
      const assetId = Math.random().toString(36).substring(2, 9);
      
      newAssets.push({
        id: assetId,
        file,
        preview: URL.createObjectURL(file),
        type: 'SECONDARY' as const,
        name: `${aiCategory}_${file.name}`,
        sourceUrl: failed.url,
        contentHash,
      });
      
      addLog('success', `   ✅ Downloaded and classified as ${aiCategory}`);
    }
    
    if (newAssets.length > 0) {
      setAssets(prev => [...prev, ...newAssets]);
      addLog('success', `✅ Recovered ${newAssets.length} images`);
      toast({ title: 'Retry Complete', description: `Recovered ${newAssets.length} images` });
    }
    
    setFailedDownloads(stillFailed);
    if (stillFailed.length > 0) {
      addLog('warning', `${stillFailed.length} images still failed`);
    }
    
    setIsRetrying(false);
  };

  const analyzeAsset = async (asset: ImageAsset, attempt = 0): Promise<{ result: AnalysisResult | null; error?: string; isCreditsExhausted?: boolean }> => {
    try {
      const base64 = await fileToBase64(asset.file);

      const { data, error } = await supabase.functions.invoke('analyze-image', {
        body: {
          imageBase64: base64,
          imageType: asset.type,
          listingTitle,
          forcedCategory: selectedCategory !== 'AUTO' ? selectedCategory : undefined,
        }
      });

      if (error) {
        const status = (error as any)?.context?.status;
        if (status === 429 && attempt < 3) {
          addLog('warning', '⏳ Rate limit hit — pausing 30 seconds...');
          await new Promise(r => setTimeout(r, 30000));
          return analyzeAsset(asset, attempt + 1);
        }
        if ((status === 502 || status === 503) && attempt < 2) {
          addLog('warning', `⚠️ Gateway error (${status}) — retrying in 10s...`);
          await new Promise(r => setTimeout(r, 10000));
          return analyzeAsset(asset, attempt + 1);
        }

        let errorMsg = 'Analysis failed';
        let errorType: string | undefined;
        try {
          if (error instanceof Error && (error as any).context?.json) {
            const body = await (error as any).context.json();
            errorMsg = body?.error || body?.message || errorMsg;
            errorType = body?.errorType;
          } else if (error instanceof Error) {
            errorMsg = error.message;
          }
        } catch {
          /* use default */
        }

        if (status === 402 || errorType === 'payment_required') {
          return { result: null, error: errorMsg || 'AI credits exhausted', isCreditsExhausted: true };
        }

        return { result: null, error: errorMsg };
      }

      if (data?.errorType === 'payment_required') {
        return { result: null, error: data.error || 'AI credits exhausted', isCreditsExhausted: true };
      }

      return { result: data as AnalysisResult };
    } catch (error: any) {
      console.error('Analysis error:', error);
      const status = error?.context?.status;
      if (status === 402) {
        return { result: null, error: 'AI credits exhausted', isCreditsExhausted: true };
      }
      return { result: null, error: error?.message || 'Analysis failed' };
    }
  };

  const countdownCooldown = async (ms: number) => {
    const seconds = ms / 1000;
    for (let i = seconds; i > 0; i--) {
      addLog('processing', `Batch cooldown — resuming in ${i}s...`);
      await new Promise(r => setTimeout(r, 1000));
    }
  };

  const handleRunAudit = async () => {
    if (assets.length === 0) return;
    if (!creditGate('analyze')) return;

    setAiCreditsExhausted(false);
    setCurrentStep('audit');
    setIsAnalyzing(true);
    setAuditComplete(null);
    setStyleConsistency(null);
    setAnalyzingProgress({ current: 0, total: assets.length });
    addLog('processing', `🔍 Guardian initializing batch audit...`);
    addLog('info', `📦 ${assets.length} images queued for compliance check`);

    let passedCount = 0;
    let failedCount = 0;
    let creditsExhaustedDuringRun = false;
    const scores: number[] = [];

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];

      setAssets(prev => prev.map(a =>
        a.id === asset.id ? { ...a, isAnalyzing: true } : a
      ));

      setAnalyzingProgress({ current: i + 1, total: assets.length });
      addLog('processing', `🔬 Scanning ${asset.type} image: ${asset.name}`);

      const { result, error: analysisError, isCreditsExhausted } = await analyzeAsset(asset);

      if (isCreditsExhausted) {
        // Don't store analysisError — treat as batch-level pause, not per-asset failure
        setAssets(prev => prev.map(a =>
          a.id === asset.id ? { ...a, isAnalyzing: false } : a
        ));
        creditsExhaustedDuringRun = true;
        setAiCreditsExhausted(true);
        addLog('error', `🚫 AI credits exhausted — audit paused. ${assets.length - i - 1} image(s) skipped.`);
        break;
      }

      setAssets(prev => prev.map(a =>
        a.id === asset.id
          ? {
              ...a,
              isAnalyzing: false,
              analysisResult: result || undefined,
              analysisError: result ? undefined : (analysisError || 'Analysis failed')
            }
          : a
      ));

      if (result) {
        const statusLog = result.status === 'PASS' ? 'success' : 'warning';
        const emoji = result.status === 'PASS' ? '✅' : '⚠️';
        addLog(statusLog, `${emoji} ${asset.name}: Score ${result.overallScore}% - ${result.status}`);

        if (result.status === 'PASS') passedCount++;
        else failedCount++;
        scores.push(result.overallScore);

        refreshCredits();

        const sessionImageId = assetSessionMap.get(asset.id);
        if (sessionImageId) {
          await supabase
            .from('session_images')
            .update({
              analysis_result: JSON.parse(JSON.stringify(result)),
              status: result.status === 'PASS' ? 'passed' : 'failed'
            })
            .eq('id', sessionImageId);
        }

        const criticalViolations = result.violations?.filter(v => v.severity === 'critical') || [];
        if (criticalViolations.length > 0) {
          criticalViolations.forEach(v => {
            addLog('error', `   🚨 CRITICAL: ${v.message}`);
          });
        }
      } else {
        addLog('error', `❌ Failed to analyze ${asset.name}${analysisError ? ': ' + analysisError : ''}`);
      }

      if (i < assets.length - 1) {
        await new Promise(r => setTimeout(r, RATE_LIMITS.delayBetweenRequests));

        const imageNumber = i + 1;
        if (imageNumber % RATE_LIMITS.batchCooldownEvery === 0) {
          await countdownCooldown(RATE_LIMITS.batchCooldownDuration);
        }
      }
    }

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

    if (!creditsExhaustedDuringRun) {
      addLog('success', '🎯 Guardian batch audit complete');
    }

    const mainAssetForIdentity = assets.find(a => a.type === 'MAIN');
    if (mainAssetForIdentity && !creditsExhaustedDuringRun) {
      try {
        addLog('processing', '🔗 Extracting product identity card from main image...');
        const mainBase64 = await fileToBase64(mainAssetForIdentity.file);
        const { data: idData, error: idError } = await supabase.functions.invoke('extract-product-identity', {
          body: { imageBase64: mainBase64, productTitle: listingTitle }
        });

        const idStatus = (idError as any)?.context?.status;
        if (idStatus === 402 || idData?.errorType === 'payment_required') {
          creditsExhaustedDuringRun = true;
          setAiCreditsExhausted(true);
          addLog('warning', '⚠️ Product identity extraction skipped (AI credits exhausted)');
        } else if (!idError && idData?.identity) {
          setProductIdentity(idData.identity);
          addLog('success', `✅ Product identity extracted: ${idData.identity.brandName} - ${idData.identity.productName}`);
          if (currentSessionId) {
            await supabase.from('enhancement_sessions').update({ product_identity: idData.identity }).eq('id', currentSessionId);
          }
        }
      } catch {
        addLog('warning', '⚠️ Product identity extraction skipped');
      }
    }

    setIsAnalyzing(false);
    setAnalyzingProgress(undefined);
    setAuditComplete({ passed: passedCount, failed: failedCount });

    setAssets(currentAssets => {
      saveAuditToHistory(currentAssets, listingTitle);
      return currentAssets;
    });

    const latestAssets = creditsExhaustedDuringRun
      ? assets
      : assets.map(asset => asset);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const allViolations = latestAssets.flatMap(a => a.analysisResult?.violations || []);
    const criticals = allViolations.filter(v => v.severity === 'critical');

    sendSlackNotification({
      type: 'audit_complete',
      title: listingTitle || 'Untitled Product',
      status: failedCount === 0 ? '✅ PASS' : '❌ FAIL',
      score: avgScore,
      violations: allViolations.length,
      images: assets.length,
      criticalCount: criticals.length,
      topViolation: allViolations[0]?.message || 'None',
    });

    if (criticals.length > 0) {
      sendSlackNotification({
        type: 'critical_violation',
        title: listingTitle || 'Untitled Product',
        criticalCount: criticals.length,
        topViolation: criticals[0]?.message,
      });
    }

    if (creditsExhaustedDuringRun) {
      toast({
        title: 'Audit Paused',
        description: 'Credits exhausted. Already-analyzed results are preserved.',
      });
      refreshCredits();
      return;
    }

    toast({ title: 'Audit Complete', description: 'All images analyzed and saved to session history.' });
    refreshCredits();
    setTimeout(() => setAuditComplete(null), 3000);

    if (failedCount > 0) {
      setCurrentStep('fix');
    } else {
      setCurrentStep('review');
    }

    if (assets.length >= 2) {
      analyzeStyleConsistency(assets);
    }
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
      fixed_images_count: fixedCount,
      user_id: user?.id
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
    if (!creditGate('fix')) return;

    try {
      const mainAsset = assets.find(a => a.type === 'MAIN' && a.id !== assetId);
      let mainImageBase64: string | undefined;
      
      if (asset.type === 'SECONDARY' && mainAsset) {
        mainImageBase64 = await fileToBase64(mainAsset.fixedImage ? 
          await fetch(mainAsset.fixedImage).then(r => r.blob()).then(b => new File([b], 'main.jpg')) : 
          mainAsset.file
        );
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
      let lastFixMethod: ImageAsset['fixMethod'];
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
              customPrompt: customPrompt,
              spatialAnalysis: asset.analysisResult?.spatialAnalysis,
              imageCategory: asset.analysisResult?.productCategory || undefined,
              productIdentity: productIdentity || undefined,
              violations: asset.analysisResult?.violations || [],
              scoringRationale: asset.analysisResult?.scoringRationale || undefined,
            }
          });

          if (genError) {
            const errorContext = (genError as any)?.context;
            const status = errorContext?.status as number | undefined;
            let body: any = undefined;
            if (errorContext?.body) {
              try { body = typeof errorContext.body === 'string' ? JSON.parse(errorContext.body) : errorContext.body; } catch { body = undefined; }
            }
            const serverMsg: string | undefined = body?.error || body?.message;
            const serverType: string | undefined = body?.errorType;

            if (status === 402 || serverType === 'payment_required') {
              setAiCreditsExhausted(true);
              addLog('error', `❌ ${serverMsg || 'Not enough AI credits.'}`);
              setAssets(prev => prev.map(a => a.id === assetId ? { ...a, isGeneratingFix: false } : a));
              setFixProgress(prev => prev ? { ...prev, currentStep: 'error' } : prev);
              toast({ title: 'Credits Exhausted', description: 'Upgrade your plan or wait for your next billing cycle to continue.', variant: 'destructive', duration: 8000 });
              return;
            }
            throw genError;
          }
          if (genData?.error) {
            if (genData.errorType === 'payment_required') {
              setAiCreditsExhausted(true);
              addLog('error', `❌ ${genData.error}`);
              setAssets(prev => prev.map(a => a.id === assetId ? { ...a, isGeneratingFix: false } : a));
              setFixProgress(prev => prev ? { ...prev, currentStep: 'error' } : prev);
              toast({ title: 'Credits Exhausted', description: 'Upgrade your plan or wait for your next billing cycle to continue.', variant: 'destructive', duration: 8000 });
              return;
            }
            throw new Error(genData.error);
          }
          if (!genData?.fixedImage) throw new Error('No image generated');

          const fixMethod = genData.usedBackgroundSegmentation 
            ? 'bg-segmentation' as const
            : asset.type === 'MAIN' 
              ? 'full-regeneration' as const
              : 'surgical-edit' as const;
          lastFixMethod = fixMethod;

          addLog('success', `✨ AI generation complete (${fixMethod})`);
          lastGeneratedImage = genData.fixedImage;

          const newAttempt: FixAttempt = {
            attempt,
            generatedImage: genData.fixedImage,
            status: 'verifying',
            fixTier: 'gemini-flash',
          };

          setFixProgress(prev => prev ? {
            ...prev,
            currentStep: 'verifying',
            intermediateImage: genData.fixedImage,
            attempts: [...prev.attempts, newAttempt],
            thinkingSteps: [...prev.thinkingSteps, '✨ Image generated, starting verification...']
          } : prev);

          const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-image', {
            body: {
              originalImageBase64: originalBase64,
              generatedImageBase64: genData.fixedImage,
              imageType: asset.type,
              mainImageBase64,
              spatialAnalysis: asset.analysisResult?.spatialAnalysis,
              productIdentity: productIdentity || undefined,
            }
          });

          if (verifyError) {
            addLog('warning', `⚠️ Verification unavailable, using generated image`);
            finalImage = genData.fixedImage;
            break;
          }

          const verification = verifyData;
          addLog('info', `📊 Verification score: ${verification.score}%`);

          setFixProgress(prev => prev ? {
            ...prev,
            thinkingSteps: [...prev.thinkingSteps, ...(verification.thinkingSteps || [])]
          } : prev);

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
            }
            addLog('warning', `⚠️ Issues: ${verification.critique}`);
            
            if (attempt < maxAttempts) {
              addLog('processing', `🔄 Refining prompt and retrying...`);
              setFixProgress(prev => prev ? {
                ...prev,
                currentStep: 'retrying',
                lastCritique: verification.critique,
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
            setAssets(prev => prev.map(a => a.id === assetId ? { ...a, isGeneratingFix: false } : a));
            toast({ title: 'Generation Failed', description: msg, variant: 'destructive' });
            return;
          }
          await new Promise(r => setTimeout(r, 3000));
        }
      }

      if (finalImage) {
        setAssets(prev => prev.map(a => 
          a.id === assetId ? { ...a, isGeneratingFix: false, fixedImage: finalImage, fixMethod: lastFixMethod } : a
        ));
        setFixProgress(null);
        
        const sessionImageId = assetSessionMap.get(assetId);
        if (sessionImageId && currentSessionId) {
          const uploaded = await uploadImage(finalImage, currentSessionId, `fixed_${asset.name}`);
          if (uploaded) {
            await supabase.from('session_images').update({ fixed_image_url: uploaded.url, status: 'fixed' }).eq('id', sessionImageId);
            await supabase.from('enhancement_sessions').update({ 
              fixed_count: assets.filter(a => a.fixedImage || a.id === assetId).length
            }).eq('id', currentSessionId);
          }
        }
        
        addLog('success', `🎉 Fix complete for ${asset.name}`);
        toast({ title: 'Fix Generated', description: 'AI-corrected image is ready and saved' });
        refreshCredits();
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Fix failed';
      addLog('error', `❌ Fix failed: ${msg}`);
      setAssets(prev => prev.map(a => a.id === assetId ? { ...a, isGeneratingFix: false } : a));
      setFixProgress(null);
      toast({ title: 'Fix Failed', description: msg, variant: 'destructive' });
    }
  };

  const handleReverify = async (assetId: string) => {
    const asset = assets.find(a => a.id === assetId);
    if (!asset || !asset.fixedImage) return;

    setAssets(prev => prev.map(a => a.id === assetId ? { ...a, isGeneratingFix: true } : a));
    addLog('processing', `🔍 Re-verifying fixed image: ${asset.name}...`);

    try {
      const originalBase64 = await fileToBase64(asset.file);
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
          productIdentity: productIdentity || undefined,
        }
      });

      if (verifyError) throw verifyError;

      const score = verifyData?.score || 0;
      const passed = verifyData?.isSatisfactory === true;
      
      addLog(passed ? 'success' : 'warning', `${passed ? '✅' : '⚠️'} Re-verification: ${score}% - ${passed ? 'PASS' : 'FAIL'}`);
      
      toast({ 
        title: passed ? 'Verification Passed' : 'Verification Issues Found',
        description: `Score: ${score}%`,
        variant: passed ? 'default' : 'destructive'
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Verification failed';
      addLog('error', `❌ Re-verification failed: ${msg}`);
      toast({ title: 'Verification Failed', description: msg, variant: 'destructive' });
    } finally {
      setAssets(prev => prev.map(a => a.id === assetId ? { ...a, isGeneratingFix: false } : a));
    }
  };

  const handleBatchFix = async () => {
    const failedAssets = assets.filter(a => (a.analysisResult?.status === 'FAIL' || a.analysisResult?.status === 'WARNING') && !a.fixedImage);
    if (failedAssets.length === 0) return;
    
    setIsBatchFixing(true);
    setBatchFixProgress({ current: 0, total: failedAssets.length });
    addLog('processing', `🔧 Starting Fix All for ${failedAssets.length} failed images...`);
    
    let fixedCount = 0;

    for (let i = 0; i < failedAssets.length; i++) {
      if (aiCreditsExhausted) {
        addLog('warning', `🚫 AI credits exhausted — skipping remaining ${failedAssets.length - i} fix(es).`);
        toast({
          title: 'Credits Exhausted',
          description: 'Upgrade your plan to continue fixing images.',
          variant: 'destructive',
          duration: 8000,
        });
        break;
      }

      setBatchFixProgress({ current: i + 1, total: failedAssets.length });
      await handleRequestFix(failedAssets[i].id);
      fixedCount++;

      if (i < failedAssets.length - 1) {
        await new Promise(r => setTimeout(r, RATE_LIMITS.delayBetweenRequests));
        if ((i + 1) % RATE_LIMITS.batchCooldownEvery === 0) {
          await countdownCooldown(RATE_LIMITS.batchCooldownDuration);
        }
      }
    }
    
    if (currentSessionId) {
      await supabase.from('enhancement_sessions').update({ status: 'completed' }).eq('id', currentSessionId);
    }
    
    setIsBatchFixing(false);
    setBatchFixProgress(null);
    addLog('success', `✅ Fixes complete — ${fixedCount} images corrected`);
    toast({ title: 'Fix Complete', description: `${fixedCount} images corrected` });
  };

  // --- Batch Enhance ---
  const [isBatchEnhancing, setIsBatchEnhancing] = useState(false);
  const [batchEnhanceProgress, setBatchEnhanceProgress] = useState<{ current: number; total: number } | null>(null);

  const handleBatchEnhance = async () => {
    // Enhanceable = analyzed images that don't already have an enhancement
    const enhanceable = assets.filter(a => a.analysisResult && (!a.fixedImage || a.fixMethod !== 'enhancement'));
    if (enhanceable.length === 0) return;

    setIsBatchEnhancing(true);
    setBatchEnhanceProgress({ current: 0, total: enhanceable.length });
    addLog('processing', `✨ Starting Enhance All for ${enhanceable.length} images...`);

    const mainAsset = assets.find(a => a.type === 'MAIN');
    let mainImageBase64: string | undefined;
    if (mainAsset) {
      mainImageBase64 = await fileToBase64(
        mainAsset.fixedImage
          ? await fetch(mainAsset.fixedImage).then(r => r.blob()).then(b => new File([b], 'main.jpg'))
          : mainAsset.file
      );
    }

    let enhancedCount = 0;

    for (let i = 0; i < enhanceable.length; i++) {
      if (aiCreditsExhausted) {
        addLog('warning', `🚫 AI credits exhausted — skipping remaining ${enhanceable.length - i} enhancement(s).`);
        toast({ title: 'Credits Exhausted', description: 'Upgrade your plan to continue.', variant: 'destructive', duration: 8000 });
        break;
      }

      const asset = enhanceable[i];
      setBatchEnhanceProgress({ current: i + 1, total: enhanceable.length });
      addLog('processing', `🔍 Analyzing enhancement opportunities for ${asset.name}...`);

      try {
        const base64 = await fileToBase64(asset.file);

        // Step 1: Get enhancement analysis
        const { data: analysisData, error: analysisError } = await supabase.functions.invoke('enhance-analyze-image', {
          body: {
            imageBase64: base64,
            mainImageBase64,
            imageType: asset.type,
            listingTitle,
            imageCategory: asset.analysisResult?.productCategory || undefined,
          },
        });

        if (analysisError) throw analysisError;
        if (analysisData?.error) throw new Error(analysisData.error);

        const opportunities = analysisData?.enhancementOpportunities || [];
        if (opportunities.length === 0) {
          addLog('info', `   ✅ ${asset.name} — no enhancements needed`);
          continue;
        }

        addLog('processing', `   🎨 Generating enhanced version (${opportunities.length} improvements)...`);

        // Step 2: Generate enhancement
        const { data: enhanceData, error: enhanceError } = await supabase.functions.invoke('generate-enhancement', {
          body: {
            originalImage: base64,
            mainProductImage: mainImageBase64,
            imageCategory: analysisData.imageCategory || asset.analysisResult?.productCategory || 'UNKNOWN',
            enhancementType: opportunities[0]?.type || 'general',
            targetImprovements: opportunities.map((o: any) => o.description),
            preserveElements: ['product', 'brand-text', 'key-features'],
          },
        });

        if (enhanceError) throw enhanceError;
        if (enhanceData?.error) throw new Error(enhanceData.error);
        if (!enhanceData?.enhancedImage) throw new Error('No enhanced image returned');

        setAssets(prev => prev.map(a =>
          a.id === asset.id ? { ...a, fixedImage: enhanceData.enhancedImage, fixMethod: 'enhancement' as const } : a
        ));

        enhancedCount++;
        addLog('success', `   ✨ Enhanced ${asset.name}`);
        refreshCredits();
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Enhancement failed';
        addLog('error', `   ❌ Enhancement failed for ${asset.name}: ${msg}`);
      }

      if (i < enhanceable.length - 1) {
        await new Promise(r => setTimeout(r, RATE_LIMITS.delayBetweenRequests));
        if ((i + 1) % RATE_LIMITS.batchCooldownEvery === 0) {
          await countdownCooldown(RATE_LIMITS.batchCooldownDuration);
        }
      }
    }

    setIsBatchEnhancing(false);
    setBatchEnhanceProgress(null);
    addLog('success', `✅ Enhancement complete — ${enhancedCount} images improved`);
    toast({ title: 'Enhance Complete', description: `${enhancedCount} images enhanced` });
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

  const triggerAIComparison = async (compData: CompetitorData) => {
    setIsLoadingAIComparison(true);
    setAiComparison(null);
    addLog('processing', '🧠 Running AI competitive intelligence analysis...');

    try {
      const yourAnalysis = {
        title: listingTitle,
        imageCount: assets.length,
        images: assets.filter(a => a.analysisResult).map(a => ({
          type: a.type,
          category: extractImageCategory(a),
          score: a.analysisResult?.overallScore,
          status: a.analysisResult?.status,
          violations: a.analysisResult?.violations?.map(v => ({ severity: v.severity, message: v.message })) || [],
        })),
      };

      const competitorAnalysis = {
        title: compData.title,
        imageCount: compData.imageCount,
        images: compData.assets.filter(a => a.analysisResult).map(a => ({
          type: a.type,
          category: extractImageCategory(a),
          score: a.analysisResult?.overallScore,
          status: a.analysisResult?.status,
          violations: a.analysisResult?.violations?.map(v => ({ severity: v.severity, message: v.message })) || [],
        })),
      };

      const { data, error } = await supabase.functions.invoke('compare-listings', {
        body: { yourAnalysis, competitorAnalysis, yourTitle: listingTitle, competitorTitle: compData.title },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setAiComparison(data as AIComparisonResult);
      addLog('success', '✅ AI competitive analysis complete');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'AI comparison failed';
      addLog('error', `❌ AI comparison failed: ${msg}`);
    } finally {
      setIsLoadingAIComparison(false);
    }
  };

  const handleImportCompetitor = async (url: string) => {
    setIsImportingCompetitor(true);
    setCompetitorData(null);
    setAiComparison(null);
    addLog('processing', '🔍 Importing competitor listing...');

    try {
      const product = await scrapeAmazonProduct(url, addLog);
      const imagesToProcess = product.images.slice(0, 20);

      const compAssets: ImageAsset[] = [];
      const seenHashes = new Set<string>();

      for (let i = 0; i < imagesToProcess.length; i++) {
        setCompetitorProgress({ current: i + 1, total: imagesToProcess.length });
        const file = await downloadImage(imagesToProcess[i].url);
        if (!file) continue;

        const contentHash = await computeContentHash(file);
        if (seenHashes.has(contentHash)) continue;
        seenHashes.add(contentHash);

        const base64 = await fileToBase64(file);
        const classification = await classifyImage(base64, product.title, product.asin !== 'UNKNOWN' ? product.asin : undefined);
        const aiCategory = classification.category as ImageCategory;

        const downloadedAsset = buildAssetFromDownload(
          file,
          aiCategory,
          imagesToProcess[i].url,
          contentHash,
          compAssets.length === 0,
        );
        const asset: ImageAsset = {
          ...downloadedAsset,
          id: `comp_${downloadedAsset.id}`,
        };

        addLog('processing', `Auditing competitor image ${compAssets.length + 1}...`);
        const { result } = await analyzeAsset(asset);
        if (result) asset.analysisResult = result;

        compAssets.push(asset);

        if (i < imagesToProcess.length - 1) {
          await new Promise(r => setTimeout(r, RATE_LIMITS.delayBetweenRequests));
          if ((i + 1) % RATE_LIMITS.batchCooldownEvery === 0) {
            await countdownCooldown(RATE_LIMITS.batchCooldownDuration);
          }
        }
      }

      const analyzed = compAssets.filter(a => a.analysisResult);
      const passed = analyzed.filter(a => a.analysisResult?.status === 'PASS').length;
      const scores = analyzed.map(a => a.analysisResult!.overallScore);
      const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

      const categories: Record<string, number> = {};
      compAssets.forEach(a => {
        const cat = extractImageCategory(a);
        categories[cat] = (categories[cat] || 0) + 1;
      });

      const allViolations = analyzed.flatMap(a =>
        (a.analysisResult?.violations || []).map(v => ({ severity: v.severity, message: v.message }))
      );

      const compData: CompetitorData = {
        url,
        asin: product.asin !== 'UNKNOWN' ? product.asin : null,
        title: product.title || 'Unknown Competitor',
        assets: compAssets,
        imageCount: compAssets.length,
        passRate: analyzed.length ? Math.round((passed / analyzed.length) * 100) : 0,
        overallScore: avgScore,
        categories,
        violations: allViolations,
      };

      setCompetitorData(compData);
      addLog('success', `✅ Competitor audit complete — ${compAssets.length} images, ${avgScore}% score`);
      toast({ title: 'Competitor Audit Complete', description: `Analyzed ${compAssets.length} images` });
      triggerAIComparison(compData);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Competitor import failed';
      addLog('error', msg);
      toast({ title: 'Import Failed', description: msg, variant: 'destructive' });
    } finally {
      setIsImportingCompetitor(false);
      setCompetitorProgress(null);
    }
  };

  const handleRetryFailedAnalysis = async () => {
    const failedAssets = assets.filter(a => a.analysisError);
    if (failedAssets.length === 0) return;

    setIsAnalyzing(true);
    setAiCreditsExhausted(false);
    addLog('processing', `🔄 Retrying ${failedAssets.length} failed image(s)...`);

    let creditsExhaustedDuringRetry = false;

    for (let i = 0; i < failedAssets.length; i++) {
      const asset = failedAssets[i];
      setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, isAnalyzing: true } : a));
      const { result, error: analysisError, isCreditsExhausted } = await analyzeAsset(asset);

      if (isCreditsExhausted) {
        setAssets(prev => prev.map(a =>
          a.id === asset.id ? { ...a, isAnalyzing: false } : a
        ));
        creditsExhaustedDuringRetry = true;
        setAiCreditsExhausted(true);
        addLog('error', `🚫 AI credits exhausted — retry stopped with ${failedAssets.length - i - 1} image(s) remaining.`);
        break;
      }

      setAssets(prev => prev.map(a =>
        a.id === asset.id ? { ...a, isAnalyzing: false, analysisResult: result || undefined, analysisError: result ? undefined : (analysisError || 'Analysis failed') } : a
      ));

      if (result) {
        addLog('success', `✅ ${asset.name}: Score ${result.overallScore}% - ${result.status}`);
        refreshCredits();
      } else {
        addLog('error', `❌ Retry failed for ${asset.name}${analysisError ? ': ' + analysisError : ''}`);
      }

      if (i < failedAssets.length - 1) {
        await new Promise(r => setTimeout(r, RATE_LIMITS.delayBetweenRequests));
      }
    }

    setIsAnalyzing(false);

    if (!creditsExhaustedDuringRetry) {
      toast({ title: 'Retry Complete', description: `Retried ${failedAssets.length} image(s)` });
    }
  };

  const enhanceableCount = assets.filter(a => a.analysisResult && (!a.fixedImage || a.fixMethod !== 'enhancement')).length;

  const handleFixAndEnhance = async () => {
    addLog('processing', '🔧✨ Starting Fix & Enhance All...');
    await handleBatchFix();
    await handleBatchEnhance();
    addLog('success', '🎯 Fix & Enhance All complete');
  };

  const handleResumeAudit = async () => {
    const unanalyzedAssets = assets.filter(a => !a.analysisResult && !a.analysisError);
    if (unanalyzedAssets.length === 0) return;

    setAiCreditsExhausted(false);
    setIsAnalyzing(true);
    setCurrentStep('audit');
    addLog('processing', `▶️ Resuming audit for ${unanalyzedAssets.length} remaining image(s)...`);

    let creditsExhaustedDuringResume = false;

    for (let i = 0; i < unanalyzedAssets.length; i++) {
      const asset = unanalyzedAssets[i];
      setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, isAnalyzing: true } : a));
      setAnalyzingProgress({ current: i + 1, total: unanalyzedAssets.length });

      const { result, error: analysisError, isCreditsExhausted } = await analyzeAsset(asset);

      if (isCreditsExhausted) {
        setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, isAnalyzing: false } : a));
        creditsExhaustedDuringResume = true;
        setAiCreditsExhausted(true);
        addLog('error', `🚫 AI credits exhausted again — ${unanalyzedAssets.length - i - 1} image(s) still remaining.`);
        break;
      }

      setAssets(prev => prev.map(a =>
        a.id === asset.id
          ? { ...a, isAnalyzing: false, analysisResult: result || undefined, analysisError: result ? undefined : (analysisError || 'Analysis failed') }
          : a
      ));

      if (result) {
        addLog('success', `✅ ${asset.name}: Score ${result.overallScore}% - ${result.status}`);
        refreshCredits();
      } else {
        addLog('error', `❌ Failed to analyze ${asset.name}${analysisError ? ': ' + analysisError : ''}`);
      }

      if (i < unanalyzedAssets.length - 1) {
        await new Promise(r => setTimeout(r, RATE_LIMITS.delayBetweenRequests));
      }
    }

    setIsAnalyzing(false);
    setAnalyzingProgress(undefined);

    if (creditsExhaustedDuringResume) {
      toast({ title: 'Audit Paused Again', description: 'Credits are still insufficient.' });
    } else {
      toast({ title: 'Audit Complete', description: 'All remaining images analyzed.' });

      const allAnalyzed = assets.filter(a => a.analysisResult);
      const failCount = allAnalyzed.filter(a => a.analysisResult?.status === 'FAIL' || a.analysisResult?.status === 'WARNING').length;
      if (failCount > 0) {
        setCurrentStep('fix');
      } else {
        setCurrentStep('review');
      }
    }
  };

  return {
    // State
    assets, setAssets,
    listingTitle, setListingTitle,
    amazonUrl, setAmazonUrl,
    selectedCategory, setSelectedCategory,
    productAsin,
    currentSessionId,
    isImporting,
    isAnalyzing,
    analyzingProgress,
    auditComplete,
    isBatchFixing,
    batchFixProgress,
    isBatchEnhancing,
    batchEnhanceProgress,
    logs, setLogs,
    selectedAsset, setSelectedAsset,
    showFixModal, setShowFixModal,
    fixProgress, setFixProgress,
    failedDownloads,
    isRetrying,
    bulkProgress,
    productIdentity,
    styleConsistency,
    isAnalyzingStyle,
    competitorData,
    isImportingCompetitor,
    competitorProgress,
    aiComparison,
    isLoadingAIComparison,
    currentStep, setCurrentStep,
    titlePulse,
    uploadSectionRef,
    assetGridRef,
    aiCreditsExhausted,
    importError,

    // Handlers
    addLog,
    handleImportFromAmazon,
    handleBulkImport,
    handleRetryFailedDownloads,
    handleRunAudit,
    handleSaveReport,
    handleRequestFix,
    handleReverify,
    handleBatchFix,
    handleBatchEnhance,
    handleFixAndEnhance,
    enhanceableCount,
    handleViewDetails,
    handleDownload,
    handleImportCompetitor,
    handleRetryFailedAnalysis,
    handleResumeAudit,
  };
}
