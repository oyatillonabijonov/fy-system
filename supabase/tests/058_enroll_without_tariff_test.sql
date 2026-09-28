-- Behavioural tests for migration 058 (enrolment without tariffs / seller).
-- THROWAWAY DB only (recipe: CLAUDE.md §5 "Tests").
\set ON_ERROR_STOP on

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('58000000-0000-0000-0000-000000000001', 'admin58@fy.uz', '{"full_name":"Admin58","role":"admin"}'::jsonb),
  ('58000000-0000-0000-0000-000000000002', 'mkt58@fy.uz',   '{"full_name":"Mkt58","role":"xodim"}'::jsonb);
UPDATE public.profiles SET role = 'admin' WHERE id = '58000000-0000-0000-0000-000000000001';
UPDATE public.profiles SET department = 'marketing' WHERE id = '58000000-0000-0000-0000-000000000002';
INSERT INTO public.events (id, name) VALUES
  ('e5800000-0000-0000-0000-000000000001', 'No tariffs'),
  ('e5800000-0000-0000-0000-000000000002', 'With tariffs');
INSERT INTO public.event_tariffs (event_id, name, price)
VALUES ('e5800000-0000-0000-0000-000000000002', 'Standart', 1000000);
SELECT set_config('request.jwt.claim.sub', '58000000-0000-0000-0000-000000000001', false);

-- TEST 1: event without tariffs, no seller → enrolled at the given price
DO $$
DECLARE v_pid uuid; r record;
BEGIN
  v_pid := public.enroll_participant('e5800000-0000-0000-0000-000000000001', NULL, NULL,
                                     NULL, 'Tarifsiz Mijoz', '901110058', 750000);
  SELECT price, tariff_id, seller_id INTO r FROM public.event_participants WHERE id = v_pid;
  IF r.price <> 750000 OR r.tariff_id IS NOT NULL OR r.seller_id IS NOT NULL THEN
    RAISE EXCEPTION 'TEST 1 FAILED: %', row_to_json(r); END IF;
  RAISE NOTICE 'TEST 1 ok: individual price, no seller';
END $$;

-- TEST 2: no tariff and no price → price_required; event with tariffs → tariff_required
DO $$
BEGIN
  BEGIN
    PERFORM public.enroll_participant('e5800000-0000-0000-0000-000000000001', NULL, NULL, NULL, 'Narxsiz', '901110059');
    RAISE EXCEPTION 'TEST 2 FAILED: enrolled without tariff or price';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'price_required' THEN RAISE EXCEPTION 'TEST 2 FAILED: %', SQLERRM; END IF;
  END;
  BEGIN
    PERFORM public.enroll_participant('e5800000-0000-0000-0000-000000000002', NULL, NULL, NULL, 'Tarifsiz', '901110060', 5);
    RAISE EXCEPTION 'TEST 2 FAILED: skipped the tariff of an event that has tariffs';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'tariff_required' THEN RAISE EXCEPTION 'TEST 2 FAILED: %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'TEST 2 ok: price_required / tariff_required';
END $$;

-- TEST 3: a given seller outside Sotuv is still rejected
DO $$
BEGIN
  PERFORM public.enroll_participant('e5800000-0000-0000-0000-000000000001', NULL,
    '58000000-0000-0000-0000-000000000002', NULL, 'Sotuvchili', '901110061', 1);
  RAISE EXCEPTION 'TEST 3 FAILED: non-Sotuv seller accepted';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'seller_invalid' THEN RAISE EXCEPTION 'TEST 3 FAILED: %', SQLERRM; END IF;
  RAISE NOTICE 'TEST 3 ok: seller still validated';
END $$;

-- TEST 4: Moliya → record_payment enrols a new client without tariff/seller
DO $$
DECLARE v_pay uuid; r record;
BEGIN
  v_pay := public.record_payment('e5800000-0000-0000-0000-000000000001', 200000, 'naqd', now(),
    NULL, 'Moliya Mijoz', '901110062', NULL, NULL, 900000);
  SELECT ep.price, ep.paid INTO r
  FROM public.payments p JOIN public.event_participants ep ON ep.id = p.participant_id WHERE p.id = v_pay;
  IF r.price <> 900000 OR r.paid <> 200000 THEN RAISE EXCEPTION 'TEST 4 FAILED: %', row_to_json(r); END IF;
  RAISE NOTICE 'TEST 4 ok: record_payment enrols without tariff/seller';
END $$;

SELECT '058 enroll without tariff: all tests passed' AS result;
