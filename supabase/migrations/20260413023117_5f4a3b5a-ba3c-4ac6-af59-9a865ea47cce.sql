
-- 1. Create credit_ledger table
CREATE TABLE public.credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  credit_type public.credit_type NOT NULL,
  amount integer NOT NULL,
  balance_after integer NOT NULL,
  event_type text NOT NULL,
  idempotency_key text UNIQUE,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_credit_ledger_user_type ON public.credit_ledger (user_id, credit_type, created_at DESC);
CREATE INDEX idx_credit_ledger_idempotency ON public.credit_ledger (idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ledger" ON public.credit_ledger
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins view all ledger" ON public.credit_ledger
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can insert own ledger" ON public.credit_ledger
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can insert any ledger" ON public.credit_ledger
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Create promo_codes table
CREATE TABLE public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  credit_type public.credit_type NOT NULL,
  credit_amount integer NOT NULL CHECK (credit_amount > 0),
  max_redemptions integer,
  current_redemptions integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  affiliate_tag text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage promo codes" ON public.promo_codes
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated read active promos" ON public.promo_codes
  FOR SELECT TO authenticated USING (active = true);

-- 3. Create promo_redemptions table
CREATE TABLE public.promo_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  promo_code_id uuid NOT NULL REFERENCES public.promo_codes(id),
  ledger_entry_id uuid REFERENCES public.credit_ledger(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, promo_code_id)
);

ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own redemptions" ON public.promo_redemptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can redeem" ON public.promo_redemptions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all redemptions" ON public.promo_redemptions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. get_credit_balance function
CREATE OR REPLACE FUNCTION public.get_credit_balance(p_user_id uuid, p_credit_type public.credit_type)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT balance_after FROM credit_ledger
     WHERE user_id = p_user_id AND credit_type = p_credit_type
     ORDER BY created_at DESC, id DESC LIMIT 1),
    0
  );
$$;

-- 5. debit_credit function (atomic, idempotent)
CREATE OR REPLACE FUNCTION public.debit_credit(
  p_user_id uuid,
  p_credit_type public.credit_type,
  p_idempotency_key text,
  p_description text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
  v_new_balance integer;
  v_existing_balance integer;
BEGIN
  SELECT balance_after INTO v_existing_balance
  FROM credit_ledger WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN get_credit_balance(p_user_id, p_credit_type);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || p_credit_type::text));

  v_balance := get_credit_balance(p_user_id, p_credit_type);

  IF v_balance <= 0 THEN
    RETURN -1;
  END IF;

  v_new_balance := v_balance - 1;

  INSERT INTO credit_ledger (user_id, credit_type, amount, balance_after, event_type, idempotency_key, description)
  VALUES (p_user_id, p_credit_type, -1, v_new_balance, 'debit', p_idempotency_key, p_description);

  RETURN v_new_balance;
END;
$$;

-- 6. grant_credit function
CREATE OR REPLACE FUNCTION public.grant_credit(
  p_user_id uuid,
  p_credit_type public.credit_type,
  p_amount integer,
  p_event_type text DEFAULT 'grant',
  p_description text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
  v_new_balance integer;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT balance_after INTO v_new_balance
    FROM credit_ledger WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN v_new_balance;
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || p_credit_type::text));

  v_balance := get_credit_balance(p_user_id, p_credit_type);
  v_new_balance := v_balance + p_amount;

  INSERT INTO credit_ledger (user_id, credit_type, amount, balance_after, event_type, idempotency_key, description)
  VALUES (p_user_id, p_credit_type, p_amount, v_new_balance, p_event_type, p_idempotency_key, p_description);

  RETURN v_new_balance;
END;
$$;

-- 7. Update handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', '')
  );

  INSERT INTO public.user_credits (user_id, credit_type, total_credits, used_credits, plan)
  VALUES
    (NEW.id, 'scrape', 5, 0, 'free'),
    (NEW.id, 'analyze', 10, 0, 'free'),
    (NEW.id, 'fix', 2, 0, 'free'),
    (NEW.id, 'enhance', 2, 0, 'free');

  INSERT INTO public.credit_ledger (user_id, credit_type, amount, balance_after, event_type, description)
  VALUES
    (NEW.id, 'scrape', 5, 5, 'grant', 'Free plan initial credits'),
    (NEW.id, 'analyze', 10, 10, 'grant', 'Free plan initial credits'),
    (NEW.id, 'fix', 2, 2, 'grant', 'Free plan initial credits'),
    (NEW.id, 'enhance', 2, 2, 'grant', 'Free plan initial credits');

  RETURN NEW;
END;
$function$;

-- 8. Seed existing users with enhance credits
INSERT INTO user_credits (user_id, credit_type, total_credits, used_credits, plan)
SELECT user_id, 'enhance'::credit_type, 2, 0, plan
FROM user_credits
WHERE credit_type = 'scrape'
ON CONFLICT DO NOTHING;

-- 9. Seed ledger from existing balances
INSERT INTO credit_ledger (user_id, credit_type, amount, balance_after, event_type, description)
SELECT
  user_id,
  credit_type,
  GREATEST(total_credits - used_credits, 0),
  GREATEST(total_credits - used_credits, 0),
  'grant',
  'Migration from legacy credit system'
FROM user_credits
WHERE total_credits - used_credits > 0;
