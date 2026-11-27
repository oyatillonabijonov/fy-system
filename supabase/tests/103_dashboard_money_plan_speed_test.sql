-- Behavioural tests for migration 103 (Dashboard: money from Moliya, plan, tasks, speed to lead, stage
-- conversion). THROWAWAY DB only (recipe: CLAUDE.md §5).
\set ON_ERROR_STOP on

-- staff logins: the shared helper (112 — the auth trigger no longer trusts metadata)
\ir _helpers.sql
DO $staff$ BEGIN
  PERFORM pg_temp.make_staff('10200000-0000-0000-0000-000000000001', 'boss102@fy.uz', 'Boss102', 'xodim');
  PERFORM pg_temp.make_staff('10200000-0000-0000-0000-000000000002', 'fin102@fy.uz', 'Fin102', 'xodim');
  PERFORM pg_temp.make_staff('10200000-0000-0000-0000-000000000003', 'a102@fy.uz', 'SellerA102', 'xodim');
  PERFORM pg_temp.make_staff('10200000-0000-0000-0000-000000000004', 'b102@fy.uz', 'SellerB102', 'xodim');
END $staff$;
INSERT INTO public.user_permissions (user_id, module, can_view) VALUES
  ('10200000-0000-0000-0000-000000000001', 'dashboard', true),
  ('10200000-0000-0000-0000-000000000002', 'dashboard', true),
  ('10200000-0000-0000-0000-000000000002', 'tadbirlar-moliya', true);

SET session_replication_role = replica;   -- fixtures with their own dates and money, no triggers
INSERT INTO public.events (id, name, date, total_value, seats_plan) VALUES
  ('e1020000-0000-0000-0000-000000000001', 'E102', ((now() AT TIME ZONE 'Asia/Tashkent')::date + 10)::timestamp AT TIME ZONE 'Asia/Tashkent', 10000000, 10),
  ('e1020000-0000-0000-0000-000000000002', 'E102 boshqa', now() + interval '30 days', 0, NULL);
INSERT INTO public.crm_pipelines (id, name, sort_order, event_id) VALUES
  ('a1020000-0000-0000-0000-000000000001', 'P102', 70, 'e1020000-0000-0000-0000-000000000001'),
  ('a1020000-0000-0000-0000-000000000002', 'P102 tadbirsiz', 71, NULL);
INSERT INTO public.crm_stages (id, pipeline_id, name, color, sort_order, is_won, is_lost) VALUES
  ('b1020000-0000-0000-0000-000000000001', 'a1020000-0000-0000-0000-000000000001', 'S1', '#378ADD', 0, false, false),
  ('b1020000-0000-0000-0000-000000000002', 'a1020000-0000-0000-0000-000000000001', 'S2', '#378ADD', 1, false, false),
  ('b1020000-0000-0000-0000-000000000003', 'a1020000-0000-0000-0000-000000000001', 'S3', '#378ADD', 2, false, false),
  ('b1020000-0000-0000-0000-000000000004', 'a1020000-0000-0000-0000-000000000001', 'W',  '#378ADD', 3, true,  false),
  ('b1020000-0000-0000-0000-000000000005', 'a1020000-0000-0000-0000-000000000001', 'L',  '#378ADD', 4, false, true),
  ('b1020000-0000-0000-0000-000000000006', 'a1020000-0000-0000-0000-000000000002', 'T1', '#378ADD', 0, false, false);
INSERT INTO public.clients (id, full_name, phone) VALUES
  ('c1020000-0000-0000-0000-000000000001', 'C102 bir', '+998900010201'),
  ('c1020000-0000-0000-0000-000000000002', 'C102 ikki', '+998900010202');
