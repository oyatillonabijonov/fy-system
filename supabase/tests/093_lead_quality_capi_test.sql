-- Behavioural tests for migration 093 (lead quality + Meta event queue). THROWAWAY DB only (recipe: CLAUDE.md §5).
\set ON_ERROR_STOP on

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('93000000-0000-0000-0000-00000000000a', 'a93@fy.uz', '{"full_name":"Admin93","role":"admin"}'::jsonb),
  ('93000000-0000-0000-0000-000000000001', 's93@fy.uz', '{"full_name":"Sotuvchi93","role":"xodim"}'::jsonb);
UPDATE public.profiles SET role = 'admin' WHERE id = '93000000-0000-0000-0000-00000000000a';
INSERT INTO public.user_permissions (user_id, module, can_view) VALUES ('93000000-0000-0000-0000-000000000001', 'sotuv-crmn', true);

INSERT INTO public.events (id, name) VALUES ('e9300000-0000-0000-0000-000000000001', 'Biznes nonushta 93');
INSERT INTO public.crm_pipelines (id, name, event_id) VALUES ('a9300000-0000-0000-0000-000000000001', 'Voronka93', 'e9300000-0000-0000-0000-000000000001');
INSERT INTO public.crm_stages (id, pipeline_id, name, sort_order, is_won, is_lost) VALUES
  ('b9300000-0000-0000-0000-000000000001', 'a9300000-0000-0000-0000-000000000001', 'Yangi', 0, false, false),
  ('b9300000-0000-0000-0000-000000000002', 'a9300000-0000-0000-0000-000000000001', 'Yutildi', 1, true, false);
INSERT INTO public.clients (id, full_name, phone) VALUES
  ('c9300000-0000-0000-0000-000000000001', 'Anvar93', '+998901930001'),
  ('c9300000-0000-0000-0000-000000000002', 'Bobur93', '+998901930002'),
  ('c9300000-0000-0000-0000-000000000003', 'Qo''lda93', '+998901930003');
INSERT INTO public.crm_leads (id, pipeline_id, stage_id, name, client_id, price, capi) VALUES
  ('d9300000-0000-0000-0000-000000000001', 'a9300000-0000-0000-0000-000000000001', 'b9300000-0000-0000-0000-000000000001', 'L1', 'c9300000-0000-0000-0000-000000000001', 1800000, '{"event_id":"ev-1"}'),
  ('d9300000-0000-0000-0000-000000000002', 'a9300000-0000-0000-0000-000000000001', 'b9300000-0000-0000-0000-000000000001', 'L2', 'c9300000-0000-0000-0000-000000000002', 1800000, '{"event_id":"ev-2"}'),
  ('d9300000-0000-0000-0000-000000000003', 'a9300000-0000-0000-0000-000000000001', 'b9300000-0000-0000-0000-000000000001', 'L3', 'c9300000-0000-0000-0000-000000000003', 900000, NULL);
INSERT INTO public.crm_calls (uuid, direction, phone, lead_id, started_at, duration, talk_time) VALUES
  ('k1', 'out', '+998901930001', 'd9300000-0000-0000-0000-000000000001', now(), 60, 50),
  ('k2', 'out', '+998901930001', 'd9300000-0000-0000-0000-000000000001', now(), 60, 50),
  ('k3', 'out', '+998901930002', 'd9300000-0000-0000-0000-000000000002', now(), 60, 50),
  ('k4', 'out', '+998901930003', 'd9300000-0000-0000-0000-000000000003', now(), 60, 50);

CREATE OR REPLACE FUNCTION pg_temp.n(p_lead text, p_event text) RETURNS integer
LANGUAGE sql AS $$ SELECT count(*)::int FROM public.meta_events_log WHERE lead_id::text = p_lead AND event_name = p_event $$;

