-- Behavioural tests for migration 063 (event cashback % / individual price for
-- finance editors, no-show returns spent cashback, no-show price follows paid).
-- THROWAWAY DB only (recipe: CLAUDE.md §5 "Tests").
\set ON_ERROR_STOP on

-- F = finance editor, S = staff with Tadbirlar only
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('63000000-0000-0000-0000-000000000001', 'fin63@fy.uz',   '{"full_name":"Moliyachi63","role":"xodim"}'::jsonb),
  ('63000000-0000-0000-0000-000000000002', 'staff63@fy.uz', '{"full_name":"Hodim63","role":"xodim"}'::jsonb);
INSERT INTO public.user_permissions (user_id, module, can_view, can_edit, can_delete) VALUES
  ('63000000-0000-0000-0000-000000000001', 'tadbirlar-moliya', true, true, false),
  ('63000000-0000-0000-0000-000000000002', 'tadbirlar', true, true, false);
INSERT INTO public.events (id, name, cashback_percent, date) VALUES
  ('e6300000-0000-0000-0000-000000000001', 'Tarifsiz', 5, now() + interval '5 days'),
  ('e6300000-0000-0000-0000-000000000002', 'Tarifli',  5, now() + interval '5 days');
INSERT INTO public.event_tariffs (id, event_id, name, price) VALUES
  ('7c630000-0000-0000-0000-000000000001', 'e6300000-0000-0000-0000-000000000002', 'Standart', 3000000);
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events, public.event_participants, public.clients TO authenticated;

SET ROLE authenticated;

-- ─── TEST 1: event cashback % — staff can't change it, editor can ───────────
SELECT set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000002', false);
DO $$
DECLARE refused int := 0;
BEGIN
  UPDATE public.events SET name = 'Tarifsiz tadbir' WHERE id = 'e6300000-0000-0000-0000-000000000001';  -- normal edit
  INSERT INTO public.events (name) VALUES ('Staff tadbiri');                                          -- default 5 %
  UPDATE public.events SET cashback_percent = 5 WHERE id = 'e6300000-0000-0000-0000-000000000001';     -- unchanged
  BEGIN UPDATE public.events SET cashback_percent = 30 WHERE id = 'e6300000-0000-0000-0000-000000000001';
  EXCEPTION WHEN raise_exception THEN refused := refused + 1; END;
  BEGIN INSERT INTO public.events (name, cashback_percent) VALUES ('Soxta', 50);
  EXCEPTION WHEN raise_exception THEN refused := refused + 1; END;
  IF refused <> 2 THEN RAISE EXCEPTION 'TEST 1 FAILED: % of 2 refused', refused; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000001', false);
UPDATE public.events SET cashback_percent = 10 WHERE id = 'e6300000-0000-0000-0000-000000000001';
DO $$ BEGIN
  IF (SELECT cashback_percent FROM public.events WHERE id = 'e6300000-0000-0000-0000-000000000001') <> 10 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: editor could not set the percent'; END IF;
  RAISE NOTICE 'TEST 1 ok: event cashback %% only for finance editors';
END $$;

-- ─── TEST 2: individual price only for finance editors ──────────────────────
SELECT set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000002', false);
DO $$
DECLARE refused int := 0;
BEGIN
  BEGIN PERFORM public.enroll_participant('e6300000-0000-0000-0000-000000000001', NULL, NULL, NULL, 'Tekin Mijoz', '906300001', 0);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'forbidden: individual_price' THEN RAISE; END IF; refused := refused + 1; END;
  BEGIN INSERT INTO public.event_participants (event_id, full_name, price) VALUES ('e6300000-0000-0000-0000-000000000001', 'Soxta', 0);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'forbidden: enroll_via_rpc' THEN RAISE; END IF; refused := refused + 1; END;
  IF refused <> 2 THEN RAISE EXCEPTION 'TEST 2 FAILED: % of 2 refused', refused; END IF;
  -- by tariff staff still enrols
  PERFORM public.enroll_participant('e6300000-0000-0000-0000-000000000002', '7c630000-0000-0000-0000-000000000001', NULL, NULL, 'Tarifli Mijoz', '906300002');
END $$;
SELECT set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000001', false);
DO $$ BEGIN
  PERFORM public.enroll_participant('e6300000-0000-0000-0000-000000000001', NULL, NULL, NULL, 'Individual Mijoz', '906300003', 1000000);
  RAISE NOTICE 'TEST 2 ok: staff enrols by tariff only; editor may type a price';
END $$;

-- ─── TEST 3: no-show gives back the spent cashback ──────────────────────────
DO $$
DECLARE v_part uuid; v_client uuid; r record; bal numeric;
BEGIN
  SELECT id, contact_id INTO v_part, v_client FROM public.event_participants WHERE full_name = 'Individual Mijoz';
  PERFORM public.record_payment('e6300000-0000-0000-0000-000000000001', 600000, 'naqd', now(), v_client);
  PERFORM public.adjust_cashback(v_client, 'add', 100000, 'test');
  PERFORM public.spend_cashback(v_part, v_client, 'e6300000-0000-0000-0000-000000000001', 100000);
  -- paid 700k = 600k cash + 100k cashback; keep 200k of the cash → 400k refunded
  PERFORM public.settle_no_show(v_part, 200000, 'naqd');
  SELECT price, paid, cashback_used INTO r FROM public.event_participants WHERE id = v_part;
  SELECT cashback_balance INTO bal FROM public.clients WHERE id = v_client;
  IF r.price <> 200000 OR r.paid <> 200000 OR r.cashback_used <> 0 OR bal <> 100000 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: % balance=%', row_to_json(r), bal; END IF;
  RAISE NOTICE 'TEST 3 ok: 100k cashback back on the balance, deal = 200k kept';
END $$;

-- ─── TEST 4: later refund / void on a no-show leave no debt ─────────────────
DO $$
DECLARE v_part uuid := (SELECT id FROM public.event_participants WHERE full_name = 'Individual Mijoz');
        v_ref uuid; r record;
BEGIN
  v_ref := public.refund_payment(v_part, 50000, 'naqd', 'yana qaytarildi');
  SELECT price, paid INTO r FROM public.event_participants WHERE id = v_part;
  IF r.price <> 150000 OR r.paid <> 150000 THEN RAISE EXCEPTION 'TEST 4 FAILED (refund): %', row_to_json(r); END IF;
  PERFORM public.void_payment(v_ref, 'xato qaytarish');
  SELECT price, paid INTO r FROM public.event_participants WHERE id = v_part;
  IF r.price <> 200000 OR r.paid <> 200000 THEN RAISE EXCEPTION 'TEST 4 FAILED (void): %', row_to_json(r); END IF;
  IF EXISTS (SELECT 1 FROM public.finance_debtors() WHERE participant_id = v_part) THEN
    RAISE EXCEPTION 'TEST 4 FAILED: no-show listed as a debtor'; END IF;
  RAISE NOTICE 'TEST 4 ok: refund and its void keep price = paid, no phantom debt';
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT '063 finance rules: all tests passed' AS result;
