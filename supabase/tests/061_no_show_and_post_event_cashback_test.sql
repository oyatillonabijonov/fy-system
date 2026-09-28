-- Behavioural tests for migration 061 (no-show settlement, cashback after the event).
-- THROWAWAY DB only (recipe: CLAUDE.md §5 "Tests").
\set ON_ERROR_STOP on

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('61000000-0000-0000-0000-000000000001', 'admin61@fy.uz', '{"full_name":"Admin61","role":"admin"}'::jsonb);
UPDATE public.profiles SET role = 'admin' WHERE id = '61000000-0000-0000-0000-000000000001';
-- one event still ahead, one already over (yesterday)
INSERT INTO public.events (id, name, cashback_percent, date) VALUES
  ('e6100000-0000-0000-0000-000000000001', 'Kelajak', 5, now() + interval '10 days'),
  ('e6100000-0000-0000-0000-000000000002', 'O''tgan',  5, now() - interval '2 days');
SELECT set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', false);

-- TEST 1: paying for a future event credits no cashback yet
DO $$
DECLARE v uuid; e numeric;
BEGIN
  PERFORM public.record_payment('e6100000-0000-0000-0000-000000000001', 27000000, 'karta', now(),
    NULL, 'Kelmagan Mijoz', '906100001', NULL, NULL, 27000000);
  PERFORM public.settle_event_cashback();
  SELECT cashback_earned INTO e FROM public.event_participants WHERE full_name = 'Kelmagan Mijoz';
  IF e <> 0 THEN RAISE EXCEPTION 'TEST 1 FAILED: cashback before the event = %', e; END IF;
  RAISE NOTICE 'TEST 1 ok: no cashback before the event';
END $$;

-- TEST 2: after the event it arrives (5% of cash), once
DO $$
DECLARE e numeric; bal numeric;
BEGIN
  PERFORM public.record_payment('e6100000-0000-0000-0000-000000000002', 2000000, 'naqd', now(),
    NULL, 'Kelgan Mijoz', '906100002', NULL, NULL, 2000000);
  PERFORM public.settle_event_cashback();
  PERFORM public.settle_event_cashback();
  SELECT ep.cashback_earned, c.cashback_balance INTO e, bal
  FROM public.event_participants ep JOIN public.clients c ON c.id = ep.contact_id WHERE ep.full_name = 'Kelgan Mijoz';
  IF e <> 100000 OR bal <> 100000 THEN RAISE EXCEPTION 'TEST 2 FAILED: earned %, balance %', e, bal; END IF;
  RAISE NOTICE 'TEST 2 ok: 100000 after the event, idempotent';
END $$;

-- TEST 3: no-show keeps 10M of 27M: 17M refunded, price 10M, debt 0, no cashback
DO $$
DECLARE r record; ref numeric;
BEGIN
  PERFORM public.settle_no_show((SELECT id FROM public.event_participants WHERE full_name = 'Kelmagan Mijoz'),
                                10000000, 'karta', 'kelmadi');
  SELECT price, paid, no_show_at IS NOT NULL AS ns, cashback_earned INTO r
  FROM public.event_participants WHERE full_name = 'Kelmagan Mijoz';
  SELECT sum(amount) INTO ref FROM public.payments p JOIN public.event_participants ep ON ep.id = p.participant_id
  WHERE ep.full_name = 'Kelmagan Mijoz' AND p.kind = 'refund';
  IF r.price <> 10000000 OR r.paid <> 10000000 OR NOT r.ns OR r.cashback_earned <> 0 OR ref <> -17000000 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: % refund=%', row_to_json(r), ref; END IF;
  RAISE NOTICE 'TEST 3 ok: 17M refunded, price 10M, debt 0';
END $$;

-- TEST 4: a no-show on an ended event loses its cashback; can't settle twice; keep > cash rejected
DO $$
DECLARE bal numeric;
BEGIN
  PERFORM public.settle_no_show((SELECT id FROM public.event_participants WHERE full_name = 'Kelgan Mijoz'), 2000000, 'naqd');
  SELECT c.cashback_balance INTO bal FROM public.clients c WHERE c.full_name = 'Kelgan Mijoz';
  IF bal <> 0 THEN RAISE EXCEPTION 'TEST 4 FAILED: no-show kept cashback %', bal; END IF;
  BEGIN
    PERFORM public.settle_no_show((SELECT id FROM public.event_participants WHERE full_name = 'Kelgan Mijoz'), 0, 'naqd');
    RAISE EXCEPTION 'TEST 4 FAILED: settled twice';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'already_no_show' THEN RAISE EXCEPTION 'TEST 4 FAILED: %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'TEST 4 ok: no-show loses cashback, single settlement';
END $$;
SELECT set_config('request.jwt.claim.sub', '', false);

SELECT '061 no-show + post-event cashback: all tests passed' AS result;
