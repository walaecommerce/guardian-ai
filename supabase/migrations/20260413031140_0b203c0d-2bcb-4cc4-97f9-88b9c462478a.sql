-- Affiliates table
CREATE TABLE public.affiliates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tag text NOT NULL UNIQUE,
  name text NOT NULL,
  email text,
  commission_rate numeric DEFAULT 0,
  commission_fixed numeric DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage affiliates"
  ON public.affiliates FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_affiliates_updated_at
  BEFORE UPDATE ON public.affiliates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Snapshot affiliate attribution on redemptions
ALTER TABLE public.promo_redemptions
  ADD COLUMN affiliate_tag text,
  ADD COLUMN credits_granted integer NOT NULL DEFAULT 0;
