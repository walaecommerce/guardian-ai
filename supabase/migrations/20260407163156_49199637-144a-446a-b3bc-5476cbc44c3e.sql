
-- Step 1: Add user_id columns
ALTER TABLE public.enhancement_sessions ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.compliance_reports ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 2: Drop all open RLS policies on enhancement_sessions
DROP POLICY "Anyone can view sessions" ON public.enhancement_sessions;
DROP POLICY "Anyone can create sessions" ON public.enhancement_sessions;
DROP POLICY "Anyone can update sessions" ON public.enhancement_sessions;
DROP POLICY "Anyone can delete sessions" ON public.enhancement_sessions;

-- Create user-scoped policies for enhancement_sessions
CREATE POLICY "Users view own sessions" ON public.enhancement_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create own sessions" ON public.enhancement_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own sessions" ON public.enhancement_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own sessions" ON public.enhancement_sessions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Step 3: Drop all open RLS policies on compliance_reports
DROP POLICY "Anyone can view reports" ON public.compliance_reports;
DROP POLICY "Anyone can create reports" ON public.compliance_reports;
DROP POLICY "Anyone can update reports" ON public.compliance_reports;
DROP POLICY "Anyone can delete reports" ON public.compliance_reports;

-- Create user-scoped policies for compliance_reports
CREATE POLICY "Users view own reports" ON public.compliance_reports FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create own reports" ON public.compliance_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own reports" ON public.compliance_reports FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own reports" ON public.compliance_reports FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Step 4: Drop all open RLS policies on session_images
DROP POLICY "Anyone can view session images" ON public.session_images;
DROP POLICY "Anyone can create session images" ON public.session_images;
DROP POLICY "Anyone can update session images" ON public.session_images;
DROP POLICY "Anyone can delete session images" ON public.session_images;

-- session_images gets access via the session's user_id
CREATE POLICY "Users view own session images" ON public.session_images FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.enhancement_sessions es WHERE es.id = session_id AND es.user_id = auth.uid()));
CREATE POLICY "Users create own session images" ON public.session_images FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.enhancement_sessions es WHERE es.id = session_id AND es.user_id = auth.uid()));
CREATE POLICY "Users update own session images" ON public.session_images FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.enhancement_sessions es WHERE es.id = session_id AND es.user_id = auth.uid()));
CREATE POLICY "Users delete own session images" ON public.session_images FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.enhancement_sessions es WHERE es.id = session_id AND es.user_id = auth.uid()));

-- Step 5: Tighten product_claim_cache - restrict DELETE to authenticated only
DROP POLICY "Anyone can delete cache" ON public.product_claim_cache;
DROP POLICY "Anyone can insert cache" ON public.product_claim_cache;
DROP POLICY "Anyone can read cache" ON public.product_claim_cache;
DROP POLICY "Anyone can update cache" ON public.product_claim_cache;

CREATE POLICY "Authenticated can read cache" ON public.product_claim_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert cache" ON public.product_claim_cache FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update cache" ON public.product_claim_cache FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete cache" ON public.product_claim_cache FOR DELETE TO authenticated USING (true);

-- Step 6: Storage bucket policies for session-images
CREATE POLICY "Authenticated users can upload images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'session-images');
CREATE POLICY "Authenticated users can read images" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'session-images');
CREATE POLICY "Authenticated users can update own images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'session-images');
CREATE POLICY "Authenticated users can delete own images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'session-images');
