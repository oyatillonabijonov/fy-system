-- 056: staff access hardening + first-login password change.
--
-- 1. "Users can update own profile" (UPDATE USING id = auth.uid()) had no column
--    limit, so any staff member could PATCH their own row to role = 'admin'.
--    A BEFORE UPDATE trigger now lets non-admins change only full_name, phone,
--    avatar_url, updated_at on their own row — and clear must_change_password.
-- 2. Deactivation didn't cut data access: is_admin() and has_permission()
--    ignored is_active (is_staff() already checked it). Both now require it.
-- 3. profiles.must_change_password: set by admin-create-user for accounts made
--    with a temporary password; the web shows a red banner until the user
--    changes it, then clears it (true → false is the only change a user may make).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- ─── 1. Column guard for self-updates ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- columns a non-admin may change on their own row
  v_free text[] := ARRAY['full_name', 'phone', 'avatar_url', 'updated_at', 'must_change_password'];
BEGIN
  -- service role / direct SQL (no JWT) and admins are not limited
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - v_free) IS DISTINCT FROM (to_jsonb(OLD) - v_free) THEN
    RAISE EXCEPTION 'Bu maydonlarni faqat administrator o''zgartira oladi'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.must_change_password AND NOT OLD.must_change_password THEN
    RAISE EXCEPTION 'Bu maydonlarni faqat administrator o''zgartira oladi'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_self_update ON public.profiles;
CREATE TRIGGER guard_profile_self_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_self_update();

-- ─── 2. Deactivated accounts lose admin rights and module access ────────────
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND role = 'admin' AND COALESCE(is_active, true)
  );
$$;

CREATE OR REPLACE FUNCTION public.has_permission(p_user_id uuid, p_module text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  user_role text;
  active bool;
  has_perm bool;
BEGIN
  SELECT role, COALESCE(is_active, true) INTO user_role, active
  FROM public.profiles WHERE id = p_user_id;
  IF NOT COALESCE(active, false) THEN RETURN false; END IF;
  IF user_role = 'admin' THEN RETURN true; END IF;

  SELECT can_view INTO has_perm
  FROM public.user_permissions
  WHERE user_id = p_user_id AND module = p_module;

  RETURN COALESCE(has_perm, false);
END;
$$;