-- 1 stays in S1 (overdue task, called an hour after the form) · 2 jumped S1 → S3 (task today, never called)
-- 3 S1 → S2 → lost · 4 hand-made, won · 5 from a call, no task · 6 another voronka, no task
INSERT INTO public.crm_leads (id, name, pipeline_id, stage_id, price, responsible_user_id, created_by, source, client_id, is_won, is_lost, created_at, closed_at, stage_changed_at) VALUES
  ('d1020000-0000-0000-0000-000000000001', 'L102-1', 'a1020000-0000-0000-0000-000000000001', 'b1020000-0000-0000-0000-000000000001', 0,   '10200000-0000-0000-0000-000000000003', NULL, 'sayt', 'c1020000-0000-0000-0000-000000000001', false, false, now() - interval '2 hours', NULL, now()),
  ('d1020000-0000-0000-0000-000000000002', 'L102-2', 'a1020000-0000-0000-0000-000000000001', 'b1020000-0000-0000-0000-000000000003', 0,   '10200000-0000-0000-0000-000000000003', NULL, 'sayt', 'c1020000-0000-0000-0000-000000000002', false, false, now() - interval '2 hours', NULL, now()),
  ('d1020000-0000-0000-0000-000000000003', 'L102-3', 'a1020000-0000-0000-0000-000000000001', 'b1020000-0000-0000-0000-000000000005', 0,   '10200000-0000-0000-0000-000000000003', NULL, 'meta', NULL, false, true,  now() - interval '2 hours', now(), now()),
  ('d1020000-0000-0000-0000-000000000004', 'L102-4', 'a1020000-0000-0000-0000-000000000001', 'b1020000-0000-0000-0000-000000000004', 999, '10200000-0000-0000-0000-000000000003', '10200000-0000-0000-0000-000000000003', 'manual', NULL, true,  false, now() - interval '2 hours', now(), now()),
  ('d1020000-0000-0000-0000-000000000005', 'L102-5', 'a1020000-0000-0000-0000-000000000001', 'b1020000-0000-0000-0000-000000000001', 0,   NULL, NULL, 'call', NULL, false, false, now() - interval '2 hours', NULL, now()),
  ('d1020000-0000-0000-0000-000000000006', 'L102-6', 'a1020000-0000-0000-0000-000000000002', 'b1020000-0000-0000-0000-000000000006', 0,   NULL, NULL, 'sayt', NULL, false, false, now() - interval '2 hours', NULL, now());
INSERT INTO public.crm_notes (lead_id, kind, text, meta, created_at) VALUES
  ('d1020000-0000-0000-0000-000000000002', 'stage', 'S1 → S3', '{"from":"b1020000-0000-0000-0000-000000000001","to":"b1020000-0000-0000-0000-000000000003"}', now() - interval '1 hour'),
  ('d1020000-0000-0000-0000-000000000003', 'stage', 'S1 → S2', '{"from":"b1020000-0000-0000-0000-000000000001","to":"b1020000-0000-0000-0000-000000000002"}', now() - interval '90 minutes'),
  ('d1020000-0000-0000-0000-000000000003', 'stage', 'S2 → L',  '{"from":"b1020000-0000-0000-0000-000000000002","to":"b1020000-0000-0000-0000-000000000005"}', now() - interval '30 minutes'),
  ('d1020000-0000-0000-0000-000000000004', 'stage', 'S1 → W',  '{"from":"b1020000-0000-0000-0000-000000000001","to":"b1020000-0000-0000-0000-000000000004"}', now() - interval '30 minutes');
INSERT INTO public.crm_tasks (lead_id, text, kind, due_date, is_done, assignee_id) VALUES
  ('d1020000-0000-0000-0000-000000000001', 'kechikkan', 'call', now() - interval '1 day', false, '10200000-0000-0000-0000-000000000003'),
  ('d1020000-0000-0000-0000-000000000001', 'keyingi',   'call', now() + interval '20 days', false, '10200000-0000-0000-0000-000000000003'),
  ('d1020000-0000-0000-0000-000000000002', 'bugun',     'call', ((now() AT TIME ZONE 'Asia/Tashkent')::date + time '23:59') AT TIME ZONE 'Asia/Tashkent', false, '10200000-0000-0000-0000-000000000003'),
  ('d1020000-0000-0000-0000-000000000005', 'bajarilgan', 'call', now() - interval '1 day', true, NULL);
-- the first call back is tied to the client, not to the bitim
INSERT INTO public.crm_calls (uuid, direction, phone, client_id, lead_id, started_at, duration, talk_time) VALUES
  ('c102-out',   'out', '+998900010201', 'c1020000-0000-0000-0000-000000000001', NULL, now() - interval '1 hour', 30, 20),
  ('c102-later', 'out', '+998900010201', 'c1020000-0000-0000-0000-000000000001', NULL, now() - interval '10 minutes', 30, 20);
