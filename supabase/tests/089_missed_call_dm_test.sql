-- Behavioural tests for migration 089 (missed call → private message). THROWAWAY DB only (recipe: CLAUDE.md §5).
\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.call(p_uuid text, p_dir text, p_phone text, p_ago interval, p_talk int DEFAULT 0) RETURNS void
LANGUAGE sql AS $$ INSERT INTO public.crm_calls (uuid, direction, phone, started_at, talk_time) VALUES (p_uuid, p_dir, p_phone, now() - p_ago, p_talk) $$;
CREATE OR REPLACE FUNCTION pg_temp.due(p_phone text) RETURNS integer
LANGUAGE sql AS $$ SELECT calls FROM public.missed_calls_dm() WHERE phone = p_phone $$;

DO $$
BEGIN
  -- a missed call is due at once (no 2-hour wait)
  PERFORM pg_temp.call('dm-a1', 'in', '+998910000001', interval '1 minute');
  IF pg_temp.due('+998910000001') IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'TEST 1 FAILED: not due at once'; END IF;

  -- answered → not a missed call
  PERFORM pg_temp.call('dm-b1', 'in', '+998910000002', interval '1 minute', 30);
  IF pg_temp.due('+998910000002') IS NOT NULL THEN RAISE EXCEPTION 'TEST 2 FAILED: answered call due'; END IF;

  -- we already called back → handled
  PERFORM pg_temp.call('dm-c1', 'in', '+998910000003', interval '5 minutes');
  PERFORM pg_temp.call('dm-c2', 'out', '+998910000003', interval '2 minutes');
  IF pg_temp.due('+998910000003') IS NOT NULL THEN RAISE EXCEPTION 'TEST 3 FAILED: call back ignored'; END IF;

  -- sent → not again; the group alert's stamp doesn't count, a new missed call does
  UPDATE public.crm_calls SET missed_dm_at = now() WHERE phone = '+998910000001';
  IF pg_temp.due('+998910000001') IS NOT NULL THEN RAISE EXCEPTION 'TEST 4 FAILED: sent twice'; END IF;
  PERFORM pg_temp.call('dm-a2', 'in', '+998910000001', interval '10 seconds');
  UPDATE public.crm_calls SET missed_alerted_at = now() WHERE uuid = 'dm-a2';
  IF pg_temp.due('+998910000001') IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'TEST 4 FAILED: new call not due'; END IF;

  -- older than a day → dropped; hidden number → skipped
  PERFORM pg_temp.call('dm-d1', 'in', '+998910000004', interval '25 hours');
  IF pg_temp.due('+998910000004') IS NOT NULL THEN RAISE EXCEPTION 'TEST 5 FAILED: stale call due'; END IF;
  PERFORM pg_temp.call('dm-e1', 'in', NULL, interval '1 minute');
  IF EXISTS (SELECT 1 FROM public.missed_calls_dm() WHERE phone IS NULL) THEN RAISE EXCEPTION 'TEST 6 FAILED: hidden number'; END IF;

  -- not for the API roles
  IF has_function_privilege('authenticated', 'public.missed_calls_dm()', 'EXECUTE') THEN RAISE EXCEPTION 'TEST 7 FAILED: API role can run it'; END IF;

  RAISE NOTICE 'TESTS ok: at once, answered, call back, once only, stale, hidden, service-only';
END $$;
