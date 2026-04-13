import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Gift, Plus, Pencil, Loader2, Eye, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow, format } from 'date-fns';

interface PromoCode {
  id: string;
  code: string;
  credit_type: string;
  credit_amount: number;
  max_redemptions: number | null;
  current_redemptions: number;
  expires_at: string | null;
  affiliate_tag: string | null;
  active: boolean;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface Redemption {
  id: string;
  user_id: string;
  created_at: string;
}

const CREDIT_TYPES = ['scrape', 'analyze', 'fix', 'enhance'] as const;

const emptyForm = {
  code: '',
  credit_type: 'analyze' as string,
  credit_amount: 10,
  max_redemptions: '' as string | number,
  expires_at: '',
  affiliate_tag: '',
  active: true,
};

export default function PromoCodesPanel() {
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [detailPromo, setDetailPromo] = useState<PromoCode | null>(null);
  const [redemptionLoading, setRedemptionLoading] = useState(false);

  const fetchPromos = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('promo_codes')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setPromos(data as unknown as PromoCode[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchPromos(); }, [fetchPromos]);

  async function handleCreate() {
    if (!form.code.trim()) { toast.error('Code is required'); return; }
    if (form.credit_amount < 1) { toast.error('Amount must be at least 1'); return; }
    setSaving(true);
    const payload: Record<string, unknown> = {
      code: form.code.trim().toUpperCase(),
      credit_type: form.credit_type,
      credit_amount: form.credit_amount,
      active: form.active,
    };
    if (form.max_redemptions !== '' && Number(form.max_redemptions) > 0) {
      payload.max_redemptions = Number(form.max_redemptions);
    }
    if (form.expires_at) payload.expires_at = new Date(form.expires_at).toISOString();
    if (form.affiliate_tag.trim()) payload.affiliate_tag = form.affiliate_tag.trim();

    const { error } = await supabase.from('promo_codes').insert(payload as any);
    setSaving(false);
    if (error) {
      toast.error(`Failed: ${error.message}`);
    } else {
      toast.success(`Promo code ${payload.code} created`);
      setForm(emptyForm);
      setCreateOpen(false);
      fetchPromos();
    }
  }

  function openEdit(p: PromoCode) {
    setEditId(p.id);
    setForm({
      code: p.code,
      credit_type: p.credit_type,
      credit_amount: p.credit_amount,
      max_redemptions: p.max_redemptions ?? '',
      expires_at: p.expires_at ? p.expires_at.slice(0, 16) : '',
      affiliate_tag: p.affiliate_tag ?? '',
      active: p.active,
    });
    setEditOpen(true);
  }

  async function handleEdit() {
    if (!editId) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      credit_amount: form.credit_amount,
      active: form.active,
      max_redemptions: form.max_redemptions !== '' ? Number(form.max_redemptions) : null,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      affiliate_tag: form.affiliate_tag.trim() || null,
    };
    const { error } = await supabase.from('promo_codes').update(payload as any).eq('id', editId);
    setSaving(false);
    if (error) {
      toast.error(`Failed: ${error.message}`);
    } else {
      toast.success('Promo code updated');
      setEditOpen(false);
      fetchPromos();
    }
  }

  async function toggleActive(p: PromoCode) {
    const { error } = await supabase
      .from('promo_codes')
      .update({ active: !p.active } as any)
      .eq('id', p.id);
    if (error) {
      toast.error('Failed to toggle');
    } else {
      toast.success(`${p.code} ${p.active ? 'deactivated' : 'activated'}`);
      fetchPromos();
    }
  }

