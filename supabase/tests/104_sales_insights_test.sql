-- Behavioural tests for migration 104 (sales_insights: quality, lost reasons, activity, by ad, sales cycle).
-- THROWAWAY DB only (recipe: CLAUDE.md §5).
\set ON_ERROR_STOP on

-- staff logins: the shared helper (112 — the auth trigger no longer trusts metadata)
\ir _helpers.sql
DO $staff$ BEGIN
  PERFORM pg_temp.make_staff('10400000-0000-0000-0000-000000000001', 'boss104@fy.uz', 'Boss104', 'xodim');
  PERFORM pg_temp.make_staff('10400000-0000-0000-0000-000000000002', 'fin104@fy.uz', 'Fin104', 'xodim');
  PERFORM pg_temp.make_staff('10400000-0000-0000-0000-000000000003', 's104@fy.uz', 'Seller104', 'xodim');
END $staff$;
INSERT INTO public.user_permissions (user_id, module, can_view) VALUES
  ('10400000-0000-0000-0000-000000000001', 'dashboard', true),
  ('10400000-0000-0000-0000-000000000002', 'dashboard', true),
  ('10400000-0000-0000-0000-000000000002', 'tadbirlar-moliya', true);

SET session_replication_role = replica;   -- fixtures with their own dates and money, no triggers
INSERT INTO public.events (id, name, date) VALUES ('e1040000-0000-0000-0000-000000000001', 'E104', now() + interval '10 days');
INSERT INTO public.crm_pipelines (id, name, sort_order, event_id) VALUES ('a1040000-0000-0000-0000-000000000001', 'P104', 80, 'e1040000-0000-0000-0000-000000000001');
INSERT INTO public.crm_stages (id, pipeline_id, name, color, sort_order, is_won, is_lost) VALUES
  ('b1040000-0000-0000-0000-000000000001', 'a1040000-0000-0000-0000-000000000001', 'S1', '#378ADD', 0, false, false),
  ('b1040000-0000-0000-0000-000000000002', 'a1040000-0000-0000-0000-000000000001', 'W',  '#378ADD', 1, true,  false),
  ('b1040000-0000-0000-0000-000000000003', 'a1040000-0000-0000-0000-000000000001', 'L',  '#378ADD', 2, false, true);
INSERT INTO public.clients (id, full_name, phone) VALUES ('c1040000-0000-0000-0000-000000000001', 'C104', '+998900010401');
-- 1 qualified (6), ad CR5, won; its client's seat was paid two days after the form · 2 qualified (5), CR5, lost for the price
-- 3 not qualified (2), CR7, open · 4 hand-made, no score, no ad, won six days later with no payment
INSERT INTO public.crm_leads (id, name, pipeline_id, stage_id, responsible_user_id, source, client_id, lead_score, qualified, attribution, loss_reason, is_won, is_lost, created_at, closed_at) VALUES
  ('d1040000-0000-0000-0000-000000000001', 'L104-1', 'a1040000-0000-0000-0000-000000000001', 'b1040000-0000-0000-0000-000000000002', '10400000-0000-0000-0000-000000000003', 'sayt', 'c1040000-0000-0000-0000-000000000001', 6, true,
     '{"utm_source":"fb","utm_campaign":"K1","utm_term":"A1","utm_content":"CR5"}', NULL, true, false, now() - interval '4 days', now() - interval '1 day'),
  ('d1040000-0000-0000-0000-000000000002', 'L104-2', 'a1040000-0000-0000-0000-000000000001', 'b1040000-0000-0000-0000-000000000003', '10400000-0000-0000-0000-000000000003', 'sayt', NULL, 5, true,
     '{"utm_source":"fb","utm_campaign":"K1","utm_term":"A1","utm_content":"CR5"}', 'Narx', false, true, now() - interval '1 day', now()),
  ('d1040000-0000-0000-0000-000000000003', 'L104-3', 'a1040000-0000-0000-0000-000000000001', 'b1040000-0000-0000-0000-000000000001', '10400000-0000-0000-0000-000000000003', 'meta', NULL, 2, false,
     '{"platform":"ig","campaign_name":"K1","adset_name":"A1","ad_name":"CR7"}', NULL, false, false, now() - interval '1 day', NULL),
  ('d1040000-0000-0000-0000-000000000004', 'L104-4', 'a1040000-0000-0000-0000-000000000001', 'b1040000-0000-0000-0000-000000000002', '10400000-0000-0000-0000-000000000003', 'manual', NULL, NULL, NULL,
     '{}', NULL, true, false, now() - interval '6 days', now());
