-- Behavioural tests for migration 080 (sales_dashboard). THROWAWAY DB only (recipe: CLAUDE.md §5).
\set ON_ERROR_STOP on

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('78000000-0000-0000-0000-000000000001', 's78@fy.uz', '{"full_name":"Sotuvchi78","role":"xodim"}'::jsonb),
  ('78000000-0000-0000-0000-000000000002', 'x78@fy.uz', '{"full_name":"Begona78","role":"xodim"}'::jsonb);
-- Dashboard bor, sotuv-crmn YO'Q: funksiya baribir ishlashi kerak (DEFINER)
INSERT INTO public.user_permissions (user_id, module, can_view) VALUES ('78000000-0000-0000-0000-000000000001', 'dashboard', true);

INSERT INTO public.crm_pipelines (id, name, sort_order) VALUES ('a7800000-0000-0000-0000-000000000002', 'P2-78', 50);
INSERT INTO public.crm_stages (id, pipeline_id, name, color, sort_order) VALUES
  ('b7800000-0000-0000-0000-000000000009', 'a7800000-0000-0000-0000-000000000002', 'Ochiq78', '#378ADD', 0);

-- Fixtures with explicit times: triggers off so created_at/closed_at/done_at stay as written
SET session_replication_role = replica;
WITH u AS (SELECT id FROM public.crm_pipelines WHERE name = 'Umumiy'),
     st AS (SELECT name, id FROM public.crm_stages WHERE pipeline_id = (SELECT id FROM u))
INSERT INTO public.crm_leads (id, name, pipeline_id, stage_id, price, responsible_user_id, is_won, is_lost, created_at, closed_at, stage_changed_at, source)
SELECT v.id, v.name, (SELECT id FROM u), (SELECT id FROM st WHERE st.name = v.stage), v.price, v.resp, v.won, v.lost, v.created, v.closed, v.changed, v.src
FROM (VALUES
  ('d7800000-0000-0000-0000-000000000000'::uuid, 'L0-prev', 'Yutildi', 500,  '78000000-0000-0000-0000-000000000001'::uuid, true,  false, '2026-01-08 10:00+05'::timestamptz, '2026-01-08 12:00+05'::timestamptz, '2026-01-08 12:00+05'::timestamptz, 'call'),
  ('d7800000-0000-0000-0000-000000000001'::uuid, 'L1-won',  'Yutildi', 1000, '78000000-0000-0000-0000-000000000001'::uuid, true,  false, '2026-01-10 10:00+05', '2026-01-11 10:00+05', '2026-01-11 10:00+05', 'call'),
  ('d7800000-0000-0000-0000-000000000002'::uuid, 'L2-lost', 'Yutqazildi', 0, '78000000-0000-0000-0000-000000000001'::uuid, false, true,  '2026-01-11 10:00+05', '2026-01-12 10:00+05', '2026-01-12 10:00+05', 'sayt'),
  ('d7800000-0000-0000-0000-000000000003'::uuid, 'L3-stale','Yangi',   0,    '78000000-0000-0000-0000-000000000001'::uuid, false, false, '2026-01-12 10:00+05', NULL, now() - interval '20 days', 'sayt'),
  ('d7800000-0000-0000-0000-000000000004'::uuid, 'L4-nores','Yangi',   0,    NULL,                                          false, false, '2026-01-12 11:00+05', NULL, now(), NULL)
) AS v(id, name, stage, price, resp, won, lost, created, closed, changed, src);
INSERT INTO public.crm_leads (id, name, pipeline_id, stage_id, price, is_won, is_lost, created_at, stage_changed_at)
VALUES ('d7800000-0000-0000-0000-000000000005', 'L5-p2', 'a7800000-0000-0000-0000-000000000002', 'b7800000-0000-0000-0000-000000000009', 0, false, false, '2026-01-11 09:00+05', now());

INSERT INTO public.crm_tasks (id, lead_id, text, kind, due_date, is_done, done_at, assignee_id) VALUES
  ('e7800000-0000-0000-0000-000000000001', 'd7800000-0000-0000-0000-000000000001', 'vaqtida', 'call', '2026-01-11 12:00+05', true,  '2026-01-11 10:00+05', '78000000-0000-0000-0000-000000000001'),
  ('e7800000-0000-0000-0000-000000000002', 'd7800000-0000-0000-0000-000000000001', 'kech',    'call', '2026-01-10 12:00+05', true,  '2026-01-11 11:00+05', '78000000-0000-0000-0000-000000000001'),
  ('e7800000-0000-0000-0000-000000000003', 'd7800000-0000-0000-0000-000000000003', 'ochiq',   'call', now() - interval '1 day', false, NULL,           '78000000-0000-0000-0000-000000000001');

