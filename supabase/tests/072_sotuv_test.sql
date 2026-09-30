-- Behavioural tests for migration 072 (Sotuv bo'limi). THROWAWAY DB only (recipe: CLAUDE.md §5).
\set ON_ERROR_STOP on

-- A = admin, M = sales (sotuv-crmn), X = staff without the module
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('72000000-0000-0000-0000-000000000001', 'admin72@fy.uz', '{"full_name":"Admin72","role":"admin"}'::jsonb),
  ('72000000-0000-0000-0000-000000000002', 'm72@fy.uz',     '{"full_name":"Sotuvchi72","role":"xodim"}'::jsonb),
  ('72000000-0000-0000-0000-000000000003', 'x72@fy.uz',     '{"full_name":"Hodim72","role":"xodim"}'::jsonb);
UPDATE public.profiles SET role = 'admin' WHERE id = '72000000-0000-0000-0000-000000000001';
INSERT INTO public.user_permissions (user_id, module, can_view) VALUES ('72000000-0000-0000-0000-000000000002', 'sotuv-crmn', true);
INSERT INTO public.crm_pipelines (id, name) VALUES ('a7200000-0000-0000-0000-000000000001', 'Test voronka'), ('a7200000-0000-0000-0000-000000000002', 'Boshqa');
INSERT INTO public.crm_stages (id, pipeline_id, name, sort_order, is_won, is_lost) VALUES
  ('b7200000-0000-0000-0000-000000000001', 'a7200000-0000-0000-0000-000000000001', 'Yangi', 0, false, false),
  ('b7200000-0000-0000-0000-000000000002', 'a7200000-0000-0000-0000-000000000001', 'Yutildi', 1, true, false),
  ('b7200000-0000-0000-0000-000000000003', 'a7200000-0000-0000-0000-000000000002', 'Boshqa yangi', 0, false, false);
GRANT USAGE ON SCHEMA public TO authenticated;
SET ROLE authenticated;

-- TEST 1: staff without the module sees nothing and can't create a deal
SELECT set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000003', false);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.crm_pipelines) THEN RAISE EXCEPTION 'TEST 1 FAILED: outsider sees voronkalar'; END IF;
  BEGIN
    PERFORM public.create_crm_lead('a7200000-0000-0000-0000-000000000001', 'b7200000-0000-0000-0000-000000000001', 'x', NULL, 'Ali', '901112233');
    RAISE EXCEPTION 'TEST 1 FAILED: outsider created a deal';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'TEST 1 ok: module-gated';
END $$;

-- TEST 2: a new phone creates a client; the same number in another format reuses it; feed says "created"
SELECT set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000002', false);
DO $$
DECLARE l1 uuid; l2 uuid;
BEGIN
  l1 := public.create_crm_lead('a7200000-0000-0000-0000-000000000001', 'b7200000-0000-0000-0000-000000000001', '', NULL, 'Aziz Karimov', '90 111 22 33', 1500000);
  l2 := public.create_crm_lead('a7200000-0000-0000-0000-000000000001', 'b7200000-0000-0000-0000-000000000001', 'Ikkinchi', NULL, 'Boshqa ism', '+998901112233');
  IF (SELECT count(*) FROM public.clients WHERE phone = '+998901112233') <> 1 THEN RAISE EXCEPTION 'TEST 2 FAILED: duplicate client'; END IF;
  IF (SELECT client_id FROM public.crm_leads WHERE id = l1) IS DISTINCT FROM (SELECT client_id FROM public.crm_leads WHERE id = l2) THEN
    RAISE EXCEPTION 'TEST 2 FAILED: second deal not on the same client'; END IF;
  IF (SELECT name FROM public.crm_leads WHERE id = l1) <> 'Aziz Karimov' THEN RAISE EXCEPTION 'TEST 2 FAILED: empty name not filled from client'; END IF;
  IF (SELECT responsible_user_id FROM public.crm_leads WHERE id = l1) <> '72000000-0000-0000-0000-000000000002' THEN RAISE EXCEPTION 'TEST 2 FAILED: responsible not the author'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_notes WHERE lead_id = l1 AND kind = 'created') THEN RAISE EXCEPTION 'TEST 2 FAILED: no created row'; END IF;
  RAISE NOTICE 'TEST 2 ok: one client per phone, author responsible, feed row';
END $$;

