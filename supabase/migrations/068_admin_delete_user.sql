-- 068: admins delete a staff member for good (login + profile).
-- Their history stays: payments/expenses they recorded, sales, events they
-- managed, tasks, comments and activity keep their rows — every FK to profiles is
-- ON DELETE SET NULL, so "who" shows as "—" and their tasks become unassigned.
-- Permissions and KPI targets cascade away. Deactivation (is_active) still exists
-- for "gone for now".

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Hodimni faqat admin o''chira oladi' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_user = auth.uid() THEN
    RAISE EXCEPTION 'O''zingizni o''chira olmaysiz';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user) THEN
    RAISE EXCEPTION 'Hodim topilmadi';   -- also keeps member (club client) logins out of reach
  END IF;

  DELETE FROM public.profiles WHERE id = p_user;
  DELETE FROM auth.users WHERE id = p_user;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
