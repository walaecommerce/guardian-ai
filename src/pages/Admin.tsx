import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose
} from '@/components/ui/dialog';
import { Shield, Users, BarChart3, CreditCard, Loader2, Activity, ShieldCheck, ShieldOff } from 'lucide-react';
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

export default function Admin() {
  const { isAdmin, isLoading: authLoading, user } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [credits, setCredits] = useState<CreditRow[]>([]);
  const [roles, setRoles] = useState<{ user_id: string; role: string }[]>([]);
  const [sessionCounts, setSessionCounts] = useState<Record<string, number>>({});
  const [stats, setStats] = useState({ totalSessions: 0, totalImages: 0, totalCreditsUsed: 0 });
  const [activityLog, setActivityLog] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCredits, setEditingCredits] = useState<Record<string, number>>({});
  const [roleDialog, setRoleDialog] = useState<{ open: boolean; userId: string; action: 'grant' | 'revoke'; userName: string }>({
    open: false, userId: '', action: 'grant', userName: ''
  });

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate('/');
    }
  }, [isAdmin, authLoading, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchAll();
  }, [isAdmin]);

  async function fetchAll() {
    setLoading(true);
    const [profilesRes, creditsRes, rolesRes, sessionsRes, imagesRes, usageRes] = await Promise.all([
      supabase.from('user_profiles').select('id, email, full_name, created_at'),
      supabase.from('user_credits').select('*'),
      supabase.from('user_roles').select('user_id, role'),
      supabase.from('enhancement_sessions').select('id, user_id'),
      supabase.from('session_images').select('id'),
      supabase.from('credit_usage_log').select('id, user_id, credit_type, edge_function, consumed_at').order('consumed_at', { ascending: false }).limit(50),
    ]);

    if (profilesRes.data) setUsers(profilesRes.data);
    if (creditsRes.data) setCredits(creditsRes.data);
    if (rolesRes.data) setRoles(rolesRes.data);
    if (usageRes.data) setActivityLog(usageRes.data);

    const counts: Record<string, number> = {};
    sessionsRes.data?.forEach((s: any) => {
      counts[s.user_id] = (counts[s.user_id] || 0) + 1;
    });
    setSessionCounts(counts);

    // Sum used_credits from user_credits (non-admin consumption)
    const deducted = creditsRes.data?.reduce((sum, c) => sum + c.used_credits, 0) ?? 0;
    // Count admin usage logs (admins skip deduction but still log)
    const adminUserIds = new Set(rolesRes.data?.filter(r => r.role === 'admin').map(r => r.user_id) ?? []);
    const adminLogCount = usageRes.data?.filter(l => adminUserIds.has(l.user_id)).length ?? 0;
    // For a full count, query all usage logs
    const { count: totalLogCount } = await supabase.from('credit_usage_log').select('id', { count: 'exact', head: true });

    setStats({
      totalSessions: sessionsRes.data?.length ?? 0,
      totalImages: imagesRes.data?.length ?? 0,
      totalCreditsUsed: totalLogCount ?? deducted,
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
      default: return 'secondary';
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
          <TabsTrigger value="activity" className="gap-2">
            <Activity className="w-4 h-4" /> Activity
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-2">
            <BarChart3 className="w-4 h-4" /> System Stats
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
                      <th className="text-left p-3 text-muted-foreground font-medium">Sessions</th>
                      <th className="text-left p-3 text-muted-foreground font-medium">Joined</th>
                      <th className="text-left p-3 text-muted-foreground font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => {
                      const role = getUserRole(u.id);
                      const isSelf = u.id === user?.id;
                      return (
                        <tr key={u.id} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="p-3 text-foreground">{u.full_name || '—'}</td>
                          <td className="p-3 text-muted-foreground">{u.email}</td>
                          <td className="p-3">
                            <Badge variant={role === 'admin' ? 'default' : 'secondary'}>
                              {role}
                            </Badge>
                          </td>
                          <td className="p-3 text-foreground">{sessionCounts[u.id] ?? 0}</td>
                          <td className="p-3 text-muted-foreground">
                            {new Date(u.created_at).toLocaleDateString()}
                          </td>
                          <td className="p-3">
                            {isSelf ? (
                              <span className="text-xs text-muted-foreground">You</span>
                            ) : role === 'admin' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                onClick={() => setRoleDialog({ open: true, userId: u.id, action: 'revoke', userName: u.full_name || u.email || '' })}
                              >
                                <ShieldOff className="w-3 h-3" /> Revoke Admin
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                onClick={() => setRoleDialog({ open: true, userId: u.id, action: 'grant', userName: u.full_name || u.email || '' })}
                              >
                                <ShieldCheck className="w-3 h-3" /> Make Admin
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
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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

        {/* Activity Tab */}
        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {activityLog.length === 0 ? (
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
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Credits Consumed</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">{stats.totalCreditsUsed}</p>
              </CardContent>
            </Card>
          </div>
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
    </div>
  );
}
