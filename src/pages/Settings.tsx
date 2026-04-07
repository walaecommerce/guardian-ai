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
  User, CreditCard, Bell, Loader2, Save, ExternalLink, Search, BarChart3, Sparkles, Send,
  CheckCircle2, XCircle, Clock, TrendingUp,
} from 'lucide-react';
import {
  getNotificationPrefs, saveNotificationPrefs, NotificationPrefs,
  getNotificationLog, NotificationLogEntry,
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
      <Card className="border-white/5 bg-white/[0.02]">
        <CardHeader>
          <CardTitle className="text-lg">Profile Information</CardTitle>
          <CardDescription>Update your personal details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 mb-2">
            <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-white/10 shrink-0">
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

function BillingTab() {
  const { plan, subscribed, subscriptionEnd, openPortal } = useSubscription();
  const { remainingCredits, totalCredits } = useCredits();
  const navigate = useNavigate();
  const tier = getTierByPlan(plan);

  const creditTypes = [
    { type: 'scrape' as const, icon: Search, label: 'Scrapes' },
    { type: 'analyze' as const, icon: BarChart3, label: 'Analyses' },
    { type: 'fix' as const, icon: Sparkles, label: 'Fixes' },
  ];

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card className="border-white/5 bg-white/[0.02]">
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
      <Card className="border-white/5 bg-white/[0.02]">
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
    </div>
  );
}

// ── Notifications Tab ────────────────────────────────────────

function NotificationsTab() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(getNotificationPrefs);
  const [log, setLog] = useState<NotificationLogEntry[]>(getNotificationLog);
  const [testing, setTesting] = useState(false);

  const updatePrefs = (updated: NotificationPrefs) => {
    setPrefs(updated);
    saveNotificationPrefs(updated);
  };

  const handleTest = async () => {
    if (!prefs.slackWebhookUrl) {
      toast.error('Enter a Slack webhook URL first');
      return;
    }
    setTesting(true);
    try {
      const { error } = await supabase.functions.invoke('send-slack-notification', {
        body: {
          webhookUrl: prefs.slackWebhookUrl,
          type: 'test',
          title: 'Test Product',
          status: '✅ PASS',
          score: 92,
          violations: 2,
          images: 7,
          criticalCount: 0,
          topViolation: 'Minor text overlay on secondary image',
        },
      });
      if (error) throw error;
      toast.success('Test notification sent — check your Slack channel');
      setLog(getNotificationLog());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test failed');
      setLog(getNotificationLog());
    } finally {
      setTesting(false);
    }
  };

  const statusIcon = (status: string) => {
    if (status === 'sent') return <CheckCircle2 className="w-3.5 h-3.5 text-success" />;
    if (status === 'failed') return <XCircle className="w-3.5 h-3.5 text-destructive" />;
    return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
  };

  return (
    <div className="space-y-6">
      {/* Slack */}
      <Card className="border-white/5 bg-white/[0.02]">
        <CardHeader>
          <CardTitle className="text-lg">Slack Integration</CardTitle>
          <CardDescription>Receive audit alerts in your Slack channel</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="slackUrl">Webhook URL</Label>
            <Input
              id="slackUrl"
              type="url"
              value={prefs.slackWebhookUrl}
              onChange={(e) => updatePrefs({ ...prefs, slackWebhookUrl: e.target.value })}
              placeholder="https://hooks.slack.com/services/..."
            />
          </div>

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

          <Button onClick={handleTest} disabled={testing || !prefs.slackWebhookUrl} variant="outline" size="sm">
            {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Send Test
          </Button>
        </CardContent>
      </Card>

      {/* Triggers */}
      <Card className="border-white/5 bg-white/[0.02]">
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

          <Separator className="bg-white/5" />

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
        <Card className="border-white/5 bg-white/[0.02]">
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
          <TabsList className="bg-white/[0.03] border border-white/5">
            <TabsTrigger value="profile" className="gap-2 data-[state=active]:bg-white/5">
              <User className="w-4 h-4" /> Profile
            </TabsTrigger>
            <TabsTrigger value="billing" className="gap-2 data-[state=active]:bg-white/5">
              <CreditCard className="w-4 h-4" /> Billing
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2 data-[state=active]:bg-white/5">
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
