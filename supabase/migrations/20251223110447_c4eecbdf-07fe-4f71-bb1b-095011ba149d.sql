-- Create compliance_reports table for historical tracking
CREATE TABLE public.compliance_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  amazon_url TEXT,
  product_asin TEXT,
  listing_title TEXT,
  total_images INTEGER NOT NULL DEFAULT 0,
  passed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  average_score NUMERIC(5,2),
  report_data JSONB NOT NULL DEFAULT '{}',
  fixed_images_count INTEGER NOT NULL DEFAULT 0
);

-- Enable Row Level Security (public access for now since no auth)
ALTER TABLE public.compliance_reports ENABLE ROW LEVEL SECURITY;

-- Allow public read/insert for this demo app
CREATE POLICY "Anyone can view reports" 
ON public.compliance_reports 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can create reports" 
ON public.compliance_reports 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update reports" 
ON public.compliance_reports 
FOR UPDATE 
USING (true);

-- Create index for faster queries
CREATE INDEX idx_compliance_reports_created_at ON public.compliance_reports(created_at DESC);
CREATE INDEX idx_compliance_reports_asin ON public.compliance_reports(product_asin);