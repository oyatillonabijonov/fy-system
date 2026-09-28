-- Behavioural tests for migration 053 (Moliya core).
-- THROWAWAY DB only (recipe: CLAUDE.md §5 "Tests"). Run:
--   docker exec fy-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql
-- Every block RAISEs on failure; the last line prints on success.
\set ON_ERROR_STOP on

-- ─── FIXTURES ────────────────────────────────────────────────────────────────
-- F = finance editor, V = finance viewer, S = plain staff, P = Sotuv seller.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('51000000-0000-0000-0000-000000000001', 'fin51@fy.uz',    '{"full_name":"Moliyachi","role":"xodim"}'::jsonb),
  ('51000000-0000-0000-0000-000000000002', 'view51@fy.uz',   '{"full_name":"Kuzatuvchi","role":"xodim"}'::jsonb),
  ('51000000-0000-0000-0000-000000000003', 'staff51@fy.uz',  '{"full_name":"Hodim","role":"xodim"}'::jsonb),
  ('51000000-0000-0000-0000-000000000004', 'seller51@fy.uz', '{"full_name":"Sotuvchi","role":"xodim"}'::jsonb);
UPDATE public.profiles SET department = 'sotuv' WHERE id = '51000000-0000-0000-0000-000000000004';
INSERT INTO public.user_permissions (user_id, module, can_view, can_edit, can_delete) VALUES
  ('51000000-0000-0000-0000-000000000001', 'tadbirlar-moliya', true, true,  false),
  ('51000000-0000-0000-0000-000000000002', 'tadbirlar-moliya', true, false, false);

-- Already over: since 061 cashback is credited after the event (settle_event_cashback)
INSERT INTO public.events (id, name, cashback_percent, date) VALUES
  ('e5100000-0000-0000-0000-000000000001', 'Event 1', 10, now() - interval '3 days'),
  ('e5100000-0000-0000-0000-000000000002', 'Event 2', 0,  now() - interval '3 days'),
  ('e5100000-0000-0000-0000-000000000003', 'Event 3', 0,  now() - interval '3 days');
INSERT INTO public.event_tariffs (id, event_id, name, price) VALUES
  ('7b000000-0000-0000-0000-000000000001', 'e5100000-0000-0000-0000-000000000001', 'Standart', 10000000),
  ('7b000000-0000-0000-0000-000000000002', 'e5100000-0000-0000-0000-000000000002', 'Standart',  5000000),
  ('7b000000-0000-0000-0000-000000000003', 'e5100000-0000-0000-0000-000000000003', 'Standart', 20000000);
INSERT INTO public.clients (id, full_name, phone) VALUES
  ('c5100000-0000-0000-0000-000000000001', 'Mavjud', '+998901000001');

-- The stand has no Supabase default grants; the real API role needs these.
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.payments, public.event_participants, public.events, public.clients,
     public.profiles, public.user_permissions, public.cashback_transactions
  TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.as_user(p uuid) RETURNS void LANGUAGE sql AS
  $$ SELECT set_config('request.jwt.claim.sub', p::text, false)::void $$;

-- ─── A: new client + enrolment + payment in one call ───────────────────────
DO $$
DECLARE v_pay uuid; r record;
BEGIN
  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000001');
  v_pay := public.record_payment(
    p_event_id => 'e5100000-0000-0000-0000-000000000001', p_amount => 4000000, p_method => 'naqd',
    p_paid_at => '2026-09-10 10:00+05', p_full_name => 'Ali Valiyev', p_phone => '90 100 00 02',
    p_tariff_id => '7b000000-0000-0000-0000-000000000001',
    p_seller_id => '51000000-0000-0000-0000-000000000004',
    p_next_due_date => '2026-10-10', p_note => 'birinchi');
  PERFORM public.settle_event_cashback();
  SELECT ep.price, ep.paid, ep.next_due_date, ep.cashback_earned, p.recorded_by, p.kind, p.note
    INTO r
  FROM public.payments p JOIN public.event_participants ep ON ep.id = p.participant_id
  WHERE p.id = v_pay;
  IF r.price <> 10000000 OR r.paid <> 4000000 OR r.next_due_date <> '2026-10-10'
     OR r.cashback_earned <> 400000 OR r.recorded_by <> '51000000-0000-0000-0000-000000000001'
     OR r.kind <> 'payment' OR r.note <> 'birinchi' THEN
    RAISE EXCEPTION 'A FAILED: %', row_to_json(r);
  END IF;
  RAISE NOTICE 'A ok: mijoz + yozilish + to''lov bitta chaqiruvda';
END $$;

