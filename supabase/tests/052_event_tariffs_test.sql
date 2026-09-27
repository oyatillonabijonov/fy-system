-- Behavioural tests for migration 052 (event tariffs + seller + enroll_participant).
-- THROWAWAY DB only (recipe: CLAUDE.md §5 "Tests"). Run:
--   docker exec fy-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql
-- Every block RAISEs on failure; the last line prints on success.
\set ON_ERROR_STOP on

-- ─── FIXTURES ────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('50000000-0000-0000-0000-000000000001', 'staff50@fy.uz',  '{"full_name":"Staff","role":"xodim"}'::jsonb),
  ('50000000-0000-0000-0000-000000000002', 'seller50@fy.uz', '{"full_name":"Sotuvchi","role":"xodim"}'::jsonb),
  ('50000000-0000-0000-0000-000000000003', 'mkt50@fy.uz',    '{"full_name":"Marketolog","role":"xodim"}'::jsonb),
  ('50000000-0000-0000-0000-000000000004', 'member50@fy.uz', '{"full_name":"Member","user_type":"member"}'::jsonb);
UPDATE public.profiles SET department = 'sotuv'     WHERE id = '50000000-0000-0000-0000-000000000002';
UPDATE public.profiles SET department = 'marketing' WHERE id = '50000000-0000-0000-0000-000000000003';

INSERT INTO public.events (id, name, cashback_percent) VALUES
  ('e5000000-0000-0000-0000-000000000001', 'Event A', 5),
  ('e5000000-0000-0000-0000-000000000002', 'Event B', 5);
INSERT INTO public.event_tariffs (id, event_id, name, price, sort_order) VALUES
  ('7a000000-0000-0000-0000-00000000000a', 'e5000000-0000-0000-0000-000000000001', 'Standart', 17000000, 0),
  ('7a000000-0000-0000-0000-00000000000b', 'e5000000-0000-0000-0000-000000000001', 'VIP',      25000000, 1),
  ('7a000000-0000-0000-0000-00000000000c', 'e5000000-0000-0000-0000-000000000002', 'Standart', 10000000, 0);
INSERT INTO public.clients (id, full_name, phone) VALUES
  ('c5000000-0000-0000-0000-000000000001', 'Mavjud Mijoz', '+998901112233');

CREATE OR REPLACE FUNCTION pg_temp.as_user(p uuid) RETURNS void LANGUAGE sql AS
  $$ SELECT set_config('request.jwt.claim.sub', p::text, false)::void $$;

-- ─── T1: negative tariff price is rejected ──────────────────────────────────
DO $$
BEGIN
  INSERT INTO public.event_tariffs (event_id, name, price)
  VALUES ('e5000000-0000-0000-0000-000000000001', 'Minus', -1);
  RAISE EXCEPTION 'T1 FAILED: manfiy narx qabul qilindi';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'T1 ok: manfiy narx rad etildi';
END $$;

-- ─── T2: new client → client + participant (price/tariff/seller from args) ──
DO $$
DECLARE v_pid uuid; r record;
BEGIN
  PERFORM pg_temp.as_user('50000000-0000-0000-0000-000000000001');
  v_pid := public.enroll_participant(
    'e5000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000000b',
    '50000000-0000-0000-0000-000000000002', NULL, '  Yangi Mijoz ', '90 555 66 77');
  SELECT ep.price, ep.paid, ep.tariff_id, ep.seller_id, ep.full_name, c.phone, c.events_count
    INTO r
  FROM public.event_participants ep JOIN public.clients c ON c.id = ep.contact_id
  WHERE ep.id = v_pid;
  IF r.price <> 25000000 OR r.paid <> 0
     OR r.tariff_id <> '7a000000-0000-0000-0000-00000000000b'
     OR r.seller_id <> '50000000-0000-0000-0000-000000000002'
     OR r.full_name <> 'Yangi Mijoz' OR r.phone <> '+998905556677' OR r.events_count <> 1 THEN
    RAISE EXCEPTION 'T2 FAILED: %', row_to_json(r);
  END IF;
  RAISE NOTICE 'T2 ok: yangi mijoz yaratildi va VIP narxi bilan yozildi';
END $$;

-- ─── T3: phone in another format → client_exists with the existing id ──────
DO $$
BEGIN
  PERFORM pg_temp.as_user('50000000-0000-0000-0000-000000000001');
  PERFORM public.enroll_participant(
    'e5000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000000a',
    '50000000-0000-0000-0000-000000000002', NULL, 'Boshqa Ism', '998-90-111-22-33');
  RAISE EXCEPTION 'T3 FAILED: dublikat telefon qabul qilindi';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'client_exists:c5000000-0000-0000-0000-000000000001:Mavjud Mijoz' THEN
    RAISE EXCEPTION 'T3 FAILED: kutilmagan xato: %', SQLERRM;
  END IF;
  RAISE NOTICE 'T3 ok: %', SQLERRM;
END $$;

