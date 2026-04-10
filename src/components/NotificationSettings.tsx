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
import { logEvent } from '@/services/eventLog';

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

/**
 * Fetch notification log from Supabase.
 */
async function getNotificationLog(): Promise<NotificationLogEntry[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data } = await supabase
      .from('notification_log')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    return (data || []).map(row => ({
      id: row.id,
      timestamp: row.created_at,
      type: row.type,
      message: row.message,
      status: row.status as 'sent' | 'failed' | 'pending',
      error: row.error || undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * Add a notification log entry to Supabase.
 */
export async function addNotificationLog(
  entry: Omit<NotificationLogEntry, 'id' | 'timestamp'>,
  idempotencyKey?: string,
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('notification_log').insert({
      user_id: user.id,
      type: entry.type,
      message: entry.message,
      status: entry.status,
      error: entry.error || null,
      idempotency_key: idempotencyKey || null,
    } as any);
  } catch {
    // silent
  }
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
      body: payload,
    });

    if (error) throw error;

    const idempotencyKey = `${payload.type}_${Math.floor(Date.now() / 60000)}`;
    await addNotificationLog({
      type: payload.type,
      message: `${payload.type.replace(/_/g, ' ')} — ${payload.title || 'Unknown'}`,
      status: 'sent',
    }, idempotencyKey);
    logEvent('notification_sent', { type: payload.type, title: payload.title });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await addNotificationLog({
      type: payload.type,
      message: `${payload.type.replace(/_/g, ' ')} — ${payload.title || 'Unknown'}`,
      status: 'failed',
      error: msg,
    });
    logEvent('notification_failed', { type: payload.type, title: payload.title, error: msg });
  }
}

export function NotificationSettings() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [log, setLog] = useState<NotificationLogEntry[]>([]);
  const [testing, setTesting] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setLoading(true);
      Promise.all([
        getNotificationPrefs(),
        getNotificationLog(),
      ]).then(([p, l]) => {
        setPrefs(p);
        setLog(l);
        setLoading(false);
      });
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
      await addNotificationLog({ type: 'test', message: 'Test notification sent', status: 'sent' });
      const updatedLog = await getNotificationLog();
      setLog(updatedLog);
      toast({ title: 'Test Sent', description: 'Check your Slack channel' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed';
      await addNotificationLog({ type: 'test', message: 'Test notification', status: 'failed', error: msg });
      const updatedLog = await getNotificationLog();
      setLog(updatedLog);
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