INSERT INTO public.event_participants (id, event_id, contact_id, full_name, price, paid, created_at) VALUES
  ('f1040000-0000-0000-0000-000000000001', 'e1040000-0000-0000-0000-000000000001', 'c1040000-0000-0000-0000-000000000001', 'C104', 1500000, 500000, now() - interval '2 days');
INSERT INTO public.payments (participant_id, amount, method, kind, paid_at, voided_at, void_reason) VALUES
  ('f1040000-0000-0000-0000-000000000001', 500000, 'naqd', 'payment', now() - interval '2 days', NULL, NULL),
  ('f1040000-0000-0000-0000-000000000001', 100000, 'naqd', 'payment', now() - interval '3 days', now(), 'xato');
-- three calls at 10:15 Tashkent today: two out (one answered), one in
INSERT INTO public.crm_calls (uuid, direction, phone, lead_id, started_at, duration, talk_time)
SELECT u, dir, '+998900010401', 'd1040000-0000-0000-0000-000000000001', ((now() AT TIME ZONE 'Asia/Tashkent')::date + time '10:15') AT TIME ZONE 'Asia/Tashkent', 30, talk
FROM (VALUES ('c104-out-ok', 'out', 20), ('c104-out-no', 'out', 0), ('c104-in', 'in', 15)) v(u, dir, talk);
SET session_replication_role = origin;

SELECT set_config('t104.p', 'a1040000-0000-0000-0000-000000000001', false);
SELECT set_config('t104.boss', '10400000-0000-0000-0000-000000000001', false);
SELECT set_config('t104.fin', '10400000-0000-0000-0000-000000000002', false);

-- TEST 1: the new reasons are accepted when a bitim goes to the lost stage, anything else is still refused
DO $$ BEGIN
  UPDATE public.crm_leads SET stage_id = 'b1040000-0000-0000-0000-000000000003', loss_reason = 'Keyingi tadbirga' WHERE id = 'd1040000-0000-0000-0000-000000000003';
  UPDATE public.crm_leads SET stage_id = 'b1040000-0000-0000-0000-000000000001' WHERE id = 'd1040000-0000-0000-0000-000000000003';
  BEGIN
    UPDATE public.crm_leads SET stage_id = 'b1040000-0000-0000-0000-000000000003', loss_reason = 'shunchaki' WHERE id = 'd1040000-0000-0000-0000-000000000003';
    RAISE EXCEPTION 'TEST 1 FAILED: free text accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  RAISE NOTICE 'TEST 1 ok: loss reasons';
END $$;

GRANT USAGE ON SCHEMA public TO authenticated;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('t104.fin'), false);

-- TEST 2: quality — all → qualified → won, and per score (no score is its own row)
DO $$ DECLARE d jsonb := public.sales_insights(current_date - 8, current_date + 1, current_setting('t104.p')::uuid); q jsonb := d->'quality'; got text; BEGIN
  IF (q->>'leads')::int IS DISTINCT FROM 4 OR (q->>'scored')::int <> 3 OR (q->>'qualified')::int <> 2 OR (q->>'won')::int <> 2 OR (q->>'won_qualified')::int <> 1
     OR (q->>'threshold')::int <> 4 THEN RAISE EXCEPTION 'TEST 2 FAILED: %', q; END IF;
  SELECT string_agg(COALESCE(x->>'score', '-') || ':' || (x->>'leads') || '/' || (x->>'won'), ' ' ORDER BY o) INTO got FROM jsonb_array_elements(q->'by_score') WITH ORDINALITY t(x, o);
  IF got IS DISTINCT FROM '2:1/0 5:1/0 6:1/1 -:1/1' THEN RAISE EXCEPTION 'TEST 2 FAILED: by_score %', got; END IF;
  IF d->'lost_reasons' IS DISTINCT FROM '[{"count": 1, "reason": "Narx"}]'::jsonb THEN RAISE EXCEPTION 'TEST 2 FAILED: lost_reasons %', d->'lost_reasons'; END IF;
  RAISE NOTICE 'TEST 2 ok: quality and lost reasons';
END $$;

