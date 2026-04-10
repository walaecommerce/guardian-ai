
-- tracked_products
CREATE TABLE public.tracked_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  asin text NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  added_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, asin)
);
ALTER TABLE public.tracked_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own tracked products" ON public.tracked_products FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create own tracked products" ON public.tracked_products FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own tracked products" ON public.tracked_products FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own tracked products" ON public.tracked_products FOR DELETE USING (auth.uid() = user_id);

-- tracker_audits
CREATE TABLE public.tracker_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracked_product_id uuid NOT NULL REFERENCES public.tracked_products(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  scores jsonb NOT NULL DEFAULT '{}',
  violations_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PASS',
  fix_applied boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tracker_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own tracker audits" ON public.tracker_audits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create own tracker audits" ON public.tracker_audits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own tracker audits" ON public.tracker_audits FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own tracker audits" ON public.tracker_audits FOR DELETE USING (auth.uid() = user_id);

-- campaign_audits
CREATE TABLE public.campaign_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  client text NOT NULL DEFAULT '',
  score integer NOT NULL DEFAULT 0,
  products_count integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.campaign_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own campaign audits" ON public.campaign_audits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create own campaign audits" ON public.campaign_audits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own campaign audits" ON public.campaign_audits FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own campaign audits" ON public.campaign_audits FOR DELETE USING (auth.uid() = user_id);

-- studio_generations
CREATE TABLE public.studio_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  template text NOT NULL,
  product_name text NOT NULL,
  prompt text,
  score integer,
  status text NOT NULL DEFAULT 'generated',
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.studio_generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own studio generations" ON public.studio_generations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create own studio generations" ON public.studio_generations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own studio generations" ON public.studio_generations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own studio generations" ON public.studio_generations FOR DELETE USING (auth.uid() = user_id);

-- notification_log
CREATE TABLE public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own notification log" ON public.notification_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create own notification log" ON public.notification_log FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own notification log" ON public.notification_log FOR DELETE USING (auth.uid() = user_id);