INSERT INTO public.crm_calls (uuid, direction, phone, staff_id, lead_id, started_at, duration, talk_time) VALUES
  ('c78-1', 'in',  '+998900000781', '78000000-0000-0000-0000-000000000001', 'd7800000-0000-0000-0000-000000000001', '2026-01-10 09:00+05', 20, 0),
  ('c78-2', 'out', '+998900000781', '78000000-0000-0000-0000-000000000001', 'd7800000-0000-0000-0000-000000000001', '2026-01-10 10:00+05', 70, 60),
  ('c78-0', 'out', '+998900000782', '78000000-0000-0000-0000-000000000001', 'd7800000-0000-0000-0000-000000000002', '2026-01-11 08:00+05', 10, 0),
  ('c78-3', 'in',  '+998900000782', '78000000-0000-0000-0000-000000000001', 'd7800000-0000-0000-0000-000000000002', '2026-01-11 09:00+05', 15, 0),
  ('c78-4', 'in',  '+998900000783', NULL, NULL, '2026-01-11 10:00+05', 30, 25),
  ('c78-5', 'in',  '+998900000784', NULL, NULL, now() - interval '1 hour', 10, 0);
SET session_replication_role = origin;

-- The test role can't read crm_pipelines (no sotuv-crmn) — keep Umumiy's id for TEST 4
SELECT set_config('t78.umumiy', id::text, false) FROM public.crm_pipelines WHERE name = 'Umumiy';
GRANT USAGE ON SCHEMA public TO authenticated;
SET ROLE authenticated;

-- TEST 1: no dashboard permission → refused
SELECT set_config('request.jwt.claim.sub', '78000000-0000-0000-0000-000000000002', false);
DO $$ BEGIN
  BEGIN
    PERFORM public.sales_dashboard('2026-01-10', '2026-01-12');
    RAISE EXCEPTION 'TEST 1 FAILED: outsider read the dashboard';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'TEST 1 ok: guarded';
END $$;

SELECT set_config('request.jwt.claim.sub', '78000000-0000-0000-0000-000000000001', false);

-- TEST 2: KPIs, previous period, daily (dashboard user WITHOUT sotuv-crmn still sees numbers)
DO $$ DECLARE d jsonb := public.sales_dashboard('2026-01-10', '2026-01-12'); BEGIN
  IF (d->'kpi'->>'new')::int <> 5 THEN RAISE EXCEPTION 'TEST 2 FAILED: new = % (want 5)', d->'kpi'->>'new'; END IF;
  IF (d->'kpi'->>'won')::int <> 1 OR (d->'kpi'->>'lost')::int <> 1 THEN RAISE EXCEPTION 'TEST 2 FAILED: won/lost %', d->'kpi'; END IF;
  IF (d->'kpi'->>'conversion')::numeric <> 50.0 THEN RAISE EXCEPTION 'TEST 2 FAILED: conversion %', d->'kpi'->>'conversion'; END IF;
  IF (d->'kpi'->>'won_sum')::numeric <> 1000 THEN RAISE EXCEPTION 'TEST 2 FAILED: won_sum %', d->'kpi'->>'won_sum'; END IF;
  IF (d->'kpi_prev'->>'new')::int <> 1 OR (d->'kpi_prev'->>'won')::int <> 1 THEN RAISE EXCEPTION 'TEST 2 FAILED: prev %', d->'kpi_prev'; END IF;
  IF jsonb_array_length(d->'daily') <> 3 THEN RAISE EXCEPTION 'TEST 2 FAILED: daily length %', jsonb_array_length(d->'daily'); END IF;
  IF (d->'daily'->0->>'day') <> '2026-01-10' OR (d->'daily'->0->>'new')::int <> 1 THEN RAISE EXCEPTION 'TEST 2 FAILED: daily[0] %', d->'daily'->0; END IF;
  IF (d->'daily'->1->>'won')::int <> 1 THEN RAISE EXCEPTION 'TEST 2 FAILED: daily[1] %', d->'daily'->1; END IF;
  RAISE NOTICE 'TEST 2 ok: kpi';
END $$;