-- TEST 3: by ad — utm and Meta's own names land in the same columns; one seat a bitim; no ad = the bitim's own source
DO $$ DECLARE d jsonb := public.sales_insights(current_date - 8, current_date + 1, current_setting('t104.p')::uuid); a jsonb; BEGIN
  SELECT x INTO a FROM jsonb_array_elements(d->'by_ad') x WHERE x->>'creative' = 'CR5';
  IF a->>'source' <> 'fb' OR a->>'campaign' <> 'K1' OR a->>'adset' <> 'A1' OR (a->>'leads')::int <> 2 OR (a->>'qualified')::int <> 2 OR (a->>'won')::int <> 1
     OR (a->>'seats')::int <> 1 OR (a->>'agreed')::numeric <> 1500000 OR (a->>'paid')::numeric <> 500000 THEN RAISE EXCEPTION 'TEST 3 FAILED: CR5 %', a; END IF;
  SELECT x INTO a FROM jsonb_array_elements(d->'by_ad') x WHERE x->>'creative' = 'CR7';
  IF a->>'source' IS DISTINCT FROM 'ig' OR a->>'campaign' <> 'K1' OR (a->>'leads')::int <> 1 OR (a->>'seats')::int <> 0 THEN RAISE EXCEPTION 'TEST 3 FAILED: CR7 %', a; END IF;
  -- a bitim with no ad data keeps its own source (here: made by hand), with no campaign under it
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d->'by_ad') x WHERE x->>'source' = 'manual' AND x->>'campaign' IS NULL AND x->>'creative' IS NULL AND (x->>'leads')::int = 1) THEN
    RAISE EXCEPTION 'TEST 3 FAILED: no row for bitimlar without an ad %', d->'by_ad'; END IF;
  RAISE NOTICE 'TEST 3 ok: by ad';
END $$;

-- TEST 4: sales cycle — to the first live payment (2 days), or to the day it was won when nothing is paid (6 days)
DO $$ DECLARE d jsonb := public.sales_insights(current_date - 8, current_date + 1, current_setting('t104.p')::uuid); c jsonb := d->'cycle'; BEGIN
  IF (c->>'count')::int IS DISTINCT FROM 2 OR (c->>'median_days')::numeric <> 4.0 OR (c->>'avg_days')::numeric <> 4.0 THEN RAISE EXCEPTION 'TEST 4 FAILED: % (a voided payment must not count)', c; END IF;
  IF (c->>'d1_3')::int <> 1 OR (c->>'d4_7')::int <> 1 OR (c->>'lt1')::int <> 0 THEN RAISE EXCEPTION 'TEST 4 FAILED: buckets %', c; END IF;
  IF c->'by_seller'->0->>'full_name' <> 'Seller104' OR (c->'by_seller'->0->>'count')::int <> 2 OR jsonb_array_length(c->'by_source') <> 2 THEN RAISE EXCEPTION 'TEST 4 FAILED: breakdowns %', c; END IF;
  RAISE NOTICE 'TEST 4 ok: sales cycle';
END $$;

-- TEST 5: activity — by day adds up; by hour is Tashkent time; "connected" = an outgoing call that was answered
DO $$ DECLARE d jsonb := public.sales_insights(current_date - 8, current_date + 1, current_setting('t104.p')::uuid); h jsonb; BEGIN
  IF (SELECT sum((x->>'leads')::int) FROM jsonb_array_elements(d->'activity'->'by_day') x) IS DISTINCT FROM 4
     OR (SELECT sum((x->>'out')::int) FROM jsonb_array_elements(d->'activity'->'by_day') x) <> 2 THEN RAISE EXCEPTION 'TEST 5 FAILED: by_day %', d->'activity'->'by_day'; END IF;
  IF jsonb_array_length(d->'activity'->'by_hour') <> 24 THEN RAISE EXCEPTION 'TEST 5 FAILED: 24 hours'; END IF;
  h := d->'activity'->'by_hour'->10;
  IF (h->>'out')::int IS DISTINCT FROM 2 OR (h->>'connected')::int <> 1 OR (h->>'in')::int <> 1 THEN RAISE EXCEPTION 'TEST 5 FAILED: hour 10 %', h; END IF;
  RAISE NOTICE 'TEST 5 ok: activity';
END $$;

-- TEST 6: without the Moliya right the ad table keeps its counts and hides the money; no dashboard right = refused
SELECT set_config('request.jwt.claim.sub', current_setting('t104.boss'), false);
DO $$ DECLARE d jsonb := public.sales_insights(current_date - 8, current_date + 1, current_setting('t104.p')::uuid); a jsonb; BEGIN
  SELECT x INTO a FROM jsonb_array_elements(d->'by_ad') x WHERE x->>'creative' = 'CR5';
  IF (a->>'seats')::int IS DISTINCT FROM 1 OR a->>'agreed' IS NOT NULL OR a->>'paid' IS NOT NULL THEN RAISE EXCEPTION 'TEST 6 FAILED: money leaked %', a; END IF;
  RAISE NOTICE 'TEST 6 ok: money needs the Moliya right';
END $$;
SELECT set_config('request.jwt.claim.sub', '10400000-0000-0000-0000-000000000003', false);
DO $$ BEGIN
  PERFORM public.sales_insights(current_date - 8, current_date + 1);
  RAISE EXCEPTION 'TEST 7 FAILED: no dashboard right, still answered';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'TEST 7 ok: guarded';
END $$;
RESET ROLE;