-- ─── T4: existing client twice → already_enrolled ───────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.as_user('50000000-0000-0000-0000-000000000001');
  PERFORM public.enroll_participant(
    'e5000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000000a',
    '50000000-0000-0000-0000-000000000002', 'c5000000-0000-0000-0000-000000000001');
  PERFORM public.enroll_participant(
    'e5000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000000a',
    '50000000-0000-0000-0000-000000000002', 'c5000000-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'T4 FAILED: ikki marta yozildi';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'already_enrolled' THEN RAISE EXCEPTION 'T4 FAILED: %', SQLERRM; END IF;
  RAISE NOTICE 'T4 ok: already_enrolled';
END $$;

-- ─── T5: tariff of another event → tariff_mismatch ──────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.as_user('50000000-0000-0000-0000-000000000001');
  PERFORM public.enroll_participant(
    'e5000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000000c',
    '50000000-0000-0000-0000-000000000002', 'c5000000-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'T5 FAILED: begona tarif qabul qilindi';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'tariff_mismatch' THEN RAISE EXCEPTION 'T5 FAILED: %', SQLERRM; END IF;
  RAISE NOTICE 'T5 ok: tariff_mismatch';
END $$;

-- ─── T6: seller outside Sotuv → seller_invalid, and NO client left behind ───
DO $$
DECLARE v_cnt int;
BEGIN
  PERFORM pg_temp.as_user('50000000-0000-0000-0000-000000000001');
  BEGIN
    PERFORM public.enroll_participant(
      'e5000000-0000-0000-0000-000000000002', '7a000000-0000-0000-0000-00000000000c',
      '50000000-0000-0000-0000-000000000003', NULL, 'Yarim Qolgan', '+998907770000');
    RAISE EXCEPTION 'T6 FAILED: marketolog sotuvchi bo''ldi';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'seller_invalid' THEN RAISE EXCEPTION 'T6 FAILED: %', SQLERRM; END IF;
  END;
  SELECT count(*) INTO v_cnt FROM public.clients WHERE phone = '+998907770000';
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'T6 FAILED: xatodan keyin mijoz qolib ketdi'; END IF;
  RAISE NOTICE 'T6 ok: seller_invalid, mijoz yaratilmadi';
END $$;

-- ─── T7: non-staff (member) → forbidden ─────────────────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.as_user('50000000-0000-0000-0000-000000000004');
  PERFORM public.enroll_participant(
    'e5000000-0000-0000-0000-000000000002', '7a000000-0000-0000-0000-00000000000c',
    '50000000-0000-0000-0000-000000000002', 'c5000000-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'T7 FAILED: a''zo yozdi';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'forbidden: staff_only' THEN RAISE EXCEPTION 'T7 FAILED: %', SQLERRM; END IF;
  RAISE NOTICE 'T7 ok: forbidden';
END $$;

-- ─── T8: tariff with participants cannot be deleted on its own ──────────────
-- VIP ('…b') holds T2's participant. Not Standart: T4's first enroll was rolled
-- back together with its block when the handler caught already_enrolled.
DO $$
BEGIN
  DELETE FROM public.event_tariffs WHERE id = '7a000000-0000-0000-0000-00000000000b';
  RAISE EXCEPTION 'T8 FAILED: ishtirokchisi bor tarif o''chdi';
EXCEPTION WHEN foreign_key_violation THEN
  RAISE NOTICE 'T8 ok: FK tarifni himoya qildi';
END $$;

-- ─── T9: missing name / junk phone for a new client → client_required ───────
DO $$
BEGIN
  PERFORM pg_temp.as_user('50000000-0000-0000-0000-000000000001');
  PERFORM public.enroll_participant(
    'e5000000-0000-0000-0000-000000000002', '7a000000-0000-0000-0000-00000000000c',
    '50000000-0000-0000-0000-000000000002', NULL, 'Ism', 'yo''q');
  RAISE EXCEPTION 'T9 FAILED: yaroqsiz telefon qabul qilindi';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'client_required' THEN RAISE EXCEPTION 'T9 FAILED: %', SQLERRM; END IF;
  RAISE NOTICE 'T9 ok: client_required';
END $$;

-- ─── T10: deleting an event with tariffs + participants succeeds ────────────
DO $$
DECLARE v_left int;
BEGIN
  DELETE FROM public.events WHERE id = 'e5000000-0000-0000-0000-000000000001';
  SELECT count(*) INTO v_left FROM public.event_tariffs WHERE event_id = 'e5000000-0000-0000-0000-000000000001';
  IF v_left <> 0 THEN RAISE EXCEPTION 'T10 FAILED: tariflar qoldi'; END IF;
  RAISE NOTICE 'T10 ok: tadbir tariflari va ishtirokchilari bilan o''chdi';
END $$;

-- ─── T11: later tariff price change does not touch enrolled participants ────
DO $$
DECLARE v_pid uuid; v_price numeric;
BEGIN
  PERFORM pg_temp.as_user('50000000-0000-0000-0000-000000000001');
  v_pid := public.enroll_participant(
    'e5000000-0000-0000-0000-000000000002', '7a000000-0000-0000-0000-00000000000c',
    '50000000-0000-0000-0000-000000000002', 'c5000000-0000-0000-0000-000000000001');
  UPDATE public.event_tariffs SET price = 99000000 WHERE id = '7a000000-0000-0000-0000-00000000000c';
  SELECT price INTO v_price FROM public.event_participants WHERE id = v_pid;
  IF v_price <> 10000000 THEN RAISE EXCEPTION 'T11 FAILED: narx % bo''lib qoldi', v_price; END IF;
  RAISE NOTICE 'T11 ok: yozilgan narx o''zgarmadi';
END $$;

SELECT '052: hamma testlar o''tdi ✓' AS natija;