DO $$
BEGIN
  IF (SELECT lead_threshold FROM public.crm_pipelines WHERE id = 'a9300000-0000-0000-0000-000000000001') <> 4 THEN RAISE EXCEPTION 'TEST 8 FAILED: threshold default'; END IF;

  -- 1/2: qualified → one Lead carrying the form's event_id; again → nothing more
  UPDATE public.crm_leads SET lead_score = 5, qualified = true WHERE id = 'd9300000-0000-0000-0000-000000000001';
  IF pg_temp.n('d9300000-0000-0000-0000-000000000001', 'Lead') <> 1 THEN RAISE EXCEPTION 'TEST 1 FAILED: no Lead'; END IF;
  IF (SELECT event_id FROM public.meta_events_log WHERE lead_id = 'd9300000-0000-0000-0000-000000000001') <> 'ev-1' THEN RAISE EXCEPTION 'TEST 1 FAILED: event_id is not the form''s'; END IF;
  UPDATE public.crm_leads SET qualified = false WHERE id = 'd9300000-0000-0000-0000-000000000001';
  UPDATE public.crm_leads SET qualified = true, capi = '{"event_id":"ev-1b"}' WHERE id = 'd9300000-0000-0000-0000-000000000001';
  IF pg_temp.n('d9300000-0000-0000-0000-000000000001', 'Lead') <> 1 THEN RAISE EXCEPTION 'TEST 2 FAILED: Lead twice'; END IF;

  -- 3: unqualified → nothing; a bitim without capi → nothing, even qualified
  UPDATE public.crm_leads SET lead_score = 0, qualified = false WHERE id = 'd9300000-0000-0000-0000-000000000002';
  UPDATE public.crm_leads SET lead_score = 5, qualified = true WHERE id = 'd9300000-0000-0000-0000-000000000003';
  IF pg_temp.n('d9300000-0000-0000-0000-000000000002', 'Lead') + pg_temp.n('d9300000-0000-0000-0000-000000000003', 'Lead') <> 0 THEN RAISE EXCEPTION 'TEST 3 FAILED'; END IF;

  -- 5: call analysis outcomes
  INSERT INTO public.crm_call_analyses (call_uuid, status, outcome) VALUES ('k1', 'pending', NULL), ('k3', 'pending', NULL), ('k4', 'pending', NULL);
  UPDATE public.crm_call_analyses SET status = 'done', outcome = 'rad etdi, qayta qo‘ng‘iroq qilinmaydi' WHERE call_uuid = 'k1';
  IF pg_temp.n('d9300000-0000-0000-0000-000000000001', 'QualifiedLead') <> 0 THEN RAISE EXCEPTION 'TEST 5 FAILED: rad etdi counted'; END IF;
  UPDATE public.crm_call_analyses SET status = 'done', outcome = 'Maqsadsiz lid' WHERE call_uuid = 'k3';
  IF pg_temp.n('d9300000-0000-0000-0000-000000000002', 'QualifiedLead') <> 0 THEN RAISE EXCEPTION 'TEST 5 FAILED: maqsadsiz counted'; END IF;
  INSERT INTO public.crm_call_analyses (call_uuid, status, outcome) VALUES ('k2', 'done', 'O‘ylab ko‘radi');
  IF pg_temp.n('d9300000-0000-0000-0000-000000000001', 'QualifiedLead') <> 1 THEN RAISE EXCEPTION 'TEST 5 FAILED: o''ylab ko''radi not counted'; END IF;
  UPDATE public.crm_call_analyses SET status = 'done', outcome = 'yozildi' WHERE call_uuid = 'k4';
  IF pg_temp.n('d9300000-0000-0000-0000-000000000003', 'QualifiedLead') <> 0 THEN RAISE EXCEPTION 'TEST 3 FAILED: no-capi bitim got QualifiedLead'; END IF;

  -- 6: a payment on the voronka's event → Purchase (participant price); won later adds nothing
  INSERT INTO public.event_participants (id, event_id, contact_id, full_name, price) VALUES
    ('f9300000-0000-0000-0000-000000000001', 'e9300000-0000-0000-0000-000000000001', 'c9300000-0000-0000-0000-000000000001', 'Anvar93', 2000000);
  INSERT INTO public.payments (participant_id, amount, method, paid_at) VALUES ('f9300000-0000-0000-0000-000000000001', 500000, 'naqd', now());
  IF (SELECT value FROM public.meta_events_log WHERE lead_id = 'd9300000-0000-0000-0000-000000000001' AND event_name = 'Purchase') IS DISTINCT FROM 2000000 THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Purchase from payment %', (SELECT value FROM public.meta_events_log WHERE lead_id = 'd9300000-0000-0000-0000-000000000001' AND event_name = 'Purchase'); END IF;
  UPDATE public.crm_leads SET stage_id = 'b9300000-0000-0000-0000-000000000002' WHERE id = 'd9300000-0000-0000-0000-000000000001';
  IF pg_temp.n('d9300000-0000-0000-0000-000000000001', 'Purchase') <> 1 THEN RAISE EXCEPTION 'TEST 6 FAILED: Purchase twice'; END IF;

  -- 4: won → Purchase = Summa (with capi); without capi → nothing
  UPDATE public.crm_leads SET stage_id = 'b9300000-0000-0000-0000-000000000002' WHERE id IN ('d9300000-0000-0000-0000-000000000002', 'd9300000-0000-0000-0000-000000000003');
  IF (SELECT value FROM public.meta_events_log WHERE lead_id = 'd9300000-0000-0000-0000-000000000002' AND event_name = 'Purchase') IS DISTINCT FROM 1800000 THEN RAISE EXCEPTION 'TEST 4 FAILED: won Purchase'; END IF;
  IF pg_temp.n('d9300000-0000-0000-0000-000000000003', 'Purchase') <> 0 THEN RAISE EXCEPTION 'TEST 4 FAILED: no-capi bitim got Purchase'; END IF;
  IF (SELECT event_id FROM public.meta_events_log WHERE lead_id = 'd9300000-0000-0000-0000-000000000002' AND event_name = 'Purchase') <> 'd9300000-0000-0000-0000-000000000002_Purchase' THEN RAISE EXCEPTION 'TEST 4 FAILED: event_id'; END IF;
  RAISE NOTICE 'TESTS 1-6, 8 ok';
END $$;

GRANT USAGE ON SCHEMA public TO authenticated;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '93000000-0000-0000-0000-000000000001', false);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.meta_events_log) THEN RAISE EXCEPTION 'TEST 7 FAILED: seller reads the Meta log'; END IF;
  BEGIN
    UPDATE public.crm_leads SET qualified = true, lead_score = 7 WHERE id = 'd9300000-0000-0000-0000-000000000002';
    IF (SELECT lead_score FROM public.crm_leads WHERE id = 'd9300000-0000-0000-0000-000000000002') = 7 THEN RAISE EXCEPTION 'TEST 7 FAILED: seller changed a score'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub', '93000000-0000-0000-0000-00000000000a', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.meta_events_log) < 4 THEN RAISE EXCEPTION 'TEST 7 FAILED: admin cannot read the Meta log'; END IF;
  RAISE NOTICE 'TEST 7 ok';
END $$;
RESET ROLE;