-- seats: A sold 1 (half paid), B sold 2 without any bitim (one paid, one not) + a no-show who keeps 200 000;
-- an old unpaid seat of A; a seat of another event
INSERT INTO public.event_participants (id, event_id, full_name, price, paid, seller_id, created_at, no_show_at) VALUES
  ('f1020000-0000-0000-0000-000000000001', 'e1020000-0000-0000-0000-000000000001', 'P1', 1500000, 500000,  '10200000-0000-0000-0000-000000000003', now() - interval '1 hour', NULL),
  ('f1020000-0000-0000-0000-000000000002', 'e1020000-0000-0000-0000-000000000001', 'P2', 1000000, 1000000, '10200000-0000-0000-0000-000000000004', now() - interval '1 hour', NULL),
  ('f1020000-0000-0000-0000-000000000003', 'e1020000-0000-0000-0000-000000000001', 'P3', 1000000, 0,       '10200000-0000-0000-0000-000000000004', now() - interval '1 hour', NULL),
  ('f1020000-0000-0000-0000-000000000004', 'e1020000-0000-0000-0000-000000000001', 'P4', 200000,  200000,  '10200000-0000-0000-0000-000000000004', now() - interval '1 hour', now()),
  ('f1020000-0000-0000-0000-000000000005', 'e1020000-0000-0000-0000-000000000001', 'P5', 2000000, 0,       '10200000-0000-0000-0000-000000000003', now() - interval '10 days', NULL),
  ('f1020000-0000-0000-0000-000000000006', 'e1020000-0000-0000-0000-000000000002', 'P6', 5000000, 0,       NULL, now() - interval '1 hour', NULL);
INSERT INTO public.payments (participant_id, amount, method, kind, paid_at, voided_at, void_reason) VALUES
  ('f1020000-0000-0000-0000-000000000001', 500000,  'naqd', 'payment', now() - interval '1 hour', NULL, NULL),
  ('f1020000-0000-0000-0000-000000000002', 1000000, 'naqd', 'payment', now() - interval '1 hour', NULL, NULL),
  ('f1020000-0000-0000-0000-000000000002', 300000,  'naqd', 'payment', now() - interval '1 hour', now(), 'xato'),
  ('f1020000-0000-0000-0000-000000000004', 200000,  'naqd', 'payment', now() - interval '1 hour', NULL, NULL);
SET session_replication_role = origin;

SELECT set_config('t102.p1', 'a1020000-0000-0000-0000-000000000001', false);
SELECT set_config('t102.p2', 'a1020000-0000-0000-0000-000000000002', false);
SELECT set_config('t102.boss', '10200000-0000-0000-0000-000000000001', false);
SELECT set_config('t102.fin', '10200000-0000-0000-0000-000000000002', false);

-- TEST 1: working minutes — a night lead counts from 09:00, Sunday is skipped, Saturday is a working day
DO $$ BEGIN
  IF public.business_minutes('2026-11-17 00:36+05', '2026-11-17 09:10+05') <> 10 THEN RAISE EXCEPTION 'TEST 1 FAILED: night lead'; END IF;
  IF public.business_minutes('2026-11-14 17:50+05', '2026-11-16 09:05+05') <> 15 THEN RAISE EXCEPTION 'TEST 1 FAILED: Sat → Mon'; END IF;
  IF public.business_minutes('2026-11-17 10:00+05', '2026-11-17 10:20+05') <> 20 THEN RAISE EXCEPTION 'TEST 1 FAILED: same day'; END IF;
  IF public.business_minutes('2026-11-17 20:00+05', '2026-11-17 23:00+05') <> 0 THEN RAISE EXCEPTION 'TEST 1 FAILED: evening'; END IF;
  IF public.business_minutes('2026-11-17 10:00+05', NULL) IS NOT NULL THEN RAISE EXCEPTION 'TEST 1 FAILED: no call must be NULL'; END IF;
  RAISE NOTICE 'TEST 1 ok: business_minutes';
END $$;

