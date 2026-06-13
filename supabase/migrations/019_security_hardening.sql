-- ===========================================
-- FIX 1 + 2: Recreate SECURITY DEFINER functions
-- with proper search_path and revoke EXECUTE from anon/authenticated
-- ===========================================

-- handle_new_user: auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
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

-- has_permission: check user permission for a module
CREATE OR REPLACE FUNCTION public.has_permission(p_user_id uuid, p_module text)
RETURNS bool
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  user_role text;
  has_perm bool;
BEGIN
  SELECT role INTO user_role FROM public.profiles WHERE id = p_user_id;
  IF user_role = 'admin' THEN RETURN true; END IF;

  SELECT can_view INTO has_perm
  FROM public.user_permissions
  WHERE user_id = p_user_id AND module = p_module;

  RETURN COALESCE(has_perm, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;

-- is_admin: check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid)
RETURNS bool
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND role = 'admin'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;

-- update_updated_at: trigger helper
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- update_client_cashback_balance: trigger
CREATE OR REPLACE FUNCTION public.update_client_cashback_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.type IN ('earned', 'manual_add') THEN
      UPDATE public.clients
      SET cashback_balance = cashback_balance + NEW.amount,
          updated_at = now()
      WHERE id = NEW.client_id;
    ELSIF NEW.type IN ('used', 'manual_subtract') THEN
      UPDATE public.clients
      SET cashback_balance = cashback_balance - NEW.amount,
          updated_at = now()
      WHERE id = NEW.client_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ===========================================
-- FIX 3: Storage buckets — remove listing access
-- ===========================================

DROP POLICY IF EXISTS "Public read access for client images" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for event covers" ON storage.objects;