  async function viewRedemptions(p: PromoCode) {
    setDetailPromo(p);
    setDetailOpen(true);
    setRedemptionLoading(true);
    const { data } = await supabase
      .from('promo_redemptions')
      .select('id, user_id, created_at')
      .eq('promo_code_id', p.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setRedemptions((data ?? []) as Redemption[]);
    setRedemptionLoading(false);
  }

  const creditTypeBadge = (type: string) => {
    const map: Record<string, 'default' | 'warning' | 'success' | 'secondary'> = {
      scrape: 'default', analyze: 'warning', fix: 'success', enhance: 'secondary',
    };
    return map[type] ?? 'secondary';
  };

  if (loading) {
    return (
      <Card><CardContent className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Gift className="w-5 h-5 text-muted-foreground" />
            Promo Codes ({promos.length})
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchPromos}>
              <RefreshCw className="w-4 h-4 mr-1" /> Refresh
            </Button>
            <Button size="sm" onClick={() => { setForm(emptyForm); setCreateOpen(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Create
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {promos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No promo codes yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Code</th>
                    <th className="pb-2 font-medium text-muted-foreground">Type</th>
                    <th className="pb-2 font-medium text-muted-foreground">Amount</th>
                    <th className="pb-2 font-medium text-muted-foreground">Redemptions</th>
                    <th className="pb-2 font-medium text-muted-foreground">Affiliate</th>
                    <th className="pb-2 font-medium text-muted-foreground">Expires</th>
                    <th className="pb-2 font-medium text-muted-foreground">Status</th>
                    <th className="pb-2 font-medium text-muted-foreground">Created</th>
                    <th className="pb-2 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {promos.map(p => (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-2.5 font-mono font-semibold text-foreground">{p.code}</td>
                      <td className="py-2.5">
                        <Badge variant={creditTypeBadge(p.credit_type)} className="text-xs capitalize">
                          {p.credit_type}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-foreground">{p.credit_amount}</td>
                      <td className="py-2.5 text-foreground">
                        {p.current_redemptions}{p.max_redemptions ? ` / ${p.max_redemptions}` : ' / ∞'}
                      </td>
                      <td className="py-2.5 text-muted-foreground">{p.affiliate_tag || '—'}</td>
                      <td className="py-2.5 text-muted-foreground text-xs">
                        {p.expires_at ? format(new Date(p.expires_at), 'MMM d, yyyy') : '—'}
                      </td>
                      <td className="py-2.5">
                        <Badge variant={p.active ? 'success' : 'destructive'} className="text-xs">
                          {p.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-muted-foreground text-xs">
                        {formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}
                      </td>
                      <td className="py-2.5">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(p)} title="Edit">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => viewRedemptions(p)} title="View redemptions">
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleActive(p)}
                            title={p.active ? 'Deactivate' : 'Activate'}
                          >
                            <Switch checked={p.active} className="pointer-events-none scale-75" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Promo Code</DialogTitle>
          </DialogHeader>
          <PromoForm form={form} setForm={setForm} />
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
          <DialogHeader>
            <DialogTitle>Edit Promo Code: {form.code}</DialogTitle>
          </DialogHeader>
          <PromoForm form={form} setForm={setForm} isEdit />
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleEdit} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Redemptions Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redemptions: {detailPromo?.code}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-4 text-sm">
              <span className="text-muted-foreground">Total: <strong className="text-foreground">{detailPromo?.current_redemptions}</strong></span>
              <span className="text-muted-foreground">Max: <strong className="text-foreground">{detailPromo?.max_redemptions ?? '∞'}</strong></span>
            </div>
            {redemptionLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : redemptions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No redemptions yet.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-1">
                {redemptions.map(r => (
                  <div key={r.id} className="flex justify-between items-center text-xs p-2 rounded border border-border/50">
                    <span className="font-mono text-muted-foreground">{r.user_id.slice(0, 8)}…</span>
                    <span className="text-muted-foreground">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PromoForm({
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
      <div className="space-y-2">
        <Label>Code</Label>
        <Input
          value={form.code}
          onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
          placeholder="SUMMER2026"
          disabled={isEdit}
          className="font-mono uppercase"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Credit Type</Label>
          <Select
            value={form.credit_type}
            onValueChange={v => setForm(f => ({ ...f, credit_type: v }))}
            disabled={isEdit}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CREDIT_TYPES.map(t => (
                <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Credit Amount</Label>
          <Input
            type="number"
            min={1}
            value={form.credit_amount}
            onChange={e => setForm(f => ({ ...f, credit_amount: parseInt(e.target.value) || 0 }))}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Max Redemptions (empty = unlimited)</Label>
          <Input
            type="number"
            min={0}
            value={form.max_redemptions}
            onChange={e => setForm(f => ({ ...f, max_redemptions: e.target.value }))}
            placeholder="Unlimited"
          />
        </div>
        <div className="space-y-2">
          <Label>Expires At (optional)</Label>
          <Input
            type="datetime-local"
            value={form.expires_at}
            onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Affiliate Tag (optional)</Label>
        <Input
          value={form.affiliate_tag}
          onChange={e => setForm(f => ({ ...f, affiliate_tag: e.target.value }))}
          placeholder="partner-name"
        />
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: v }))} />
        <Label>Active</Label>
      </div>
    </div>
  );
}