-- TEST 3: stage move → feed row, won + closed_at; back → reopened; foreign stage refused
DO $$
DECLARE l uuid := (SELECT id FROM public.crm_leads WHERE name = 'Aziz Karimov');
BEGIN
  UPDATE public.crm_leads SET stage_id = 'b7200000-0000-0000-0000-000000000002' WHERE id = l;
  IF NOT (SELECT is_won AND closed_at IS NOT NULL FROM public.crm_leads WHERE id = l) THEN RAISE EXCEPTION 'TEST 3 FAILED: not won'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_notes WHERE lead_id = l AND kind = 'stage' AND text = 'Yangi → Yutildi') THEN
    RAISE EXCEPTION 'TEST 3 FAILED: no stage row'; END IF;
  UPDATE public.crm_leads SET stage_id = 'b7200000-0000-0000-0000-000000000001' WHERE id = l;
  IF (SELECT is_won OR closed_at IS NOT NULL FROM public.crm_leads WHERE id = l) THEN RAISE EXCEPTION 'TEST 3 FAILED: not reopened'; END IF;
  BEGIN
    UPDATE public.crm_leads SET stage_id = 'b7200000-0000-0000-0000-000000000003' WHERE id = l;
    RAISE EXCEPTION 'TEST 3 FAILED: stage of another voronka accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  RAISE NOTICE 'TEST 3 ok: stage rules and feed';
END $$;

-- TEST 4: users write only plain notes as themselves, can't edit them; can't touch stages
DO $$
DECLARE l uuid := (SELECT id FROM public.crm_leads WHERE name = 'Aziz Karimov');
BEGIN
  INSERT INTO public.crm_notes (lead_id, text) VALUES (l, 'Ertaga qayta chiqamiz');
  BEGIN
    INSERT INTO public.crm_notes (lead_id, kind, text) VALUES (l, 'stage', 'soxta');
    RAISE EXCEPTION 'TEST 4 FAILED: fake system row';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.crm_notes (lead_id, text, created_by) VALUES (l, 'soxta', '72000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'TEST 4 FAILED: note under someone else''s name';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.crm_notes SET text = 'o''zgardi' WHERE lead_id = l;
    RAISE EXCEPTION 'TEST 4 FAILED: note edited';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.crm_stages SET name = 'buzildi' WHERE id = 'b7200000-0000-0000-0000-000000000001';
  IF (SELECT name FROM public.crm_stages WHERE id = 'b7200000-0000-0000-0000-000000000001') <> 'Yangi' THEN
    RAISE EXCEPTION 'TEST 4 FAILED: non-admin renamed a stage'; END IF;
  DELETE FROM public.crm_leads WHERE id = l;
  IF NOT EXISTS (SELECT 1 FROM public.crm_leads WHERE id = l) THEN RAISE EXCEPTION 'TEST 4 FAILED: non-admin deleted a deal'; END IF;
  RAISE NOTICE 'TEST 4 ok: notes, stages and deletes guarded';
END $$;

-- TEST 5: task done_at follows is_done; only the author or an admin deletes it
DO $$
DECLARE l uuid := (SELECT id FROM public.crm_leads WHERE name = 'Aziz Karimov'); t uuid;
BEGIN
  INSERT INTO public.crm_tasks (lead_id, text, due_date) VALUES (l, 'Qayta qo''ng''iroq', now()) RETURNING id INTO t;
  IF (SELECT assignee_id FROM public.crm_tasks WHERE id = t) <> '72000000-0000-0000-0000-000000000002' THEN RAISE EXCEPTION 'TEST 5 FAILED: owner default'; END IF;
  UPDATE public.crm_tasks SET is_done = true, result = 'Gaplashildi' WHERE id = t;
  IF (SELECT done_at FROM public.crm_tasks WHERE id = t) IS NULL THEN RAISE EXCEPTION 'TEST 5 FAILED: done_at not set'; END IF;
  UPDATE public.crm_tasks SET is_done = false WHERE id = t;
  IF (SELECT done_at FROM public.crm_tasks WHERE id = t) IS NOT NULL THEN RAISE EXCEPTION 'TEST 5 FAILED: done_at not cleared'; END IF;
  RAISE NOTICE 'TEST 5a ok: done_at';
END $$;
SELECT set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000001', false);
DO $$ BEGIN
  DELETE FROM public.crm_tasks;
  IF EXISTS (SELECT 1 FROM public.crm_tasks) THEN RAISE EXCEPTION 'TEST 5 FAILED: admin could not delete'; END IF;
  UPDATE public.crm_stages SET name = 'Yangi lid' WHERE id = 'b7200000-0000-0000-0000-000000000001';
  IF (SELECT name FROM public.crm_stages WHERE id = 'b7200000-0000-0000-0000-000000000001') <> 'Yangi lid' THEN RAISE EXCEPTION 'TEST 5 FAILED: admin could not rename'; END IF;
  RAISE NOTICE 'TEST 5 ok: admin deletes tasks and edits stages';
END $$;
