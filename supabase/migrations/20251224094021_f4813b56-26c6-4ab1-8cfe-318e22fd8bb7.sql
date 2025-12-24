-- Create a table to cache product claim verification results
CREATE TABLE public.product_claim_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_key TEXT NOT NULL UNIQUE,
  claim_text TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT true,
  exists BOOLEAN NOT NULL DEFAULT true,
  release_status TEXT NOT NULL DEFAULT 'unknown',
  details TEXT,
  sources JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days')
);

-- Create index for fast lookups
CREATE INDEX idx_product_claim_cache_key ON public.product_claim_cache(claim_key);
CREATE INDEX idx_product_claim_cache_expires ON public.product_claim_cache(expires_at);

-- Enable RLS
ALTER TABLE public.product_claim_cache ENABLE ROW LEVEL SECURITY;

-- Allow public read/write for caching (no auth required for this cache table)
CREATE POLICY "Anyone can read cache" ON public.product_claim_cache FOR SELECT USING (true);
CREATE POLICY "Anyone can insert cache" ON public.product_claim_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update cache" ON public.product_claim_cache FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete cache" ON public.product_claim_cache FOR DELETE USING (true);