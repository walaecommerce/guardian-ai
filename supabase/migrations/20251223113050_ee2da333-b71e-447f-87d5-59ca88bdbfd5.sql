-- Create storage bucket for session images
INSERT INTO storage.buckets (id, name, public)
VALUES ('session-images', 'session-images', true);

-- Allow public read access to session images
CREATE POLICY "Public read access for session images"
ON storage.objects FOR SELECT
USING (bucket_id = 'session-images');

-- Allow anyone to upload session images
CREATE POLICY "Anyone can upload session images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'session-images');

-- Allow anyone to update session images
CREATE POLICY "Anyone can update session images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'session-images');

-- Allow anyone to delete session images
CREATE POLICY "Anyone can delete session images"
ON storage.objects FOR DELETE
USING (bucket_id = 'session-images');

-- Create enhancement_sessions table (parent record for each import session)
CREATE TABLE public.enhancement_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  amazon_url TEXT,
  product_asin TEXT,
  listing_title TEXT,
  total_images INTEGER NOT NULL DEFAULT 0,
  passed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  fixed_count INTEGER NOT NULL DEFAULT 0,
  average_score NUMERIC,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'archived')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create session_images table (individual image records)
CREATE TABLE public.session_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.enhancement_sessions(id) ON DELETE CASCADE,
  image_name TEXT NOT NULL,
  image_type TEXT NOT NULL CHECK (image_type IN ('MAIN', 'SECONDARY')),
  image_category TEXT,
  original_image_url TEXT NOT NULL,
  fixed_image_url TEXT,
  analysis_result JSONB,
  fix_attempts JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'analyzed', 'passed', 'failed', 'fixed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.enhancement_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_images ENABLE ROW LEVEL SECURITY;

-- RLS policies for enhancement_sessions (public access for now)
CREATE POLICY "Anyone can view sessions" ON public.enhancement_sessions FOR SELECT USING (true);
CREATE POLICY "Anyone can create sessions" ON public.enhancement_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update sessions" ON public.enhancement_sessions FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete sessions" ON public.enhancement_sessions FOR DELETE USING (true);

-- RLS policies for session_images
CREATE POLICY "Anyone can view session images" ON public.session_images FOR SELECT USING (true);
CREATE POLICY "Anyone can create session images" ON public.session_images FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update session images" ON public.session_images FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete session images" ON public.session_images FOR DELETE USING (true);

-- Create indexes for better query performance
CREATE INDEX idx_session_images_session_id ON public.session_images(session_id);
CREATE INDEX idx_enhancement_sessions_created_at ON public.enhancement_sessions(created_at DESC);
CREATE INDEX idx_enhancement_sessions_asin ON public.enhancement_sessions(product_asin);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_enhancement_sessions_updated_at
BEFORE UPDATE ON public.enhancement_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_session_images_updated_at
BEFORE UPDATE ON public.session_images
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();