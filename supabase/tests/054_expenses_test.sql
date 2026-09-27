-- Behavioural tests for migration 054 (expenses, Chiqim / Sof KPI, event_profit).
-- THROWAWAY DB only (recipe: CLAUDE.md §5 "Tests"). Run:
--   docker exec fy-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql
-- Every block RAISEs on failure; the last line prints on success.
\set ON_ERROR_STOP on

-- ─── FIXTURES ────────────────────────────────────────────────────────────────
-- F = finance editor, V = finance viewer, S = plain staff, P = Sotuv seller.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('54000000-0000-0000-0000-000000000001', 'fin54@fy.uz',    '{"full_name":"Moliyachi","role":"xodim"}'::jsonb),
  ('54000000-0000-0000-0000-000000000002', 'view54@fy.uz',   '{"full_name":"Kuzatuvchi","role":"xodim"}'::jsonb),
  ('54000000-0000-0000-0000-000000000003', 'staff54@fy.uz',  '{"full_name":"Hodim","role":"xodim"}'::jsonb),
  ('54000000-0000-0000-0000-000000000004', 'seller54@fy.uz', '{"full_name":"Sotuvchi","role":"xodim"}'::jsonb);
UPDATE public.profiles SET department = 'sotuv' WHERE id = '54000000-0000-0000-0000-000000000004';
INSERT INTO public.user_permissions (user_id, module, can_view, can_edit, can_delete) VALUES
  ('54000000-0000-0000-0000-000000000001', 'tadbirlar-moliya', true, true,  false),
  ('54000000-0000-0000-0000-000000000002', 'tadbirlar-moliya', true, false, false);

INSERT INTO public.events (id, name, total_value) VALUES
  ('e5400000-0000-0000-0000-000000000001', 'Event A', 20000000),
  ('e5400000-0000-0000-0000-000000000002', 'Event B', 0),
  ('e5400000-0000-0000-0000-000000000003', 'Event C', 0);
INSERT INTO public.event_tariffs (id, event_id, name, price) VALUES
  ('7c000000-0000-0000-0000-000000000001', 'e5400000-0000-0000-0000-000000000001', 'Standart', 10000000);

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.payments, public.event_participants, public.events, public.clients,
     public.profiles, public.user_permissions, public.cashback_transactions, public.expenses
  TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.as_user(p uuid) RETURNS void LANGUAGE sql AS
  $$ SELECT set_config('request.jwt.claim.sub', p::text, false)::void $$;

-- One paid participant in Event A: price 10 mln, paid 4 mln on 2026-09-10.
SELECT pg_temp.as_user('54000000-0000-0000-0000-000000000001');
SELECT public.record_payment(
  p_event_id => 'e5400000-0000-0000-0000-000000000001', p_amount => 4000000, p_method => 'naqd',
  p_paid_at => '2026-09-10 10:00+05', p_full_name => 'Ali Valiyev', p_phone => '90 540 00 01',
  p_tariff_id => '7c000000-0000-0000-0000-000000000001',
  p_seller_id => '54000000-0000-0000-0000-000000000004');

-- ─── A: finance editor adds expenses (event-bound and general) ──────────────
DO $$
DECLARE v_id uuid; r record;
BEGIN
  PERFORM pg_temp.as_user('54000000-0000-0000-0000-000000000001');
  v_id := public.add_expense('zal', 1000000, '2026-09-05', 'e5400000-0000-0000-0000-000000000001', '  Zal ijarasi  ');
  PERFORM public.add_expense('ofis', 500000, '2026-09-20', NULL, '   ');
  PERFORM public.add_expense('reklama', 300000, '2026-08-15', 'e5400000-0000-0000-0000-000000000002', NULL);
  PERFORM public.add_expense('spiker', 700000, '2026-09-12', 'e5400000-0000-0000-0000-000000000003', NULL);
  SELECT * INTO r FROM public.expenses WHERE id = v_id;
  IF r.recorded_by <> '54000000-0000-0000-0000-000000000001' OR r.note <> 'Zal ijarasi'
     OR r.amount <> 1000000 OR r.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'A FAILED: %', row_to_json(r);
  END IF;
  IF (SELECT note FROM public.expenses WHERE category = 'ofis') IS NOT NULL THEN
    RAISE EXCEPTION 'A FAILED: bo''sh izoh NULL bo''lishi kerak';
  END IF;
  RAISE NOTICE 'A ok: xarajat qo''shiladi, kiritgan va izoh to''g''ri';
END $$;

