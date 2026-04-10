/**
 * Lightweight operational event logger.
 * Inserts into app_events table. Fire-and-forget — never throws.
 */
import { supabase } from '@/integrations/supabase/client';

export type AppEventType =
  | 'audit_started'
  | 'audit_completed'
  | 'audit_failed'
  | 'fix_generated'
  | 'fix_applied'
  | 'studio_generation_started'
  | 'studio_generation_completed'
  | 'studio_generation_failed'
  | 'notification_sent'
  | 'notification_failed';

export async function logEvent(
  eventType: AppEventType,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await (supabase.from('app_events') as any).insert({
      user_id: user.id,
      event_type: eventType,
      metadata,
    });
  } catch {
    // Silent — event logging must never break user flows
  }
}