-- TEST 3: seller row — tasks on time / late / overdue, calls; a NULL-owner bitim doesn't add a row
DO $$ DECLARE d jsonb := public.sales_dashboard('2026-01-10', '2026-01-12'); s jsonb; BEGIN
  IF jsonb_array_length(d->'sellers') <> 1 THEN RAISE EXCEPTION 'TEST 3 FAILED: sellers %', d->'sellers'; END IF;
  s := d->'sellers'->0;
  IF s->>'full_name' <> 'Sotuvchi78' THEN RAISE EXCEPTION 'TEST 3 FAILED: name %', s->>'full_name'; END IF;
  IF (s->>'tasks_done')::int <> 2 OR (s->>'tasks_on_time')::int <> 1 OR (s->>'tasks_overdue_open')::int <> 1 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: tasks %', s; END IF;
  IF (s->>'won')::int <> 1 OR (s->>'lost')::int <> 1 OR (s->>'conversion')::numeric <> 50.0 OR (s->>'open')::int <> 1 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: deals %', s; END IF;
  IF (s->>'calls_in')::int <> 2 OR (s->>'calls_out')::int <> 2 OR (s->>'calls_missed')::int <> 2 OR (s->>'talk_sec')::int <> 60 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: calls %', s; END IF;
  RAISE NOTICE 'TEST 3 ok: seller';
END $$;

-- TEST 4: pipeline filter — only Umumiy bitimlar; calls without a bitim drop out
DO $$ DECLARE d jsonb := public.sales_dashboard('2026-01-10', '2026-01-12', current_setting('t78.umumiy')::uuid); BEGIN
  IF (d->'kpi'->>'new')::int <> 4 THEN RAISE EXCEPTION 'TEST 4 FAILED: new %', d->'kpi'->>'new'; END IF;
  IF (d->'calls'->>'in')::int <> 2 THEN RAISE EXCEPTION 'TEST 4 FAILED: calls.in % (bitimsiz kirdi)', d->'calls'->>'in'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(d->'funnel') f WHERE f->>'pipeline' = 'P2-78') THEN RAISE EXCEPTION 'TEST 4 FAILED: P2 in funnel'; END IF;
  RAISE NOTICE 'TEST 4 ok: pipeline filter';
END $$;

-- TEST 5: calls — called back only by a LATER outgoing call; attention lists
DO $$ DECLARE d jsonb := public.sales_dashboard('2026-01-10', '2026-01-12'); BEGIN
  IF (d->'calls'->>'in')::int <> 3 OR (d->'calls'->>'out')::int <> 2 OR (d->'calls'->>'missed')::int <> 2 THEN RAISE EXCEPTION 'TEST 5 FAILED: calls %', d->'calls'; END IF;
  IF (d->'calls'->>'missed')::int <> 2 OR (d->'calls'->>'missed_called_back')::int <> 1 THEN RAISE EXCEPTION 'TEST 5 FAILED: callback %', d->'calls'; END IF;
  IF (d->'calls'->>'avg_talk_sec')::int <> 43 THEN RAISE EXCEPTION 'TEST 5 FAILED: avg %', d->'calls'->>'avg_talk_sec'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d->'attention'->'overdue_tasks') t WHERE t->>'text' = 'ochiq') THEN RAISE EXCEPTION 'TEST 5 FAILED: overdue'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d->'attention'->'stale_leads') t WHERE t->>'name' = 'L3-stale') THEN RAISE EXCEPTION 'TEST 5 FAILED: stale'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(d->'attention'->'stale_leads') t WHERE t->>'name' = 'L4-nores') THEN RAISE EXCEPTION 'TEST 5 FAILED: fresh lead stale'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(d->'attention'->'missed_unanswered')) <> 1
     OR d->'attention'->'missed_unanswered'->0->>'phone' <> '+998900000784' THEN RAISE EXCEPTION 'TEST 5 FAILED: missed %', d->'attention'->'missed_unanswered'; END IF;
  RAISE NOTICE 'TEST 5 ok: calls + attention';
END $$;

-- TEST 6: empty period → zeros, null conversion, no error
DO $$ DECLARE d jsonb := public.sales_dashboard('2025-03-01', '2025-03-02'); BEGIN
  IF (d->'kpi'->>'new')::int <> 0 OR d->'kpi'->'conversion' <> 'null'::jsonb THEN RAISE EXCEPTION 'TEST 6 FAILED: %', d->'kpi'; END IF;
  IF jsonb_array_length(d->'daily') <> 2 OR (d->'calls'->>'in')::int <> 0 THEN RAISE EXCEPTION 'TEST 6 FAILED: daily/calls'; END IF;
  RAISE NOTICE 'TEST 6 ok: empty period';
END $$;
RESET ROLE;
