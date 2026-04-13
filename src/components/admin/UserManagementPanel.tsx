import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Users, Search, ShieldCheck, ShieldOff, Gift, KeyRound, Ban, CheckCircle2,
  Loader2, Eye, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface UserRow {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  disabled: boolean;
}

interface CreditRow {
  id: string;
  user_id: string;
  credit_type: string;
  total_credits: number;
  used_credits: number;
  plan: string;
}

interface LedgerRow {
  id: string;
  credit_type: string;
  amount: number;
  balance_after: number;
  event_type: string;
  description: string | null;
  created_at: string;
}

interface Props {
  currentUserId: string | undefined;
}

export default function UserManagementPanel({ currentUserId }: Props) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [credits, setCredits] = useState<CreditRow[]>([]);
  const [roles, setRoles] = useState<{ user_id: string; role: string }[]>([]);
  const [sessionCounts, setSessionCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Detail drawer
  const [detailUser, setDetailUser] = useState<UserRow | null>(null);
  const [detailLedger, setDetailLedger] = useState<LedgerRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Confirm dialogs
  const [confirmAction, setConfirmAction] = useState<{
    open: boolean;
    type: 'reset_password' | 'disable' | 'enable' | 'grant_admin' | 'revoke_admin';
    user: UserRow | null;
    loading: boolean;
  }>({ open: false, type: 'reset_password', user: null, loading: false });

  // Adjust credits dialog
  const [adjustDialog, setAdjustDialog] = useState<{
    open: boolean; userId: string; userName: string;
    creditType: string; amount: number; description: string; action: 'grant' | 'debit';
  }>({
    open: false, userId: '', userName: '', creditType: 'analyze', amount: 10, description: '', action: 'grant',
  });

  // Plan dialog
  const [planDialog, setPlanDialog] = useState<{
    open: boolean; userId: string; userName: string; currentPlan: string; newPlan: string;
  }>({ open: false, userId: '', userName: '', currentPlan: 'free', newPlan: 'free' });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [profilesRes, creditsRes, rolesRes, sessionsRes] = await Promise.all([
      supabase.from('user_profiles').select('id, email, full_name, created_at, disabled'),
      supabase.from('user_credits').select('*'),
      supabase.from('user_roles').select('user_id, role'),
      supabase.from('enhancement_sessions').select('id, user_id'),
    ]);

    if (profilesRes.data) setUsers(profilesRes.data as unknown as UserRow[]);
    if (creditsRes.data) setCredits(creditsRes.data);
    if (rolesRes.data) setRoles(rolesRes.data);

    const counts: Record<string, number> = {};
    sessionsRes.data?.forEach((s: any) => {
      counts[s.user_id] = (counts[s.user_id] || 0) + 1;
    });
    setSessionCounts(counts);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const getUserRole = (userId: string) => roles.find(r => r.user_id === userId)?.role ?? 'user';
  const getUserCredits = (userId: string) => credits.filter(c => c.user_id === userId);
  const getUserPlan = (userId: string) => getUserCredits(userId)[0]?.plan ?? 'free';

  const filteredUsers = users.filter(u => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.email?.toLowerCase().includes(q) ||
      u.full_name?.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q)
    );
  });

  async function openDetail(u: UserRow) {
    setDetailUser(u);
    setDetailLoading(true);
    const { data } = await supabase
      .from('credit_ledger')
      .select('id, credit_type, amount, balance_after, event_type, description, created_at')
      .eq('user_id', u.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setDetailLedger((data ?? []) as unknown as LedgerRow[]);
    setDetailLoading(false);
  }

  async function executeConfirmAction() {
    const { type, user } = confirmAction;
    if (!user) return;
    setConfirmAction(prev => ({ ...prev, loading: true }));

    if (type === 'reset_password' || type === 'disable' || type === 'enable') {
      const actionMap = {
        reset_password: 'reset_password',
        disable: 'disable_user',
        enable: 'enable_user',
      };
      const { data, error } = await supabase.functions.invoke('admin-user-action', {
        body: { action: actionMap[type], targetUserId: user.id },
      });
      if (error) {
        toast.error(`Failed: ${error.message}`);
      } else {
        const msgs = {
          reset_password: `Password reset email sent to ${data?.email || user.email}`,
          disable: `${user.full_name || user.email} disabled`,
          enable: `${user.full_name || user.email} re-enabled`,
        };
        toast.success(msgs[type]);
        fetchAll();
      }
    } else if (type === 'grant_admin') {
      const { error } = await supabase.from('user_roles').insert({ user_id: user.id, role: 'admin' });
      if (error) toast.error('Failed to grant admin'); else { toast.success('Admin granted'); fetchAll(); }
    } else if (type === 'revoke_admin') {
      const { error } = await supabase.from('user_roles').delete().eq('user_id', user.id).eq('role', 'admin');
      if (error) toast.error('Failed to revoke admin'); else { toast.success('Admin revoked'); fetchAll(); }
    }

    setConfirmAction({ open: false, type: 'reset_password', user: null, loading: false });
  }

  async function handleAdjustment() {
    const { userId, creditType, amount, description, action } = adjustDialog;
    const finalAmount = action === 'debit' ? -amount : amount;
    const { error } = await supabase.rpc('grant_credit', {
      p_user_id: userId,
      p_credit_type: creditType as 'scrape' | 'analyze' | 'fix' | 'enhance',
      p_amount: finalAmount,
      p_event_type: action === 'grant' ? 'adjustment' : 'debit',
      p_description: description || `Admin ${action} of ${amount} ${creditType} credits`,
    });
    if (error) {
      toast.error(`Failed: ${error.message}`);
    } else {
      toast.success(`${action === 'grant' ? 'Granted' : 'Debited'} ${amount} ${creditType} credits`);
      // Sync legacy
      const { data: legacyRow } = await supabase
        .from('user_credits')
        .select('id, total_credits')
        .eq('user_id', userId)
        .eq('credit_type', creditType as 'scrape' | 'analyze' | 'fix' | 'enhance')
        .single();
      if (legacyRow && action === 'grant') {
        await supabase.from('user_credits').update({ total_credits: legacyRow.total_credits + amount }).eq('id', legacyRow.id);
      }
      fetchAll();
    }
    setAdjustDialog(prev => ({ ...prev, open: false }));
  }

  async function handlePlanChange() {
    const { userId, newPlan } = planDialog;
    const userCreds = credits.filter(c => c.user_id === userId);
    for (const c of userCreds) {
      await supabase.from('user_credits').update({ plan: newPlan }).eq('id', c.id);
    }
    toast.success(`Plan changed to ${newPlan}`);
    fetchAll();
    setPlanDialog(prev => ({ ...prev, open: false }));
  }

  const confirmLabels: Record<string, { title: string; desc: string; btn: string; variant: 'default' | 'destructive' }> = {
    reset_password: { title: 'Send Password Reset', desc: 'This will send a password reset email to the user.', btn: 'Send Reset Email', variant: 'default' },
    disable: { title: 'Disable User', desc: 'This will disable the user account. They will be unable to sign in or use product features.', btn: 'Disable Account', variant: 'destructive' },
    enable: { title: 'Enable User', desc: 'This will re-enable the user account, allowing them to sign in again.', btn: 'Enable Account', variant: 'default' },
    grant_admin: { title: 'Grant Admin Role', desc: 'This will give the user admin access to the dashboard.', btn: 'Grant Admin', variant: 'default' },
    revoke_admin: { title: 'Revoke Admin Role', desc: 'This will remove admin access from this user.', btn: 'Revoke Admin', variant: 'destructive' },
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
            <Users className="w-5 h-5 text-muted-foreground" />
            Users ({filteredUsers.length}{searchQuery ? ` of ${users.length}` : ''})
          </CardTitle>
          <div className="flex gap-2 items-center">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Search name, email, or ID…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 w-64 h-9"
              />
            </div>
            <Button variant="outline" size="sm" onClick={fetchAll}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 text-muted-foreground font-medium">Name</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Email</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Role</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Plan</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Status</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Sessions</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Joined</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => {
                  const role = getUserRole(u.id);
                  const plan = getUserPlan(u.id);
                  const isSelf = u.id === currentUserId;

                  return (
                    <tr key={u.id} className={`border-b border-border/50 hover:bg-muted/30 ${u.disabled ? 'opacity-60' : ''}`}>
                      <td className="p-3 text-foreground">{u.full_name || '—'}</td>
                      <td className="p-3 text-muted-foreground text-xs">{u.email}</td>
                      <td className="p-3">
                        <Badge variant={role === 'admin' ? 'default' : 'secondary'} className="text-xs">
                          {role}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Badge
                          variant="outline"
                          className="cursor-pointer text-xs"
                          onClick={() => setPlanDialog({
                            open: true, userId: u.id,
                            userName: u.full_name || u.email || '',
                            currentPlan: plan, newPlan: plan,
                          })}
                        >
                          {plan}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {u.disabled ? (
                          <Badge variant="destructive" className="text-xs">Disabled</Badge>
                        ) : (
                          <Badge variant="success" className="text-xs">Active</Badge>
                        )}
                      </td>
                      <td className="p-3 text-foreground">{sessionCounts[u.id] ?? 0}</td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1 flex-wrap">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="View details"
                            onClick={() => openDetail(u)}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Adjust credits"
                            onClick={() => setAdjustDialog({
                              open: true, userId: u.id,
                              userName: u.full_name || u.email || '',
                              creditType: 'analyze', amount: 10, description: '', action: 'grant',
                            })}>
                            <Gift className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Send password reset"
                            onClick={() => setConfirmAction({ open: true, type: 'reset_password', user: u, loading: false })}>
                            <KeyRound className="w-3.5 h-3.5" />
                          </Button>
                          {!isSelf && (
                            <>
                              {role === 'admin' ? (
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Revoke admin"
                                  onClick={() => setConfirmAction({ open: true, type: 'revoke_admin', user: u, loading: false })}>
                                  <ShieldOff className="w-3.5 h-3.5" />
                                </Button>
                              ) : (
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Grant admin"
                                  onClick={() => setConfirmAction({ open: true, type: 'grant_admin', user: u, loading: false })}>
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {u.disabled ? (
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Enable user"
                                  onClick={() => setConfirmAction({ open: true, type: 'enable', user: u, loading: false })}>
                                  <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                                </Button>
                              ) : (
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Disable user"
                                  onClick={() => setConfirmAction({ open: true, type: 'disable', user: u, loading: false })}>
                                  <Ban className="w-3.5 h-3.5 text-destructive" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* User Detail Sheet */}
      <Sheet open={!!detailUser} onOpenChange={open => { if (!open) setDetailUser(null); }}>
        <SheetContent className="w-[420px] sm:max-w-[420px] overflow-y-auto">
          {detailUser && (
            <>
              <SheetHeader>
                <SheetTitle>{detailUser.full_name || detailUser.email || 'User'}</SheetTitle>
              </SheetHeader>
              <div className="space-y-5 mt-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-foreground">{detailUser.email || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Role</p>
                    <Badge variant={getUserRole(detailUser.id) === 'admin' ? 'default' : 'secondary'}>
                      {getUserRole(detailUser.id)}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Plan</p>
                    <p className="text-foreground capitalize">{getUserPlan(detailUser.id)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    {detailUser.disabled ? (
                      <Badge variant="destructive">Disabled</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Sessions</p>
                    <p className="text-foreground">{sessionCounts[detailUser.id] ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Joined</p>
                    <p className="text-foreground">{new Date(detailUser.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">User ID</p>
                    <p className="text-foreground font-mono text-xs break-all">{detailUser.id}</p>
                  </div>
                </div>

                {/* Credits */}
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Credits</p>
                  <div className="grid grid-cols-2 gap-2">
                    {getUserCredits(detailUser.id).map(c => (
                      <div key={c.id} className="p-2 rounded-lg border border-border/50 text-xs">
                        <span className="capitalize text-muted-foreground">{c.credit_type}</span>
                        <p className="text-foreground font-semibold">
                          {c.total_credits - c.used_credits} remaining
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent Ledger */}
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Recent Ledger</p>
                  {detailLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : detailLedger.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No ledger entries.</p>
                  ) : (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {detailLedger.map(l => (
                        <div key={l.id} className="flex items-center justify-between text-xs p-1.5 rounded border border-border/30">
                          <div className="flex items-center gap-1.5">
                            <Badge variant={l.amount > 0 ? 'success' : 'destructive'} className="text-[10px] px-1">
                              {l.amount > 0 ? '+' : ''}{l.amount}
                            </Badge>
                            <span className="text-muted-foreground capitalize">{l.credit_type}</span>
                          </div>
                          <span className="text-muted-foreground">
                            {formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Confirmation Dialog */}
      <Dialog open={confirmAction.open} onOpenChange={open => { if (!open) setConfirmAction(prev => ({ ...prev, open: false })); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmLabels[confirmAction.type]?.title}</DialogTitle>
            <DialogDescription>
              {confirmLabels[confirmAction.type]?.desc}
              {confirmAction.user && (
                <span className="block mt-1 font-medium text-foreground">
                  {confirmAction.user.full_name || confirmAction.user.email}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button
              variant={confirmLabels[confirmAction.type]?.variant}
              onClick={executeConfirmAction}
              disabled={confirmAction.loading}
            >
              {confirmAction.loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {confirmLabels[confirmAction.type]?.btn}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credit Adjustment Dialog */}
      <Dialog open={adjustDialog.open} onOpenChange={open => { if (!open) setAdjustDialog(prev => ({ ...prev, open: false })); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Credits: {adjustDialog.userName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm text-muted-foreground">Action</label>
                <Select value={adjustDialog.action} onValueChange={v => setAdjustDialog(p => ({ ...p, action: v as 'grant' | 'debit' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grant">Grant</SelectItem>
                    <SelectItem value="debit">Debit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm text-muted-foreground">Credit Type</label>
                <Select value={adjustDialog.creditType} onValueChange={v => setAdjustDialog(p => ({ ...p, creditType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['scrape', 'analyze', 'fix', 'enhance'].map(t => (
                      <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">Amount</label>
              <Input type="number" min={1} value={adjustDialog.amount}
                onChange={e => setAdjustDialog(p => ({ ...p, amount: parseInt(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">Description (optional)</label>
              <Input value={adjustDialog.description}
                onChange={e => setAdjustDialog(p => ({ ...p, description: e.target.value }))}
                placeholder="Reason for adjustment" />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleAdjustment}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Plan Change Dialog */}
      <Dialog open={planDialog.open} onOpenChange={open => { if (!open) setPlanDialog(prev => ({ ...prev, open: false })); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Plan: {planDialog.userName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">New Plan</label>
            <select
              className="w-full p-2 border border-border rounded-lg bg-background text-foreground"
              value={planDialog.newPlan}
              onChange={e => setPlanDialog(p => ({ ...p, newPlan: e.target.value }))}
            >
              <option value="free">Free</option>
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="agency">Agency</option>
            </select>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handlePlanChange}>Change Plan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
