import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useCredits } from '@/hooks/useCredits';
import { useCreditsHistory } from '@/hooks/useCreditsHistory';
import { useSubscription } from '@/hooks/useSubscription';
import { TIERS, getTierByPlan } from '@/config/subscriptionTiers';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import {
  User, CreditCard, Bell, Loader2, Save, ExternalLink, Search, BarChart3, Sparkles,
  CheckCircle2, XCircle, Clock, TrendingUp,
} from 'lucide-react';
import {
  getNotificationPrefs, saveNotificationPrefs, NotificationPrefs,
  NotificationLogEntry,
} from '@/components/NotificationSettings';

// ── Profile Tab ──────────────────────────────────────────────

function ProfileTab() {
  const { user, profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [amazonStoreUrl, setAmazonStoreUrl] = useState(profile?.amazon_store_url || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from('user_profiles')
      .update({ full_name: fullName, amazon_store_url: amazonStoreUrl })
      .eq('id', user.id);

    if (error) {
      toast.error('Failed to update profile');
    } else {
      toast.success('Profile updated');
      await refreshProfile();
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-lg">Profile Information</CardTitle>
          <CardDescription>Update your personal details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 mb-2">
            <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-border shrink-0">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-primary/10 flex items-center justify-center">
                  <User className="w-6 h-6 text-primary" />
                </div>
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{profile?.full_name || 'User'}</p>
              <p className="text-xs text-muted-foreground">{profile?.email || user?.email}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={profile?.email || user?.email || ''} disabled className="opacity-60" />
            <p className="text-[11px] text-muted-foreground">Email is managed by your login provider</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amazonUrl">Amazon Store URL</Label>
            <Input
              id="amazonUrl"
              value={amazonStoreUrl}
              onChange={(e) => setAmazonStoreUrl(e.target.value)}
              placeholder="https://www.amazon.com/stores/..."
            />
          </div>

          <Button onClick={handleSave} disabled={saving} className="mt-2">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Changes
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Billing Tab ──────────────────────────────────────────────

const usageChartConfig = {
  scrape: { label: 'Scrapes', color: 'hsl(var(--primary))' },
  analyze: { label: 'Analyses', color: 'hsl(var(--accent-foreground))' },
  fix: { label: 'Fixes', color: 'hsl(var(--destructive))' },
};

function BillingTab() {
  const { plan, subscribed, subscriptionEnd, openPortal } = useSubscription();
  const { remainingCredits, totalCredits } = useCredits();
  const { data: usageData, loading: usageLoading } = useCreditsHistory(30);
  const navigate = useNavigate();
  const tier = getTierByPlan(plan);

  const creditTypes = [
    { type: 'scrape' as const, icon: Search, label: 'Scrapes' },
    { type: 'analyze' as const, icon: BarChart3, label: 'Analyses' },
    { type: 'fix' as const, icon: Sparkles, label: 'Fixes' },
    { type: 'enhance' as const, icon: Sparkles, label: 'Enhancements' },
  ];

  const hasUsageData = usageData.some(d => d.scrape + d.analyze + d.fix > 0);

  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Current Plan</CardTitle>
              <CardDescription>Manage your subscription and billing</CardDescription>
            </div>
            <Badge className={`${plan === 'free' ? 'bg-white/10 text-muted-foreground' : 'bg-primary/15 text-primary'} px-3 py-1 text-sm font-semibold capitalize`}>
              {tier.name}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-foreground">{tier.price}</span>
            <span className="text-sm text-muted-foreground">{tier.period}</span>
          </div>

          {subscribed && subscriptionEnd && (
            <p className="text-xs text-muted-foreground">
              Renews on {new Date(subscriptionEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            {plan === 'free' ? (
              <Button onClick={() => navigate('/pricing')} className="bg-primary text-primary-foreground hover:bg-primary/90">
                Upgrade Plan
              </Button>
            ) : (
              <>
                <Button onClick={() => navigate('/pricing')} variant="outline">
                  Change Plan
                </Button>
                <Button onClick={openPortal} variant="ghost" className="text-muted-foreground">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Manage Billing
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Credit Usage */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-lg">Credit Usage</CardTitle>
          <CardDescription>Monthly credits for the current billing cycle</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {creditTypes.map(({ type, icon: Icon, label }) => {
            const remaining = remainingCredits(type);
            const total = totalCredits(type);
            const pct = total > 0 ? (remaining / total) * 100 : 0;
            const isLow = pct < 20;

            return (
              <div key={type} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm text-foreground font-medium">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    {label}
                  </span>
                  <span className={`text-sm font-semibold ${isLow ? 'text-destructive' : 'text-foreground'}`}>
                    {remaining} / {total}
                  </span>
                </div>
                <Progress value={pct} className={`h-2 ${isLow ? '[&>div]:bg-destructive' : ''}`} />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Promo Code */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-lg">Promo Code</CardTitle>
          <CardDescription>Have a promo code? Redeem it for bonus credits.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Enter promo code"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
              className="max-w-xs"
            />
            <Button
              disabled={!promoCode.trim() || promoLoading}
              onClick={async () => {
                setPromoLoading(true);
                try {
                  const { data, error } = await supabase.functions.invoke('redeem-promo', {
                    body: { code: promoCode.trim() },
                  });
                  if (error) throw error;
                  if (data?.error) {
                    toast.error(data.error);
                  } else {
                    toast.success(`🎉 +${data.amount} ${data.creditType} credits added!`);
                    setPromoCode('');
                  }
                } catch (err: any) {
                  toast.error(err?.message || 'Failed to redeem promo code');
                } finally {
                  setPromoLoading(false);
                }
              }}
            >
              {promoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Redeem'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Usage History Chart */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            Usage History
          </CardTitle>
          <CardDescription>Credit consumption over the last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          {usageLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : !hasUsageData ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <BarChart3 className="w-8 h-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No usage data yet</p>
              <p className="text-xs text-muted-foreground/60">Credits consumed will appear here</p>
            </div>
          ) : (
            <ChartContainer config={usageChartConfig} className="h-64 w-full">
              <BarChart data={usageData} barCategoryGap="20%">
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/30" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  interval="preserveStartEnd"
                  className="text-muted-foreground"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  allowDecimals={false}
                  className="text-muted-foreground"
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="scrape" stackId="a" fill="var(--color-scrape)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="analyze" stackId="a" fill="var(--color-analyze)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="fix" stackId="a" fill="var(--color-fix)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Notifications Tab ────────────────────────────────────────

function NotificationsTab() {
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    emailAddress: '',
    notifyOn: { auditComplete: true, criticalViolations: true, scoreDropped: true, fixGenerated: false },
    minSeverity: 'any',
  });
  const [log, setLog] = useState<NotificationLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Load prefs + log from server on mount
  useState(() => {
    Promise.all([
      getNotificationPrefs(),
      (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];
        const { data } = await supabase
          .from('notification_log')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10);
        return (data || []).map((row: any) => ({
          id: row.id,
          timestamp: row.created_at,
          type: row.type,
          message: row.message,
          status: row.status,
          error: row.error || undefined,
        })) as NotificationLogEntry[];
      })(),
    ]).then(([p, l]) => {
      setPrefs(p);
      setLog(l);
      setLoading(false);
    });
  });

  const updatePrefs = async (updated: NotificationPrefs) => {
    setPrefs(updated);
    await saveNotificationPrefs(updated);
  };

  const statusIcon = (status: string) => {
    if (status === 'sent') return <CheckCircle2 className="w-3.5 h-3.5 text-success" />;
    if (status === 'failed') return <XCircle className="w-3.5 h-3.5 text-destructive" />;
    return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
  };

  return (
    <div className="space-y-6">
      {/* Email */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-lg">Email Notifications</CardTitle>
          <CardDescription>Receive audit alerts via email</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="emailNotif">Email Address</Label>
            <Input
              id="emailNotif"
              type="email"
              value={prefs.emailAddress}
              onChange={(e) => updatePrefs({ ...prefs, emailAddress: e.target.value })}
              placeholder="you@company.com"
            />
          </div>
        </CardContent>
      </Card>

      {/* Triggers */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-lg">Notification Triggers</CardTitle>
          <CardDescription>Choose which events trigger alerts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: 'auditComplete' as const, label: 'Audit completed' },
            { key: 'criticalViolations' as const, label: 'Critical violations detected' },
            { key: 'scoreDropped' as const, label: 'Score dropped significantly' },
            { key: 'fixGenerated' as const, label: 'Fix generated' },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center gap-3">
              <Checkbox
                id={key}
                checked={prefs.notifyOn[key]}
                onCheckedChange={(checked) =>
                  updatePrefs({ ...prefs, notifyOn: { ...prefs.notifyOn, [key]: !!checked } })
                }
              />
              <Label htmlFor={key} className="text-sm cursor-pointer">{label}</Label>
            </div>
          ))}

          <Separator className="bg-muted/50" />

          <div className="space-y-2">
            <Label>Minimum Severity</Label>
            <Select value={prefs.minSeverity} onValueChange={(v) => updatePrefs({ ...prefs, minSeverity: v as any })}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="high">High+</SelectItem>
                <SelectItem value="critical">Critical only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Delivery Log */}
      {log.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg">Delivery Log</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-48">
              <div className="space-y-2">
                {log.slice(0, 10).map((entry) => (
                  <div key={entry.id} className="flex items-start gap-2 text-xs">
                    {statusIcon(entry.status)}
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground truncate">{entry.message}</p>
                      <p className="text-muted-foreground">{new Date(entry.timestamp).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Settings Page ────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-10 max-w-3xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your account, subscription, and notifications</p>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="bg-muted/30 border border-border">
            <TabsTrigger value="profile" className="gap-2 data-[state=active]:bg-muted/50">
              <User className="w-4 h-4" /> Profile
            </TabsTrigger>
            <TabsTrigger value="billing" className="gap-2 data-[state=active]:bg-muted/50">
              <CreditCard className="w-4 h-4" /> Billing
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2 data-[state=active]:bg-muted/50">
              <Bell className="w-4 h-4" /> Notifications
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile"><ProfileTab /></TabsContent>
          <TabsContent value="billing"><BillingTab /></TabsContent>
          <TabsContent value="notifications"><NotificationsTab /></TabsContent>
        </Tabs>

        <div className="mt-10 pt-6 border-t border-border/50 flex gap-4 text-sm text-muted-foreground">
          <a href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</a>
          <a href="/terms" className="hover:text-foreground transition-colors">Terms of Service</a>
        </div>
      </main>
    </div>
  );
}
