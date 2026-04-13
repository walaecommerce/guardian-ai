import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Users, Plus, Pencil, Loader2, RefreshCw, TrendingUp, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface Affiliate {
  id: string;
  tag: string;
  name: string;
  email: string | null;
  commission_rate: number;
  commission_fixed: number;
  active: boolean;
  created_at: string;
}

interface AffiliateReport {
  tag: string;
  name: string;
  active: boolean;
  promoCount: number;
  totalRedemptions: number;
  uniqueUsers: number;
  totalCredits: number;
  estimatedCommission: number;
  commission_rate: number;
  commission_fixed: number;
}

const emptyForm = {
  tag: '',
  name: '',
  email: '',
  commission_rate: 0,
  commission_fixed: 0,
  active: true,
};

export default function AffiliateReportPanel() {
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [reports, setReports] = useState<AffiliateReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [affRes, promoRes, redemptionRes] = await Promise.all([
      supabase.from('affiliates').select('*').order('created_at', { ascending: false }),
      supabase.from('promo_codes').select('id, code, affiliate_tag, credit_amount'),
      supabase.from('promo_redemptions').select('id, user_id, affiliate_tag, credits_granted, created_at'),
    ]);

    const affs = (affRes.data ?? []) as unknown as Affiliate[];
    setAffiliates(affs);

    // Build reports
    const promos = promoRes.data ?? [];
    const redemptions = (redemptionRes.data ?? []) as Array<{
      id: string; user_id: string; affiliate_tag: string | null; credits_granted: number; created_at: string;
    }>;

    const reportMap = new Map<string, AffiliateReport>();

    // Init from affiliates table
    for (const a of affs) {
      reportMap.set(a.tag, {
        tag: a.tag,
        name: a.name,
        active: a.active,
        promoCount: 0,
        totalRedemptions: 0,
        uniqueUsers: 0,
        totalCredits: 0,
        estimatedCommission: 0,
        commission_rate: Number(a.commission_rate) || 0,
        commission_fixed: Number(a.commission_fixed) || 0,
      });
    }

    // Also discover tags from promos/redemptions not yet in affiliates table
    for (const p of promos) {
      if (p.affiliate_tag && !reportMap.has(p.affiliate_tag)) {
        reportMap.set(p.affiliate_tag, {
          tag: p.affiliate_tag,
          name: p.affiliate_tag,
          active: true,
          promoCount: 0,
          totalRedemptions: 0,
          uniqueUsers: 0,
          totalCredits: 0,
          estimatedCommission: 0,
          commission_rate: 0,
          commission_fixed: 0,
        });
      }
    }

    // Count promos per affiliate
    for (const p of promos) {
      if (p.affiliate_tag && reportMap.has(p.affiliate_tag)) {
        reportMap.get(p.affiliate_tag)!.promoCount++;
      }
    }

    // Aggregate redemptions
    for (const r of redemptions) {
      if (!r.affiliate_tag) continue;
      let report = reportMap.get(r.affiliate_tag);
      if (!report) {
        report = {
          tag: r.affiliate_tag,
          name: r.affiliate_tag,
          active: true,
          promoCount: 0,
          totalRedemptions: 0,
          uniqueUsers: 0,
          totalCredits: 0,
          estimatedCommission: 0,
          commission_rate: 0,
          commission_fixed: 0,
        };
        reportMap.set(r.affiliate_tag, report);
      }
      report.totalRedemptions++;
      report.totalCredits += r.credits_granted || 0;
    }

    // Count unique users per tag
    const userSets = new Map<string, Set<string>>();
    for (const r of redemptions) {
      if (!r.affiliate_tag) continue;
      if (!userSets.has(r.affiliate_tag)) userSets.set(r.affiliate_tag, new Set());
      userSets.get(r.affiliate_tag)!.add(r.user_id);
    }
    for (const [tag, users] of userSets) {
      const report = reportMap.get(tag);
      if (report) report.uniqueUsers = users.size;
    }

    // Estimate commissions
    for (const report of reportMap.values()) {
      const fixedTotal = report.commission_fixed * report.totalRedemptions;
      const rateTotal = (report.commission_rate / 100) * report.totalCredits;
      report.estimatedCommission = fixedTotal + rateTotal;
    }

    setReports(Array.from(reportMap.values()).sort((a, b) => b.totalRedemptions - a.totalRedemptions));
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleCreate() {
    if (!form.tag.trim() || !form.name.trim()) { toast.error('Tag and name required'); return; }
    setSaving(true);
    const { error } = await supabase.from('affiliates').insert({
      tag: form.tag.trim().toLowerCase(),
      name: form.name.trim(),
      email: form.email.trim() || null,
      commission_rate: form.commission_rate,
      commission_fixed: form.commission_fixed,
      active: form.active,
    } as any);
    setSaving(false);
    if (error) { toast.error(`Failed: ${error.message}`); return; }
    toast.success(`Affiliate "${form.tag}" created`);
    setForm(emptyForm);
    setCreateOpen(false);
    fetchData();
  }

  function openEdit(a: Affiliate) {
    setEditId(a.id);
    setForm({
      tag: a.tag,
      name: a.name,
      email: a.email ?? '',
      commission_rate: Number(a.commission_rate),
      commission_fixed: Number(a.commission_fixed),
      active: a.active,
    });
    setEditOpen(true);
  }

  async function handleEdit() {
    if (!editId) return;
    setSaving(true);
    const { error } = await supabase.from('affiliates').update({
      name: form.name.trim(),
      email: form.email.trim() || null,
      commission_rate: form.commission_rate,
      commission_fixed: form.commission_fixed,
      active: form.active,
    } as any).eq('id', editId);
    setSaving(false);
    if (error) { toast.error(`Failed: ${error.message}`); return; }
    toast.success('Affiliate updated');
    setEditOpen(false);
    fetchData();
  }

  if (loading) {
    return (
      <Card><CardContent className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase">Affiliates</p>
            <p className="text-2xl font-bold text-foreground">{affiliates.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase">Total Redemptions</p>
            <p className="text-2xl font-bold text-foreground">
              {reports.reduce((s, r) => s + r.totalRedemptions, 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase">Unique Users</p>
            <p className="text-2xl font-bold text-foreground">
              {reports.reduce((s, r) => s + r.uniqueUsers, 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase">Credits Granted</p>
            <p className="text-2xl font-bold text-foreground">
              {reports.reduce((s, r) => s + r.totalCredits, 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Affiliate Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-muted-foreground" />
            Affiliate Report
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="w-4 h-4 mr-1" /> Refresh
            </Button>
            <Button size="sm" onClick={() => { setForm(emptyForm); setCreateOpen(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Add Affiliate
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No affiliate data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Tag</th>
                    <th className="pb-2 font-medium text-muted-foreground">Name</th>
                    <th className="pb-2 font-medium text-muted-foreground">Promos</th>
                    <th className="pb-2 font-medium text-muted-foreground">Redemptions</th>
                    <th className="pb-2 font-medium text-muted-foreground">Users</th>
                    <th className="pb-2 font-medium text-muted-foreground">Credits</th>
                    <th className="pb-2 font-medium text-muted-foreground">Est. Commission</th>
                    <th className="pb-2 font-medium text-muted-foreground">Status</th>
                    <th className="pb-2 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map(r => {
                    const aff = affiliates.find(a => a.tag === r.tag);
                    return (
                      <tr key={r.tag} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2.5 font-mono font-semibold text-foreground">{r.tag}</td>
                        <td className="py-2.5 text-foreground">{r.name}</td>
                        <td className="py-2.5 text-foreground">{r.promoCount}</td>
                        <td className="py-2.5 text-foreground">{r.totalRedemptions}</td>
                        <td className="py-2.5 text-foreground">{r.uniqueUsers}</td>
                        <td className="py-2.5 text-foreground">{r.totalCredits}</td>
                        <td className="py-2.5 text-foreground">
                          {r.estimatedCommission > 0 ? (
                            <span className="flex items-center gap-1">
                              <DollarSign className="w-3 h-3" />
                              {r.estimatedCommission.toFixed(2)}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="py-2.5">
                          <Badge variant={r.active ? 'success' : 'destructive'} className="text-xs">
                            {r.active ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="py-2.5">
                          {aff && (
                            <Button variant="ghost" size="sm" onClick={() => openEdit(aff)} title="Edit">
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          )}
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

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Affiliate</DialogTitle></DialogHeader>
          <AffiliateForm form={form} setForm={setForm} />
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Affiliate: {form.tag}</DialogTitle></DialogHeader>
          <AffiliateForm form={form} setForm={setForm} isEdit />
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleEdit} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AffiliateForm({
  form,
  setForm,
  isEdit = false,
}: {
  form: typeof emptyForm;
  setForm: React.Dispatch<React.SetStateAction<typeof emptyForm>>;
  isEdit?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Tag (unique identifier)</Label>
          <Input
            value={form.tag}
            onChange={e => setForm(f => ({ ...f, tag: e.target.value }))}
            placeholder="partner-xyz"
            disabled={isEdit}
            className="font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label>Name</Label>
          <Input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Partner XYZ"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Email (optional)</Label>
        <Input
          value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          placeholder="partner@example.com"
          type="email"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Commission Rate (%)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={form.commission_rate}
            onChange={e => setForm(f => ({ ...f, commission_rate: parseFloat(e.target.value) || 0 }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Fixed Commission ($)</Label>
          <Input
            type="number"
            min={0}
            step={0.01}
            value={form.commission_fixed}
            onChange={e => setForm(f => ({ ...f, commission_fixed: parseFloat(e.target.value) || 0 }))}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: v }))} />
        <Label>Active</Label>
      </div>
    </div>
  );
}
