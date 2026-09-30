-- Behavioural tests for migration 074 (OnlinePBX calls). THROWAWAY DB only (recipe: CLAUDE.md §5).
-- Runs as the table owner, like amo-sync.
\set ON_ERROR_STOP on

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('74000000-0000-0000-0000-000000000001', 'm74@fy.uz', '{"full_name":"Sotuvchi74","role":"xodim"}'::jsonb);
UPDATE public.profiles SET pbx_ext = '100' WHERE id = '74000000-0000-0000-0000-000000000001';
INSERT INTO public.crm_pipelines (id, name, sort_order) VALUES ('a7400000-0000-0000-0000-000000000001', 'Qo''ng''iroqlar', -2);
INSERT INTO public.crm_stages (id, pipeline_id, name, sort_order) VALUES ('b7400000-0000-0000-0000-000000000001', 'a7400000-0000-0000-0000-000000000001', 'Yangi', 0);
INSERT INTO public.clients (id, full_name, phone) VALUES ('c7400000-0000-0000-0000-000000000001', 'Aziz74', '+998901110074');
INSERT INTO public.crm_leads (id, name, pipeline_id, stage_id, client_id, responsible_user_id)
  VALUES ('d7400000-0000-0000-0000-000000000001', 'Aziz74', 'a7400000-0000-0000-0000-000000000001', 'b7400000-0000-0000-0000-000000000001',
          'c7400000-0000-0000-0000-000000000001', '74000000-0000-0000-0000-000000000001');

-- TEST 1: an outbound call (9-digit number from the PBX) is tied to the client, deal and staff; replays are ignored
DO $$ BEGIN
  IF public.log_pbx_call('u1', 'outbound', '100', '901110074', 1790763508, 187, 170, 'NORMAL_CLEARING') <> 'logged' THEN RAISE EXCEPTION 'TEST 1 FAILED: not logged'; END IF;
  IF public.log_pbx_call('u1', 'outbound', '100', '901110074', 1790763508, 187, 170, 'NORMAL_CLEARING') <> 'known' THEN RAISE EXCEPTION 'TEST 1 FAILED: replay logged twice'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_calls WHERE uuid = 'u1' AND direction = 'out' AND phone = '+998901110074'
                 AND client_id = 'c7400000-0000-0000-0000-000000000001' AND lead_id = 'd7400000-0000-0000-0000-000000000001'
                 AND staff_id = '74000000-0000-0000-0000-000000000001' AND talk_time = 170) THEN
    RAISE EXCEPTION 'TEST 1 FAILED: wrong links: %', (SELECT row_to_json(c) FROM public.crm_calls c WHERE uuid = 'u1'); END IF;
  IF public.log_pbx_call('u2', 'local', '100', '101', 1790763508, 5, 5, 'NORMAL_CLEARING') <> 'skipped' THEN RAISE EXCEPTION 'TEST 1 FAILED: internal call logged'; END IF;
  RAISE NOTICE 'TEST 1 ok: outbound call linked, idempotent, internal skipped';
END $$;

-- TEST 2: a missed incoming call opens ONE call-back task for the deal's owner
DO $$ BEGIN
  PERFORM public.log_pbx_call('u3', 'inbound', '+998901110074', '555160077', 1790763600, 20, 0, 'NO_ANSWER');
  PERFORM public.log_pbx_call('u4', 'inbound', '901110074', '555160077', 1790763700, 20, 0, 'NO_ANSWER');
  IF (SELECT count(*) FROM public.crm_tasks WHERE lead_id = 'd7400000-0000-0000-0000-000000000001' AND NOT is_done) <> 1 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: % call-back tasks', (SELECT count(*) FROM public.crm_tasks WHERE lead_id = 'd7400000-0000-0000-0000-000000000001'); END IF;
  IF (SELECT assignee_id FROM public.crm_tasks WHERE lead_id = 'd7400000-0000-0000-0000-000000000001') <> '74000000-0000-0000-0000-000000000001' THEN
    RAISE EXCEPTION 'TEST 2 FAILED: task not for the deal owner'; END IF;
  RAISE NOTICE 'TEST 2 ok: missed call → one call-back task';
END $$;

-- TEST 3: an unknown incoming number opens a deal only when the "call" source is on
DO $$ BEGIN
  PERFORM public.log_pbx_call('u5', 'inbound', '935550074', '100', 1790763800, 40, 30, 'NORMAL_CLEARING');
  IF EXISTS (SELECT 1 FROM public.clients WHERE phone = '+998935550074') THEN RAISE EXCEPTION 'TEST 3 FAILED: source off but client created'; END IF;
  UPDATE public.crm_lead_sources SET enabled = true, pipeline_id = 'a7400000-0000-0000-0000-000000000001' WHERE id = 'call';
  PERFORM public.log_pbx_call('u6', 'inbound', '935550074', '100', 1790763900, 40, 30, 'NORMAL_CLEARING');
  IF NOT EXISTS (SELECT 1 FROM public.crm_calls c JOIN public.crm_leads l ON l.id = c.lead_id
                 WHERE c.uuid = 'u6' AND l.pipeline_id = 'a7400000-0000-0000-0000-000000000001' AND l.source = 'call') THEN
    RAISE EXCEPTION 'TEST 3 FAILED: no deal for the unknown caller'; END IF;
  RAISE NOTICE 'TEST 3 ok: unknown caller → deal via the call source';
END $$;

-- TEST 4: staff read calls only with the module; the API roles can't write them
GRANT USAGE ON SCHEMA public TO authenticated;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '74000000-0000-0000-0000-000000000001', false);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.crm_calls) THEN RAISE EXCEPTION 'TEST 4 FAILED: calls visible without the module'; END IF;
  IF has_function_privilege('authenticated', 'public.log_pbx_call(text,text,text,text,bigint,integer,integer,text)', 'execute')
     OR has_table_privilege('authenticated', 'public.crm_calls', 'insert') THEN
    RAISE EXCEPTION 'TEST 4 FAILED: API role can write calls'; END IF;
  RAISE NOTICE 'TEST 4 ok: calls module-gated, service-only writes';
END $$;
