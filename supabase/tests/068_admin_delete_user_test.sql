-- Behavioural tests for migration 068 (admin deletes a staff member). THROWAWAY DB only (recipe: CLAUDE.md §5).
\set ON_ERROR_STOP on

-- A = admin, S = staff with history (seller, recorded a payment, owns/created a task, commented), M = another staff
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('68000000-0000-0000-0000-000000000001', 'admin68@fy.uz', '{"full_name":"Admin68","role":"admin"}'::jsonb),
  ('68000000-0000-0000-0000-000000000002', 's68@fy.uz',     '{"full_name":"Ketadigan68","role":"xodim"}'::jsonb),
  ('68000000-0000-0000-0000-000000000003', 'm68@fy.uz',     '{"full_name":"Qoladigan68","role":"xodim"}'::jsonb);
UPDATE public.profiles SET role = 'admin' WHERE id = '68000000-0000-0000-0000-000000000001';
INSERT INTO public.events (id, name) VALUES ('e6800000-0000-0000-0000-000000000001', 'Safar 68');
INSERT INTO public.event_participants (id, event_id, full_name, price, seller_id)
  VALUES ('a6800000-0000-0000-0000-000000000001', 'e6800000-0000-0000-0000-000000000001', 'Mijoz68', 1000000, '68000000-0000-0000-0000-000000000002');
INSERT INTO public.payments (id, participant_id, amount, method, recorded_by)
  VALUES ('b6800000-0000-0000-0000-000000000001', 'a6800000-0000-0000-0000-000000000001', 400000, 'naqd', '68000000-0000-0000-0000-000000000002');
INSERT INTO public.tasks (id, title, assignee_id, created_by)
  VALUES ('c6800000-0000-0000-0000-000000000001', 'Resort68', '68000000-0000-0000-0000-000000000002', '68000000-0000-0000-0000-000000000002');
INSERT INTO public.task_comments (task_id, author_id, body)
  VALUES ('c6800000-0000-0000-0000-000000000001', '68000000-0000-0000-0000-000000000002', 'izoh68');
GRANT USAGE ON SCHEMA public TO authenticated;
SET ROLE authenticated;

-- TEST 1: a non-admin can't delete anyone
SELECT set_config('request.jwt.claim.sub', '68000000-0000-0000-0000-000000000003', false);
DO $$ BEGIN
  BEGIN
    PERFORM public.admin_delete_user('68000000-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'TEST 1 FAILED: staff deleted a colleague';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'TEST 1 ok: only admins delete';
END $$;

-- TEST 2: an admin can't delete themselves, nor a login that isn't staff
SELECT set_config('request.jwt.claim.sub', '68000000-0000-0000-0000-000000000001', false);
DO $$ BEGIN
  BEGIN
    PERFORM public.admin_delete_user('68000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'TEST 2 FAILED: admin deleted self';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%zingizni%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.admin_delete_user(gen_random_uuid());
    RAISE EXCEPTION 'TEST 2 FAILED: unknown id accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%topilmadi%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'TEST 2 ok: no self-delete, staff only';
END $$;

-- TEST 3: the admin deletes S — login and profile gone, history kept with "who" emptied, money unchanged
SELECT public.admin_delete_user('68000000-0000-0000-0000-000000000002');
RESET ROLE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = '68000000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'TEST 3 FAILED: login kept'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = '68000000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'TEST 3 FAILED: profile kept'; END IF;
  IF (SELECT recorded_by FROM public.payments WHERE id = 'b6800000-0000-0000-0000-000000000001') IS NOT NULL
     OR (SELECT amount FROM public.payments WHERE id = 'b6800000-0000-0000-0000-000000000001') <> 400000 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: payment lost or still points at the user'; END IF;
  IF (SELECT seller_id FROM public.event_participants WHERE id = 'a6800000-0000-0000-0000-000000000001') IS NOT NULL
     OR (SELECT paid FROM public.event_participants WHERE id = 'a6800000-0000-0000-0000-000000000001') <> 400000 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: participant seller/paid wrong'; END IF;
  IF (SELECT assignee_id IS NULL AND created_by IS NULL FROM public.tasks WHERE id = 'c6800000-0000-0000-0000-000000000001') IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST 3 FAILED: task lost or still assigned'; END IF;
  IF (SELECT count(*) FROM public.task_comments WHERE body = 'izoh68' AND author_id IS NULL) <> 1 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: comment lost'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = '68000000-0000-0000-0000-000000000003') THEN
    RAISE EXCEPTION 'TEST 3 FAILED: another staff member removed'; END IF;
  RAISE NOTICE 'TEST 3 ok: user gone, payments/sales/tasks/comments kept without the name';
END $$;
