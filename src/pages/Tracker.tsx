import { useState, useEffect, useCallback } from 'react';
import { useCreditGate } from '@/hooks/useCreditGate';
import { useAuth } from '@/hooks/useAuth';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Loader2, Plus, RefreshCw, Trash2, ChevronLeft, AlertTriangle,
  TrendingUp, TrendingDown, Minus, X, Activity,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { scrapeAmazonProduct, downloadImage, extractAsin } from '@/services/amazonScraper';
import { classifyImage } from '@/services/imageClassifier';
import { supabase } from '@/integrations/supabase/client';
import { AnalysisResult, ImageCategory } from '@/types';
import { RATE_LIMITS } from '@/config/models';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';

// ── Types ────────────────────────────────────────────────────

interface AuditRecord {
  id?: string;
  date: string;
  scores: {
    compliance: number;
    completeness: number;
    diversity: number;
    readability: number;
    appeal: number;
    consistency: number;
    health: number;
  };
  violations_count: number;
  status: string;
  fixApplied?: boolean;
}

interface TrackedProduct {
  id: string; // DB id
  asin: string;
  title: string;
  url: string;
  added_date: string;
  audits: AuditRecord[];
}

interface TrackerAlert {
  id: string;
  productAsin: string;
  productTitle: string;
  oldScore: number;
  newScore: number;
  date: string;
  dismissed: boolean;
}

const ALERTS_KEY = 'guardian-tracker-alerts';

