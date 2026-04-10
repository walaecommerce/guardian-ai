ALTER TABLE public.campaign_audits
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed';

-- Update existing rows to ensure they're marked completed
UPDATE public.campaign_audits SET status = 'completed' WHERE status IS NULL OR status = '';