-- ─── B: over-debt payment for a new client → nothing is saved ───────────────
DO $$
DECLARE v int;
BEGIN
  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000001');
  BEGIN
    PERFORM public.record_payment(
      p_event_id => 'e5100000-0000-0000-0000-000000000001', p_amount => 4000000, p_method => 'naqd',
      p_full_name => 'Ortiqcha', p_phone => '+998901000003',
      p_tariff_id => '7b000000-0000-0000-0000-000000000001',
      p_seller_id => '51000000-0000-0000-0000-000000000004', p_price => 3000000);
    RAISE EXCEPTION 'B FAILED: qarzdan ortiq to''lov qabul qilindi';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'amount_exceeds_debt%' THEN RAISE EXCEPTION 'B FAILED: %', SQLERRM; END IF;
  END;
  SELECT count(*) INTO v FROM public.clients WHERE phone = '+998901000003';
  IF v <> 0 THEN RAISE EXCEPTION 'B FAILED: mijoz qolib ketdi'; END IF;
  RAISE NOTICE 'B ok: amount_exceeds_debt, hech narsa saqlanmadi';
END $$;

-- ─── C: existing client not in the event, no tariff (event has tariffs) → tariff_required (058) ─
DO $$
BEGIN
  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000001');
  PERFORM public.record_payment(
    p_event_id => 'e5100000-0000-0000-0000-000000000001', p_amount => 1000, p_method => 'naqd',
    p_client_id => 'c5100000-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'C FAILED: tarifsiz yozildi';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'tariff_required' THEN RAISE EXCEPTION 'C FAILED: %', SQLERRM; END IF;
  RAISE NOTICE 'C ok: tariff_required';
END $$;

-- ─── D: second installment clears the due date once fully paid ──────────────
DO $$
DECLARE v_client uuid; r record;
BEGIN
  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000001');
  SELECT id INTO v_client FROM public.clients WHERE phone = '+998901000002';
  PERFORM public.record_payment(
    p_event_id => 'e5100000-0000-0000-0000-000000000001', p_amount => 6000000, p_method => 'karta',
    p_client_id => v_client);
  PERFORM public.settle_event_cashback();
  SELECT paid, next_due_date, cashback_earned INTO r
  FROM public.event_participants
  WHERE contact_id = v_client AND event_id = 'e5100000-0000-0000-0000-000000000001';
  IF r.paid <> 10000000 OR r.next_due_date IS NOT NULL OR r.cashback_earned <> 1000000 THEN
    RAISE EXCEPTION 'D FAILED: %', row_to_json(r);
  END IF;
  RAISE NOTICE 'D ok: to''liq to''landi, muddat tozalandi';
END $$;

-- ─── E: void needs a reason, lowers paid, claws back cashback, only once ────
DO $$
DECLARE v_pay uuid; r record;
BEGIN
  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000001');
  SELECT p.id INTO v_pay
  FROM public.payments p
  JOIN public.event_participants ep ON ep.id = p.participant_id
  JOIN public.clients c ON c.id = ep.contact_id
  WHERE c.phone = '+998901000002' AND p.amount = 6000000;

  BEGIN
    PERFORM public.void_payment(v_pay, '   ');
    RAISE EXCEPTION 'E FAILED: sababsiz bekor qilindi';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'reason_required' THEN RAISE EXCEPTION 'E FAILED: %', SQLERRM; END IF;
  END;

  PERFORM public.void_payment(v_pay, 'Xato summa');
  PERFORM public.settle_event_cashback();
  SELECT ep.paid, ep.cashback_earned, p.voided_by, p.void_reason INTO r
  FROM public.payments p JOIN public.event_participants ep ON ep.id = p.participant_id
  WHERE p.id = v_pay;
  IF r.paid <> 4000000 OR r.cashback_earned <> 400000
     OR r.voided_by <> '51000000-0000-0000-0000-000000000001' OR r.void_reason <> 'Xato summa' THEN
    RAISE EXCEPTION 'E FAILED: %', row_to_json(r);
  END IF;

  BEGIN
    PERFORM public.void_payment(v_pay, 'yana');
    RAISE EXCEPTION 'E FAILED: ikki marta bekor qilindi';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'already_voided' THEN RAISE EXCEPTION 'E FAILED: %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'E ok: bekor qilish, keshbek qaytarildi';
END $$;

-- ─── F: refund is a negative row, capped by cash actually paid ──────────────
DO $$
DECLARE v_part uuid; v_ref uuid; r record;
BEGIN
  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000001');
  SELECT ep.id INTO v_part
  FROM public.event_participants ep JOIN public.clients c ON c.id = ep.contact_id
  WHERE c.phone = '+998901000002';

  v_ref := public.refund_payment(v_part, 1000000, 'naqd', 'qisman qaytarish');
  SELECT p.amount, p.kind, ep.paid INTO r
  FROM public.payments p JOIN public.event_participants ep ON ep.id = p.participant_id
  WHERE p.id = v_ref;
  IF r.amount <> -1000000 OR r.kind <> 'refund' OR r.paid <> 3000000 THEN
    RAISE EXCEPTION 'F FAILED: %', row_to_json(r);
  END IF;

  BEGIN
    PERFORM public.refund_payment(v_part, 5000000, 'naqd');
    RAISE EXCEPTION 'F FAILED: to''langandan ko''p qaytarildi';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'refund_exceeds_paid%' THEN RAISE EXCEPTION 'F FAILED: %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'F ok: qaytarish';
END $$;

-- ─── G: voiding a refund may not push paid above the price ──────────────────
DO $$
DECLARE v_part uuid; v_ref uuid;
BEGIN
  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000001');
  SELECT ep.id INTO v_part
  FROM public.event_participants ep JOIN public.clients c ON c.id = ep.contact_id
  WHERE c.phone = '+998901000002';
  SELECT id INTO v_ref FROM public.payments WHERE participant_id = v_part AND kind = 'refund';

  UPDATE public.event_participants SET price = 3000000 WHERE id = v_part;  -- paid is 3M
  BEGIN
    PERFORM public.void_payment(v_ref, 'qaytarish xato');
    RAISE EXCEPTION 'G FAILED: ortiqcha to''lovga olib keldi';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'void_would_overpay' THEN RAISE EXCEPTION 'G FAILED: %', SQLERRM; END IF;
  END;
  UPDATE public.event_participants SET price = 10000000 WHERE id = v_part;
  RAISE NOTICE 'G ok: void_would_overpay';
END $$;

-- ─── H: only finance editors may move money; only finance may read it ──────
DO $$
BEGIN
  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000003');
  BEGIN
    PERFORM public.record_payment(
      p_event_id => 'e5100000-0000-0000-0000-000000000002', p_amount => 1000, p_method => 'naqd',
      p_client_id => 'c5100000-0000-0000-0000-000000000001',
      p_tariff_id => '7b000000-0000-0000-0000-000000000002',
      p_seller_id => '51000000-0000-0000-0000-000000000004');
    RAISE EXCEPTION 'H FAILED: oddiy hodim to''lov kiritdi';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'forbidden: finance_only' THEN RAISE EXCEPTION 'H FAILED: %', SQLERRM; END IF;
  END;

  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000002');
  BEGIN
    PERFORM public.void_payment((SELECT id FROM public.payments LIMIT 1), 'x');
    RAISE EXCEPTION 'H FAILED: faqat ko''ruvchi bekor qildi';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'forbidden: finance_only' THEN RAISE EXCEPTION 'H FAILED: %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'H ok: yozish faqat can_edit bilan';
END $$;

DO $$
DECLARE n_staff int; n_view int;
BEGIN
  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000003');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n_staff FROM public.payments;
  RESET ROLE;

  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000002');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n_view FROM public.payments;
  RESET ROLE;

  IF n_staff <> 0 OR n_view = 0 THEN
    RAISE EXCEPTION 'H FAILED: RLS staff=% viewer=%', n_staff, n_view;
  END IF;
  RAISE NOTICE 'H ok: to''lovlarni faqat Moliya o''qiydi';
END $$;

-- ─── I: no direct writes to payments, even for a finance editor ─────────────
DO $$
DECLARE v_part uuid; v_before int; v_after int;
BEGIN
  SELECT id INTO v_part FROM public.event_participants
  WHERE event_id = 'e5100000-0000-0000-0000-000000000001' LIMIT 1;
  SELECT count(*) INTO v_before FROM public.payments;

  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000001');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.payments (participant_id, amount, method) VALUES (v_part, 100, 'naqd');
    RAISE EXCEPTION 'I FAILED: to''g''ridan-to''g''ri INSERT o''tdi';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;  -- RLS: no INSERT policy
  END;
  DELETE FROM public.payments;  -- no DELETE policy → 0 rows
  RESET ROLE;

  SELECT count(*) INTO v_after FROM public.payments;
  IF v_after <> v_before THEN RAISE EXCEPTION 'I FAILED: % → %', v_before, v_after; END IF;
  RAISE NOTICE 'I ok: to''lovlarga faqat RPC yozadi';
END $$;

-- ─── J: price / due date are finance fields; other columns stay staff-editable
DO $$
DECLARE v_part uuid; v_price numeric;
BEGIN
  SELECT id INTO v_part FROM public.event_participants
  WHERE event_id = 'e5100000-0000-0000-0000-000000000001' LIMIT 1;

  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000003');
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.event_participants SET price = 1 WHERE id = v_part;
    RAISE EXCEPTION 'J FAILED: hodim narxni o''zgartirdi';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'forbidden: finance_fields' THEN RAISE EXCEPTION 'J FAILED: %', SQLERRM; END IF;
  END;
  UPDATE public.event_participants SET notes = 'izoh' WHERE id = v_part;
  RESET ROLE;

  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000001');
  SET LOCAL ROLE authenticated;
  UPDATE public.event_participants SET next_due_date = '2030-01-01' WHERE id = v_part;
  RESET ROLE;

  SELECT price INTO v_price FROM public.event_participants WHERE id = v_part;
  IF v_price = 1 THEN RAISE EXCEPTION 'J FAILED: narx o''zgargan'; END IF;
  RAISE NOTICE 'J ok: narx va muddat faqat Moliyada';
END $$;

-- ─── K: participants/events with active payments can't be deleted ───────────
DO $$
BEGIN
  BEGIN
    DELETE FROM public.event_participants WHERE event_id = 'e5100000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'K FAILED: to''lovi bor ishtirokchi o''chdi';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'participant_has_payments' THEN RAISE EXCEPTION 'K FAILED: %', SQLERRM; END IF;
  END;
  BEGIN
    DELETE FROM public.events WHERE id = 'e5100000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'K FAILED: to''lovi bor tadbir o''chdi';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'participant_has_payments' THEN RAISE EXCEPTION 'K FAILED: %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'K ok: to''lovi borlar o''chmaydi';
END $$;

DO $$
DECLARE v_pay uuid; v_part uuid;
BEGIN
  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000001');
  v_pay := public.record_payment(
    p_event_id => 'e5100000-0000-0000-0000-000000000002', p_amount => 1000000, p_method => 'naqd',
    p_client_id => 'c5100000-0000-0000-0000-000000000001',
    p_tariff_id => '7b000000-0000-0000-0000-000000000002',
    p_seller_id => '51000000-0000-0000-0000-000000000004');
  SELECT participant_id INTO v_part FROM public.payments WHERE id = v_pay;
  PERFORM public.void_payment(v_pay, 'test');
  DELETE FROM public.event_participants WHERE id = v_part;
  IF EXISTS (SELECT 1 FROM public.event_participants WHERE id = v_part) THEN
    RAISE EXCEPTION 'K FAILED: faqat bekor qilingan to''lovi bor ishtirokchi o''chmadi';
  END IF;
  RAISE NOTICE 'K ok: bekor qilingan to''lovlar o''chirishga to''sqinlik qilmaydi';
END $$;

-- ─── L: finance_summary matches hand-computed totals ────────────────────────
-- Event 3: X via RPC (seller P) pays 5M cash on 15 Aug; Y is a legacy participant
-- with no seller (price 8M) who pays 2M by card on 5 Sep. X is overdue.
DO $$
BEGIN
  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000001');
  PERFORM public.record_payment(
    p_event_id => 'e5100000-0000-0000-0000-000000000003', p_amount => 5000000, p_method => 'naqd',
    p_paid_at => '2026-08-15 12:00+05', p_full_name => 'X Mijoz', p_phone => '+998901000010',
    p_tariff_id => '7b000000-0000-0000-0000-000000000003',
    p_seller_id => '51000000-0000-0000-0000-000000000004');
  INSERT INTO public.clients (id, full_name, phone)
  VALUES ('c5100000-0000-0000-0000-000000000009', 'Y Mijoz', '+998901000011');
  INSERT INTO public.event_participants (event_id, contact_id, full_name, price, paid)
  VALUES ('e5100000-0000-0000-0000-000000000003', 'c5100000-0000-0000-0000-000000000009', 'Y Mijoz', 8000000, 0);
  PERFORM public.record_payment(
    p_event_id => 'e5100000-0000-0000-0000-000000000003', p_amount => 2000000, p_method => 'karta',
    p_paid_at => '2026-09-05 12:00+05', p_client_id => 'c5100000-0000-0000-0000-000000000009');
  UPDATE public.event_participants SET next_due_date = '2020-01-01'
  WHERE event_id = 'e5100000-0000-0000-0000-000000000003' AND full_name = 'X Mijoz';
END $$;

DO $$
DECLARE s record;
BEGIN
  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000001');
  SET LOCAL ROLE authenticated;

  SELECT * INTO s FROM public.finance_summary(p_event_id => 'e5100000-0000-0000-0000-000000000003');
  IF s.income <> 7000000 OR s.debt <> 21000000 OR s.overdue_debt <> 15000000
     OR s.agreed <> 28000000 OR s.collected <> 7000000 THEN
    RAISE EXCEPTION 'L FAILED (hammasi): %', row_to_json(s);
  END IF;

  SELECT * INTO s FROM public.finance_summary(p_event_id => 'e5100000-0000-0000-0000-000000000003', p_method => 'karta');
  IF s.income <> 2000000 THEN RAISE EXCEPTION 'L FAILED (karta): %', row_to_json(s); END IF;

  SELECT * INTO s FROM public.finance_summary(
    p_event_id => 'e5100000-0000-0000-0000-000000000003', p_seller_id => '51000000-0000-0000-0000-000000000004');
  IF s.income <> 5000000 OR s.debt <> 15000000 THEN RAISE EXCEPTION 'L FAILED (sotuvchi): %', row_to_json(s); END IF;

  SELECT * INTO s FROM public.finance_summary(p_event_id => 'e5100000-0000-0000-0000-000000000003', p_no_seller => true);
  IF s.income <> 2000000 OR s.debt <> 6000000 THEN RAISE EXCEPTION 'L FAILED (sotuvchisiz): %', row_to_json(s); END IF;

  SELECT * INTO s FROM public.finance_summary(
    p_event_id => 'e5100000-0000-0000-0000-000000000003', p_from => '2026-09-01', p_to => '2026-09-30');
  IF s.income <> 2000000 THEN RAISE EXCEPTION 'L FAILED (sentyabr): %', row_to_json(s); END IF;

  -- The date range narrows debt by enrolment day: both enrolled today, so 2020 is empty.
  SELECT * INTO s FROM public.finance_summary(
    p_event_id => 'e5100000-0000-0000-0000-000000000003', p_from => '2020-01-01', p_to => '2020-01-31');
  IF s.debt <> 0 THEN RAISE EXCEPTION 'L FAILED (2020 qarz): %', row_to_json(s); END IF;
  RESET ROLE;

  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000003');
  SET LOCAL ROLE authenticated;
  SELECT * INTO s FROM public.finance_summary(p_event_id => 'e5100000-0000-0000-0000-000000000003');
  RESET ROLE;
  IF s.income <> 0 OR s.debt <> 0 THEN RAISE EXCEPTION 'L FAILED (oddiy hodim): %', row_to_json(s); END IF;
  RAISE NOTICE 'L ok: KPI''lar qo''lda hisoblangan bilan mos';
END $$;

-- ─── M: finance_debtors statuses, order, joins, age ─────────────────────────
DO $$
DECLARE n int; r record;
BEGIN
  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000001');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.finance_debtors(p_event_id => 'e5100000-0000-0000-0000-000000000003');
  IF n <> 2 THEN RAISE EXCEPTION 'M FAILED (debt) %', n; END IF;
  SELECT count(*) INTO n FROM public.finance_debtors(p_event_id => 'e5100000-0000-0000-0000-000000000003', p_status => 'overdue');
  IF n <> 1 THEN RAISE EXCEPTION 'M FAILED (overdue) %', n; END IF;
  SELECT count(*) INTO n FROM public.finance_debtors(p_event_id => 'e5100000-0000-0000-0000-000000000003', p_status => 'paid');
  IF n <> 0 THEN RAISE EXCEPTION 'M FAILED (paid) %', n; END IF;
  SELECT * INTO r FROM public.finance_debtors(p_event_id => 'e5100000-0000-0000-0000-000000000003') LIMIT 1;
  IF r.full_name <> 'X Mijoz' OR r.debt <> 15000000 OR r.seller_name <> 'Sotuvchi'
     OR r.tariff_name <> 'Standart' OR r.age_days <> 0 OR r.event_name <> 'Event 3' THEN
    RAISE EXCEPTION 'M FAILED (row): %', row_to_json(r);
  END IF;
  RESET ROLE;

  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000003');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.finance_debtors(p_event_id => 'e5100000-0000-0000-0000-000000000003');
  RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'M FAILED (oddiy hodim) %', n; END IF;
  RAISE NOTICE 'M ok: qarzdorlar ro''yxati';
END $$;

-- ─── N: legacy negative payment was backfilled as a refund ──────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.payments WHERE note = 'legacy-negative' AND kind <> 'refund') THEN
    RAISE EXCEPTION 'N FAILED: eski manfiy to''lov refund bo''lmadi';
  END IF;
  RAISE NOTICE 'N ok: backfill';
