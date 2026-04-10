-- 1. Make session-images bucket private
UPDATE storage.buckets SET public = false WHERE id = 'session-images';

-- 2. Drop any existing public SELECT policy on session-images objects
DROP POLICY IF EXISTS "Public read session images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view session images" ON storage.objects;

-- 3. Add authenticated storage policies for session-images
-- Users can read their own session images (via join to enhancement_sessions)
CREATE POLICY "Authenticated users read own session images"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'session-images'
  AND EXISTS (
    SELECT 1 FROM public.enhancement_sessions es
    WHERE es.user_id = auth.uid()
      AND (storage.foldername(name))[1] = es.id::text
  )
);

-- Users can upload to their own session folders
CREATE POLICY "Authenticated users upload own session images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'session-images'
  AND EXISTS (
    SELECT 1 FROM public.enhancement_sessions es
    WHERE es.user_id = auth.uid()
      AND (storage.foldername(name))[1] = es.id::text
  )
);

-- Users can update their own session images
CREATE POLICY "Authenticated users update own session images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'session-images'
  AND EXISTS (
    SELECT 1 FROM public.enhancement_sessions es
    WHERE es.user_id = auth.uid()
      AND (storage.foldername(name))[1] = es.id::text
  )
);

-- Users can delete their own session images
CREATE POLICY "Authenticated users delete own session images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'session-images'
  AND EXISTS (
    SELECT 1 FROM public.enhancement_sessions es
    WHERE es.user_id = auth.uid()
      AND (storage.foldername(name))[1] = es.id::text
  )
);

-- 4. Create notification_preferences table
CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  slack_webhook_url text,
  email_address text,
  notify_on jsonb NOT NULL DEFAULT '{"auditComplete":true,"criticalViolations":true,"scoreDropped":true,"fixGenerated":false}'::jsonb,
  min_severity text NOT NULL DEFAULT 'any',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notification preferences"
ON public.notification_preferences FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own notification preferences"
ON public.notification_preferences FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notification preferences"
ON public.notification_preferences FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own notification preferences"
ON public.notification_preferences FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE TRIGGER update_notification_preferences_updated_at
BEFORE UPDATE ON public.notification_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();