-- ─── B: viewer / staff cannot add; bad input refused ────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.as_user('54000000-0000-0000-0000-000000000002');
  BEGIN
    PERFORM public.add_expense('zal', 100, '2026-09-01');
    RAISE EXCEPTION 'B FAILED: ko''ruvchi xarajat qo''shdi';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'forbidden: finance_only' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.as_user('54000000-0000-0000-0000-000000000001');
  BEGIN
    PERFORM public.add_expense('zal', 0, '2026-09-01');
    RAISE EXCEPTION 'B FAILED: 0 summa o''tdi';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'invalid_amount' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.add_expense('taksi', 100, '2026-09-01');
    RAISE EXCEPTION 'B FAILED: noma''lum kategoriya o''tdi';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'B ok: ko''ruvchi kirita olmaydi, 0 summa va noma''lum kategoriya rad etiladi';
END $$;

-- ─── C: RLS — read only with Moliya, no direct writes even for the editor ───
DO $$
DECLARE n_staff int; n_view int; n_del int;
BEGIN
  PERFORM pg_temp.as_user('54000000-0000-0000-0000-000000000003');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n_staff FROM public.expenses;
  RESET ROLE;

  PERFORM pg_temp.as_user('54000000-0000-0000-0000-000000000002');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n_view FROM public.expenses;
  RESET ROLE;

  PERFORM pg_temp.as_user('54000000-0000-0000-0000-000000000001');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.expenses (category, amount, spent_at) VALUES ('zal', 100, '2026-09-01');
    RAISE EXCEPTION 'C FAILED: to''g''ridan-to''g''ri INSERT o''tdi';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  WITH d AS (DELETE FROM public.expenses RETURNING 1) SELECT count(*) INTO n_del FROM d;
  RESET ROLE;

  IF n_staff <> 0 OR n_view <> 4 OR n_del <> 0 THEN
    RAISE EXCEPTION 'C FAILED: staff=% viewer=% deleted=%', n_staff, n_view, n_del;
  END IF;
  RAISE NOTICE 'C ok: xarajatni faqat Moliya o''qiydi, hech kim to''g''ridan-to''g''ri yozmaydi';
END $$;

-- ─── D: void_expense — reason required, once only, viewer refused ───────────
DO $$
DECLARE v_id uuid; r record;
BEGIN
  SELECT id INTO v_id FROM public.expenses WHERE category = 'reklama';
  PERFORM pg_temp.as_user('54000000-0000-0000-0000-000000000002');
  BEGIN
    PERFORM public.void_expense(v_id, 'xato');
    RAISE EXCEPTION 'D FAILED: ko''ruvchi bekor qildi';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'forbidden: finance_only' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.as_user('54000000-0000-0000-0000-000000000001');
  BEGIN
    PERFORM public.void_expense(v_id, '  ');
    RAISE EXCEPTION 'D FAILED: sababsiz bekor qilindi';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'reason_required' THEN RAISE; END IF;
  END;
  PERFORM public.void_expense(v_id, ' summa xato ');
  BEGIN
    PERFORM public.void_expense(v_id, 'yana');
    RAISE EXCEPTION 'D FAILED: ikki marta bekor qilindi';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'already_voided' THEN RAISE; END IF;
  END;
  SELECT * INTO r FROM public.expenses WHERE id = v_id;
  IF r.voided_at IS NULL OR r.voided_by <> '54000000-0000-0000-0000-000000000001' OR r.void_reason <> 'summa xato' THEN
    RAISE EXCEPTION 'D FAILED: %', row_to_json(r);
  END IF;
  RAISE NOTICE 'D ok: bekor qilish sabab bilan, bir marta, faqat Moliya muharriri';
END $$;

-- Live expenses now: zal 1.0 mln (A, 09-05), ofis 0.5 mln (general, 09-20), spiker 0.7 mln (C, 09-12).
-- Voided: reklama 0.3 mln (B, 08-15). Income: 4 mln (A, 09-10).

-- ─── E: finance_summary — expense / net with filters ────────────────────────
DO $$
DECLARE r record;
BEGIN
  PERFORM pg_temp.as_user('54000000-0000-0000-0000-000000000002');
  SELECT * INTO r FROM public.finance_summary();
  IF r.income <> 4000000 OR r.expense <> 2200000 OR r.net <> 1800000 THEN
    RAISE EXCEPTION 'E1 FAILED (filtrsiz): %', row_to_json(r);
  END IF;
  SELECT * INTO r FROM public.finance_summary(p_event_id => 'e5400000-0000-0000-0000-000000000001');
  IF r.expense <> 1000000 OR r.net <> 3000000 THEN
    RAISE EXCEPTION 'E2 FAILED (tadbir A): %', row_to_json(r);
  END IF;
  SELECT * INTO r FROM public.finance_summary(p_from => '2026-09-10', p_to => '2026-09-30');
  IF r.income <> 4000000 OR r.expense <> 1200000 THEN
    RAISE EXCEPTION 'E3 FAILED (davr): %', row_to_json(r);
  END IF;
  SELECT * INTO r FROM public.finance_summary(p_from => '2026-08-01', p_to => '2026-08-31');
  IF r.expense <> 0 THEN
    RAISE EXCEPTION 'E4 FAILED (bekor qilingan xarajat hisoblandi): %', row_to_json(r);
  END IF;
  PERFORM pg_temp.as_user('54000000-0000-0000-0000-000000000003');
  SELECT * INTO r FROM public.finance_summary();
  IF r.expense <> 0 OR r.income <> 0 THEN
    RAISE EXCEPTION 'E5 FAILED (huquqsiz hodim raqam ko''rdi): %', row_to_json(r);
  END IF;
  RAISE NOTICE 'E ok: Chiqim va Sof cashflow filtrlar bilan to''g''ri, bekor qilingan hisobga kirmaydi';
