import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useApiKey } from '@/hooks/useApiKey';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  User, Key, Bell, Loader2, Save, CheckCircle2, XCircle, Clock, Send, Trash2, ShieldCheck, ExternalLink,
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

// ── AI Provider Tab ──────────────────────────────────────────

function AIProviderTab() {
  const { configured, keyHint, loading, saveKey, deleteKey } = useApiKey();
  const [keyInput, setKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    if (!keyInput.trim()) return;
    setSaving(true);
    try {
      await saveKey(keyInput.trim());
      setKeyInput('');
      toast.success('Gemini API key saved and validated');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save API key');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteKey();
      toast.success('API key removed');
    } catch {
      toast.error('Failed to remove API key');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-white/5 bg-white/[0.02]">
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-white/5 bg-white/[0.02]">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Gemini API Key
          </CardTitle>
          <CardDescription>
            All AI features (analysis, fix generation, studio) use your own Google Gemini API key.
            Your key is stored securely server-side and never exposed to the browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {configured ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg border border-green-500/20 bg-green-500/5">
                <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">Key configured</p>
                  <p className="text-xs text-muted-foreground font-mono">{keyHint}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-destructive hover:text-destructive shrink-0"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </Button>
              </div>

              <Separator className="bg-white/5" />

              <div className="space-y-2">
                <Label>Replace key</Label>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="AIza..."
                    className="font-mono"
                  />
                  <Button onClick={handleSave} disabled={saving || !keyInput.trim()}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                <XCircle className="w-5 h-5 text-amber-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">No API key configured</p>
                  <p className="text-xs text-muted-foreground">AI features are disabled until you add a key.</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="geminiKey">Google Gemini API Key</Label>
                <div className="flex gap-2">
                  <Input
                    id="geminiKey"
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="AIza..."
                    className="font-mono"
                  />
                  <Button onClick={handleSave} disabled={saving || !keyInput.trim()}>
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Key className="w-4 h-4 mr-2" />}
                    Save
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Get your key from{' '}
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
                    Google AI Studio <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
              </div>
            </div>
          )}
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
    if (!prefs.slackWebhookUrl) { toast.error('Enter a Slack webhook URL first'); return; }
    setTesting(true);
    try {
      const { error } = await supabase.functions.invoke('send-slack-notification', {
        body: {
          webhookUrl: prefs.slackWebhookUrl, type: 'test', title: 'Test Product',
          status: '✅ PASS', score: 92, violations: 2, images: 7, criticalCount: 0,
          topViolation: 'Minor text overlay on secondary image',
        },
      });
      if (error) throw error;
      toast.success('Test notification sent');
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
      <Card className="border-white/5 bg-white/[0.02]">
        <CardHeader>
          <CardTitle className="text-lg">Slack Integration</CardTitle>
          <CardDescription>Receive audit alerts in your Slack channel</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="slackUrl">Webhook URL</Label>
            <Input id="slackUrl" type="url" value={prefs.slackWebhookUrl} onChange={(e) => updatePrefs({ ...prefs, slackWebhookUrl: e.target.value })} placeholder="https://hooks.slack.com/services/..." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="emailNotif">Email Address</Label>
            <Input id="emailNotif" type="email" value={prefs.emailAddress} onChange={(e) => updatePrefs({ ...prefs, emailAddress: e.target.value })} placeholder="you@company.com" />
          </div>
          <Button onClick={handleTest} disabled={testing || !prefs.slackWebhookUrl} variant="outline" size="sm">
            {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Send Test
          </Button>
        </CardContent>
      </Card>

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
              <Checkbox id={key} checked={prefs.notifyOn[key]} onCheckedChange={(checked) => updatePrefs({ ...prefs, notifyOn: { ...prefs.notifyOn, [key]: !!checked } })} />
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

      {log.length > 0 && (
        <Card className="border-white/5 bg-white/[0.02]">
          <CardHeader><CardTitle className="text-lg">Delivery Log</CardTitle></CardHeader>
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
          <p className="text-sm text-muted-foreground mt-1">Manage your account, AI provider, and notifications</p>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="bg-white/[0.03] border border-white/5">
            <TabsTrigger value="profile" className="gap-2 data-[state=active]:bg-white/5">
              <User className="w-4 h-4" /> Profile
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-2 data-[state=active]:bg-white/5">
              <Key className="w-4 h-4" /> AI Provider
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2 data-[state=active]:bg-white/5">
              <Bell className="w-4 h-4" /> Notifications
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile"><ProfileTab /></TabsContent>
          <TabsContent value="ai"><AIProviderTab /></TabsContent>
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
