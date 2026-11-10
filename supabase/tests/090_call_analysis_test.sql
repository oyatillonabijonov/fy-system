-- Behavioural tests for migration 090 (AI call analysis). THROWAWAY DB only (recipe: CLAUDE.md §5).
\set ON_ERROR_STOP on

-- A = admin, M = manager, S1/S2 = sellers (sotuv-crmn), X = staff without the module
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('90000000-0000-0000-0000-00000000000a', 'a90@fy.uz',  '{"full_name":"Admin90","role":"admin"}'::jsonb),
  ('90000000-0000-0000-0000-00000000000b', 'm90@fy.uz',  '{"full_name":"Menejer90","role":"xodim"}'::jsonb),
  ('90000000-0000-0000-0000-000000000001', 's190@fy.uz', '{"full_name":"Zuhra90","role":"xodim"}'::jsonb),
  ('90000000-0000-0000-0000-000000000002', 's290@fy.uz', '{"full_name":"Hikmat90","role":"xodim"}'::jsonb),
  ('90000000-0000-0000-0000-000000000003', 'x90@fy.uz',  '{"full_name":"Hodim90","role":"xodim"}'::jsonb);
UPDATE public.profiles SET role = 'admin'   WHERE id = '90000000-0000-0000-0000-00000000000a';
UPDATE public.profiles SET role = 'manager' WHERE id = '90000000-0000-0000-0000-00000000000b';
INSERT INTO public.user_permissions (user_id, module, can_view) VALUES
  ('90000000-0000-0000-0000-00000000000b', 'sotuv-crmn', true),
  ('90000000-0000-0000-0000-000000000001', 'sotuv-crmn', true),
  ('90000000-0000-0000-0000-000000000002', 'sotuv-crmn', true);

-- a voronka tied to an event with two tariffs, a client named by the phone, a bitim
INSERT INTO public.events (id, name, date) VALUES ('e9000000-0000-0000-0000-000000000001', 'Biznes nonushta 90', '2026-11-28 03:30+00');
INSERT INTO public.event_tariffs (event_id, name, price, sort_order) VALUES
  ('e9000000-0000-0000-0000-000000000001', 'Standart', 1800000, 0), ('e9000000-0000-0000-0000-000000000001', 'VIP', 3000000, 1);
INSERT INTO public.crm_pipelines (id, name, event_id) VALUES ('a9000000-0000-0000-0000-000000000001', 'Voronka90', 'e9000000-0000-0000-0000-000000000001');
INSERT INTO public.crm_stages (id, pipeline_id, name, sort_order) VALUES ('b9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000001', 'Yangi', 0);
INSERT INTO public.clients (id, full_name, phone) VALUES ('c9000000-0000-0000-0000-000000000001', '+998901234590', '+998901234590');
INSERT INTO public.crm_leads (id, pipeline_id, stage_id, name, client_id) VALUES
  ('d9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000001', 'b9000000-0000-0000-0000-000000000001', 'Bitim90', 'c9000000-0000-0000-0000-000000000001');

DELETE FROM public.crm_calls;   -- the stand's own leftovers would change what claim picks
UPDATE public.amo_sync_state SET value = extract(epoch FROM now() - interval '1 hour')::bigint::text WHERE key = 'call_analysis_from';
UPDATE public.sales_script SET body = 'Salom';
INSERT INTO public.crm_calls (uuid, direction, phone, staff_id, client_id, lead_id, started_at, duration, talk_time) VALUES
  ('c1', 'in',  '+998901234590', '90000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001', 'd9000000-0000-0000-0000-000000000001', now() - interval '3 minutes', 60, 50),
  ('c2', 'out', '+998900000002', '90000000-0000-0000-0000-000000000002', NULL, NULL, now() - interval '2 minutes', 60, 50),
  ('c3', 'in',  '+998900000003', NULL, NULL, NULL, now() - interval '1 minute', 60, 50),
  ('c4', 'in',  '+998900000004', '90000000-0000-0000-0000-000000000001', NULL, NULL, now() - interval '1 minute', 20, 0),
  ('c5', 'in',  '+998900000005', '90000000-0000-0000-0000-000000000001', NULL, NULL, now() - interval '2 days', 60, 50),
  ('c6', 'in',  '+998900000006', '90000000-0000-0000-0000-000000000001', NULL, NULL, now() - interval '3 hours', 60, 50);

