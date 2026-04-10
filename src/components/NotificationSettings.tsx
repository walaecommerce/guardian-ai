import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Settings, Send, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export interface NotificationPrefs {
  slackWebhookUrl: string;
  emailAddress: string;
  notifyOn: {
    auditComplete: boolean;
    criticalViolations: boolean;
    scoreDropped: boolean;
    fixGenerated: boolean;
  };
  minSeverity: 'any' | 'high' | 'critical';
}

export interface NotificationLogEntry {
  id: string;
  timestamp: string;
  type: string;
  message: string;
  status: 'sent' | 'failed' | 'pending';
  error?: string;
}

const DEFAULT_PREFS: NotificationPrefs = {
  slackWebhookUrl: '',
  emailAddress: '',
  notifyOn: { auditComplete: true, criticalViolations: true, scoreDropped: true, fixGenerated: false },
  minSeverity: 'any',
};

// Delivery log stays in localStorage — it's ephemeral, per-device
const LOG_KEY = 'guardian-notification-log';

/**
 * Load notification preferences from the server for the authenticated user.
 */
export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return DEFAULT_PREFS;

    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error || !data) return DEFAULT_PREFS;

    return {
      slackWebhookUrl: data.slack_webhook_url || '',
      emailAddress: data.email_address || '',
      notifyOn: (data.notify_on as any) || DEFAULT_PREFS.notifyOn,
      minSeverity: (data.min_severity as any) || 'any',
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/**
 * Save notification preferences to the server (upsert by user_id).
 */
export async function saveNotificationPrefs(prefs: NotificationPrefs): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from('notification_preferences')
      .upsert({
        user_id: user.id,
        slack_webhook_url: prefs.slackWebhookUrl || null,
        email_address: prefs.emailAddress || null,
        notify_on: prefs.notifyOn,
        min_severity: prefs.minSeverity,
      }, { onConflict: 'user_id' });

    return !error;
  } catch {
    return false;
  }
}

