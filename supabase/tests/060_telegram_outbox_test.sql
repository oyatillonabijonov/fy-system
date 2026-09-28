-- Behavioural test for migration 060 (Telegram receipt outbox). Throwaway DB only.
\set ON_ERROR_STOP on

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('60000000-0000-0000-0000-000000000001', 'admin60@fy.uz', '{"full_name":"Admin60","role":"admin"}'::jsonb);
UPDATE public.profiles SET role = 'admin' WHERE id = '60000000-0000-0000-0000-000000000001';
INSERT INTO public.events (id, name, cashback_percent) VALUES ('e6000000-0000-0000-0000-000000000001', 'Outbox tadbir', 5);
SELECT set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', false);

DO $$
DECLARE v_pay uuid; v_part uuid; v_client uuid; q text;
BEGIN
  v_pay := public.record_payment('e6000000-0000-0000-0000-000000000001', 400000, 'naqd', now(),
    NULL, 'Outbox Mijoz', '906000001', NULL, NULL, 1000000);
  SELECT participant_id INTO v_part FROM public.payments WHERE id = v_pay;
  SELECT contact_id INTO v_client FROM public.event_participants WHERE id = v_part;
  PERFORM public.void_payment(v_pay, 'Xato');
  -- cashback: give the client a balance, then spend it on the debt
  PERFORM public.adjust_cashback(v_client, 'add', 50000, 'test');
  PERFORM public.spend_cashback(v_part, v_client, 'e6000000-0000-0000-0000-000000000001', 50000);

  SELECT string_agg(kind, ',' ORDER BY id) INTO q FROM public.telegram_outbox;
  IF q IS DISTINCT FROM 'payment,void,cashback' THEN
    RAISE EXCEPTION 'TEST 1 FAILED: outbox = % (want payment,void,cashback — manual add is not a receipt)', q; END IF;
  RAISE NOTICE 'TEST 1 ok: payment, void and cashback spend queued';
END $$;

-- TEST 2: the queue is invisible to API roles
SET ROLE authenticated;
DO $$
BEGIN
  PERFORM 1 FROM public.telegram_outbox;
  RAISE EXCEPTION 'TEST 2 FAILED: authenticated can read the outbox';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'TEST 2 ok: outbox closed to API roles';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

SELECT '060 telegram outbox: all tests passed' AS result;
