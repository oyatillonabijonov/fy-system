-- Behavioural tests for migration 063: no-show returns spent cashback, no-show
-- price follows paid. (Its finance-only rules 1–2 were reverted by 065.)
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

-- Rules 1–2 (cashback % / individual price for finance editors only) were
-- lifted again by 065 — see its test. The individual-price client for TEST 3:
SELECT set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000001', false);
DO $$ BEGIN
  PERFORM public.enroll_participant('e6300000-0000-0000-0000-000000000001', NULL, NULL, NULL, 'Individual Mijoz', '906300003', 1000000);
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
