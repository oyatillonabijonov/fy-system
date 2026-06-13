-- ============================================
-- MEMBER AUTH: link clients ↔ auth.users
-- ============================================

-- 1. Link column: a club member's login account
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. handle_new_user: skip profile creation for member accounts.
--    Members are clients, not staff — a profiles row would let them into
--    the staff dashboard and pollute employee lists.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.raw_user_meta_data->>'user_type' = 'member' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'xodim')
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin, service_role;

-- 3. is_staff: does the caller have an active staff profile?
--    (Members have NO profiles row, so this cleanly separates the two.)
CREATE OR REPLACE FUNCTION public.is_staff(p_user_id uuid)
RETURNS bool
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND COALESCE(is_active, true)
  );
$$;

-- anon keeps EXECUTE so RLS policies evaluate to false (empty result)
-- instead of erroring; with no JWT, auth.uid() is NULL → always false.
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO anon, authenticated, service_role;

-- 4. my_client_id: resolve the caller's client row (member identity)
CREATE OR REPLACE FUNCTION public.my_client_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id FROM public.clients WHERE auth_user_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.my_client_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_client_id() TO anon, authenticated, service_role;