-- TESTS 1–3 (service side): what claim picks, the lease, the facts
DO $$
DECLARE r record; second text;
BEGIN
  SELECT * INTO r FROM public.call_analysis_claim();
  IF r.call_uuid IS DISTINCT FROM 'c1' THEN RAISE EXCEPTION 'TEST 1 FAILED: first claim is % (want c1)', r.call_uuid; END IF;
  IF r.seller_name <> 'Zuhra90' OR r.event_name <> 'Biznes nonushta 90' OR r.tariffs <> 'Standart: 1800000; VIP: 3000000' OR r.script <> 'Salom' THEN
    RAISE EXCEPTION 'TEST 3 FAILED: facts %', row_to_json(r); END IF;
  IF r.client_name IS NOT NULL THEN RAISE EXCEPTION 'TEST 3 FAILED: a phone-named client came as a name'; END IF;

  SELECT call_uuid INTO second FROM public.call_analysis_claim();
  IF second IS DISTINCT FROM 'c2' THEN RAISE EXCEPTION 'TEST 2 FAILED: leased call handed out again or wrong order (%)', second; END IF;
  IF (SELECT call_uuid FROM public.call_analysis_claim()) IS DISTINCT FROM 'c3' THEN RAISE EXCEPTION 'TEST 1 FAILED: c3 (no staff) not picked'; END IF;
  IF EXISTS (SELECT 1 FROM public.call_analysis_claim()) THEN RAISE EXCEPTION 'TEST 1 FAILED: missed / stale / before switch-on call picked'; END IF;

  UPDATE public.crm_call_analyses SET next_try_at = now() - interval '1 minute' WHERE call_uuid = 'c2';
  IF (SELECT call_uuid FROM public.call_analysis_claim()) IS DISTINCT FROM 'c2' THEN RAISE EXCEPTION 'TEST 2 FAILED: a pending call past its lease not retried'; END IF;

  UPDATE public.sales_script SET body = '  ';
  UPDATE public.crm_call_analyses SET next_try_at = now() - interval '1 minute' WHERE call_uuid = 'c1';
  IF (SELECT script FROM public.call_analysis_claim()) IS NOT NULL THEN RAISE EXCEPTION 'TEST 3 FAILED: blank script not NULL'; END IF;

  -- every claim is a try: a call that keeps crashing the worker still runs out of tries
  IF (SELECT attempts FROM public.crm_call_analyses WHERE call_uuid = 'c1') <> 2 OR (SELECT attempts FROM public.crm_call_analyses WHERE call_uuid = 'c3') <> 1 THEN
    RAISE EXCEPTION 'TEST 9 FAILED: a claim does not count as a try'; END IF;
  UPDATE public.crm_call_analyses SET attempts = 5, next_try_at = now() - interval '1 minute' WHERE call_uuid = 'c3';
  IF EXISTS (SELECT 1 FROM public.call_analysis_claim()) THEN RAISE EXCEPTION 'TEST 9 FAILED: a call out of tries handed out again'; END IF;
  IF (SELECT status FROM public.crm_call_analyses WHERE call_uuid = 'c3') <> 'failed' THEN RAISE EXCEPTION 'TEST 9 FAILED: a call out of tries not marked failed'; END IF;
  -- a pending row is never stranded by its age (a re-queued old call, a day-long outage)
  INSERT INTO public.crm_call_analyses (call_uuid, next_try_at) VALUES ('c5', now() - interval '1 minute');
  IF (SELECT call_uuid FROM public.call_analysis_claim()) IS DISTINCT FROM 'c5' THEN RAISE EXCEPTION 'TEST 9 FAILED: an old pending call left hanging'; END IF;
  DELETE FROM public.crm_call_analyses WHERE call_uuid = 'c5';

  IF has_function_privilege('authenticated', 'public.call_analysis_claim()', 'EXECUTE') THEN RAISE EXCEPTION 'TEST 1 FAILED: API role can claim'; END IF;
  RAISE NOTICE 'TESTS 1-3, 9 ok: claim picks answered recent calls once, lease, facts, tries';
END $$;

UPDATE public.crm_call_analyses SET status = 'done', score = 60,
  mistakes = '[{"quote":"a","tag":"keyingi_qadam"},{"quote":"b","tag":"keyingi_qadam"},{"quote":"c","tag":"boshqa"}]'::jsonb WHERE call_uuid = 'c1';
UPDATE public.crm_call_analyses SET status = 'done', score = 80, mistakes = '[]'::jsonb WHERE call_uuid = 'c2';
UPDATE public.crm_call_analyses SET status = 'done', score = 10 WHERE call_uuid = 'c3';
INSERT INTO public.crm_calls (uuid, direction, phone, staff_id, started_at, duration, talk_time) VALUES
  ('c7', 'in', '+998900000007', '90000000-0000-0000-0000-000000000001', now() - interval '5 minutes', 10, 5);
INSERT INTO public.crm_call_analyses (call_uuid, status, score) VALUES ('c7', 'done', NULL);   -- too short: no score

GRANT USAGE ON SCHEMA public TO authenticated;
SET ROLE authenticated;