END $$;

-- ─── O (I-1/I-2): void of a payment may not drive net paid negative ─────────
-- pay 10M → refund 3M (paid 7M, cashback_used 0 on this no-cashback event) →
-- void the 10M payment would leave paid = -3M: refused, nothing changes.
DO $$
DECLARE v_pay uuid; v_part uuid; v_paid numeric;
BEGIN
  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000001');
  v_pay := public.record_payment(
    p_event_id => 'e5100000-0000-0000-0000-000000000003', p_amount => 10000000, p_method => 'naqd',
    p_full_name => 'O Mijoz', p_phone => '+998901000020',
    p_tariff_id => '7b000000-0000-0000-0000-000000000003',
    p_seller_id => '51000000-0000-0000-0000-000000000004');
  SELECT participant_id INTO v_part FROM public.payments WHERE id = v_pay;
  PERFORM public.refund_payment(v_part, 3000000, 'naqd', 'qisman');

  SELECT paid INTO v_paid FROM public.event_participants WHERE id = v_part;
  IF v_paid <> 7000000 THEN RAISE EXCEPTION 'O SETUP FAILED: paid=%', v_paid; END IF;

  BEGIN
    PERFORM public.void_payment(v_pay, 'xato');
    RAISE EXCEPTION 'O FAILED: manfiy to''langan summaga olib keldi';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'void_would_go_negative' THEN RAISE EXCEPTION 'O FAILED: %', SQLERRM; END IF;
  END;

  SELECT paid INTO v_paid FROM public.event_participants WHERE id = v_part;
  IF v_paid <> 7000000 THEN RAISE EXCEPTION 'O FAILED: holat o''zgardi %', v_paid; END IF;
  IF EXISTS (SELECT 1 FROM public.payments WHERE id = v_pay AND voided_at IS NOT NULL) THEN
    RAISE EXCEPTION 'O FAILED: baribir bekor qilindi';
  END IF;
  RAISE NOTICE 'O ok: void_would_go_negative, hech narsa o''zgarmadi';
