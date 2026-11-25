-- Behavioural tests for migration 107 (calls_day_summary). THROWAWAY DB only.
\set ON_ERROR_STOP on
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a1070000-0000-0000-0000-000000000001', 's107@fy.uz', '{"full_name":"Sotuvchi107","role":"xodim"}'::jsonb),
  ('a1070000-0000-0000-0000-000000000002', 'x107@fy.uz', '{"full_name":"Boshqa107","role":"xodim"}'::jsonb),
  ('a1070000-0000-0000-0000-000000000003', 'n107@fy.uz', '{"full_name":"Ruxsatsiz107","role":"xodim"}'::jsonb);
INSERT INTO public.user_permissions (user_id, module, can_view) VALUES
  ('a1070000-0000-0000-0000-000000000001', 'sotuv-crmn', true), ('a1070000-0000-0000-0000-000000000002', 'sotuv-crmn', true);
-- 2026-03-10 in Tashkent = 2026-03-09 19:00 UTC … 2026-03-10 19:00 UTC
INSERT INTO public.crm_calls (uuid, direction, phone, staff_id, started_at, duration, talk_time) VALUES
  ('t107-1', 'out', '+998901070001', 'a1070000-0000-0000-0000-000000000001', '2026-03-09 19:30+00', 40, 30),   -- 00:30 Tashkent: in the day, answered
  ('t107-2', 'out', '+998901070002', 'a1070000-0000-0000-0000-000000000001', '2026-03-10 05:00+00', 20, 0),    -- not answered
  ('t107-3', 'out', '+998901070002', 'a1070000-0000-0000-0000-000000000001', '2026-03-10 06:00+00', 25, 0),    -- same number again
  ('t107-4', 'out', '+998901070003', 'a1070000-0000-0000-0000-000000000002', '2026-03-10 07:00+00', 90, 70),   -- another seller, answered
  ('t107-5', 'in',  '+998901070004', 'a1070000-0000-0000-0000-000000000001', '2026-03-10 08:00+00', 60, 50),   -- incoming answered
  ('t107-6', 'in',  '+998901070005', NULL,                                   '2026-03-10 09:00+00', 15, 0),    -- missed, nobody's
  ('t107-7', 'out', '+998901070006', 'a1070000-0000-0000-0000-000000000001', '2026-03-09 18:30+00', 30, 20),   -- 23:30 the day before
  ('t107-8', 'out', '+998901070007', 'a1070000-0000-0000-0000-000000000001', '2026-03-10 19:30+00', 30, 20);   -- 00:30 the day after
GRANT USAGE ON SCHEMA public TO authenticated;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1070000-0000-0000-0000-000000000001', false);
DO $$
DECLARE r jsonb;
BEGIN
  r := public.calls_day_summary('2026-03-10', NULL);
  IF (r->>'out')::int <> 4 OR (r->>'out_answered')::int <> 2 OR (r->>'in')::int <> 2 OR (r->>'in_answered')::int <> 1 OR (r->>'talk_sec')::int <> 150 OR (r->>'numbers')::int <> 5 THEN
    RAISE EXCEPTION 'TEST 1 FAILED (everyone): %', r; END IF;
  r := public.calls_day_summary('2026-03-10', 'a1070000-0000-0000-0000-000000000001');
  IF (r->>'out')::int <> 3 OR (r->>'out_answered')::int <> 1 OR (r->>'in')::int <> 1 OR (r->>'in_answered')::int <> 1 OR (r->>'talk_sec')::int <> 80 OR (r->>'numbers')::int <> 3 THEN
    RAISE EXCEPTION 'TEST 2 FAILED (mine): %', r; END IF;
  r := public.calls_day_summary('2026-03-11', NULL);
  IF (r->>'out')::int <> 1 OR (r->>'in')::int <> 0 THEN RAISE EXCEPTION 'TEST 3 FAILED (next day): %', r; END IF;
  RAISE NOTICE 'TEST 1-3 ok';
END $$;
SELECT set_config('request.jwt.claim.sub', 'a1070000-0000-0000-0000-000000000003', false);
DO $$
BEGIN
  BEGIN PERFORM public.calls_day_summary('2026-03-10', NULL); RAISE EXCEPTION 'TEST 4 FAILED: no permission, but answered';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'TEST 4 ok';
END $$;
RESET ROLE;