-- TEST 4: a seller sees their own analyses only; manager and admin see all; no module → nothing
SELECT set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', false);
DO $$ BEGIN
  IF (SELECT array_agg(call_uuid ORDER BY call_uuid) FROM public.crm_call_analyses) IS DISTINCT FROM ARRAY['c1','c7'] THEN
    RAISE EXCEPTION 'TEST 4 FAILED: seller 1 sees %', (SELECT array_agg(call_uuid) FROM public.crm_call_analyses); END IF;
  -- TEST 5: no API writes
  BEGIN
    UPDATE public.crm_call_analyses SET score = 100;
    RAISE EXCEPTION 'TEST 5 FAILED: seller changed a score';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.crm_call_analyses (call_uuid) VALUES ('c4');
    RAISE EXCEPTION 'TEST 5 FAILED: seller inserted an analysis';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- TEST 6: re-queue is admin-only
  BEGIN
    PERFORM public.requeue_call_analysis('c1');
    RAISE EXCEPTION 'TEST 6 FAILED: seller re-queued';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- TEST 7: the script is readable, not editable
  IF (SELECT count(*) FROM public.sales_script) <> 1 THEN RAISE EXCEPTION 'TEST 7 FAILED: seller cannot read the script'; END IF;
  UPDATE public.sales_script SET body = 'hack';
  IF (SELECT body FROM public.sales_script) = 'hack' THEN RAISE EXCEPTION 'TEST 7 FAILED: seller edited the script'; END IF;
  -- TEST 8: stats — only their own row
  IF jsonb_array_length(public.call_analysis_stats(current_date - 7, current_date + 1)->'sellers') <> 1
     OR public.call_analysis_stats(current_date - 7, current_date + 1)->'sellers'->0->>'name' <> 'Zuhra90' THEN
    RAISE EXCEPTION 'TEST 8 FAILED: seller stats %', public.call_analysis_stats(current_date - 7, current_date + 1); END IF;
  RAISE NOTICE 'TESTS 4-8 (seller) ok';
END $$;

SELECT set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', false);
DO $$ BEGIN
  IF (SELECT array_agg(call_uuid) FROM public.crm_call_analyses) IS DISTINCT FROM ARRAY['c2'] THEN RAISE EXCEPTION 'TEST 4 FAILED: seller 2 sees others'; END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000003', false);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.crm_call_analyses) THEN RAISE EXCEPTION 'TEST 4 FAILED: outsider sees analyses'; END IF;
  IF EXISTS (SELECT 1 FROM public.sales_script) THEN RAISE EXCEPTION 'TEST 7 FAILED: outsider reads the script'; END IF;
  BEGIN
    PERFORM public.call_analysis_stats(current_date - 7, current_date + 1);
    RAISE EXCEPTION 'TEST 8 FAILED: outsider got stats';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SELECT set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-00000000000b', false);
DO $$
DECLARE s jsonb := public.call_analysis_stats(current_date - 7, current_date + 1)->'sellers';
BEGIN
  IF (SELECT count(*) FROM public.crm_call_analyses) <> 4 THEN RAISE EXCEPTION 'TEST 4 FAILED: manager does not see all'; END IF;
  IF jsonb_array_length(s) <> 2 OR s->0->>'name' <> 'Hikmat90' OR (s->0->>'avg_score')::int <> 80 THEN RAISE EXCEPTION 'TEST 8 FAILED: order/avg %', s; END IF;
  IF (s->1->>'avg_score')::int <> 60 OR (s->1->>'calls')::int <> 2 THEN RAISE EXCEPTION 'TEST 8 FAILED: unscored call must count in calls, not in the average: %', s->1; END IF;
  IF s->1->'tags'->0 IS DISTINCT FROM '{"tag":"keyingi_qadam","count":2}'::jsonb THEN RAISE EXCEPTION 'TEST 8 FAILED: tags %', s->1->'tags'; END IF;
  IF jsonb_array_length(s->1->'weeks') < 1 OR (s->1->'weeks'->0->>'avg')::int <> 60 THEN RAISE EXCEPTION 'TEST 8 FAILED: weeks %', s->1->'weeks'; END IF;
  BEGIN
    PERFORM public.requeue_call_analysis('c1');
    RAISE EXCEPTION 'TEST 6 FAILED: manager re-queued';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'TESTS 4, 8 (manager) ok';
END $$;

SELECT set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-00000000000a', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.crm_call_analyses) <> 4 THEN RAISE EXCEPTION 'TEST 4 FAILED: admin does not see all'; END IF;
  PERFORM public.requeue_call_analysis('c1');
  IF (SELECT status || attempts::text FROM public.crm_call_analyses WHERE call_uuid = 'c1') <> 'pending0' THEN RAISE EXCEPTION 'TEST 6 FAILED: not re-queued'; END IF;
  UPDATE public.sales_script SET body = 'Yangi skript';
  IF (SELECT body FROM public.sales_script) <> 'Yangi skript' THEN RAISE EXCEPTION 'TEST 7 FAILED: admin cannot edit the script'; END IF;
  RAISE NOTICE 'TESTS 4, 6, 7 (admin) ok';
END $$;

RESET ROLE;