GRANT USAGE ON SCHEMA public TO authenticated;
SET ROLE authenticated;

-- TEST 2: money comes from Moliya, for the voronka's event (finance viewer)
SELECT set_config('request.jwt.claim.sub', current_setting('t102.fin'), false);
DO $$ DECLARE d jsonb := public.sales_dashboard(current_date - 2, current_date + 1, current_setting('t102.p1')::uuid); m jsonb := d->'sales'->'money'; BEGIN
  IF (d->'sales'->>'seats')::int IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'TEST 2 FAILED: seats % (no-show and old seat must be out)', d->'sales'->>'seats'; END IF;
  IF (m->>'agreed')::numeric IS DISTINCT FROM 3700000 THEN RAISE EXCEPTION 'TEST 2 FAILED: agreed %', m->>'agreed'; END IF;
  IF (m->>'collected')::numeric IS DISTINCT FROM 1700000 THEN RAISE EXCEPTION 'TEST 2 FAILED: collected % (voided payment must be out)', m->>'collected'; END IF;
  IF (m->>'debt')::numeric IS DISTINCT FROM 4000000 THEN RAISE EXCEPTION 'TEST 2 FAILED: debt %', m->>'debt'; END IF;
  -- the period's own seats: one paid in full, one in part, one not at all (the old unpaid seat and the no-show are out)
  IF (m->>'full')::int IS DISTINCT FROM 1 OR (m->>'partial')::int IS DISTINCT FROM 1 OR (m->>'unpaid')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: full % partial % unpaid %', m->>'full', m->>'partial', m->>'unpaid'; END IF;
  IF (m->>'paid')::numeric IS DISTINCT FROM 1700000 OR (m->>'owed')::numeric IS DISTINCT FROM 2000000 THEN RAISE EXCEPTION 'TEST 2 FAILED: paid % owed % (must add up to agreed)', m->>'paid', m->>'owed'; END IF;
  IF (SELECT sum((x->>'collected')::numeric) FROM jsonb_array_elements(d->'daily') x) IS DISTINCT FROM 1700000
     OR (SELECT sum((x->>'seats')::int) FROM jsonb_array_elements(d->'daily') x) IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'TEST 2 FAILED: daily money %', d->'daily'; END IF;
  IF (d->'kpi'->>'new_lost')::int IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'TEST 2 FAILED: new_lost'; END IF;
  IF (d->'sales'->>'linked')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'TEST 2 FAILED: linked'; END IF;
  -- the old numbers are untouched
  IF (d->'kpi'->>'new')::int <> 5 OR (d->'kpi'->>'won')::int <> 1 OR (d->'kpi'->>'lost')::int <> 1 OR (d->'kpi'->>'won_sum')::numeric <> 999
     OR (d->'kpi'->>'conversion')::numeric <> 50 THEN RAISE EXCEPTION 'TEST 2 FAILED: old kpi changed %', d->'kpi'; END IF;
  IF (d->'kpi'->>'new_won')::int IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'TEST 2 FAILED: new_won'; END IF;
  RAISE NOTICE 'TEST 2 ok: sales money';
END $$;

-- TEST 3: a seller who sold seats without a bitim is in the table, with Moliya's numbers
DO $$ DECLARE d jsonb := public.sales_dashboard(current_date - 2, current_date + 1, current_setting('t102.p1')::uuid); b jsonb; a jsonb; BEGIN
  SELECT s INTO b FROM jsonb_array_elements(d->'sellers') s WHERE s->>'full_name' = 'SellerB102';
  SELECT s INTO a FROM jsonb_array_elements(d->'sellers') s WHERE s->>'full_name' = 'SellerA102';
  IF b IS NULL THEN RAISE EXCEPTION 'TEST 3 FAILED: seller without a bitim is missing'; END IF;
  IF (b->>'seats')::int IS DISTINCT FROM 2 OR (b->>'agreed')::numeric IS DISTINCT FROM 2200000 OR (b->>'collected')::numeric IS DISTINCT FROM 1200000 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: seller B %', b; END IF;
  IF (a->>'seats')::int IS DISTINCT FROM 1 OR (a->>'agreed')::numeric IS DISTINCT FROM 1500000 OR (a->>'won')::int <> 1 THEN RAISE EXCEPTION 'TEST 3 FAILED: seller A %', a; END IF;
  RAISE NOTICE 'TEST 3 ok: sellers from Moliya';