END $$;

-- ─── F: event_profit — per-event rows, general row, Σ profit = net ─────────
DO $$
DECLARE r record; v_sum numeric; v_net numeric; n int;
BEGIN
  PERFORM pg_temp.as_user('54000000-0000-0000-0000-000000000002');
  SELECT * INTO r FROM public.event_profit() WHERE event_id = 'e5400000-0000-0000-0000-000000000001';
  IF r.event_name <> 'Event A' OR r.total_value <> 20000000 OR r.agreed <> 10000000
     OR r.collected <> 4000000 OR r.debt <> 6000000 OR r.expense <> 1000000 OR r.profit <> 3000000 THEN
    RAISE EXCEPTION 'F1 FAILED (Event A): %', row_to_json(r);
  END IF;
  SELECT * INTO r FROM public.event_profit() WHERE event_id IS NULL;
  IF r.expense <> 500000 OR r.profit <> -500000 OR r.event_name IS NOT NULL THEN
    RAISE EXCEPTION 'F2 FAILED (umumiy qator): %', row_to_json(r);
  END IF;
  -- Event B has only a voided expense → no row at all.
  IF EXISTS (SELECT 1 FROM public.event_profit() WHERE event_id = 'e5400000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'F3 FAILED: faqat bekor qilingan xarajatli tadbir chiqdi';
  END IF;
  SELECT SUM(profit) INTO v_sum FROM public.event_profit();
  SELECT net INTO v_net FROM public.finance_summary();
  IF v_sum <> v_net THEN RAISE EXCEPTION 'F4 FAILED: Σfoyda=% net=%', v_sum, v_net; END IF;
  SELECT SUM(profit) INTO v_sum FROM public.event_profit('2026-09-11', '2026-09-30');
  SELECT net INTO v_net FROM public.finance_summary('2026-09-11', '2026-09-30');
  IF v_sum <> v_net THEN RAISE EXCEPTION 'F5 FAILED (davr): Σfoyda=% net=%', v_sum, v_net; END IF;
  SELECT count(*) INTO n FROM public.event_profit(p_event_id => 'e5400000-0000-0000-0000-000000000001');
  IF n <> 1 THEN RAISE EXCEPTION 'F6 FAILED: tadbir filtri % qator qaytardi', n; END IF;
  PERFORM pg_temp.as_user('54000000-0000-0000-0000-000000000003');
  SELECT count(*) INTO n FROM public.event_profit();
  IF n <> 0 THEN RAISE EXCEPTION 'F7 FAILED: huquqsiz hodim % qator ko''rdi', n; END IF;
  RAISE NOTICE 'F ok: har tadbir foydasi, umumiy qator, Σfoyda = Sof cashflow';
END $$;

-- ─── G: event_finance_totals is gone ────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.event_finance_totals()') IS NOT NULL THEN
    RAISE EXCEPTION 'G FAILED: event_finance_totals hali bor';
  END IF;
  RAISE NOTICE 'G ok: event_finance_totals o''chirildi';
END $$;

-- ─── H: deleting an event keeps its expense as a general one ────────────────
DO $$
DECLARE v_before numeric; v_after numeric; v_ev uuid;
BEGIN
  PERFORM pg_temp.as_user('54000000-0000-0000-0000-000000000002');
  SELECT expense INTO v_before FROM public.finance_summary();
  DELETE FROM public.events WHERE id = 'e5400000-0000-0000-0000-000000000003';
  SELECT event_id INTO v_ev FROM public.expenses WHERE category = 'spiker';
  SELECT expense INTO v_after FROM public.finance_summary();
  IF v_ev IS NOT NULL OR v_before <> v_after THEN
    RAISE EXCEPTION 'H FAILED: event_id=% oldin=% keyin=%', v_ev, v_before, v_after;
  END IF;
  RAISE NOTICE 'H ok: tadbir o''chsa, xarajat umumiyga o''tadi, Chiqim o''zgarmaydi';
END $$;

SELECT '054: hamma testlar o''tdi ✓' AS natija;
