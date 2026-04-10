import { useState, useCallback, useRef, useEffect } from 'react';
import { useCreditGate } from '@/hooks/useCreditGate';
import { useAuth } from '@/hooks/useAuth';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2, Play, Download, FileText, BarChart3, CheckCircle2,
  XCircle, Clock, AlertTriangle, Trophy, TrendingDown, ChevronDown,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { scrapeAmazonProduct, downloadImage, extractAsin } from '@/services/amazonScraper';
import { classifyImage } from '@/services/imageClassifier';
import { supabase } from '@/integrations/supabase/client';
import { ImageAsset, AnalysisResult, ImageCategory } from '@/types';
import { RATE_LIMITS } from '@/config/models';
import { logEvent } from '@/services/eventLog';

// ── Types ────────────────────────────────────────────────────

type ProductStatus = 'pending' | 'importing' | 'analyzing' | 'complete' | 'error';

interface ProductAudit {
  url: string;
  asin: string | null;
  title: string;
  imagesFound: number;
  imagesAnalyzed: number;
  status: ProductStatus;
  score: number | null;
  passed: number;
  failed: number;
  violations: number;
  error?: string;
  assets: ImageAsset[];
}

interface CampaignSummary {
  campaign_name: string;
  client_name: string;
  total_products: number;
  fully_compliant: number;
  needs_fixes: number;
  critical_violations_found: number;
  average_compliance_score: number;
  worst_performing_product: string;
  best_performing_product: string;
  total_images_audited: number;
  total_violations_found: number;
  date: string;
  products: ProductAudit[];
}

interface SavedCampaign {
  id: string;
  name: string;
  client: string;
  date: string;
  score: number;
  products: number;
  summary: CampaignSummary;
}

const PRODUCT_COOLDOWN = 15000;

// ── Status badge ─────────────────────────────────────────────

function StatusBadge({ status }: { status: ProductStatus }) {
  switch (status) {
    case 'pending':
      return <Badge variant="outline" className="text-muted-foreground"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    case 'importing':
      return <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Importing</Badge>;
    case 'analyzing':
      return <Badge className="bg-orange-500/15 text-orange-600 border-orange-500/30"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Analyzing</Badge>;
    case 'complete':
      return <Badge className="bg-green-500/15 text-green-600 border-green-500/30"><CheckCircle2 className="w-3 h-3 mr-1" />Complete</Badge>;
    case 'error':
      return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Error</Badge>;
  }
}

// ── Score color ──────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 85) return 'text-green-600';
  if (score >= 70) return 'text-yellow-600';
  return 'text-destructive';
}

// ── Component ────────────────────────────────────────────────

