ALTER TABLE public.enhancement_sessions
  ADD COLUMN IF NOT EXISTS skipped_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unresolved_count integer NOT NULL DEFAULT 0;