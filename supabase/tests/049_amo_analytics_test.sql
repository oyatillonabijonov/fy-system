-- Behavioural tests for migration 049 (AmoCRM analytics tables + amo_dashboard()).
-- Run against a THROWAWAY database, never prod (see CLAUDE.md "Tests"):
--
--   docker cp supabase/tests/049_amo_analytics_test.sql fy-test:/tmp/t.sql
--   docker exec fy-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql
--
-- Fixtures live in pipeline 990001 and in the year 2030, so they don't mix with
-- anything a sync already wrote to the stand. Every block RAISEs on failure.
\set ON_ERROR_STOP on

-- ─── FIXTURES ────────────────────────────────────────────────────────────────
INSERT INTO public.amo_pipelines (id, name, sort) VALUES (990001, 'Test voronka', 1);
INSERT INTO public.amo_statuses (pipeline_id, id, name, sort, kind) VALUES
  (990001, 1, 'Yangi', 10, 'open'),
  (990001, 142, 'Yutildi', 100, 'won'),
  (990001, 143, 'Yo''qotildi', 110, 'lost');
INSERT INTO public.amo_users (id, name) VALUES (990101, 'Test Menejer');

-- Period under test: 2030-01-01 .. 2030-02-01 (previous period: Dec 2029).
INSERT INTO public.amo_leads (id, pipeline_id, status_id, responsible_user_id, created_at, updated_at, closed_at, loss_reason) VALUES
  -- 2 organic wins in the period, 2 days apart → median cycle 3 days
  (990201, 990001, 142, 990101, '2030-01-02 10:00+05', '2030-01-05 10:00+05', '2030-01-05 10:00+05', NULL),
  (990202, 990001, 142, 990101, '2030-01-03 10:00+05', '2030-01-06 10:00+05', '2030-01-06 10:07+05', NULL),
  -- 1 organic loss with a reason
  (990203, 990001, 143, 990101, '2030-01-04 10:00+05', '2030-01-08 10:00+05', '2030-01-08 11:00+05', 'Qimmat'),
  -- 1 win in the previous period
  (990204, 990001, 142, 990101, '2029-12-10 10:00+05', '2029-12-12 10:00+05', '2029-12-12 10:00+05', NULL);
-- 12 "wins" closed in the same minute = bulk clean-up, must not count as sales
INSERT INTO public.amo_leads (id, pipeline_id, status_id, responsible_user_id, created_at, updated_at, closed_at)
SELECT 990300 + g, 990001, 142, 990101, '2029-06-01 10:00+05', '2030-01-20 09:00+05', ('2030-01-20 09:00:' || lpad(g::text, 2, '0') || '+05')::timestamptz
FROM generate_series(1, 12) g;
-- Open leads: one stale (no task), one fresh with an overdue task
INSERT INTO public.amo_leads (id, pipeline_id, status_id, responsible_user_id, created_at, updated_at, closed_at) VALUES
  (990401, 990001, 1, 990101, '2030-01-10 10:00+05', now() - interval '30 days', NULL),
  (990402, 990001, 1, 990101, '2030-01-11 10:00+05', now(), NULL);
INSERT INTO public.amo_tasks (id, lead_id, responsible_user_id, complete_till) VALUES
  (990501, 990402, 990101, now() - interval '1 day');

-- Revenue fixture: one event, one participant, two payments in the period
INSERT INTO public.events (id, name) VALUES ('49000000-0000-0000-0000-00000000e001', 'Test tadbir');
INSERT INTO public.event_participants (id, event_id, full_name, price)
VALUES ('49000000-0000-0000-0000-00000000a001', '49000000-0000-0000-0000-00000000e001', 'Test Ishtirokchi', 1000000);
INSERT INTO public.payments (participant_id, amount, method, paid_at) VALUES
  ('49000000-0000-0000-0000-00000000a001', 300000, 'naqd',  '2030-01-15 12:00+05'),
  ('49000000-0000-0000-0000-00000000a001', 200000, 'karta', '2030-01-16 12:00+05');

