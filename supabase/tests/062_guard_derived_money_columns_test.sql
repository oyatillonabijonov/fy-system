-- Behavioural tests for migration 062 (derived money columns not writable from the API).
-- THROWAWAY DB only (recipe: CLAUDE.md §5 "Tests").
\set ON_ERROR_STOP on

-- F = finance editor, S = plain staff (no Moliya right)
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('62000000-0000-0000-0000-000000000001', 'fin62@fy.uz',   '{"full_name":"Moliyachi62","role":"xodim"}'::jsonb),
  ('62000000-0000-0000-0000-000000000002', 'staff62@fy.uz', '{"full_name":"Hodim62","role":"xodim"}'::jsonb);
INSERT INTO public.user_permissions (user_id, module, can_view, can_edit, can_delete) VALUES
  ('62000000-0000-0000-0000-000000000001', 'tadbirlar-moliya', true, true, false);
INSERT INTO public.events (id, name, cashback_percent, date) VALUES
  ('e6200000-0000-0000-0000-000000000001', 'Guard tadbir', 5, now() - interval '2 days');
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_participants, public.clients TO authenticated;

-- ─── the real money paths still work through the API role ───────────────────
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '62000000-0000-0000-0000-000000000001', false);
DO $$
DECLARE v_pay uuid; v_part uuid; v_client uuid; r record;
BEGIN
  v_pay := public.record_payment('e6200000-0000-0000-0000-000000000001', 600000, 'naqd', now(),
    NULL, 'Guard Mijoz', '906200001', NULL, NULL, 1000000);
  SELECT participant_id INTO v_part FROM public.payments WHERE id = v_pay;
  SELECT contact_id INTO v_client FROM public.event_participants WHERE id = v_part;
  PERFORM public.adjust_cashback(v_client, 'add', 50000, 'test');
  PERFORM public.spend_cashback(v_part, v_client, 'e6200000-0000-0000-0000-000000000001', 50000);
  PERFORM public.refund_payment(v_part, 100000, 'naqd', 'test');
  UPDATE public.event_participants SET cashback_percent = 10, price = 900000 WHERE id = v_part;  -- editor may
  SELECT paid, cashback_used, price, cashback_percent INTO r FROM public.event_participants WHERE id = v_part;
  IF r.paid <> 550000 OR r.cashback_used <> 50000 OR r.price <> 900000 OR r.cashback_percent <> 10 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: %', row_to_json(r); END IF;
  RAISE NOTICE 'TEST 1 ok: record/spend/adjust/refund + editor price & percent work';
END $$;

-- ─── plain staff: normal edits pass, money columns refused ──────────────────
SELECT set_config('request.jwt.claim.sub', '62000000-0000-0000-0000-000000000002', false);
DO $$
DECLARE v_part uuid := (SELECT id FROM public.event_participants WHERE full_name = 'Guard Mijoz');
        v_client uuid := (SELECT contact_id FROM public.event_participants WHERE full_name = 'Guard Mijoz');
        refused int := 0;
BEGIN
  UPDATE public.event_participants SET attended = true, notes = 'ok' WHERE id = v_part;
  UPDATE public.clients SET company = 'FY' WHERE id = v_client;

  BEGIN UPDATE public.event_participants SET paid = 900000 WHERE id = v_part;
  EXCEPTION WHEN raise_exception THEN refused := refused + 1; END;
  BEGIN UPDATE public.event_participants SET cashback_earned = 777777 WHERE id = v_part;
  EXCEPTION WHEN raise_exception THEN refused := refused + 1; END;
  BEGIN UPDATE public.event_participants SET cashback_used = 0 WHERE id = v_part;
  EXCEPTION WHEN raise_exception THEN refused := refused + 1; END;
  BEGIN UPDATE public.event_participants SET no_show_at = now() WHERE id = v_part;
  EXCEPTION WHEN raise_exception THEN refused := refused + 1; END;
  BEGIN UPDATE public.event_participants SET cashback_percent = 50 WHERE id = v_part;
  EXCEPTION WHEN raise_exception THEN refused := refused + 1; END;
  BEGIN UPDATE public.clients SET cashback_balance = 9999999 WHERE id = v_client;
  EXCEPTION WHEN raise_exception THEN refused := refused + 1; END;
  BEGIN INSERT INTO public.event_participants (event_id, full_name, price, paid)
        VALUES ('e6200000-0000-0000-0000-000000000001', 'Soxta', 1000000, 1000000);
  EXCEPTION WHEN raise_exception THEN refused := refused + 1; END;
  BEGIN INSERT INTO public.clients (full_name, cashback_balance) VALUES ('Soxta Mijoz', 500000);
  EXCEPTION WHEN raise_exception THEN refused := refused + 1; END;
  IF refused <> 8 THEN RAISE EXCEPTION 'TEST 2 FAILED: only % of 8 writes refused', refused; END IF;

  -- a plain client insert still works (a direct participant insert is refused
  -- for non-editors since 063 — see its test)
  INSERT INTO public.clients (full_name) VALUES ('Oddiy Mijoz');
  RAISE NOTICE 'TEST 2 ok: staff edits pass, 8 money writes refused';
END $$;

-- ─── finance editor can't write derived columns directly either ─────────────
SELECT set_config('request.jwt.claim.sub', '62000000-0000-0000-0000-000000000001', false);
DO $$
BEGIN
  UPDATE public.event_participants SET paid = 900000 WHERE full_name = 'Guard Mijoz';
  RAISE EXCEPTION 'TEST 3 FAILED: editor wrote paid directly';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'TEST 3%' THEN RAISE; END IF;
  RAISE NOTICE 'TEST 3 ok: editor refused too (%)', SQLERRM;
END $$;

-- ─── settle_no_show through the API role, settle job as the plain SQL session ─
DO $$
DECLARE r record;
BEGIN
  PERFORM public.settle_no_show((SELECT id FROM public.event_participants WHERE full_name = 'Guard Mijoz'), 300000, 'naqd');
  SELECT price, paid, no_show_at IS NOT NULL AS ns INTO r FROM public.event_participants WHERE full_name = 'Guard Mijoz';
  -- 300k kept; the 50k cashback spent goes back to the balance (063)
  IF r.price <> 300000 OR r.paid <> 300000 OR NOT r.ns THEN RAISE EXCEPTION 'TEST 4 FAILED: %', row_to_json(r); END IF;
  RAISE NOTICE 'TEST 4 ok: settle_no_show works through the API role';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);
DO $$
BEGIN
  PERFORM public.settle_event_cashback();
  RAISE NOTICE 'TEST 5 ok: settle_event_cashback (amo-sync session) not blocked';
END $$;

SELECT '062 guard derived money columns: all tests passed' AS result;