const CampaignAudit = () => {
  const { guard: creditGate } = useCreditGate();
  const { user } = useAuth();
  const [urls, setUrls] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [clientName, setClientName] = useState('');
  const [products, setProducts] = useState<ProductAudit[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [cooldown, setCooldown] = useState(0);
  const [summary, setSummary] = useState<CampaignSummary | null>(null);
  const [savedCampaigns, setSavedCampaigns] = useState<SavedCampaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>('');
  const abortRef = useRef(false);
  const submittingRef = useRef(false);
  const { toast } = useToast();

  // Load saved campaigns from Supabase
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('campaign_audits')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (data) {
        setSavedCampaigns(data.map(c => ({
          id: c.id,
          name: c.name,
          client: c.client,
          date: c.created_at,
          score: c.score,
          products: c.products_count,
          summary: (c.summary as any) || {},
        })));
      }
    })();
  }, [user]);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const updateProduct = (index: number, update: Partial<ProductAudit>) => {
    setProducts(prev => prev.map((p, i) => i === index ? { ...p, ...update } : p));
  };

  // ── Analyze single image ───────────────────────────────────
  const analyzeImage = async (base64: string, imageType: string, listingTitle: string): Promise<AnalysisResult | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('analyze-image', {
        body: {
          imageBase64: base64,
          imageType,
          listingTitle,
          guidelines: [],
        },
      });
      if (error || data?.error) return null;
      return data as AnalysisResult;
    } catch {
      return null;
    }
  };

  // ── Process single product ─────────────────────────────────
  const processProduct = async (url: string, index: number): Promise<ProductAudit> => {
    const asin = extractAsin(url);
    const result: ProductAudit = {
      url, asin, title: '', imagesFound: 0, imagesAnalyzed: 0,
      status: 'importing', score: null, passed: 0, failed: 0,
      violations: 0, assets: [],
    };

    updateProduct(index, { status: 'importing', asin });

    try {
      // Step 1: Scrape
      const product = await scrapeAmazonProduct(url);
      result.title = product.title;
      result.asin = product.asin !== 'UNKNOWN' ? product.asin : asin;
      const imagesToProcess = product.images.slice(0, 9); // Max 9
      result.imagesFound = imagesToProcess.length;
      updateProduct(index, { title: product.title, asin: result.asin, imagesFound: imagesToProcess.length, status: 'importing' });

      // Step 2: Download and classify
      const assets: ImageAsset[] = [];
      for (let i = 0; i < imagesToProcess.length; i++) {
        const img = imagesToProcess[i];
        const file = await downloadImage(img.url);
        if (!file) continue;

        const base64 = await fileToBase64(file);
        const classification = await classifyImage(base64, product.title, result.asin || undefined);
        const aiCategory = classification.category as ImageCategory;

        assets.push({
          id: `${index}-${i}`,
          file,
          preview: URL.createObjectURL(file),
          type: i === 0 ? 'MAIN' : 'SECONDARY',
          name: `${aiCategory}_${file.name}`,
        });
      }

      result.assets = assets;
      updateProduct(index, { status: 'analyzing', imagesFound: assets.length });

      // Step 3: Analyze each image
      let totalScore = 0;
      let analyzed = 0;

      for (let i = 0; i < assets.length; i++) {
        if (abortRef.current) break;

        const asset = assets[i];
        const base64 = await fileToBase64(asset.file);
        const analysisResult = await analyzeImage(base64, asset.type, product.title);

        if (analysisResult) {
          asset.analysisResult = analysisResult;
          totalScore += analysisResult.overallScore;
          analyzed++;
          if (analysisResult.status === 'PASS') result.passed++;
          else result.failed++;
          result.violations += (analysisResult.violations || []).length;
        }

        result.imagesAnalyzed = analyzed;
        updateProduct(index, {
          imagesAnalyzed: analyzed,
          passed: result.passed,
          failed: result.failed,
          violations: result.violations,
        });

        // Rate limit between images
        if (i < assets.length - 1) {
          await new Promise(r => setTimeout(r, RATE_LIMITS.delayBetweenRequests));
        }
      }

      result.score = analyzed > 0 ? Math.round(totalScore / analyzed) : null;
      result.status = 'complete';
      updateProduct(index, { status: 'complete', score: result.score, assets });

    } catch (e) {
      result.status = 'error';
      result.error = e instanceof Error ? e.message : 'Unknown error';
      updateProduct(index, { status: 'error', error: result.error });
    }

    return result;
  };

  // ── Start campaign ─────────────────────────────────────────
  const startCampaign = async () => {
    const urlList = urls.trim().split('\n').map(u => u.trim()).filter(Boolean);
    if (urlList.length === 0) {
      toast({ title: 'No URLs', description: 'Paste at least one Amazon URL', variant: 'destructive' });
      return;
    }
    if (!creditGate('scrape') || !creditGate('analyze')) return;
    if (urlList.length > 25) {
      toast({ title: 'Too many URLs', description: 'Maximum 25 products per campaign', variant: 'destructive' });
      return;
    }

    abortRef.current = false;
    setIsRunning(true);
    setSummary(null);

    const initialProducts: ProductAudit[] = urlList.map(url => ({
      url, asin: extractAsin(url), title: '', imagesFound: 0, imagesAnalyzed: 0,
      status: 'pending' as ProductStatus, score: null, passed: 0, failed: 0, violations: 0, assets: [],
    }));
    setProducts(initialProducts);

    const completedProducts: ProductAudit[] = [];

    for (let i = 0; i < urlList.length; i++) {
      if (abortRef.current) break;
      setCurrentIndex(i);

      const result = await processProduct(urlList[i], i);
      completedProducts.push(result);

      // Cooldown between products
      if (i < urlList.length - 1 && !abortRef.current) {
        for (let s = Math.ceil(PRODUCT_COOLDOWN / 1000); s > 0; s--) {
          setCooldown(s);
          await new Promise(r => setTimeout(r, 1000));
        }
        setCooldown(0);
      }
    }

    // Build summary
    const completed = completedProducts.filter(p => p.status === 'complete' && p.score !== null);
    const allScores = completed.map(p => p.score!);
    const avgScore = allScores.length ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;
    const fullyCompliant = completed.filter(p => p.failed === 0).length;
    const criticalViolations = completedProducts.reduce((sum, p) =>
      sum + p.assets.reduce((vs, a) =>
        vs + (a.analysisResult?.violations?.filter(v => v.severity === 'critical').length || 0), 0), 0);

    const worst = completed.length ? completed.reduce((a, b) => (a.score! < b.score! ? a : b)) : null;
    const best = completed.length ? completed.reduce((a, b) => (a.score! > b.score! ? a : b)) : null;

    const campaignSummary: CampaignSummary = {
      campaign_name: campaignName || 'Unnamed Campaign',
      client_name: clientName,
      total_products: completedProducts.length,
      fully_compliant: fullyCompliant,
      needs_fixes: completed.length - fullyCompliant,
      critical_violations_found: criticalViolations,
      average_compliance_score: avgScore,
      worst_performing_product: worst?.title || 'N/A',
      best_performing_product: best?.title || 'N/A',
      total_images_audited: completedProducts.reduce((s, p) => s + p.imagesAnalyzed, 0),
      total_violations_found: completedProducts.reduce((s, p) => s + p.violations, 0),
      date: new Date().toISOString(),
      products: completedProducts,
    };

    setSummary(campaignSummary);
    setIsRunning(false);
    setCurrentIndex(-1);
    logEvent('audit_completed', { campaign: campaignSummary.campaign_name, products: completedProducts.length, avgScore });

    // Save to Supabase (with idempotency guard)
    if (user && !submittingRef.current) {
      submittingRef.current = true;
      // Strip large base64 image data before storing
      const strippedProducts = completedProducts.map(p => ({
        ...p,
        assets: p.assets.map(a => ({
          id: a.id, name: a.name, type: a.type,
          analysisResult: a.analysisResult,
        })),
      }));
      const strippedSummary = { ...campaignSummary, products: strippedProducts };

      const { data: inserted } = await supabase
        .from('campaign_audits')
        .insert([{
          user_id: user.id,
          name: campaignSummary.campaign_name,
          client: clientName,
          score: avgScore,
          products_count: completedProducts.length,
          summary: JSON.parse(JSON.stringify(strippedSummary)),
        }])
        .select()
        .single();

      if (inserted) {
        setSavedCampaigns(prev => [{
          id: inserted.id,
          name: inserted.name,
          client: inserted.client,
          date: inserted.created_at,
          score: inserted.score,
          products: inserted.products_count,
          summary: strippedSummary as any,
        }, ...prev].slice(0, 20));
      }
      submittingRef.current = false;
    }

    toast({ title: 'Campaign Complete', description: `Audited ${completedProducts.length} products with ${avgScore}% average score` });
  };

  const stopCampaign = () => { abortRef.current = true; };

  // ── Resume interrupted campaign ────────────────────────────
  const resumeCampaign = async () => {
    const pendingProducts = products
      .map((p, i) => ({ product: p, index: i }))
      .filter(({ product }) => product.status === 'pending');
    
    if (pendingProducts.length === 0) {
      toast({ title: 'Nothing to resume', description: 'All products have been processed.' });
      return;
    }
    if (!creditGate('scrape') || !creditGate('analyze')) return;

    abortRef.current = false;
    setIsRunning(true);

    const completedProducts: ProductAudit[] = products.filter(p => p.status === 'complete' || p.status === 'error');

    for (let i = 0; i < pendingProducts.length; i++) {
      if (abortRef.current) break;
      const { product, index } = pendingProducts[i];
      setCurrentIndex(index);

      const result = await processProduct(product.url, index);
      completedProducts.push(result);

      // Cooldown between products
      if (i < pendingProducts.length - 1 && !abortRef.current) {
        for (let s = Math.ceil(PRODUCT_COOLDOWN / 1000); s > 0; s--) {
          setCooldown(s);
          await new Promise(r => setTimeout(r, 1000));
        }
        setCooldown(0);
      }
    }

    // Build summary from all processed products (including previously completed)
    const allProducts = products.map(p => p.status !== 'pending' ? p : completedProducts.find(c => c.url === p.url) || p);
    const completed = allProducts.filter(p => p.status === 'complete' && p.score !== null);
    const allScores = completed.map(p => p.score!);
    const avgScore = allScores.length ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;
    const fullyCompliant = completed.filter(p => p.failed === 0).length;
    const criticalViolations = allProducts.reduce((sum, p) =>
      sum + p.assets.reduce((vs, a) =>
        vs + (a.analysisResult?.violations?.filter(v => v.severity === 'critical').length || 0), 0), 0);

    const worst = completed.length ? completed.reduce((a, b) => (a.score! < b.score! ? a : b)) : null;
    const best = completed.length ? completed.reduce((a, b) => (a.score! > b.score! ? a : b)) : null;

    const campaignSummary: CampaignSummary = {
      campaign_name: campaignName || 'Unnamed Campaign',
      client_name: clientName,
      total_products: allProducts.length,
      fully_compliant: fullyCompliant,
      needs_fixes: completed.length - fullyCompliant,
      critical_violations_found: criticalViolations,
      average_compliance_score: avgScore,
      worst_performing_product: worst?.title || 'N/A',
      best_performing_product: best?.title || 'N/A',
      total_images_audited: allProducts.reduce((s, p) => s + p.imagesAnalyzed, 0),
      total_violations_found: allProducts.reduce((s, p) => s + p.violations, 0),
      date: new Date().toISOString(),
      products: allProducts,
    };

    setSummary(campaignSummary);
    setProducts(allProducts);
    setIsRunning(false);
    setCurrentIndex(-1);

    toast({ title: 'Campaign Resumed & Complete', description: `Finished ${pendingProducts.length} remaining products` });
  };

  // ── Load saved campaign ────────────────────────────────────
  const loadCampaign = (idOrDate: string) => {
    const found = savedCampaigns.find(c => c.id === idOrDate || c.date === idOrDate);
    if (found) {
      setSummary(found.summary);
      setProducts(found.summary.products || []);
      setCampaignName(found.name);
      setClientName(found.client);
      setSelectedCampaign(idOrDate);
    }
  };

  // ── Export JSON ────────────────────────────────────────────
  const exportJSON = () => {
    if (!summary) return;
    const stripped = { ...summary, products: summary.products.map(p => ({
      url: p.url, asin: p.asin, title: p.title, imagesFound: p.imagesFound,
      imagesAnalyzed: p.imagesAnalyzed, score: p.score, passed: p.passed,
      failed: p.failed, violations: p.violations, status: p.status,
    }))};
    const blob = new Blob([JSON.stringify(stripped, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `campaign-${(summary.campaign_name || 'audit').replace(/\s+/g, '-')}-${Date.now()}.json`;
    a.click();
  };

  // ── Export PDF ─────────────────────────────────────────────
  const exportPDF = () => {
    if (!summary) return;
    const s = summary;
    const scoreClr = (v: number) => v >= 85 ? '#22c55e' : v >= 70 ? '#eab308' : '#ef4444';
    const dateStr = new Date(s.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const productPages = s.products.filter(p => p.status === 'complete').map(p => `
<div class="page">
  <div class="sh"><h2>${p.title || p.url}</h2></div>
  <div style="display:flex;gap:16px;margin-bottom:16px">
    <div class="mc"><div class="mv" style="color:${scoreClr(p.score || 0)}">${p.score || 0}%</div><div class="ml">Score</div></div>
    <div class="mc"><div class="mv">${p.imagesAnalyzed}</div><div class="ml">Images</div></div>
    <div class="mc"><div class="mv" style="color:#22c55e">${p.passed}</div><div class="ml">Passed</div></div>
    <div class="mc"><div class="mv" style="color:#ef4444">${p.failed}</div><div class="ml">Failed</div></div>
    <div class="mc"><div class="mv" style="color:#ef4444">${p.violations}</div><div class="ml">Violations</div></div>
  </div>
  ${p.asin ? `<div style="font-size:12px;color:#6b7280;margin-bottom:8px">ASIN: ${p.asin}</div>` : ''}
  <div style="font-size:11px;color:#9ca3af">URL: ${p.url}</div>
  <div class="wm">Guardian AI</div>
</div>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Campaign Report — ${s.campaign_name}</title>
<style>
@page{size:A4;margin:0}*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:210mm;min-height:297mm;padding:24mm 20mm;page-break-after:always;position:relative}
.page:last-child{page-break-after:auto}
.cover{display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center}
.sh{display:flex;align-items:center;gap:8px;margin-bottom:20px;border-left:4px solid #FF9900;padding-left:12px}
.sh h2{font-size:18px;font-weight:700}
.mc{flex:1;padding:16px;border-radius:10px;background:#f9fafb;border:1px solid #e5e7eb;text-align:center}
.mv{font-size:28px;font-weight:800}.ml{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-top:4px}
.wm{position:absolute;bottom:16mm;right:20mm;font-size:9px;color:#d1d5db}
table{width:100%;border-collapse:collapse}th{text-align:left;padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;border-bottom:2px solid #e5e7eb}
td{padding:8px 12px;font-size:12px;border-bottom:1px solid #f3f4f6}
@media print{body{background:white}.no-print{display:none!important}}
</style></head><body>
<div class="page cover">
  <div style="font-size:28px;font-weight:800;background:linear-gradient(135deg,#FF9900,#FF6600);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:48px">Guardian AI</div>
  <div style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#FF9900;margin-bottom:16px">Campaign Audit Report</div>
  <h1 style="font-size:28px;font-weight:300;color:#232F3E;margin-bottom:8px">${s.campaign_name}</h1>
  ${s.client_name ? `<div style="font-size:14px;color:#6b7280;margin-bottom:32px">Prepared for: <strong>${s.client_name}</strong></div>` : '<div style="margin-bottom:32px"></div>'}
  <div style="font-size:13px;color:#9ca3af;margin-bottom:40px">${dateStr}</div>
  <div style="display:flex;gap:16px;flex-wrap:wrap;justify-content:center;max-width:520px">
    <div class="mc"><div class="mv" style="color:#FF9900">${s.total_products}</div><div class="ml">Products</div></div>
    <div class="mc"><div class="mv" style="color:${scoreClr(s.average_compliance_score)}">${s.average_compliance_score}%</div><div class="ml">Avg Score</div></div>
    <div class="mc"><div class="mv" style="color:#22c55e">${s.fully_compliant}</div><div class="ml">Compliant</div></div>
    <div class="mc"><div class="mv" style="color:#ef4444">${s.needs_fixes}</div><div class="ml">Need Fixes</div></div>
    <div class="mc"><div class="mv" style="color:#ef4444">${s.critical_violations_found}</div><div class="ml">Critical</div></div>
    <div class="mc"><div class="mv">${s.total_images_audited}</div><div class="ml">Images</div></div>
  </div>
  <div class="wm">Guardian AI • Confidential</div>
</div>
<div class="page">
  <div class="sh"><h2>Product Summary</h2></div>
  <table><thead><tr><th>Product</th><th>ASIN</th><th>Images</th><th>Score</th><th>Status</th></tr></thead><tbody>
  ${s.products.map(p => `<tr>
    <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.title || p.url.substring(0, 50)}</td>
    <td>${p.asin || '—'}</td>
    <td>${p.imagesAnalyzed}</td>
    <td style="font-weight:700;color:${scoreClr(p.score || 0)}">${p.score != null ? p.score + '%' : '—'}</td>
    <td>${p.failed === 0 ? '✅ PASS' : '❌ FAIL'}</td>
  </tr>`).join('')}
  </tbody></table>
  <div class="wm">Guardian AI</div>
</div>
${productPages}
</body></html>`;

    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.onload = () => setTimeout(() => w.print(), 500); }
  };

  // ── Progress stats ─────────────────────────────────────────
  const completedCount = products.filter(p => p.status === 'complete' || p.status === 'error').length;
  const overallProgress = products.length ? Math.round((completedCount / products.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      
      <main className="flex-1 container mx-auto px-4 py-6 space-y-6 max-w-5xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Campaign Auditor</h2>
            <p className="text-sm text-muted-foreground">Audit up to 25 products at once</p>
          </div>
          {savedCampaigns.length > 0 && (
            <Select value={selectedCampaign} onValueChange={loadCampaign}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="View a saved campaign…" />
              </SelectTrigger>
              <SelectContent>
                {savedCampaigns.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{c.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(c.date).toLocaleDateString()} • {c.products} product{c.products !== 1 ? 's' : ''} • {c.score}% avg
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Input Section */}
        {!isRunning && !summary && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">Campaign Name</Label>
                  <Input placeholder="e.g. FitJoy Full Catalog Q1 2026" value={campaignName} onChange={e => setCampaignName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Client Name</Label>
                  <Input placeholder="e.g. FitJoy Nutrition" value={clientName} onChange={e => setClientName(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Amazon Product URLs (one per line, max 25)</Label>
                <Textarea
                  className="min-h-[200px] font-mono text-sm"
                  placeholder={"https://amazon.com/dp/B0XXXXXX01\nhttps://amazon.com/dp/B0XXXXXX02\nhttps://amazon.com/dp/B0XXXXXX03"}
                  value={urls}
                  onChange={e => setUrls(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {urls.trim().split('\n').filter(Boolean).length} / 25 URLs entered
                </p>
              </div>
              <Button onClick={startCampaign} size="lg" className="w-full">
                <Play className="w-4 h-4 mr-2" />
                Start Campaign Audit
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Progress Dashboard */}
        {(isRunning || products.length > 0) && !summary && (
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">
                    {isRunning
                      ? `Auditing product ${currentIndex + 1} of ${products.length}…`
                      : `Paused — ${products.filter(p => p.status === 'complete').length} of ${products.length} products done`}
                  </span>
                  <div className="flex items-center gap-3">
                    {cooldown > 0 && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Rate limit cooldown: {cooldown}s
                      </span>
                    )}
                    <span className="text-sm font-semibold">{overallProgress}%</span>
                  </div>
                </div>
                <Progress value={overallProgress} className="h-2" />
                <div className="flex items-center gap-2 mt-3">
                  {isRunning && (
                    <Button variant="destructive" size="sm" onClick={stopCampaign}>
                      Stop Campaign
                    </Button>
                  )}
                  {!isRunning && products.some(p => p.status === 'pending') && (
                    <Button size="sm" onClick={resumeCampaign}>
                      Resume ({products.filter(p => p.status === 'pending').length} remaining)
                    </Button>
                  )}
                  {!isRunning && (
                    <Button variant="outline" size="sm" onClick={() => { setProducts([]); setSummary(null); }}>
                      Clear & Start Over
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Product table */}
            <Card>
              <CardContent className="pt-4 p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-4 py-2 text-xs text-muted-foreground uppercase tracking-wider">#</th>
                        <th className="text-left px-4 py-2 text-xs text-muted-foreground uppercase tracking-wider">Product</th>
                        <th className="text-left px-4 py-2 text-xs text-muted-foreground uppercase tracking-wider">ASIN</th>
                        <th className="text-center px-4 py-2 text-xs text-muted-foreground uppercase tracking-wider">Images</th>
                        <th className="text-center px-4 py-2 text-xs text-muted-foreground uppercase tracking-wider">Status</th>
                        <th className="text-center px-4 py-2 text-xs text-muted-foreground uppercase tracking-wider">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p, i) => (
                        <tr key={i} className={`border-b border-border/50 ${i === currentIndex && isRunning ? 'bg-primary/5' : ''}`}>
                          <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                          <td className="px-4 py-3 max-w-[250px] truncate">
                            {p.title || p.url.substring(0, 50) + '...'}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">{p.asin || '—'}</td>
                          <td className="px-4 py-3 text-center">
                            {p.status === 'pending' ? '—' : `${p.imagesAnalyzed}/${p.imagesFound}`}
                          </td>
                          <td className="px-4 py-3 text-center"><StatusBadge status={p.status} /></td>
                          <td className="px-4 py-3 text-center">
                            {p.score !== null ? (
                              <span className={`font-bold ${scoreColor(p.score)}`}>{p.score}%</span>
                            ) : p.error ? (
                              <span className="text-xs text-destructive">{p.error.substring(0, 30)}</span>
                            ) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Campaign Summary */}
        {summary && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                Campaign Complete — {summary.campaign_name}
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={exportJSON}>
                  <Download className="w-4 h-4 mr-1" /> Export JSON
                </Button>
                <Button variant="outline" size="sm" onClick={exportPDF}>
                  <FileText className="w-4 h-4 mr-1" /> Export PDF
                </Button>
                <Button size="sm" onClick={() => { setSummary(null); setProducts([]); setUrls(''); setCampaignName(''); setClientName(''); setSelectedCampaign(''); }}>
                  Start New Campaign
                </Button>
              </div>
            </div>

            {/* Action guidance based on results */}
            {summary.needs_fixes > 0 && (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-destructive/20 bg-destructive/5">
                <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
                <p className="text-sm flex-1">
                  <strong>{summary.needs_fixes} product{summary.needs_fixes > 1 ? 's' : ''}</strong> need compliance fixes.
                  Open each product in the <strong>Single Audit</strong> tool to apply AI-powered corrections.
                </p>
              </div>
            )}
            {summary.needs_fixes === 0 && summary.total_products > 0 && (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-green-500/20 bg-green-500/5">
                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                <p className="text-sm flex-1">
                  All {summary.total_products} products are fully compliant. Export the report to share with your team.
                </p>
              </div>
            )}

            {/* Metric cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: 'Products Audited', value: summary.total_products, color: 'text-primary' },
                { label: 'Avg Score', value: `${summary.average_compliance_score}%`, color: scoreColor(summary.average_compliance_score) },
                { label: 'Fully Compliant', value: summary.fully_compliant, color: 'text-green-600' },
                { label: 'Need Fixes', value: summary.needs_fixes, color: 'text-destructive' },
                { label: 'Total Violations', value: summary.total_violations_found, color: 'text-destructive' },
              ].map((m, i) => (
                <Card key={i}>
                  <CardContent className="pt-4 pb-4 text-center">
                    <div className={`text-2xl font-bold ${m.color}`}>{m.value}</div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">{m.label}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Score distribution bar */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Score Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {summary.products
                    .filter(p => p.score !== null)
                    .sort((a, b) => (b.score || 0) - (a.score || 0))
                    .map((p, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs w-[180px] truncate text-muted-foreground">{p.title || p.asin || `Product ${i + 1}`}</span>
                        <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              (p.score || 0) >= 85 ? 'bg-green-500' : (p.score || 0) >= 70 ? 'bg-yellow-500' : 'bg-destructive'
                            }`}
                            style={{ width: `${p.score || 0}%` }}
                          />
                        </div>
                        <span className={`text-sm font-bold w-12 text-right ${scoreColor(p.score || 0)}`}>{p.score}%</span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            {/* Best / Worst */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="border-green-500/30">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Trophy className="w-4 h-4 text-green-600" />
                    <span className="text-xs font-semibold text-green-600 uppercase tracking-wider">Best Performing</span>
                  </div>
                  <p className="text-sm font-medium truncate">{summary.best_performing_product}</p>
                </CardContent>
              </Card>
              <Card className="border-destructive/30">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="w-4 h-4 text-destructive" />
                    <span className="text-xs font-semibold text-destructive uppercase tracking-wider">Needs Most Work</span>
                  </div>
                  <p className="text-sm font-medium truncate">{summary.worst_performing_product}</p>
                </CardContent>
              </Card>
            </div>

            {/* Additional stats */}
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-lg font-bold">{summary.total_images_audited}</div>
                    <div className="text-xs text-muted-foreground">Total Images Audited</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-destructive">{summary.critical_violations_found}</div>
                    <div className="text-xs text-muted-foreground">Critical Violations</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold">{summary.client_name || '—'}</div>
                    <div className="text-xs text-muted-foreground">Client</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Product table (final) */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">All Products</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-4 py-2 text-xs text-muted-foreground uppercase">#</th>
                        <th className="text-left px-4 py-2 text-xs text-muted-foreground uppercase">Product</th>
                        <th className="px-4 py-2 text-xs text-muted-foreground uppercase">ASIN</th>
                        <th className="text-center px-4 py-2 text-xs text-muted-foreground uppercase">Images</th>
                        <th className="text-center px-4 py-2 text-xs text-muted-foreground uppercase">Score</th>
                        <th className="text-center px-4 py-2 text-xs text-muted-foreground uppercase">Pass</th>
                        <th className="text-center px-4 py-2 text-xs text-muted-foreground uppercase">Fail</th>
                        <th className="text-center px-4 py-2 text-xs text-muted-foreground uppercase">Violations</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.products.map((p, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                          <td className="px-4 py-3 max-w-[200px] truncate">{p.title || p.url.substring(0, 40)}</td>
                          <td className="px-4 py-3 font-mono text-xs">{p.asin || '—'}</td>
                          <td className="px-4 py-3 text-center">{p.imagesAnalyzed}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`font-bold ${p.score !== null ? scoreColor(p.score) : ''}`}>
                              {p.score !== null ? `${p.score}%` : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-green-600">{p.passed}</td>
                          <td className="px-4 py-3 text-center text-destructive">{p.failed}</td>
                          <td className="px-4 py-3 text-center">{p.violations}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};

export default CampaignAudit;
