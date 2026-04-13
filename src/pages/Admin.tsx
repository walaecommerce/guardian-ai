import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose
} from '@/components/ui/dialog';
import { Shield, Users, BarChart3, CreditCard, Loader2, Activity, ShieldCheck, ShieldOff, Cpu, CheckCircle2, XCircle, RefreshCw, Plus, Minus, BookOpen, Gift } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface UserRow {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
}

interface CreditRow {
  id: string;
  user_id: string;
  credit_type: string;
  total_credits: number;
  used_credits: number;
  plan: string;
}

interface UsageRow {
  id: string;
  user_id: string;
  credit_type: string;
  edge_function: string | null;
  consumed_at: string;
}

interface LedgerRow {
  id: string;
  user_id: string;
  credit_type: string;
  amount: number;
  balance_after: number;
  event_type: string;
  description: string | null;
  created_at: string;
}

function AIProviderStatusPanel() {
  const [status, setStatus] = useState<{
    provider: string; configured: boolean; healthy: boolean;
    lastCheckAt: string; lastCheckError: string | null;
    models: Record<string, string>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('ai-provider-status');
      if (fnError) throw fnError;
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStatus(); }, []);

  if (loading) {
    return (
      <Card><CardContent className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </CardContent></Card>
    );
  }

  if (error) {
    return (
      <Card><CardContent className="py-8 text-center">
        <p className="text-sm text-destructive mb-3">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchStatus}>
          <RefreshCw className="w-4 h-4 mr-2" /> Retry
        </Button>
      </CardContent></Card>
    );
  }

  if (!status) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Cpu className="w-5 h-5 text-muted-foreground" />
            AI Provider Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-border/50 space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Provider</p>
              <p className="text-sm font-semibold text-foreground">{status.provider}</p>
            </div>
            <div className="p-4 rounded-xl border border-border/50 space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Configured</p>
              <div className="flex items-center gap-2">
                {status.configured ? (
                  <><CheckCircle2 className="w-4 h-4 text-success" /><span className="text-sm font-semibold text-success">Yes</span></>
                ) : (
                  <><XCircle className="w-4 h-4 text-destructive" /><span className="text-sm font-semibold text-destructive">No</span></>
                )}
              </div>
            </div>
            <div className="p-4 rounded-xl border border-border/50 space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Health</p>
              <div className="flex items-center gap-2">
                {status.healthy ? (
                  <><CheckCircle2 className="w-4 h-4 text-success" /><span className="text-sm font-semibold text-success">Healthy</span></>
                ) : (
                  <><XCircle className="w-4 h-4 text-destructive" /><span className="text-sm font-semibold text-destructive">Unhealthy</span></>
                )}
              </div>
            </div>
          </div>

          {status.lastCheckError && (
            <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20 text-sm text-destructive">
              <strong>Last error:</strong> {status.lastCheckError}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Active Models</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {Object.entries(status.models).map(([key, model]) => (
                <div key={key} className="flex items-center justify-between p-2.5 rounded-lg border border-border/50">
                  <span className="text-xs text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                  <Badge variant="outline" className="text-xs font-mono">{model}</Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              Last checked: {new Date(status.lastCheckAt).toLocaleString()}
            </p>
            <Button variant="outline" size="sm" onClick={fetchStatus}>
              <RefreshCw className="w-4 h-4 mr-2" /> Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Admin() {
  const { isAdmin, isLoading: authLoading, user } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [credits, setCredits] = useState<CreditRow[]>([]);
  const [roles, setRoles] = useState<{ user_id: string; role: string }[]>([]);
  const [sessionCounts, setSessionCounts] = useState<Record<string, number>>({});
  const [stats, setStats] = useState({ totalSessions: 0, totalImages: 0, totalCreditsUsed: 0, adminCredits: 0, userCredits: 0 });
  const [activityLog, setActivityLog] = useState<UsageRow[]>([]);
  const [activityPage, setActivityPage] = useState(0);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityFilter, setActivityFilter] = useState<'all' | 'scrape' | 'analyze' | 'fix' | 'enhance'>('all');
  const [loading, setLoading] = useState(true);
  const [editingCredits, setEditingCredits] = useState<Record<string, number>>({});
  const [roleDialog, setRoleDialog] = useState<{ open: boolean; userId: string; action: 'grant' | 'revoke'; userName: string }>({
    open: false, userId: '', action: 'grant', userName: ''
  });

  // Ledger state
  const [ledgerEntries, setLedgerEntries] = useState<LedgerRow[]>([]);
  const [ledgerPage, setLedgerPage] = useState(0);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerUserFilter, setLedgerUserFilter] = useState<string>('all');

  // Adjustment dialog
  const [adjustDialog, setAdjustDialog] = useState<{
    open: boolean; userId: string; userName: string;
    creditType: string; amount: number; description: string; action: 'grant' | 'debit';
  }>({
    open: false, userId: '', userName: '', creditType: 'analyze', amount: 10, description: '', action: 'grant',
  });

  // Plan change dialog
  const [planDialog, setPlanDialog] = useState<{
    open: boolean; userId: string; userName: string; currentPlan: string; newPlan: string;
  }>({
    open: false, userId: '', userName: '', currentPlan: 'free', newPlan: 'free',
  });

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate('/');
    }
  }, [isAdmin, authLoading, navigate]);

  const ACTIVITY_PAGE_SIZE = 25;
  const LEDGER_PAGE_SIZE = 25;

  useEffect(() => {
    if (!isAdmin) return;
    fetchAll();
    fetchActivity(0);
    fetchLedger(0);
  }, [isAdmin]);

  async function fetchLedger(page: number, userFilter: string = ledgerUserFilter) {
    setLedgerLoading(true);
    const from = page * LEDGER_PAGE_SIZE;
    const to = from + LEDGER_PAGE_SIZE - 1;

    let query = supabase
      .from('credit_ledger')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (userFilter !== 'all') {
      query = query.eq('user_id', userFilter);
    }

    const { data, count } = await query;
    if (data) setLedgerEntries(data as unknown as LedgerRow[]);
    if (count !== null) setLedgerTotal(count);
    setLedgerPage(page);
    setLedgerLoading(false);
  }

  async function fetchActivity(page: number, filter: typeof activityFilter = activityFilter) {
    setActivityLoading(true);
    const from = page * ACTIVITY_PAGE_SIZE;
    const to = from + ACTIVITY_PAGE_SIZE - 1;
    let query = supabase
      .from('credit_usage_log')
      .select('id, user_id, credit_type, edge_function, consumed_at', { count: 'exact' })
      .order('consumed_at', { ascending: false });
    if (filter !== 'all') {
      query = query.eq('credit_type', filter);
    }
    const { data, count } = await query.range(from, to);
    if (data) setActivityLog(data);
    if (count !== null) setActivityTotal(count);
    setActivityPage(page);
    setActivityLoading(false);
  }

  async function fetchAll() {
    setLoading(true);
    const [profilesRes, creditsRes, rolesRes, sessionsRes, imagesRes] = await Promise.all([
      supabase.from('user_profiles').select('id, email, full_name, created_at'),
      supabase.from('user_credits').select('*'),
      supabase.from('user_roles').select('user_id, role'),
      supabase.from('enhancement_sessions').select('id, user_id'),
      supabase.from('session_images').select('id'),
    ]);

    if (profilesRes.data) setUsers(profilesRes.data);
    if (creditsRes.data) setCredits(creditsRes.data);
    if (rolesRes.data) setRoles(rolesRes.data);

    const counts: Record<string, number> = {};
    sessionsRes.data?.forEach((s: any) => {
      counts[s.user_id] = (counts[s.user_id] || 0) + 1;
    });
    setSessionCounts(counts);

    const deducted = creditsRes.data?.reduce((sum, c) => sum + c.used_credits, 0) ?? 0;
    const { count: totalLogCount } = await supabase.from('credit_usage_log').select('id', { count: 'exact', head: true });

    const adminUserIds = new Set(rolesRes.data?.filter(r => r.role === 'admin').map(r => r.user_id) ?? []);
    const { data: allUsageLogs } = await supabase.from('credit_usage_log').select('user_id');
    const adminCount = allUsageLogs?.filter(l => adminUserIds.has(l.user_id)).length ?? 0;
    const totalCount = totalLogCount ?? deducted;

    setStats({
      totalSessions: sessionsRes.data?.length ?? 0,
      totalImages: imagesRes.data?.length ?? 0,
      totalCreditsUsed: totalCount,
      adminCredits: adminCount,
      userCredits: totalCount - adminCount,
    });

    setLoading(false);
  }

  async function updateCredits(creditId: string, newTotal: number) {
    const { error } = await supabase
      .from('user_credits')
      .update({ total_credits: newTotal })
      .eq('id', creditId);

    if (error) {
      toast.error('Failed to update credits');
    } else {
      toast.success('Credits updated');
      fetchAll();
    }
  }

  async function handleAdjustment() {
    const { userId, creditType, amount, description, action } = adjustDialog;
    const finalAmount = action === 'debit' ? -amount : amount;

    const { error } = await supabase.rpc('grant_credit', {
      p_user_id: userId,
      p_credit_type: creditType,
      p_amount: finalAmount,
      p_event_type: action === 'grant' ? 'adjustment' : 'debit',
      p_description: description || `Admin ${action} of ${amount} ${creditType} credits`,
    });

    if (error) {
      toast.error(`Failed to ${action} credits: ${error.message}`);
    } else {
      toast.success(`${action === 'grant' ? 'Granted' : 'Debited'} ${amount} ${creditType} credits`);

      // Sync legacy user_credits table
      const { data: legacyRow } = await supabase
        .from('user_credits')
        .select('id, total_credits, used_credits')
        .eq('user_id', userId)
        .eq('credit_type', creditType)
        .single();

      if (legacyRow && action === 'grant') {
        await supabase
          .from('user_credits')
          .update({ total_credits: legacyRow.total_credits + amount })
          .eq('id', legacyRow.id);
      }

      fetchAll();
      fetchLedger(ledgerPage);
    }

    setAdjustDialog(prev => ({ ...prev, open: false }));
  }

  async function handlePlanChange() {
    const { userId, newPlan } = planDialog;

    // Update all credit rows for this user
    const userCredits = credits.filter(c => c.user_id === userId);
    for (const c of userCredits) {
      await supabase
        .from('user_credits')
        .update({ plan: newPlan })
        .eq('id', c.id);
    }

    toast.success(`Plan changed to ${newPlan}`);
    fetchAll();
    setPlanDialog(prev => ({ ...prev, open: false }));
  }

  async function toggleRole(userId: string, action: 'grant' | 'revoke') {
    if (action === 'grant') {
      const { error } = await supabase.from('user_roles').insert({ user_id: userId, role: 'admin' });
      if (error) {
        toast.error('Failed to grant admin role');
      } else {
        toast.success('Admin role granted');
        fetchAll();
      }
    } else {
      const { error } = await supabase.from('user_roles').delete().eq('user_id', userId).eq('role', 'admin');
      if (error) {
        toast.error('Failed to revoke admin role');
      } else {
        toast.success('Admin role revoked');
        fetchAll();
      }
    }
    setRoleDialog(prev => ({ ...prev, open: false }));
  }

  function getUserRole(userId: string) {
    return roles.find(r => r.user_id === userId)?.role ?? 'user';
  }

  function getUserCredits(userId: string) {
    return credits.filter(c => c.user_id === userId);
  }

  function getUserName(userId: string) {
    const u = users.find(u => u.id === userId);
    return u?.full_name || u?.email || userId.slice(0, 8);
  }

  const creditTypeBadgeVariant = (type: string) => {
    switch (type) {
      case 'scrape': return 'default';
      case 'analyze': return 'warning';
      case 'fix': return 'success';
      case 'enhance': return 'secondary';
      default: return 'secondary';
    }
  };

  const eventTypeBadgeVariant = (type: string) => {
    switch (type) {
      case 'grant': return 'success';
      case 'debit': return 'destructive';
      case 'refund': return 'warning';
      case 'promo': return 'default';
      case 'adjustment': return 'secondary';
      default: return 'outline';
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users" className="gap-2">
            <Users className="w-4 h-4" /> Users
          </TabsTrigger>
          <TabsTrigger value="credits" className="gap-2">
            <CreditCard className="w-4 h-4" /> Credits
          </TabsTrigger>
          <TabsTrigger value="ledger" className="gap-2">
            <BookOpen className="w-4 h-4" /> Ledger
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2">
            <Activity className="w-4 h-4" /> Activity
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-2">
            <BarChart3 className="w-4 h-4" /> System Stats
          </TabsTrigger>
          <TabsTrigger value="ai-status" className="gap-2">
            <Cpu className="w-4 h-4" /> AI Status
          </TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">All Users ({users.length})</CardTitle>
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
                      <th className="text-left p-3 text-muted-foreground font-medium">Sessions</th>
                      <th className="text-left p-3 text-muted-foreground font-medium">Joined</th>
                      <th className="text-left p-3 text-muted-foreground font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => {
                      const role = getUserRole(u.id);
                      const isSelf = u.id === user?.id;
                      const userCreds = getUserCredits(u.id);
                      const plan = userCreds[0]?.plan ?? 'free';
                      return (
                        <tr key={u.id} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="p-3 text-foreground">{u.full_name || '—'}</td>
                          <td className="p-3 text-muted-foreground">{u.email}</td>
                          <td className="p-3">
                            <Badge variant={role === 'admin' ? 'default' : 'secondary'}>
                              {role}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <Badge
                              variant="outline"
                              className="cursor-pointer"
                              onClick={() => setPlanDialog({
                                open: true, userId: u.id,
                                userName: u.full_name || u.email || '',
                                currentPlan: plan, newPlan: plan,
                              })}
                            >
                              {plan}
                            </Badge>
                          </td>
                          <td className="p-3 text-foreground">{sessionCounts[u.id] ?? 0}</td>
                          <td className="p-3 text-muted-foreground">
                            {new Date(u.created_at).toLocaleDateString()}
                          </td>
                          <td className="p-3 space-x-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => setAdjustDialog({
                                open: true, userId: u.id,
                                userName: u.full_name || u.email || '',
                                creditType: 'analyze', amount: 10, description: '', action: 'grant',
                              })}
                            >
                              <Gift className="w-3 h-3" /> Credits
                            </Button>
                            {isSelf ? (
                              <span className="text-xs text-muted-foreground">You</span>
                            ) : role === 'admin' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                onClick={() => setRoleDialog({ open: true, userId: u.id, action: 'revoke', userName: u.full_name || u.email || '' })}
                              >
                                <ShieldOff className="w-3 h-3" /> Revoke
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                onClick={() => setRoleDialog({ open: true, userId: u.id, action: 'grant', userName: u.full_name || u.email || '' })}
                              >
                                <ShieldCheck className="w-3 h-3" /> Admin
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Credits Tab */}
        <TabsContent value="credits">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Credits Management</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {users.map(u => {
                  const userCredits = getUserCredits(u.id);
                  if (userCredits.length === 0) return null;
                  return (
                    <div key={u.id} className="p-4 rounded-xl border border-border/50 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{u.full_name || u.email}</span>
                        <Badge variant="outline" className="text-xs">{userCredits[0]?.plan}</Badge>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        {userCredits.map(c => (
                          <div key={c.id} className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground capitalize w-16">{c.credit_type}</span>
                            <span className="text-xs text-muted-foreground">{c.used_credits}/</span>
                            <Input
                              type="number"
                              className="w-24 h-8 text-sm"
                              defaultValue={c.total_credits}
                              onChange={e => setEditingCredits(prev => ({ ...prev, [c.id]: Number(e.target.value) }))}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs"
                              onClick={() => updateCredits(c.id, editingCredits[c.id] ?? c.total_credits)}
                            >
                              Save
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Ledger Tab */}
        <TabsContent value="ledger">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle className="text-lg">Credit Ledger</CardTitle>
              <div className="flex items-center gap-3">
                <select
                  value={ledgerUserFilter}
                  onChange={(e) => {
                    setLedgerUserFilter(e.target.value);
                    fetchLedger(0, e.target.value);
                  }}
                  className="text-xs bg-background border border-border rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="all">All users</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.full_name || u.email || u.id.slice(0, 8)}</option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{ledgerTotal} entries</span>
              </div>
            </CardHeader>
            <CardContent>
              {ledgerLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : ledgerEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No ledger entries yet.</p>
              ) : (
                <div className="space-y-2">
                  {ledgerEntries.map(entry => (
                    <div key={entry.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground truncate">
                            {getUserName(entry.user_id)}
                          </span>
                          <Badge variant={eventTypeBadgeVariant(entry.event_type) as any} className="text-xs">
                            {entry.event_type}
                          </Badge>
                          <Badge variant={creditTypeBadgeVariant(entry.credit_type) as any} className="text-xs">
                            {entry.credit_type}
                          </Badge>
                          <span className={`text-sm font-mono font-semibold ${entry.amount > 0 ? 'text-success' : 'text-destructive'}`}>
                            {entry.amount > 0 ? '+' : ''}{entry.amount}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            bal: {entry.balance_after}
                          </span>
                        </div>
                        {entry.description && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">{entry.description}</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {ledgerTotal > LEDGER_PAGE_SIZE && (
                <div className="flex items-center justify-between pt-4 mt-4 border-t border-border/50">
                  <span className="text-xs text-muted-foreground">
                    Page {ledgerPage + 1} of {Math.ceil(ledgerTotal / LEDGER_PAGE_SIZE)}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={ledgerPage === 0} onClick={() => fetchLedger(ledgerPage - 1)}>Previous</Button>
                    <Button variant="outline" size="sm" disabled={(ledgerPage + 1) * LEDGER_PAGE_SIZE >= ledgerTotal} onClick={() => fetchLedger(ledgerPage + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle className="text-lg">Recent Activity</CardTitle>
              <div className="flex items-center gap-3">
                <select
                  value={activityFilter}
                  onChange={(e) => {
                    const val = e.target.value as typeof activityFilter;
                    setActivityFilter(val);
                    fetchActivity(0, val);
                  }}
                  className="text-xs bg-background border border-border rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="all">All types</option>
                  <option value="scrape">Scrape</option>
                  <option value="analyze">Analyze</option>
                  <option value="fix">Fix</option>
                  <option value="enhance">Enhance</option>
                </select>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{activityTotal} actions</span>
              </div>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : activityLog.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No activity logged yet.</p>
              ) : (
                <div className="space-y-3">
                  {activityLog.map(entry => (
                    <div key={entry.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground truncate">
                            {getUserName(entry.user_id)}
                          </span>
                          <Badge variant={creditTypeBadgeVariant(entry.credit_type) as any} className="text-xs">
                            {entry.credit_type}
                          </Badge>
                          {entry.edge_function && (
                            <span className="text-xs text-muted-foreground font-mono">
                              {entry.edge_function}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(entry.consumed_at), { addSuffix: true })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {activityTotal > ACTIVITY_PAGE_SIZE && (
                <div className="flex items-center justify-between pt-4 mt-4 border-t border-border/50">
                  <span className="text-xs text-muted-foreground">
                    Page {activityPage + 1} of {Math.ceil(activityTotal / ACTIVITY_PAGE_SIZE)}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={activityPage === 0 || activityLoading} onClick={() => fetchActivity(activityPage - 1)}>Previous</Button>
                    <Button variant="outline" size="sm" disabled={(activityPage + 1) * ACTIVITY_PAGE_SIZE >= activityTotal || activityLoading} onClick={() => fetchActivity(activityPage + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stats Tab */}
        <TabsContent value="stats">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total Sessions</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">{stats.totalSessions}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Images Analyzed</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">{stats.totalImages}</p>
              </CardContent>
            </Card>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Card className="cursor-default">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Credits Consumed</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold text-foreground">{stats.totalCreditsUsed}</p>
                    </CardContent>
                  </Card>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs space-y-1 p-3">
                  <p className="font-medium">Breakdown</p>
                  <p>Admin: <span className="font-semibold">{stats.adminCredits}</span></p>
                  <p>Users: <span className="font-semibold">{stats.userCredits}</span></p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </TabsContent>

        {/* AI Status Tab */}
        <TabsContent value="ai-status">
          <AIProviderStatusPanel />
        </TabsContent>
      </Tabs>

      {/* Role Confirmation Dialog */}
      <Dialog open={roleDialog.open} onOpenChange={(open) => setRoleDialog(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {roleDialog.action === 'grant' ? 'Grant Admin Role' : 'Revoke Admin Role'}
            </DialogTitle>
            <DialogDescription>
              {roleDialog.action === 'grant'
                ? `Are you sure you want to make "${roleDialog.userName}" an admin? They will have full access to this panel.`
                : `Are you sure you want to revoke admin access from "${roleDialog.userName}"?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant={roleDialog.action === 'revoke' ? 'destructive' : 'default'}
              onClick={() => toggleRole(roleDialog.userId, roleDialog.action)}
            >
              {roleDialog.action === 'grant' ? 'Grant Admin' : 'Revoke Admin'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credit Adjustment Dialog */}
      <Dialog open={adjustDialog.open} onOpenChange={(open) => setAdjustDialog(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Credits for {adjustDialog.userName}</DialogTitle>
            <DialogDescription>
              Grant or debit credits. This will be recorded in the ledger.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <Button
                variant={adjustDialog.action === 'grant' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAdjustDialog(prev => ({ ...prev, action: 'grant' }))}
              >
                <Plus className="w-3 h-3 mr-1" /> Grant
              </Button>
              <Button
                variant={adjustDialog.action === 'debit' ? 'destructive' : 'outline'}
                size="sm"
                onClick={() => setAdjustDialog(prev => ({ ...prev, action: 'debit' }))}
              >
                <Minus className="w-3 h-3 mr-1" /> Debit
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Credit Type</label>
                <select
                  value={adjustDialog.creditType}
                  onChange={(e) => setAdjustDialog(prev => ({ ...prev, creditType: e.target.value }))}
                  className="w-full text-sm bg-background border border-border rounded-md px-2 py-1.5 text-foreground"
                >
                  <option value="scrape">Scrape</option>
                  <option value="analyze">Analyze</option>
                  <option value="fix">Fix</option>
                  <option value="enhance">Enhance</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Amount</label>
                <Input
                  type="number"
                  min={1}
                  value={adjustDialog.amount}
                  onChange={(e) => setAdjustDialog(prev => ({ ...prev, amount: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Description (optional)</label>
              <Input
                placeholder="e.g. Promo bonus, billing adjustment..."
                value={adjustDialog.description}
                onChange={(e) => setAdjustDialog(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant={adjustDialog.action === 'debit' ? 'destructive' : 'default'}
              onClick={handleAdjustment}
            >
              {adjustDialog.action === 'grant' ? 'Grant Credits' : 'Debit Credits'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Plan Change Dialog */}
      <Dialog open={planDialog.open} onOpenChange={(open) => setPlanDialog(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Plan for {planDialog.userName}</DialogTitle>
            <DialogDescription>
              Current plan: <strong>{planDialog.currentPlan}</strong>. This changes the plan label only — credit adjustments should be done separately.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <select
              value={planDialog.newPlan}
              onChange={(e) => setPlanDialog(prev => ({ ...prev, newPlan: e.target.value }))}
              className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 text-foreground"
            >
              <option value="free">Free</option>
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="agency">Agency</option>
            </select>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handlePlanChange}>
              Change Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