END $$;

-- TEST 4: plan against fact — 10 days left, 4 of 10 seats, 3 in the last week
DO $$ DECLARE d jsonb := public.sales_dashboard(current_date - 2, current_date + 1, current_setting('t102.p1')::uuid); p jsonb := d->'plan'->0; BEGIN
  IF jsonb_array_length(d->'plan') IS DISTINCT FROM 1 OR p->>'name' <> 'E102' THEN RAISE EXCEPTION 'TEST 4 FAILED: plan %', d->'plan'; END IF;
  IF (p->>'days_left')::int <> 10 OR (p->>'seats')::int <> 4 OR (p->>'seats_plan')::int <> 10 THEN RAISE EXCEPTION 'TEST 4 FAILED: %', p; END IF;
  IF (p->>'seats_need_per_day')::numeric <> 0.6 OR (p->>'seats_per_day')::numeric <> 0.4 OR (p->>'seats_forecast')::int <> 8 THEN RAISE EXCEPTION 'TEST 4 FAILED: pace %', p; END IF;
  IF (p->>'agreed')::numeric <> 5700000 OR (p->>'collected')::numeric <> 1700000 OR (p->>'agreed_need_per_day')::numeric <> 430000 THEN RAISE EXCEPTION 'TEST 4 FAILED: money %', p; END IF;
  RAISE NOTICE 'TEST 4 ok: plan';
END $$;

-- TEST 5: open bitimlar by their nearest open task; done tasks don't count; closed bitimlar aren't idle
DO $$ DECLARE d jsonb := public.sales_dashboard(current_date - 2, current_date + 1, current_setting('t102.p1')::uuid); t jsonb := d->'tasks'->'total'; s jsonb; BEGIN
  IF (t->>'overdue')::int IS DISTINCT FROM 1 OR (t->>'today')::int IS DISTINCT FROM 1 OR (t->>'idle')::int IS DISTINCT FROM 1
     OR (t->>'later')::int <> 0 OR (t->>'this_week')::int <> 0 OR (t->>'next_week')::int <> 0 THEN RAISE EXCEPTION 'TEST 5 FAILED: %', t; END IF;
  SELECT x INTO s FROM jsonb_array_elements(d->'tasks'->'by_seller') x WHERE x->>'full_name' = 'SellerA102';
  IF (s->>'overdue')::int IS DISTINCT FROM 1 OR (s->>'today')::int IS DISTINCT FROM 1 OR (s->>'idle')::int <> 0 THEN RAISE EXCEPTION 'TEST 5 FAILED: by seller %', s; END IF;
  IF (d->'attention'->'totals'->>'idle_leads')::int IS DISTINCT FROM 1 OR d->'attention'->'idle_leads'->0->>'name' <> 'L102-5' THEN
    RAISE EXCEPTION 'TEST 5 FAILED: idle list %', d->'attention'->'idle_leads'; END IF;
  IF (d->'attention'->'totals'->>'overdue_tasks')::int IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'TEST 5 FAILED: overdue total'; END IF;
  RAISE NOTICE 'TEST 5 ok: tasks';
END $$;

-- TEST 6: speed to lead — form leads only (not hand-made, not from a call), first outgoing call by client
DO $$ DECLARE d jsonb := public.sales_dashboard(current_date - 2, current_date + 1, current_setting('t102.p1')::uuid); s jsonb := d->'speed'; BEGIN
  IF (s->>'leads')::int IS DISTINCT FROM 3 OR (s->>'called')::int IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'TEST 6 FAILED: %', s; END IF;
  IF (s->>'waiting')::int IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'TEST 6 FAILED: waiting % (a lost bitim is not waiting)', s->>'waiting'; END IF;
  IF (s->>'median_min')::numeric IS DISTINCT FROM 60 OR (s->>'avg_min')::numeric IS DISTINCT FROM 60 THEN RAISE EXCEPTION 'TEST 6 FAILED: minutes %', s; END IF;
  IF (s->'by_seller'->0->>'full_name') <> 'SellerA102' OR (s->'by_seller'->0->>'waiting')::int <> 1 THEN RAISE EXCEPTION 'TEST 6 FAILED: by seller %', s->'by_seller'; END IF;
  RAISE NOTICE 'TEST 6 ok: speed to lead';
