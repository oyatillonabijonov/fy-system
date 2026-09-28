-- Behavioural tests for migration 056 (self-update guard, is_active in
-- is_admin/has_permission, must_change_password). Throwaway DB only.
\set ON_ERROR_STOP on

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('56000000-0000-0000-0000-000000000001', 'admin56@fy.uz', '{"full_name":"Admin56","role":"admin"}'::jsonb),
  ('56000000-0000-0000-0000-000000000002', 'staff56@fy.uz', '{"full_name":"Staff56","role":"xodim"}'::jsonb);
UPDATE public.profiles SET role = 'admin' WHERE id = '56000000-0000-0000-0000-000000000001';
UPDATE public.profiles SET must_change_password = true WHERE id = '56000000-0000-0000-0000-000000000002';
INSERT INTO public.user_permissions (user_id, module, can_view, can_edit, can_delete)
VALUES ('56000000-0000-0000-0000-000000000002', 'mijozlar', true, false, false);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '56000000-0000-0000-0000-000000000002', false);

-- TEST 1: staff cannot promote themselves
DO $$
BEGIN
  BEGIN
    UPDATE public.profiles SET role = 'admin' WHERE id = '56000000-0000-0000-0000-000000000002';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'TEST 1 ok: self-promotion blocked';
    RETURN;
  END;
  RAISE EXCEPTION 'TEST 1 FAILED: staff made themselves admin';
END $$;

-- TEST 2: staff can edit their own name/phone and clear the password flag, not set it
DO $$
BEGIN
  UPDATE public.profiles SET full_name = 'Staff 56', phone = '+998900000056', must_change_password = false
  WHERE id = '56000000-0000-0000-0000-000000000002';
  IF (SELECT full_name FROM public.profiles WHERE id = '56000000-0000-0000-0000-000000000002') <> 'Staff 56' THEN
    RAISE EXCEPTION 'TEST 2 FAILED: own name not updated'; END IF;
  BEGIN
    UPDATE public.profiles SET must_change_password = true WHERE id = '56000000-0000-0000-0000-000000000002';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'TEST 2 ok: self-service fields allowed, flag can only be cleared';
    RETURN;
  END;
  RAISE EXCEPTION 'TEST 2 FAILED: staff re-armed must_change_password';
END $$;

-- TEST 3: admin can still change another user's role
SELECT set_config('request.jwt.claim.sub', '56000000-0000-0000-0000-000000000001', false);
DO $$
BEGIN
  UPDATE public.profiles SET role = 'manager' WHERE id = '56000000-0000-0000-0000-000000000002';
  IF (SELECT role FROM public.profiles WHERE id = '56000000-0000-0000-0000-000000000002') <> 'manager' THEN
    RAISE EXCEPTION 'TEST 3 FAILED: admin could not change role'; END IF;
  RAISE NOTICE 'TEST 3 ok: admin changes roles';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);  -- back to a plain SQL session (no JWT)

-- TEST 4: deactivation removes module access and admin rights
UPDATE public.profiles SET is_active = false
WHERE id IN ('56000000-0000-0000-0000-000000000001', '56000000-0000-0000-0000-000000000002');
DO $$
BEGIN
  IF public.has_permission('56000000-0000-0000-0000-000000000002', 'mijozlar') THEN
    RAISE EXCEPTION 'TEST 4 FAILED: deactivated staff keeps module access'; END IF;
  IF public.is_admin('56000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'TEST 4 FAILED: deactivated admin is still admin'; END IF;
  RAISE NOTICE 'TEST 4 ok: deactivation cuts access';
END $$;

SELECT '056 staff access hardening: all tests passed' AS result;