END $$;

-- ─── P (I-3): a partial payment keeps the existing due date ────────────────
DO $$
DECLARE v_client uuid; r record;
BEGIN
  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000001');
  PERFORM public.record_payment(
    p_event_id => 'e5100000-0000-0000-0000-000000000002', p_amount => 2000000, p_method => 'naqd',
    p_full_name => 'P Mijoz', p_phone => '+998901000021',
    p_tariff_id => '7b000000-0000-0000-0000-000000000002',
    p_seller_id => '51000000-0000-0000-0000-000000000004',
    p_next_due_date => '2026-11-01');
  SELECT id INTO v_client FROM public.clients WHERE phone = '+998901000021';

  -- Partial, no new date given → the existing one must survive.
  PERFORM public.record_payment(
    p_event_id => 'e5100000-0000-0000-0000-000000000002', p_amount => 1000000, p_method => 'naqd',
    p_client_id => v_client);
  SELECT next_due_date, paid INTO r FROM public.event_participants
  WHERE contact_id = v_client AND event_id = 'e5100000-0000-0000-0000-000000000002';
  -- IS DISTINCT FROM, not <>: the bug being tested can leave next_due_date NULL,
  -- and NULL <> '...' is NULL (not true), which would silently pass a broken fix.
  IF r.next_due_date IS DISTINCT FROM '2026-11-01' OR r.paid <> 3000000 THEN
    RAISE EXCEPTION 'P FAILED (qisman): %', row_to_json(r);
  END IF;

  -- Fully paid off → the date clears regardless.
  PERFORM public.record_payment(
    p_event_id => 'e5100000-0000-0000-0000-000000000002', p_amount => 2000000, p_method => 'naqd',
    p_client_id => v_client);
  SELECT next_due_date, paid INTO r FROM public.event_participants
  WHERE contact_id = v_client AND event_id = 'e5100000-0000-0000-0000-000000000002';
  IF r.next_due_date IS NOT NULL OR r.paid <> 5000000 THEN
    RAISE EXCEPTION 'P FAILED (to''liq): %', row_to_json(r);
  END IF;
  RAISE NOTICE 'P ok: qisman to''lov muddatni saqlaydi, to''liq to''lov tozalaydi';
