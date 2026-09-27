-- Behavioural tests for migration 055 (receipts). THROWAWAY DB only (CLAUDE.md §5 "Tests").
-- The storage bucket/policies are skipped on the test image (no storage schema);
-- they are checked on the local Supabase stack. This covers attach_receipt.
\set ON_ERROR_STOP on

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('55000000-0000-0000-0000-000000000001', 'fin55@fy.uz',    '{"full_name":"Moliyachi","role":"xodim"}'::jsonb),
  ('55000000-0000-0000-0000-000000000002', 'view55@fy.uz',   '{"full_name":"Kuzatuvchi","role":"xodim"}'::jsonb),
  ('55000000-0000-0000-0000-000000000004', 'seller55@fy.uz', '{"full_name":"Sotuvchi","role":"xodim"}'::jsonb);
UPDATE public.profiles SET department = 'sotuv' WHERE id = '55000000-0000-0000-0000-000000000004';
INSERT INTO public.user_permissions (user_id, module, can_view, can_edit, can_delete) VALUES
  ('55000000-0000-0000-0000-000000000001', 'tadbirlar-moliya', true, true,  false),
  ('55000000-0000-0000-0000-000000000002', 'tadbirlar-moliya', true, false, false);
INSERT INTO public.events (id, name) VALUES ('e5500000-0000-0000-0000-000000000001', 'Event R');
INSERT INTO public.event_tariffs (id, event_id, name, price) VALUES
  ('7d000000-0000-0000-0000-000000000001', 'e5500000-0000-0000-0000-000000000001', 'Standart', 1000000);

CREATE OR REPLACE FUNCTION pg_temp.as_user(p uuid) RETURNS void LANGUAGE sql AS
  $$ SELECT set_config('request.jwt.claim.sub', p::text, false)::void $$;

SELECT pg_temp.as_user('55000000-0000-0000-0000-000000000001');
CREATE TEMP TABLE ids AS SELECT
  public.record_payment(
    p_event_id => 'e5500000-0000-0000-0000-000000000001', p_amount => 400000, p_method => 'naqd',
    p_paid_at => now(), p_full_name => 'Chek Egasi', p_phone => '90 550 00 01',
    p_tariff_id => '7d000000-0000-0000-0000-000000000001',
    p_seller_id => '55000000-0000-0000-0000-000000000004') AS pay,
  public.add_expense('zal', 200000, current_date) AS exp;

-- ─── A: editor attaches receipts to a payment and an expense ────────────────
DO $$
DECLARE v_pay uuid; v_exp uuid; v_paid numeric;
BEGIN
  SELECT pay, exp INTO v_pay, v_exp FROM ids;
  PERFORM pg_temp.as_user('55000000-0000-0000-0000-000000000001');
  PERFORM public.attach_receipt('payment', v_pay, 'payment/' || v_pay || '/a.jpg');
  PERFORM public.attach_receipt('expense', v_exp, 'expense/' || v_exp || '/b.pdf');
  IF (SELECT receipt_path FROM public.payments WHERE id = v_pay) <> 'payment/' || v_pay || '/a.jpg'
     OR (SELECT receipt_path FROM public.expenses WHERE id = v_exp) <> 'expense/' || v_exp || '/b.pdf' THEN
    RAISE EXCEPTION 'A FAILED: receipt_path not saved';
  END IF;
  SELECT paid INTO v_paid FROM public.event_participants
  WHERE event_id = 'e5500000-0000-0000-0000-000000000001';
  IF v_paid <> 400000 THEN RAISE EXCEPTION 'A FAILED: paid changed to %', v_paid; END IF;
  RAISE NOTICE 'A ok: chek to''lov va xarajatga bog''lanadi, pul o''zgarmaydi';
END $$;

-- ─── B: refusals — viewer, wrong folder, second receipt, unknown id ─────────
DO $$
DECLARE v_pay uuid; v_exp uuid;
BEGIN
  SELECT pay, exp INTO v_pay, v_exp FROM ids;

  PERFORM pg_temp.as_user('55000000-0000-0000-0000-000000000002');
  BEGIN
    PERFORM public.attach_receipt('expense', v_exp, 'expense/' || v_exp || '/x.jpg');
    RAISE EXCEPTION 'B FAILED: ko''ruvchi chek biriktirdi';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'forbidden: finance_only' THEN RAISE; END IF;
  END;

  PERFORM pg_temp.as_user('55000000-0000-0000-0000-000000000001');
  BEGIN
    PERFORM public.attach_receipt('payment', v_pay, 'expense/' || v_exp || '/b.pdf');
    RAISE EXCEPTION 'B FAILED: boshqa yozuv papkasi qabul qilindi';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'invalid_receipt_path' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.attach_receipt('payment', v_pay, 'payment/' || v_pay || '/second.jpg');
    RAISE EXCEPTION 'B FAILED: chek almashtirildi';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'receipt_exists' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.attach_receipt('expense', '00000000-0000-0000-0000-0000000000ff',
                                  'expense/00000000-0000-0000-0000-0000000000ff/z.jpg');
    RAISE EXCEPTION 'B FAILED: mavjud bo''lmagan yozuv';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'receipt_target_not_found' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'B ok: ko''ruvchi, boshqa papka, ikkinchi chek va noma''lum yozuv rad etiladi';
END $$;

SELECT '055: hamma testlar o''tdi ✓' AS natija;