-- ─── TEST 1: KPIs ────────────────────────────────────────────────────────────
DO $$
DECLARE k jsonb := public.amo_dashboard('2030-01-01 00:00+05', '2030-02-01 00:00+05', 990001)->'kpi';
BEGIN
  IF (k->>'won')::int <> 2 THEN RAISE EXCEPTION 'TEST 1 FAILED: won = % (want 2, bulk excluded)', k->>'won'; END IF;
  IF (k->>'bulk_closed')::int <> 12 THEN RAISE EXCEPTION 'TEST 1 FAILED: bulk_closed = % (want 12)', k->>'bulk_closed'; END IF;
  IF (k->>'lost')::int <> 1 THEN RAISE EXCEPTION 'TEST 1 FAILED: lost = %', k->>'lost'; END IF;
  IF (k->>'prev_won')::int <> 1 THEN RAISE EXCEPTION 'TEST 1 FAILED: prev_won = %', k->>'prev_won'; END IF;
  IF (k->>'new_leads')::int <> 5 THEN RAISE EXCEPTION 'TEST 1 FAILED: new_leads = % (want 5)', k->>'new_leads'; END IF;
  IF (k->>'active')::int <> 2 THEN RAISE EXCEPTION 'TEST 1 FAILED: active = %', k->>'active'; END IF;
  IF (k->>'stale')::int <> 1 THEN RAISE EXCEPTION 'TEST 1 FAILED: stale = %', k->>'stale'; END IF;
  IF round((k->>'cycle_days')::numeric, 2) <> 3.00 THEN RAISE EXCEPTION 'TEST 1 FAILED: cycle_days = %', k->>'cycle_days'; END IF;
  IF (k->>'revenue')::numeric <> 500000 OR (k->>'payers')::int <> 1 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: revenue = %, payers = %', k->>'revenue', k->>'payers'; END IF;
  RAISE NOTICE 'TEST 1 ok: KPIs (bulk closes excluded, revenue from payments)';
END $$;

-- ─── TEST 2: tasks, losses, managers, funnel, daily ─────────────────────────
DO $$
DECLARE d jsonb := public.amo_dashboard('2030-01-01 00:00+05', '2030-02-01 00:00+05', 990001);
BEGIN
  IF (d->'tasks'->>'overdue')::int <> 1 OR (d->'tasks'->>'no_task')::int <> 1 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: tasks = %', d->'tasks'; END IF;
  IF d->'losses'->0->>'reason' <> 'Qimmat' THEN RAISE EXCEPTION 'TEST 2 FAILED: losses = %', d->'losses'; END IF;
  IF (d->'managers'->0->>'won')::int <> 2 THEN RAISE EXCEPTION 'TEST 2 FAILED: managers = %', d->'managers'; END IF;
  IF (SELECT (x->>'count')::int FROM jsonb_array_elements(d->'funnel') x WHERE x->>'kind' = 'won') <> 2 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: funnel won = %', d->'funnel'; END IF;
  IF jsonb_array_length(d->'daily') <> 31 THEN RAISE EXCEPTION 'TEST 2 FAILED: daily has % days', jsonb_array_length(d->'daily'); END IF;
  IF (SELECT sum((x->>'won')::int) FROM jsonb_array_elements(d->'daily') x) <> 2 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: daily wins = %', (SELECT sum((x->>'won')::int) FROM jsonb_array_elements(d->'daily') x); END IF;
  IF (d->'risky'->0->>'id')::bigint <> 990401 THEN RAISE EXCEPTION 'TEST 2 FAILED: risky = %', d->'risky'; END IF;
  RAISE NOTICE 'TEST 2 ok: tasks, losses, managers, funnel, daily, risky';
END $$;

-- ─── TEST 3: RLS — only users with the dashboard module read the tables ──────
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('49000000-0000-0000-0000-000000000001', 'dash@fy.uz', '{"full_name":"Dash","role":"xodim"}'::jsonb),
  ('49000000-0000-0000-0000-000000000002', 'nodash@fy.uz', '{"full_name":"NoDash","role":"xodim"}'::jsonb);
INSERT INTO public.user_permissions (user_id, module, can_view, can_edit, can_delete)
VALUES ('49000000-0000-0000-0000-000000000001', 'dashboard', true, false, false);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '49000000-0000-0000-0000-000000000001', false);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.amo_leads WHERE pipeline_id = 990001) = 0 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: dashboard user sees no leads'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub', '49000000-0000-0000-0000-000000000002', false);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.amo_leads) <> 0 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: user without dashboard sees leads'; END IF;
  IF (public.amo_dashboard('2030-01-01 00:00+05', '2030-02-01 00:00+05', 990001)->'kpi'->>'won')::int <> 0 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: amo_dashboard leaks to user without dashboard'; END IF;
  RAISE NOTICE 'TEST 3 ok: RLS limits amo_* to the dashboard module';
END $$;
RESET ROLE;

SELECT '049 amo analytics: all tests passed' AS result;