END $$;

-- ─── R (I-6): agreed price can't be set below what's already paid ──────────
DO $$
DECLARE v_part uuid; v_price numeric;
BEGIN
  SELECT ep.id INTO v_part FROM public.event_participants ep
  JOIN public.clients c ON c.id = ep.contact_id WHERE c.phone = '+998901000020';

  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000001');
  BEGIN
    UPDATE public.event_participants SET price = 5000000 WHERE id = v_part;  -- paid is 7000000
    RAISE EXCEPTION 'R FAILED: kelishuv to''langandan kam qilib qo''yildi';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'price_below_paid' THEN RAISE EXCEPTION 'R FAILED: %', SQLERRM; END IF;
  END;
  SELECT price INTO v_price FROM public.event_participants WHERE id = v_part;
  IF v_price <> 20000000 THEN RAISE EXCEPTION 'R FAILED: narx o''zgardi %', v_price; END IF;
  RAISE NOTICE 'R ok: price_below_paid, moliyachi uchun ham';
END $$;

-- ─── S (I-5): cashback ledger writes and spend_cashback need finance edit ───
DO $$
DECLARE v_part uuid; v_client uuid; r record;
BEGIN
  SELECT ep.id, ep.contact_id INTO v_part, v_client
  FROM public.event_participants ep JOIN public.clients c ON c.id = ep.contact_id
  WHERE c.phone = '+998901000002' AND ep.event_id = 'e5100000-0000-0000-0000-000000000001';

  -- A plain staff row (can_edit false) may not mint a ledger row directly.
  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000003');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.cashback_transactions (client_id, type, amount, description)
    VALUES (v_client, 'manual_add', 500000, 'hodim o''zi qo''shdi');
    RAISE EXCEPTION 'S FAILED: oddiy hodim keshbek yozdi';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;  -- RLS: can_edit_finance() false
  END;
  RESET ROLE;

  -- Same plain staff may not spend_cashback either.
  BEGIN
    PERFORM public.spend_cashback(v_part, v_client, 'e5100000-0000-0000-0000-000000000001', 100000);
    RAISE EXCEPTION 'S FAILED: oddiy hodim keshbek sarfladi';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'forbidden: finance_only' THEN RAISE EXCEPTION 'S FAILED: %', SQLERRM; END IF;
  END;

  -- A finance editor still can.
  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000001');
  PERFORM public.spend_cashback(v_part, v_client, 'e5100000-0000-0000-0000-000000000001', 100000);
  SELECT cashback_used, paid INTO r FROM public.event_participants WHERE id = v_part;
  IF r.cashback_used <> 100000 OR r.paid <> 3100000 THEN
    RAISE EXCEPTION 'S FAILED (moliyachi): %', row_to_json(r);
  END IF;
  RAISE NOTICE 'S ok: keshbek yozuvi va spend_cashback faqat can_edit_finance bilan';
