-- Behavioural tests for migration 070 (Telegram groups, expenses in the outbox). THROWAWAY DB only (recipe: CLAUDE.md §5).
\set ON_ERROR_STOP on

-- A = admin, I = staff with the 'integratsiyalar' module, S = staff without it
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('70000000-0000-0000-0000-000000000001', 'admin70@fy.uz', '{"full_name":"Admin70","role":"admin"}'::jsonb),
  ('70000000-0000-0000-0000-000000000002', 'i70@fy.uz',     '{"full_name":"Integ70","role":"xodim"}'::jsonb),
  ('70000000-0000-0000-0000-000000000003', 's70@fy.uz',     '{"full_name":"Oddiy70","role":"xodim"}'::jsonb);
UPDATE public.profiles SET role = 'admin' WHERE id = '70000000-0000-0000-0000-000000000001';
INSERT INTO public.user_permissions (user_id, module, can_view) VALUES ('70000000-0000-0000-0000-000000000002', 'integratsiyalar', true);
INSERT INTO public.telegram_groups (chat_id, title, payments) VALUES (-1001, 'Moliya', true);
GRANT USAGE ON SCHEMA public TO authenticated;
SET ROLE authenticated;

-- TEST 1: staff without the module neither sees nor changes groups
SELECT set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000003', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.telegram_groups) <> 0 THEN RAISE EXCEPTION 'TEST 1 FAILED: plain staff sees groups'; END IF;
  UPDATE public.telegram_groups SET task_bot = true;
  BEGIN
    INSERT INTO public.telegram_groups (chat_id, title) VALUES (-1002, 'Begona');
    RAISE EXCEPTION 'TEST 1 FAILED: plain staff added a group';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'TEST 1 ok: no module, no access';
END $$;

-- TEST 2: the module (and admins) manage groups; only group chat ids
SELECT set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', false);
DO $$ BEGIN
  IF (SELECT task_bot FROM public.telegram_groups WHERE chat_id = -1001) THEN RAISE EXCEPTION 'TEST 2 FAILED: plain staff update went through'; END IF;
  UPDATE public.telegram_groups SET expenses = true, note = 'Moliya jamoasi' WHERE chat_id = -1001;
  INSERT INTO public.telegram_groups (chat_id, title, task_digest) VALUES (-1003, 'Umumiy', true);
  BEGIN
    INSERT INTO public.telegram_groups (chat_id, title) VALUES (12345, 'Shaxsiy chat');
    RAISE EXCEPTION 'TEST 2 FAILED: a private chat id accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.telegram_groups) <> 2 THEN RAISE EXCEPTION 'TEST 2 FAILED: admin sees % groups', (SELECT count(*) FROM public.telegram_groups); END IF;
  DELETE FROM public.telegram_groups WHERE chat_id = -1003;
  RAISE NOTICE 'TEST 2 ok: module holders and admins manage groups';
END $$;
RESET ROLE;

-- TEST 3: a new expense and its void are queued for Telegram; payments still queue as before
INSERT INTO public.events (id, name) VALUES ('e7000000-0000-0000-0000-000000000001', 'Safar 70');
INSERT INTO public.expenses (id, event_id, category, amount, spent_at, recorded_by)
  VALUES ('f7000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000001', 'zal', 2000000, current_date, '70000000-0000-0000-0000-000000000001');
UPDATE public.expenses SET voided_at = now(), voided_by = '70000000-0000-0000-0000-000000000001', void_reason = 'xato'
  WHERE id = 'f7000000-0000-0000-0000-000000000001';
INSERT INTO public.event_participants (id, event_id, full_name, price)
  VALUES ('a7000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000001', 'Mijoz70', 1000000);
INSERT INTO public.payments (participant_id, amount, method) VALUES ('a7000000-0000-0000-0000-000000000001', 300000, 'naqd');
DO $$ BEGIN
  IF (SELECT array_agg(kind ORDER BY id) FROM public.telegram_outbox WHERE expense_id = 'f7000000-0000-0000-0000-000000000001') IS DISTINCT FROM ARRAY['expense', 'expense_void'] THEN
    RAISE EXCEPTION 'TEST 3 FAILED: expense rows %', (SELECT array_agg(kind ORDER BY id) FROM public.telegram_outbox WHERE expense_id IS NOT NULL); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.telegram_outbox o JOIN public.payments p ON p.id = o.payment_id
                 WHERE p.participant_id = 'a7000000-0000-0000-0000-000000000001' AND o.kind = 'payment') THEN
    RAISE EXCEPTION 'TEST 3 FAILED: payment no longer queued'; END IF;
  BEGIN
    INSERT INTO public.telegram_outbox (kind) VALUES ('expense');
    RAISE EXCEPTION 'TEST 3 FAILED: an outbox row without a source accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  RAISE NOTICE 'TEST 3 ok: expenses and voids queued; payments unchanged; one source per row';
END $$;