export function getNotificationLog(): NotificationLogEntry[] {
  try {
    const stored = localStorage.getItem(LOG_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

export function addNotificationLog(entry: Omit<NotificationLogEntry, 'id' | 'timestamp'>) {
  const log = getNotificationLog();
  log.unshift({
    ...entry,
    id: Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toISOString(),
  });
  localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(0, 10)));
}

/**
 * Send a Slack notification via the edge function.
 * The edge function reads the user's stored webhook URL server-side.
 */
export async function sendSlackNotification(payload: {
  type: 'audit_complete' | 'critical_violation' | 'score_dropped' | 'fix_generated';
  title?: string;
  status?: string;
  score?: number;
  violations?: number;
  images?: number;
  criticalCount?: number;
  topViolation?: string;
  oldScore?: number;
  newScore?: number;
}) {
  // Check local prefs for type-gating (the server also enforces webhook lookup)
  const prefs = await getNotificationPrefs();

  const typeMap: Record<string, keyof NotificationPrefs['notifyOn']> = {
    audit_complete: 'auditComplete',
    critical_violation: 'criticalViolations',
    score_dropped: 'scoreDropped',
    fix_generated: 'fixGenerated',
  };
  if (!prefs.notifyOn[typeMap[payload.type]]) return;

  try {
    const { data, error } = await supabase.functions.invoke('send-slack-notification', {
      body: payload, // No webhookUrl — server reads from DB
    });

    if (error) throw error;

    addNotificationLog({
      type: payload.type,
      message: `${payload.type.replace(/_/g, ' ')} — ${payload.title || 'Unknown'}`,
      status: 'sent',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    addNotificationLog({
      type: payload.type,
      message: `${payload.type.replace(/_/g, ' ')} — ${payload.title || 'Unknown'}`,
      status: 'failed',
      error: msg,
    });
  }
}

export function NotificationSettings() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [log, setLog] = useState<NotificationLogEntry[]>(getNotificationLog);
  const [testing, setTesting] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setLoading(true);
      getNotificationPrefs().then(p => {
        setPrefs(p);
        setLoading(false);
      });
      setLog(getNotificationLog());
    }
  }, [open]);

  const updatePrefs = async (updated: NotificationPrefs) => {
    setPrefs(updated);
    await saveNotificationPrefs(updated);
  };

  const handleTest = async () => {
    if (!prefs.slackWebhookUrl) {
      toast({ title: 'No Webhook URL', description: 'Enter a Slack webhook URL first', variant: 'destructive' });
      return;
    }
    // Save first to ensure server has the webhook
    await saveNotificationPrefs(prefs);
    setTesting(true);
    try {
      const { error } = await supabase.functions.invoke('send-slack-notification', {
        body: {
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
      addNotificationLog({ type: 'test', message: 'Test notification sent', status: 'sent' });
      setLog(getNotificationLog());
      toast({ title: 'Test Sent', description: 'Check your Slack channel' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed';
      addNotificationLog({ type: 'test', message: 'Test notification', status: 'failed', error: msg });
      setLog(getNotificationLog());
      toast({ title: 'Test Failed', description: msg, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-secondary-foreground/80 hover:text-secondary-foreground">
          <Settings className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Notification Settings</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Slack Webhook */}
            <div className="space-y-2">
              <Label htmlFor="slack-webhook" className="text-sm font-medium">Slack Webhook URL</Label>
              <Input
                id="slack-webhook"
                placeholder="https://hooks.slack.com/services/..."
                value={prefs.slackWebhookUrl}
                onChange={e => updatePrefs({ ...prefs, slackWebhookUrl: e.target.value })}
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email-reports" className="text-sm font-medium">Email for Reports</Label>
              <Input
                id="email-reports"
                type="email"
                placeholder="team@company.com"
                value={prefs.emailAddress}
                onChange={e => updatePrefs({ ...prefs, emailAddress: e.target.value })}
              />
            </div>

            <Separator />

            {/* Notify On */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Notify On</Label>
              {([
                ['auditComplete', 'Audit Complete'],
                ['criticalViolations', 'Critical Violations Found'],
                ['scoreDropped', 'Score Dropped'],
                ['fixGenerated', 'Fix Generated'],
              ] as const).map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox
                    id={`notify-${key}`}
                    checked={prefs.notifyOn[key]}
                    onCheckedChange={checked =>
                      updatePrefs({ ...prefs, notifyOn: { ...prefs.notifyOn, [key]: !!checked } })
                    }
                  />
                  <Label htmlFor={`notify-${key}`} className="text-sm cursor-pointer">{label}</Label>
                </div>
              ))}
            </div>

            {/* Min Severity */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Minimum Severity</Label>
              <Select value={prefs.minSeverity} onValueChange={v => updatePrefs({ ...prefs, minSeverity: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="high">HIGH & CRITICAL only</SelectItem>
                  <SelectItem value="critical">CRITICAL only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Test Button */}
            <Button onClick={handleTest} disabled={testing || !prefs.slackWebhookUrl} className="w-full">
              {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send Test Notification
            </Button>

            <Separator />

            {/* Notification Log */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Recent Notifications</Label>
              {log.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notifications sent yet.</p>
              ) : (
                <ScrollArea className="h-40">
                  <div className="space-y-2">
                    {log.map(entry => (
                      <div key={entry.id} className="flex items-start gap-2 text-sm border rounded-md p-2">
                        {entry.status === 'sent' ? (
                          <CheckCircle2 className="w-4 h-4 text-[hsl(var(--success))] mt-0.5 shrink-0" />
                        ) : entry.status === 'failed' ? (
                          <XCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                        ) : (
                          <Clock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="truncate">{entry.message}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="outline" className="text-xs">{entry.type}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(entry.timestamp).toLocaleString()}
                            </span>
                          </div>
                          {entry.error && <p className="text-xs text-destructive mt-1">{entry.error}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
