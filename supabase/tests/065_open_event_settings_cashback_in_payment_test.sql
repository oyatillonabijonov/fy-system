-- Behavioural tests for migration 065 (event settings open to Tadbirlar staff,
-- cashback applied inside record_payment). THROWAWAY DB only (recipe: CLAUDE.md §5).
\set ON_ERROR_STOP on

-- F = finance editor, S = staff with Tadbirlar only
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('65000000-0000-0000-0000-000000000001', 'fin65@fy.uz',   '{"full_name":"Moliyachi65","role":"xodim"}'::jsonb),
  ('65000000-0000-0000-0000-000000000002', 'staff65@fy.uz', '{"full_name":"Hodim65","role":"xodim"}'::jsonb);
INSERT INTO public.user_permissions (user_id, module, can_view, can_edit, can_delete) VALUES
  ('65000000-0000-0000-0000-000000000001', 'tadbirlar-moliya', true, true, false),
  ('65000000-0000-0000-0000-000000000002', 'tadbirlar', true, true, false);
INSERT INTO public.events (id, name, date) VALUES
  ('e6500000-0000-0000-0000-000000000001', 'Tarifsiz', now() + interval '5 days');
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events, public.event_tariffs, public.event_participants, public.clients TO authenticated;
SET ROLE authenticated;

-- ─── TEST 1: Tadbirlar staff sets up events freely, but no money ────────────
SELECT set_config('request.jwt.claim.sub', '65000000-0000-0000-0000-000000000002', false);
DO $$
DECLARE v_part uuid;
BEGIN
  INSERT INTO public.events (id, name, cashback_percent) VALUES ('e6500000-0000-0000-0000-000000000002', 'Staff tadbiri', 12);
  UPDATE public.events SET cashback_percent = 8 WHERE id = 'e6500000-0000-0000-0000-000000000002';
  INSERT INTO public.event_tariffs (event_id, name, price) VALUES ('e6500000-0000-0000-0000-000000000002', 'Standart', 3000000);
  UPDATE public.event_tariffs SET price = 2500000 WHERE event_id = 'e6500000-0000-0000-0000-000000000002';
  v_part := public.enroll_participant('e6500000-0000-0000-0000-000000000001', NULL, NULL, NULL, 'Keshbek65 Mijoz', '906500001', 1000000);
  BEGIN
    PERFORM public.record_payment('e6500000-0000-0000-0000-000000000001', 1000, 'naqd');
    RAISE EXCEPTION 'TEST 1 FAILED: staff recorded a payment';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'forbidden: finance_only' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'TEST 1 ok: staff edits cashback %%, tariffs, individual price; no payments';
END $$;

-- ─── TEST 2: payment with cashback — one transaction ────────────────────────
SELECT set_config('request.jwt.claim.sub', '65000000-0000-0000-0000-000000000001', false);
DO $$
DECLARE v_part uuid; v_client uuid; v_pay uuid; r record; bal numeric; cash numeric;
BEGIN
  SELECT id, contact_id INTO v_part, v_client FROM public.event_participants WHERE full_name = 'Keshbek65 Mijoz';
  PERFORM public.adjust_cashback(v_client, 'add', 500000, 'test');
  -- 400k settled: 150k from cashback, 250k cash
  v_pay := public.record_payment('e6500000-0000-0000-0000-000000000001', 400000, 'karta', now(), v_client,
                                 p_cashback => 150000);
  SELECT paid, cashback_used INTO r FROM public.event_participants WHERE id = v_part;
  SELECT cashback_balance INTO bal FROM public.clients WHERE id = v_client;
  SELECT amount INTO cash FROM public.payments WHERE id = v_pay;
  IF r.paid <> 400000 OR r.cashback_used <> 150000 OR bal <> 350000 OR cash <> 250000 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: % balance=% cash=%', row_to_json(r), bal, cash; END IF;
  RAISE NOTICE 'TEST 2 ok: 150k cashback + 250k cash, debt down by 400k';
END $$;

-- ─── TEST 3: limits — nothing is written when any check fails ───────────────
DO $$
DECLARE v_part uuid; v_client uuid; n_before int; n_after int; refused int := 0;
BEGIN
  SELECT id, contact_id INTO v_part, v_client FROM public.event_participants WHERE full_name = 'Keshbek65 Mijoz';
  SELECT count(*) INTO n_before FROM public.payments WHERE participant_id = v_part;
  BEGIN PERFORM public.record_payment('e6500000-0000-0000-0000-000000000001', 100000, 'naqd', now(), v_client, p_cashback => 400000);  -- > amount
  EXCEPTION WHEN raise_exception THEN refused := refused + 1; END;
  BEGIN PERFORM public.record_payment('e6500000-0000-0000-0000-000000000001', 500000, 'naqd', now(), v_client, p_cashback => 450000);  -- > balance 350k
  EXCEPTION WHEN raise_exception THEN refused := refused + 1; END;
  BEGIN PERFORM public.record_payment('e6500000-0000-0000-0000-000000000001', 700000, 'naqd', now(), v_client, p_cashback => 100000);  -- > debt 600k
  EXCEPTION WHEN raise_exception THEN refused := refused + 1; END;
  BEGIN PERFORM public.record_payment('e6500000-0000-0000-0000-000000000001', 100000, 'naqd', now(), v_client, p_cashback => -1);
  EXCEPTION WHEN raise_exception THEN refused := refused + 1; END;
  SELECT count(*) INTO n_after FROM public.payments WHERE participant_id = v_part;
  IF refused <> 4 OR n_after <> n_before
     OR (SELECT cashback_balance FROM public.clients WHERE id = v_client) <> 350000 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: refused %, payments % → %', refused, n_before, n_after; END IF;
  RAISE NOTICE 'TEST 3 ok: 4 bad calls refused, nothing written';
END $$;

-- ─── TEST 4: paid fully from cashback → no cash row, NULL returned ──────────
DO $$
DECLARE v_part uuid; v_client uuid; v_pay uuid; n int;
BEGIN
  SELECT id, contact_id INTO v_part, v_client FROM public.event_participants WHERE full_name = 'Keshbek65 Mijoz';
  SELECT count(*) INTO n FROM public.payments WHERE participant_id = v_part;
  v_pay := public.record_payment('e6500000-0000-0000-0000-000000000001', 100000, 'naqd', now(), v_client, p_cashback => 100000);
  IF v_pay IS NOT NULL OR (SELECT count(*) FROM public.payments WHERE participant_id = v_part) <> n
     OR (SELECT paid FROM public.event_participants WHERE id = v_part) <> 500000 THEN
    RAISE EXCEPTION 'TEST 4 FAILED'; END IF;
  -- old callers (no p_cashback) still work
  PERFORM public.record_payment('e6500000-0000-0000-0000-000000000001', 50000, 'naqd', now(), v_client);
  RAISE NOTICE 'TEST 4 ok: all-cashback payment writes no cash row; old call shape works';
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT '065 open event settings + cashback in payment: all tests passed' AS result;
