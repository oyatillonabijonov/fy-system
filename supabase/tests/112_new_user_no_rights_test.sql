-- Behavioural tests for migration 112 (a new login gets no rights). THROWAWAY DB only (recipe: CLAUDE.md §5).
\set ON_ERROR_STOP on

-- 1. A signup that asks for admin in its metadata
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('11200000-0000-0000-0000-000000000001', 'hacker@example.com', '{"full_name":"X","role":"admin"}'::jsonb);
-- 2. A member login (admin-create-member)
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('11200000-0000-0000-0000-000000000002', 'member@example.com', '{"full_name":"M","user_type":"member"}'::jsonb);
-- 3. A staff login made the admin-create-user way: metadata role, then step 6 as service role
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('11200000-0000-0000-0000-000000000003', 'staff@fy.uz', '{"full_name":"Sinov","role":"manager"}'::jsonb);

DO $$
DECLARE r public.profiles;
BEGIN
  SELECT * INTO r FROM public.profiles WHERE id = '11200000-0000-0000-0000-000000000001';
  IF r.id IS NULL THEN RAISE EXCEPTION 'signup must still get a profile row'; END IF;
  IF r.role <> 'xodim' THEN RAISE EXCEPTION 'metadata role was trusted: %', r.role; END IF;
  IF r.is_active IS DISTINCT FROM false THEN RAISE EXCEPTION 'new profile must start inactive'; END IF;
  IF public.is_staff(r.id) OR public.is_admin(r.id) OR public.has_permission(r.id, 'mijozlar') THEN
    RAISE EXCEPTION 'a fresh signup has rights';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = '11200000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'member logins must get no staff profile';
  END IF;

  -- admin-create-user step 6 (service role: no JWT, so guard_profile_self_update lets it through)
  UPDATE public.profiles SET role = 'manager', full_name = 'Sinov', must_change_password = true, is_active = true
  WHERE id = '11200000-0000-0000-0000-000000000003';
  SELECT * INTO r FROM public.profiles WHERE id = '11200000-0000-0000-0000-000000000003';
  IF r.role <> 'manager' OR NOT r.is_active OR NOT public.is_staff(r.id) THEN
    RAISE EXCEPTION 'admin-created staff must end active with its role (role %, active %)', r.role, r.is_active;
  END IF;

  RAISE NOTICE '112 ok';
END $$;