END $$;

-- ─── T: amo_dashboard revenue — voided/refunded excluded; dashboard-only
-- viewer (no tadbirlar-moliya) still sees the correct number, though a direct
-- SELECT on payments returns nothing for them (merge of 049/050 into 053:
-- payments SELECT is now Moliya-only, so amo_dashboard's revenue CTE must go
-- through dashboard_revenue() instead of summing `payments` itself).
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('51000000-0000-0000-0000-000000000005', 'dashonly51@fy.uz', '{"full_name":"Dashboard Ko''ruvchi","role":"xodim"}'::jsonb);
INSERT INTO public.user_permissions (user_id, module, can_view, can_edit, can_delete) VALUES
  ('51000000-0000-0000-0000-000000000005', 'dashboard', true, false, false);
-- amo_dashboard is SECURITY INVOKER: the calling role needs table SELECT too
-- (the fixtures' earlier GRANT block didn't cover the amo_* tables).
GRANT SELECT ON public.amo_pipelines, public.amo_statuses, public.amo_users,
  public.amo_leads, public.amo_status_changes, public.amo_tasks, public.amo_sync_state
  TO authenticated;

-- The window must contain "now()" (paid_at defaults to it in record_payment/
-- refund_payment), and every earlier block's fixtures are also dated within
-- 2026 — so absolute totals are contaminated by A..S. To stay correct
-- regardless, this block reads amo_dashboard as deltas around single known
-- operations (nothing else touches the DB between two consecutive calls in
-- this single-threaded script), which isolates exactly the effect of that
-- operation no matter what the running total already is.
DO $$
DECLARE
  v_event  uuid := 'e5100000-0000-0000-0000-0000000000d1';
  v_tariff uuid := '7b000000-0000-0000-0000-0000000000d1';
  v_pay1   uuid;
  v_pay4   uuid;
  v_part   uuid;
  v_from   timestamptz := '2026-09-01 00:00:00+05';
  v_to     timestamptz := '2026-10-01 00:00:00+05';
  v        jsonb;
  n        int;
  rev1 numeric; rev2 numeric; rev3 numeric;
  pay1 numeric; pay2 numeric; pay3 numeric;