END $$;

-- TEST 7: stage conversion — a jump over a stage counts as passing it, lost stops where it was, won passes all
DO $$ DECLARE d jsonb := public.sales_dashboard(current_date - 2, current_date + 1, current_setting('t102.p1')::uuid); got text; BEGIN
  SELECT string_agg((x->>'name') || '=' || (x->>'reached'), ' ' ORDER BY o) INTO got FROM jsonb_array_elements(d->'stage_conv') WITH ORDINALITY q(x, o);
  IF got IS DISTINCT FROM 'S1=5 S2=3 S3=2 W=1' THEN RAISE EXCEPTION 'TEST 7 FAILED: %', got; END IF;
  IF (d->'stage_conv'->1->>'avg_days') IS NULL THEN RAISE EXCEPTION 'TEST 7 FAILED: no avg_days'; END IF;
  RAISE NOTICE 'TEST 7 ok: stage conversion';
END $$;

-- TEST 8: a voronka with no event has no money of its own; no voronka = every event
DO $$ DECLARE d jsonb := public.sales_dashboard(current_date - 2, current_date + 1, current_setting('t102.p2')::uuid);
              a jsonb := public.sales_dashboard(current_date - 2, current_date + 1); BEGIN
  IF (d->'sales'->>'linked')::boolean IS DISTINCT FROM false OR (d->'sales'->>'seats')::int <> 0 OR jsonb_array_length(d->'plan') <> 0 THEN
    RAISE EXCEPTION 'TEST 8 FAILED: unlinked voronka %', d->'sales'; END IF;
  IF (d->'tasks'->'total'->>'idle')::int IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'TEST 8 FAILED: voronka filter on tasks'; END IF;
  IF (a->'sales'->>'seats')::int < 4 OR (a->'sales'->'money'->>'agreed')::numeric < 8700000 THEN RAISE EXCEPTION 'TEST 8 FAILED: all events %', a->'sales'; END IF;
  RAISE NOTICE 'TEST 8 ok: scope';
END $$;

-- TEST 9: without the Moliya right — counts stay, every so'm is hidden
SELECT set_config('request.jwt.claim.sub', current_setting('t102.boss'), false);
DO $$ DECLARE d jsonb := public.sales_dashboard(current_date - 2, current_date + 1, current_setting('t102.p1')::uuid); b jsonb; BEGIN
  IF (d->'sales'->>'seats')::int IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'TEST 9 FAILED: seats hidden'; END IF;
  IF jsonb_typeof(d->'sales'->'money') IS DISTINCT FROM 'null' THEN RAISE EXCEPTION 'TEST 9 FAILED: money leaked %', d->'sales'->'money'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(d->'daily') x WHERE x->>'collected' IS NOT NULL) THEN RAISE EXCEPTION 'TEST 9 FAILED: daily money leaked'; END IF;
  SELECT s INTO b FROM jsonb_array_elements(d->'sellers') s WHERE s->>'full_name' = 'SellerB102';
  IF (b->>'seats')::int IS DISTINCT FROM 2 OR b->>'agreed' IS NOT NULL OR b->>'collected' IS NOT NULL THEN RAISE EXCEPTION 'TEST 9 FAILED: seller money leaked %', b; END IF;
  IF d->'plan'->0->>'agreed' IS NOT NULL OR d->'plan'->0->>'revenue_plan' IS NOT NULL OR d->'plan'->0->>'collected' IS NOT NULL
     OR d->'plan'->0->>'agreed_need_per_day' IS NOT NULL   -- no plan in sight is "unknown", never "0 needed"
     OR (d->'plan'->0->>'seats')::int <> 4 THEN RAISE EXCEPTION 'TEST 9 FAILED: plan money leaked %', d->'plan'->0; END IF;
  RAISE NOTICE 'TEST 9 ok: money needs the Moliya right';
END $$;
RESET ROLE;
