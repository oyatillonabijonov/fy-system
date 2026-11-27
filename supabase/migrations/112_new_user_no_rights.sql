-- 112: a login created outside admin-create-user gets no rights.
-- Until now handle_new_user took the profile's role from raw_user_meta_data — the `data` a client sends
-- with /auth/v1/signup — so anyone could sign up as an admin while signup was open (closed in GoTrue on
-- 2026-11-27: GOTRUE_DISABLE_SIGNUP). Now every new staff profile starts as an inactive 'xodim':
-- is_staff / is_admin / has_permission are false for it, and the web signs it out. admin-create-user
-- (service role) then writes the real role and is_active = true in its step 6.
-- Member logins (user_type = 'member', created by admin-create-member) still get no profile at all.
BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.raw_user_meta_data->>'user_type' = 'member' THEN
    RETURN NEW;
  END IF;

  -- The metadata's role is ignored on purpose: the client writes it
  INSERT INTO public.profiles (id, email, full_name, role, is_active)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), 'xodim', false);
  RETURN NEW;
END;
$$;

COMMIT;