function loadAlerts(): TrackerAlert[] {
  try { return JSON.parse(localStorage.getItem(ALERTS_KEY) || '[]'); }
  catch { return []; }
}
function saveAlerts(alerts: TrackerAlert[]) {
  localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Sparkline ────────────────────────────────────────────────

function Sparkline({ scores }: { scores: number[] }) {
  if (scores.length < 2) return <span className="text-xs text-muted-foreground">—</span>;
  const last5 = scores.slice(-5);
  const min = Math.min(...last5) - 5;
  const max = Math.max(...last5) + 5;
  const range = max - min || 1;
  const w = 64, h = 24;
  const points = last5.map((s, i) => {
    const x = (i / (last5.length - 1)) * w;
    const y = h - ((s - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');
  const color = last5[last5.length - 1] >= last5[0] ? 'hsl(var(--success))' : 'hsl(var(--destructive))';
  return (
    <svg width={w} height={h} className="inline-block">
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

// ── Score helpers ─────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 85) return 'text-green-600';
  if (score >= 70) return 'text-yellow-600';
  return 'text-destructive';
}

function ScoreChange({ current, previous }: { current: number; previous?: number }) {
  if (previous === undefined) return <span className="text-xs text-muted-foreground">—</span>;
  const diff = current - previous;
  if (diff === 0) return <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Minus className="w-3 h-3" />0</span>;
  if (diff > 0) return <span className="text-xs text-green-600 flex items-center gap-0.5"><TrendingUp className="w-3 h-3" />+{diff}</span>;
  return <span className="text-xs text-destructive flex items-center gap-0.5"><TrendingDown className="w-3 h-3" />{diff}</span>;
}

// ── Date range filter ────────────────────────────────────────

function filterByRange(audits: AuditRecord[], range: string): AuditRecord[] {
  if (range === 'all') return audits;
  const now = Date.now();
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const cutoff = now - days * 86400000;
  return audits.filter(a => new Date(a.date).getTime() >= cutoff);
}

// ── Component ────────────────────────────────────────────────

const Tracker = () => {
  const { guard: creditGate } = useCreditGate();
  const { user } = useAuth();
  const [products, setProducts] = useState<TrackedProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [alerts, setAlerts] = useState<TrackerAlert[]>(loadAlerts);
  const [urlInput, setUrlInput] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [auditingAsin, setAuditingAsin] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState('all');
  const { toast } = useToast();

  // Persist alerts only (ephemeral UI dismissals)
  useEffect(() => { saveAlerts(alerts); }, [alerts]);

  // Load products from Supabase on mount
  useEffect(() => {
    if (!user) { setIsLoadingProducts(false); return; }
    (async () => {
      setIsLoadingProducts(true);
      const { data: prods, error: prodsErr } = await supabase
        .from('tracked_products')
        .select('*')
        .order('created_at', { ascending: true });

      if (prodsErr) { console.error(prodsErr); setIsLoadingProducts(false); return; }

      const loaded: TrackedProduct[] = [];
      for (const p of prods || []) {
        const { data: audits } = await supabase
          .from('tracker_audits')
          .select('*')
          .eq('tracked_product_id', p.id)
          .order('created_at', { ascending: true });

        loaded.push({
          id: p.id,
          asin: p.asin,
          title: p.title,
          url: p.url,
          added_date: p.added_date,
          audits: (audits || []).map(a => ({
            id: a.id,
            date: a.created_at,
            scores: (a.scores as any) || {},
            violations_count: a.violations_count,
            status: a.status,
            fixApplied: a.fix_applied,
          })),
        });
      }
      setProducts(loaded);
      setIsLoadingProducts(false);
    })();
  }, [user]);

  // ── File to base64 ────────────────────────────────────────
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  // ── Run audit on a product ────────────────────────────────
  const runAudit = useCallback(async (product: TrackedProduct) => {
    if (!creditGate('scrape') || !creditGate('analyze')) return;
    setAuditingAsin(product.asin);
    try {
      const scraped = await scrapeAmazonProduct(product.url);
      const imagesToProcess = scraped.images.slice(0, 7);
      let totalScore = 0;
      let analyzed = 0;
      let totalViolations = 0;

      for (let i = 0; i < imagesToProcess.length; i++) {
        const file = await downloadImage(imagesToProcess[i].url);
        if (!file) continue;
        const base64 = await fileToBase64(file);
        try {
          const { data } = await supabase.functions.invoke('analyze-image', {
            body: { imageBase64: base64, imageType: i === 0 ? 'MAIN' : 'SECONDARY', listingTitle: product.title, guidelines: [] },
          });
          if (data && !data.error) {
            const result = data as AnalysisResult;
            totalScore += result.overallScore;
            totalViolations += (result.violations || []).length;
            analyzed++;
          }
        } catch { /* skip */ }
        if (i < imagesToProcess.length - 1) await sleep(RATE_LIMITS.delayBetweenRequests);
      }

      const healthScore = analyzed > 0 ? Math.round(totalScore / analyzed) : 0;
      const scores = {
        compliance: healthScore,
        completeness: Math.min(100, Math.round((imagesToProcess.length / 7) * 100)),
        diversity: Math.min(100, Math.round(new Set(imagesToProcess.map(i => i.category)).size / 4 * 100)),
        readability: healthScore,
        appeal: healthScore,
        consistency: healthScore,
        health: healthScore,
      };

      // Persist audit to DB
      const { data: auditRow } = await supabase
        .from('tracker_audits')
        .insert({
          tracked_product_id: product.id,
          user_id: user!.id,
          scores,
          violations_count: totalViolations,
          status: healthScore >= 85 ? 'PASS' : 'FAIL',
          fix_applied: false,
        })
        .select()
        .single();

      const audit: AuditRecord = {
        id: auditRow?.id,
        date: auditRow?.created_at || new Date().toISOString(),
        scores,
        violations_count: totalViolations,
        status: healthScore >= 85 ? 'PASS' : 'FAIL',
      };

      // Check for score drop alerts
      const prevAudits = product.audits;
      if (prevAudits.length > 0) {
        const lastScore = prevAudits[prevAudits.length - 1].scores.health;
        if (lastScore - healthScore >= 10) {
          const alert: TrackerAlert = {
            id: crypto.randomUUID(),
            productAsin: product.asin,
            productTitle: product.title,
            oldScore: lastScore,
            newScore: healthScore,
            date: new Date().toISOString(),
            dismissed: false,
          };
          setAlerts(prev => [alert, ...prev]);
        }
      }

      // Update title if scraped title changed
      if (scraped.title && scraped.title !== product.title) {
        await supabase.from('tracked_products').update({ title: scraped.title }).eq('id', product.id);
      }

      setProducts(prev => prev.map(p =>
        p.id === product.id
          ? { ...p, title: scraped.title || p.title, audits: [...p.audits, audit] }
          : p
      ));

      toast({ title: 'Audit complete', description: `${product.title}: ${healthScore}%` });
    } catch (e) {
      toast({ title: 'Audit failed', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setAuditingAsin(null);
    }
  }, [toast, user]);

  // ── Add product ───────────────────────────────────────────
  const addProduct = async () => {
    if (!urlInput.trim() || !user) return;
    if (!creditGate('scrape')) return;
    const asin = extractAsin(urlInput.trim());
    if (products.some(p => p.asin === asin || p.url === urlInput.trim())) {
      toast({ title: 'Already tracked', variant: 'destructive' });
      return;
    }

    setIsAdding(true);
    try {
      const scraped = await scrapeAmazonProduct(urlInput.trim());
      const finalAsin = scraped.asin !== 'UNKNOWN' ? scraped.asin : asin || 'UNKNOWN';

      const { data: inserted, error: insertErr } = await supabase
        .from('tracked_products')
        .insert({
          user_id: user.id,
          asin: finalAsin,
          title: scraped.title,
          url: urlInput.trim(),
        })
        .select()
        .single();

      if (insertErr) throw new Error(insertErr.message);

      const newProduct: TrackedProduct = {
        id: inserted.id,
        asin: finalAsin,
        title: scraped.title,
        url: urlInput.trim(),
        added_date: inserted.added_date,
        audits: [],
      };

      setProducts(prev => [...prev, newProduct]);
      setUrlInput('');
      toast({ title: 'Product added', description: `${scraped.title} — running first audit...` });

      // Run first audit
      setTimeout(() => runAudit(newProduct), 500);
    } catch (e) {
      toast({ title: 'Import failed', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsAdding(false);
    }
  };

  const removeProduct = async (productId: string) => {
    await supabase.from('tracked_products').delete().eq('id', productId);
    setProducts(prev => prev.filter(p => p.id !== productId));
    if (selectedProduct === products.find(p => p.id === productId)?.asin) setSelectedProduct(null);
  };

  const dismissAlert = (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, dismissed: true } : a));
  };

  const activeAlerts = alerts.filter(a => !a.dismissed);
  const detail = selectedProduct ? products.find(p => p.asin === selectedProduct) : null;

  // ── Chart data for detail view ────────────────────────────
  const chartData = detail ? filterByRange(detail.audits, dateRange).map((a, i) => ({
    date: new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    health: a.scores.health,
    compliance: a.scores.compliance,
    completeness: a.scores.completeness,
    diversity: a.scores.diversity,
    readability: a.scores.readability,
    appeal: a.scores.appeal,
    consistency: a.scores.consistency,
    fixApplied: a.fixApplied,
  })) : [];

  if (isLoadingProducts) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      
      <main className="flex-1 container mx-auto px-4 py-6 space-y-4 max-w-5xl">

        {/* Active Alerts */}
        {activeAlerts.length > 0 && (
          <div className="space-y-2">
            {activeAlerts.slice(0, 3).map(alert => (
              <div key={alert.id} className="flex items-center gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
                <p className="text-sm flex-1">
                  <strong>{alert.productTitle}</strong> compliance score dropped from{' '}
                  <span className="font-semibold">{alert.oldScore}</span> to{' '}
                  <span className="font-semibold text-destructive">{alert.newScore}</span>.
                  Amazon may have updated requirements or the listing was changed.
                </p>
                <Button variant="outline" size="sm" className="text-xs flex-shrink-0" onClick={() => {
                  const prod = products.find(p => p.asin === alert.productAsin);
                  if (prod) { dismissAlert(alert.id); runAudit(prod); }
                }}>
                  Audit Now
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => dismissAlert(alert.id)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Header row */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Activity className="w-6 h-6 text-primary" />
              Listing Health Tracker
            </h2>
            <p className="text-sm text-muted-foreground">Monitor compliance scores over time</p>
          </div>
          {activeAlerts.length > 0 && (
            <Badge variant="destructive">{activeAlerts.length} alert{activeAlerts.length > 1 ? 's' : ''}</Badge>
          )}
        </div>

        {/* Add product */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex gap-2">
              <Input
                className="flex-1"
                placeholder="Paste Amazon URL or ASIN to start tracking..."
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addProduct()}
              />
              <Button onClick={addProduct} disabled={isAdding || !urlInput.trim()}>
                {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Product
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Detail View */}
        {detail ? (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setSelectedProduct(null)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Back to all products
            </Button>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{detail.title}</CardTitle>
                    <p className="text-xs text-muted-foreground font-mono mt-1">ASIN: {detail.asin}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={dateRange} onValueChange={setDateRange}>
                      <SelectTrigger className="w-[140px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7d">Last 7 days</SelectItem>
                        <SelectItem value="30d">Last 30 days</SelectItem>
                        <SelectItem value="90d">Last 90 days</SelectItem>
                        <SelectItem value="all">All time</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      onClick={() => runAudit(detail)}
                      disabled={auditingAsin === detail.asin}
                    >
                      {auditingAsin === detail.asin ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                      Audit Now
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {chartData.length < 2 ? (
                  <div className="text-center py-12 space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {detail.audits.length === 0 ? 'No audits yet — run one to see how this listing scores.' : 'One audit recorded — run another to see trends.'}
                    </p>
                    <Button size="sm" variant="outline" onClick={() => runAudit(detail)} disabled={auditingAsin === detail.asin}>
                      {auditingAsin === detail.asin ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                      {detail.audits.length === 0 ? 'Run First Audit' : 'Run Another Audit'}
                    </Button>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={340}>
                    <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip
                        contentStyle={{
                          background: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: 12,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="health" name="Health Score" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="compliance" name="Compliance" stroke="hsl(var(--success))" strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="completeness" name="Completeness" stroke="#8b5cf6" strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="diversity" name="Diversity" stroke="#06b6d4" strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="readability" name="Readability" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="appeal" name="Appeal" stroke="#ec4899" strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="consistency" name="Consistency" stroke="#10b981" strokeWidth={1.5} dot={false} />
                      {chartData.map((d, i) => d.fixApplied ? (
                        <ReferenceLine key={i} x={d.date} stroke="hsl(var(--primary))" strokeDasharray="4 4" label={{ value: '🔧 Fix', position: 'top', fontSize: 10 }} />
                      ) : null)}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Audit history table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Audit History</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-4 py-2 text-xs text-muted-foreground uppercase">Date</th>
                        <th className="text-center px-4 py-2 text-xs text-muted-foreground uppercase">Health</th>
                        <th className="text-center px-4 py-2 text-xs text-muted-foreground uppercase">Violations</th>
                        <th className="text-center px-4 py-2 text-xs text-muted-foreground uppercase">Status</th>
                        <th className="text-center px-4 py-2 text-xs text-muted-foreground uppercase">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...detail.audits].reverse().map((a, i, arr) => {
                        const prev = arr[i + 1]; // reversed order
                        return (
                          <tr key={a.id || i} className="border-b border-border/50">
                            <td className="px-4 py-2 text-muted-foreground">
                              {new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              {a.fixApplied && <Badge className="ml-2 text-xs bg-primary/15 text-primary border-primary/30">Fix Applied</Badge>}
                            </td>
                            <td className={`px-4 py-2 text-center font-bold ${scoreColor(a.scores.health)}`}>{a.scores.health}%</td>
                            <td className="px-4 py-2 text-center">{a.violations_count}</td>
                            <td className="px-4 py-2 text-center">
                              <Badge variant={a.status === 'PASS' ? 'default' : 'destructive'} className="text-xs">
                                {a.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-2 text-center">
                              <ScoreChange current={a.scores.health} previous={prev?.scores.health} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          /* Product List */
          <Card>
            <CardContent className={products.length === 0 ? 'pt-6' : 'p-0 pt-0'}>
              {products.length === 0 ? (
                <div className="text-center py-16 px-6">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-5">
                    <Activity className="w-8 h-8 text-primary/30" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2 tracking-tight">No Products Tracked Yet</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                    Paste an Amazon product URL above to start monitoring. You'll see compliance scores, trend charts, and alerts when scores drop.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-4 py-3 text-xs text-muted-foreground uppercase">Product</th>
                        <th className="px-4 py-3 text-xs text-muted-foreground uppercase">ASIN</th>
                        <th className="px-4 py-3 text-xs text-muted-foreground uppercase">Last Audited</th>
                        <th className="text-center px-4 py-3 text-xs text-muted-foreground uppercase">Score</th>
                        <th className="text-center px-4 py-3 text-xs text-muted-foreground uppercase">Change</th>
                        <th className="text-center px-4 py-3 text-xs text-muted-foreground uppercase">Trend</th>
                        <th className="text-right px-4 py-3 text-xs text-muted-foreground uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map(p => {
                        const latest = p.audits[p.audits.length - 1];
                        const prev = p.audits.length >= 2 ? p.audits[p.audits.length - 2] : undefined;
                        const isAuditing = auditingAsin === p.asin;
                        return (
                          <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedProduct(p.asin)}>
                            <td className="px-4 py-3 max-w-[220px] truncate font-medium">{p.title || p.url.substring(0, 40)}</td>
                            <td className="px-4 py-3 font-mono text-xs text-center">{p.asin}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground text-center">
                              {latest ? new Date(latest.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : <span className="italic">Never audited</span>}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isAuditing ? (
                                <Loader2 className="w-4 h-4 animate-spin inline" />
                              ) : latest ? (
                                <span className={`font-bold ${scoreColor(latest.scores.health)}`}>{latest.scores.health}%</span>
                              ) : '—'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {latest && prev ? <ScoreChange current={latest.scores.health} previous={prev.scores.health} /> : '—'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Sparkline scores={p.audits.map(a => a.scores.health)} />
                            </td>
                            <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  disabled={isAuditing}
                                  onClick={() => runAudit(p)}
                                  title={isAuditing ? 'Audit in progress…' : 'Run a compliance audit on this product now'}
                                >
                                  {isAuditing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                                  {!isAuditing && <span>Audit</span>}
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => removeProduct(p.id)}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default Tracker;
