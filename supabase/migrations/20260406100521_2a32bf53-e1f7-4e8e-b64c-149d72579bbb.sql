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
    (NEW.id, 'fix', 2, 0, 'free');

  RETURN NEW;
END;
$function$;