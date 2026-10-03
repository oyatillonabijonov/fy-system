-- Behavioural tests for migration 082 (sales_dashboard fixes). THROWAWAY DB only (recipe: CLAUDE.md §5).
\set ON_ERROR_STOP on

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('82000000-0000-0000-0000-000000000001', 'a82@fy.uz', '{"full_name":"Boss82","role":"xodim"}'::jsonb),
  ('82000000-0000-0000-0000-000000000002', 'n82@fy.uz', '{"full_name":"NullActive82","role":"xodim"}'::jsonb),
  ('82000000-0000-0000-0000-000000000003', 'o82@fy.uz', '{"full_name":"Off82","role":"xodim"}'::jsonb);
INSERT INTO public.user_permissions (user_id, module, can_view) VALUES ('82000000-0000-0000-0000-000000000001', 'dashboard', true);
UPDATE public.profiles SET is_active = NULL WHERE id = '82000000-0000-0000-0000-000000000002';
UPDATE public.profiles SET is_active = false WHERE id = '82000000-0000-0000-0000-000000000003';

INSERT INTO public.crm_pipelines (id, name, sort_order) VALUES
  ('a8200000-0000-0000-0000-000000000001', 'Bir xil', 60), ('a8200000-0000-0000-0000-000000000002', 'Bir xil', 61);
INSERT INTO public.crm_stages (id, pipeline_id, name, color, sort_order) VALUES
  ('b8200000-0000-0000-0000-000000000001', 'a8200000-0000-0000-0000-000000000001', 'S1', '#378ADD', 0),
  ('b8200000-0000-0000-0000-000000000002', 'a8200000-0000-0000-0000-000000000002', 'S2', '#378ADD', 0);

SET session_replication_role = replica;
INSERT INTO public.crm_leads (id, name, pipeline_id, stage_id, price, responsible_user_id, is_won, is_lost, created_at, stage_changed_at) VALUES
  ('d8200000-0000-0000-0000-000000000001', 'N82', 'a8200000-0000-0000-0000-000000000001', 'b8200000-0000-0000-0000-000000000001', 0, '82000000-0000-0000-0000-000000000002', false, false, now(), now() - interval '20 days'),
  ('d8200000-0000-0000-0000-000000000002', 'O82', 'a8200000-0000-0000-0000-000000000002', 'b8200000-0000-0000-0000-000000000002', 0, '82000000-0000-0000-0000-000000000003', false, false, now(), now() - interval '20 days');
INSERT INTO public.crm_tasks (id, lead_id, text, kind, due_date, is_done, assignee_id) VALUES
  ('e8200000-0000-0000-0000-000000000001', 'd8200000-0000-0000-0000-000000000002', 'p2 task', 'call', now() - interval '1 day', false, '82000000-0000-0000-0000-000000000003');
INSERT INTO public.crm_calls (uuid, direction, phone, lead_id, started_at, duration, talk_time) VALUES
  ('c82-hidden', 'in', NULL,            NULL, now() - interval '3 hours', 5, 0),
  ('c82-a',      'in', '+998900008201', 'd8200000-0000-0000-0000-000000000001', now() - interval '3 hours', 5, 0),
  ('c82-a-back', 'in', '+998900008201', 'd8200000-0000-0000-0000-000000000001', now() - interval '2 hours', 50, 40),
  ('c82-b',      'in', '+998900008202', 'd8200000-0000-0000-0000-000000000002', now() - interval '1 hour', 5, 0);
SET session_replication_role = origin;

SELECT set_config('t82.p1', 'a8200000-0000-0000-0000-000000000001', false);
GRANT USAGE ON SCHEMA public TO authenticated;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '82000000-0000-0000-0000-000000000001', false);

-- TEST 1: a NULL is_active seller counts (has_permission treats NULL as active); is_active = false doesn't
DO $$ DECLARE d jsonb := public.sales_dashboard(current_date - 1, current_date); BEGIN
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d->'sellers') s WHERE s->>'full_name' = 'NullActive82') THEN RAISE EXCEPTION 'TEST 1 FAILED: NULL is_active seller dropped'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(d->'sellers') s WHERE s->>'full_name' = 'Off82') THEN RAISE EXCEPTION 'TEST 1 FAILED: inactive seller shown'; END IF;
  RAISE NOTICE 'TEST 1 ok: sellers by is_active';
END $$;

-- TEST 2: missed list — hidden numbers out; a client who called back and talked is handled
DO $$ DECLARE d jsonb := public.sales_dashboard(current_date - 1, current_date); BEGIN
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(d->'attention'->'missed_unanswered') m WHERE m->>'phone' IS NULL) THEN RAISE EXCEPTION 'TEST 2 FAILED: hidden number listed'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(d->'attention'->'missed_unanswered') m WHERE m->>'phone' = '+998900008201') THEN RAISE EXCEPTION 'TEST 2 FAILED: answered call-back still listed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d->'attention'->'missed_unanswered') m WHERE m->>'phone' = '+998900008202') THEN RAISE EXCEPTION 'TEST 2 FAILED: real missed number gone'; END IF;
  RAISE NOTICE 'TEST 2 ok: missed list';
END $$;

-- TEST 3: funnel rows carry pipeline_id, so two voronkalar with one name stay apart
DO $$ DECLARE d jsonb := public.sales_dashboard(current_date - 1, current_date); BEGIN
  IF (SELECT count(DISTINCT f->>'pipeline_id') FROM jsonb_array_elements(d->'funnel') f WHERE f->>'pipeline' = 'Bir xil') <> 2 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: funnel has no pipeline_id'; END IF;
  RAISE NOTICE 'TEST 3 ok: funnel pipeline_id';
END $$;

-- TEST 4: the voronka filter reaches sellers and every attention list
DO $$ DECLARE d jsonb := public.sales_dashboard(current_date - 1, current_date, current_setting('t82.p1')::uuid); BEGIN
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(d->'attention'->'overdue_tasks') t WHERE t->>'text' = 'p2 task') THEN RAISE EXCEPTION 'TEST 4 FAILED: overdue from another voronka'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(d->'attention'->'stale_leads') l WHERE l->>'name' = 'O82') THEN RAISE EXCEPTION 'TEST 4 FAILED: stale from another voronka'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(d->'attention'->'missed_unanswered') m WHERE m->>'phone' = '+998900008202') THEN RAISE EXCEPTION 'TEST 4 FAILED: missed from another voronka'; END IF;
  RAISE NOTICE 'TEST 4 ok: voronka filter everywhere';
END $$;
RESET ROLE;

-- TEST 5: the call lookups have their index
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'crm_calls' AND indexdef LIKE '%(phone, started_at)%') THEN RAISE EXCEPTION 'TEST 5 FAILED: no (phone, started_at) index'; END IF;
  RAISE NOTICE 'TEST 5 ok: index';
END $$;
