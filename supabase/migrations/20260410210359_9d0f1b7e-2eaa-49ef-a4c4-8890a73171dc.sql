
-- 1. App events table for operational logging
CREATE TABLE public.app_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own events" ON public.app_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users create own events" ON public.app_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all events" ON public.app_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_app_events_user_type ON public.app_events (user_id, event_type);
CREATE INDEX idx_app_events_created ON public.app_events (created_at);

-- 2. Idempotency key for notification_log
ALTER TABLE public.notification_log ADD COLUMN idempotency_key text;
CREATE UNIQUE INDEX idx_notification_log_idempotency ON public.notification_log (idempotency_key) WHERE idempotency_key IS NOT NULL;
