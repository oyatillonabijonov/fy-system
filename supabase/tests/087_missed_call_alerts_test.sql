-- Behavioural tests for migration 087 (missed call alerts). THROWAWAY DB only (recipe: CLAUDE.md §5).
\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.call(p_uuid text, p_dir text, p_phone text, p_ago interval, p_talk int DEFAULT 0) RETURNS void
LANGUAGE sql AS $$ INSERT INTO public.crm_calls (uuid, direction, phone, started_at, talk_time) VALUES (p_uuid, p_dir, p_phone, now() - p_ago, p_talk) $$;
CREATE OR REPLACE FUNCTION pg_temp.due(p_phone text) RETURNS integer
LANGUAGE sql AS $$ SELECT calls FROM public.missed_calls_due() WHERE phone = p_phone $$;

DO $$
BEGIN
  IF (SELECT missed_calls FROM public.telegram_groups LIMIT 1) IS TRUE THEN RAISE EXCEPTION 'switch must default off'; END IF;

  -- past 2 hours, nobody returned it → due
  PERFORM pg_temp.call('a1', 'in', '+998900000001', interval '3 hours');
  IF pg_temp.due('+998900000001') IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'TEST 1 FAILED: unreturned call not due'; END IF;

  -- under 2 hours → not yet
  PERFORM pg_temp.call('b1', 'in', '+998900000002', interval '1 hour');
  IF pg_temp.due('+998900000002') IS NOT NULL THEN RAISE EXCEPTION 'TEST 2 FAILED: due too early'; END IF;

  -- we called back (even unanswered) → handled
  PERFORM pg_temp.call('c1', 'in', '+998900000003', interval '3 hours');
  PERFORM pg_temp.call('c2', 'out', '+998900000003', interval '2 hours');
  IF pg_temp.due('+998900000003') IS NOT NULL THEN RAISE EXCEPTION 'TEST 3 FAILED: call back ignored'; END IF;

  -- they called again and someone answered → handled
  PERFORM pg_temp.call('d1', 'in', '+998900000004', interval '3 hours');
  PERFORM pg_temp.call('d2', 'in', '+998900000004', interval '150 minutes', 60);
  IF pg_temp.due('+998900000004') IS NOT NULL THEN RAISE EXCEPTION 'TEST 4 FAILED: answered repeat ignored'; END IF;

  -- two missed calls, one number → one row, both counted, clock from the oldest
  PERFORM pg_temp.call('e1', 'in', '+998900000005', interval '3 hours');
  PERFORM pg_temp.call('e2', 'in', '+998900000005', interval '30 minutes');
  IF pg_temp.due('+998900000005') IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'TEST 5 FAILED: grouping'; END IF;

  -- announced → not again; a new missed call starts a new 2 hours
  UPDATE public.crm_calls SET missed_alerted_at = now() WHERE phone = '+998900000005';
  IF pg_temp.due('+998900000005') IS NOT NULL THEN RAISE EXCEPTION 'TEST 6 FAILED: announced twice'; END IF;
  PERFORM pg_temp.call('e3', 'in', '+998900000005', interval '10 minutes');
  IF pg_temp.due('+998900000005') IS NOT NULL THEN RAISE EXCEPTION 'TEST 6 FAILED: new call due at once'; END IF;

  -- older than a day → dropped; hidden number → skipped
  PERFORM pg_temp.call('f1', 'in', '+998900000006', interval '25 hours');
  IF pg_temp.due('+998900000006') IS NOT NULL THEN RAISE EXCEPTION 'TEST 7 FAILED: stale call due'; END IF;
  PERFORM pg_temp.call('g1', 'in', NULL, interval '3 hours');
  IF EXISTS (SELECT 1 FROM public.missed_calls_due() WHERE phone IS NULL) THEN RAISE EXCEPTION 'TEST 8 FAILED: hidden number'; END IF;

  -- not for the API roles
  IF has_function_privilege('authenticated', 'public.missed_calls_due(interval)', 'EXECUTE') THEN RAISE EXCEPTION 'TEST 9 FAILED: API role can run it'; END IF;

  RAISE NOTICE 'TESTS ok: 2 h clock, call back, answered repeat, grouping, once only, stale, hidden, service-only';
END $$;
