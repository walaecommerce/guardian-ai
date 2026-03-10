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

const STORAGE_KEY = 'guardian-notification-prefs';
const LOG_KEY = 'guardian-notification-log';

export function getNotificationPrefs(): NotificationPrefs {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return {
    slackWebhookUrl: '',
    emailAddress: '',
    notifyOn: { auditComplete: true, criticalViolations: true, scoreDropped: true, fixGenerated: false },
    minSeverity: 'any',
  };
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
  const prefs = getNotificationPrefs();
  if (!prefs.slackWebhookUrl) return;

  // Check if this notification type is enabled
  const typeMap: Record<string, keyof NotificationPrefs['notifyOn']> = {
    audit_complete: 'auditComplete',
    critical_violation: 'criticalViolations',
    score_dropped: 'scoreDropped',
    fix_generated: 'fixGenerated',
  };
  if (!prefs.notifyOn[typeMap[payload.type]]) return;

  try {
    const { data, error } = await supabase.functions.invoke('send-slack-notification', {
      body: { webhookUrl: prefs.slackWebhookUrl, ...payload },
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
  const [prefs, setPrefs] = useState<NotificationPrefs>(getNotificationPrefs);
  const [log, setLog] = useState<NotificationLogEntry[]>(getNotificationLog);
  const [testing, setTesting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setPrefs(getNotificationPrefs());
      setLog(getNotificationLog());
    }
  }, [open]);

  const savePrefs = (updated: NotificationPrefs) => {
    setPrefs(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const handleTest = async () => {
    if (!prefs.slackWebhookUrl) {
      toast({ title: 'No Webhook URL', description: 'Enter a Slack webhook URL first', variant: 'destructive' });
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

        <div className="space-y-5">
          {/* Slack Webhook */}
          <div className="space-y-2">
            <Label htmlFor="slack-webhook" className="text-sm font-medium">Slack Webhook URL</Label>
            <Input
              id="slack-webhook"
              placeholder="https://hooks.slack.com/services/..."
              value={prefs.slackWebhookUrl}
              onChange={e => savePrefs({ ...prefs, slackWebhookUrl: e.target.value })}
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
              onChange={e => savePrefs({ ...prefs, emailAddress: e.target.value })}
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
                    savePrefs({ ...prefs, notifyOn: { ...prefs.notifyOn, [key]: !!checked } })
                  }
                />
                <Label htmlFor={`notify-${key}`} className="text-sm cursor-pointer">{label}</Label>
              </div>
            ))}
          </div>

          {/* Min Severity */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Minimum Severity</Label>
            <Select value={prefs.minSeverity} onValueChange={v => savePrefs({ ...prefs, minSeverity: v as any })}>
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
      </DialogContent>
    </Dialog>
  );
}