BEGIN
  INSERT INTO public.events (id, name) VALUES (v_event, 'Dashboard Test');
  INSERT INTO public.event_tariffs (id, event_id, name, price) VALUES (v_tariff, v_event, 'Standart', 10000000);

  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000001');
  v_pay1 := public.record_payment(
    p_event_id => v_event, p_amount => 3000000, p_method => 'naqd',
    p_full_name => 'Dash Mijoz', p_phone => '+998901000031',
    p_tariff_id => v_tariff, p_seller_id => '51000000-0000-0000-0000-000000000004');
  SELECT participant_id INTO v_part FROM public.payments WHERE id = v_pay1;

  -- Snapshot 1, as the dashboard-only viewer (no tadbirlar-moliya at all):
  -- amo_dashboard must already show a non-zero, correct revenue for them.
  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000005');
  SET LOCAL ROLE authenticated;
  SELECT public.amo_dashboard(v_from, v_to, NULL) INTO v;
  RESET ROLE;
  rev1 := (v->'kpi'->>'revenue')::numeric;
  pay1 := (v->'kpi'->>'payers')::numeric;
  IF rev1 <= 0 THEN RAISE EXCEPTION 'T FAILED (1): dashboard-only ko''ruvchi uchun daromad 0 (kpi=%)', v->'kpi'; END IF;

  -- Refund 500,000 of it → revenue must drop by exactly that (a refund is a
  -- negative row that still counts, per record_payment's own design).
  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000001');
  PERFORM public.refund_payment(v_part, 500000, 'naqd', 'test refund');

  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000005');
  SET LOCAL ROLE authenticated;
  SELECT public.amo_dashboard(v_from, v_to, NULL) INTO v;
  RESET ROLE;
  rev2 := (v->'kpi'->>'revenue')::numeric;
  pay2 := (v->'kpi'->>'payers')::numeric;
  IF rev2 <> rev1 - 500000 THEN
    RAISE EXCEPTION 'T FAILED (2, qaytarish): rev1=% rev2=% (500000 kamaymadi)', rev1, rev2;
  END IF;
  IF pay2 <> pay1 THEN RAISE EXCEPTION 'T FAILED (2, payers): pay1=% pay2=%', pay1, pay2; END IF;

  -- A brand-new client makes a 1,000,000 payment that is immediately voided.
  -- If voided rows leaked into revenue or the payer count, both would move;
  -- they must not, since the payment never really happened.
  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000001');
  v_pay4 := public.record_payment(
    p_event_id => v_event, p_amount => 1000000, p_method => 'karta',
    p_full_name => 'Dash Mijoz 2', p_phone => '+998901000032',
    p_tariff_id => v_tariff, p_seller_id => '51000000-0000-0000-0000-000000000004');
  PERFORM public.void_payment(v_pay4, 'test void');

  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000005');
  SET LOCAL ROLE authenticated;
  SELECT public.amo_dashboard(v_from, v_to, NULL) INTO v;
  RESET ROLE;
  rev3 := (v->'kpi'->>'revenue')::numeric;
  pay3 := (v->'kpi'->>'payers')::numeric;
  IF rev3 <> rev2 THEN
    RAISE EXCEPTION 'T FAILED (3, bekor qilingan): rev2=% rev3=% (bekor qilingan to''lov hisoblanmasligi kerak)', rev2, rev3;
  END IF;
  IF pay3 <> pay2 THEN
    RAISE EXCEPTION 'T FAILED (3, payers): bekor qilingan yangi mijoz to''lovchilar sonini oshirdi (pay2=% pay3=%)', pay2, pay3;
  END IF;

  -- ...yet the same dashboard-only viewer reads nothing directly from
  -- payments (payments select is Moliya-only, 053) — the numbers above came
  -- from dashboard_revenue(), not from a leaked row-level read.
  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000005');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.payments;
  RESET ROLE;
  IF n <> 0 THEN
    RAISE EXCEPTION 'T FAILED (to''g''ridan-to''g''ri o''qish): dashboard ko''ruvchi % qator o''qidi', n;
  END IF;

  -- The gate still holds: an authenticated user with NEITHER `dashboard` NOR
  -- `tadbirlar-moliya` (plain staff, user 3 — no user_permissions row at all)
  -- gets exactly 0 from amo_dashboard, not the auth.uid() IS NULL bypass
  -- (that bypass is for a trusted server context with NO jwt claim at all,
  -- not for an authenticated-but-unpermitted user).
  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000003');
  SET LOCAL ROLE authenticated;
  SELECT public.amo_dashboard(v_from, v_to, NULL) INTO v;
  RESET ROLE;
  IF (v->'kpi'->>'revenue')::numeric <> 0 OR (v->'kpi'->>'payers')::numeric <> 0 THEN
    RAISE EXCEPTION 'T FAILED (huquqsiz hodim): kpi=%', v->'kpi';
  END IF;

  RAISE NOTICE 'T ok: amo_dashboard bekor qilingan/qaytarilgan to''lovlarni to''g''ri hisoblaydi, faqat dashboard huquqi bilan ham ishlaydi, to''lovlar jadvali esa Moliya uchungina ochiq qoladi, huquqsiz hodim uchun esa 0';
END $$;

SELECT '053: hamma testlar o''tdi ✓' AS natija;
