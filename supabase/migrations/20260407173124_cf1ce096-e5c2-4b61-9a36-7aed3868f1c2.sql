CREATE TABLE public.credit_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  credit_type text NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT now(),
  edge_function text
);

ALTER TABLE public.credit_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own usage" ON public.credit_usage_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Service can insert usage" ON public.credit_usage_log
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_usage_log_user_date ON public.credit_usage_log (user_id, consumed_at DESC);