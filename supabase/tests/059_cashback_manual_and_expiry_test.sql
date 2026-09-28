-- Behavioural tests for migration 059 (manual cashback + 12-month expiry).
-- THROWAWAY DB only (recipe: CLAUDE.md §5 "Tests").
\set ON_ERROR_STOP on

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('59000000-0000-0000-0000-000000000001', 'admin59@fy.uz', '{"full_name":"Admin59","role":"admin"}'::jsonb),
  ('59000000-0000-0000-0000-000000000002', 'staff59@fy.uz', '{"full_name":"Staff59","role":"xodim"}'::jsonb);
UPDATE public.profiles SET role = 'admin' WHERE id = '59000000-0000-0000-0000-000000000001';
INSERT INTO public.clients (id, full_name, phone) VALUES ('c5900000-0000-0000-0000-000000000001', 'Keshbek Mijoz', '+998905900001');

-- 100 000 earned 13 months ago, 50 000 a month ago, 30 000 spent since
INSERT INTO public.cashback_transactions (client_id, type, amount, description, created_by, created_at) VALUES
  ('c5900000-0000-0000-0000-000000000001', 'earned', 100000, 'old',   'system', now() - interval '13 months'),
  ('c5900000-0000-0000-0000-000000000001', 'earned',  50000, 'fresh', 'system', now() - interval '1 month'),
  ('c5900000-0000-0000-0000-000000000001', 'used',    30000, 'spent', 'staff',  now() - interval '20 days');

-- TEST 1: the unspent part of the old credit expires (FIFO), once
DO $$
DECLARE bal numeric;
BEGIN
  PERFORM public.expire_cashback();
  PERFORM public.expire_cashback();
  SELECT cashback_balance INTO bal FROM public.clients WHERE id = 'c5900000-0000-0000-0000-000000000001';
  IF bal <> 50000 THEN RAISE EXCEPTION 'TEST 1 FAILED: balance = % (want 50000)', bal; END IF;
  IF (SELECT count(*) FROM public.cashback_transactions WHERE client_id = 'c5900000-0000-0000-0000-000000000001' AND type = 'expired') <> 1
     OR (SELECT amount FROM public.cashback_transactions WHERE client_id = 'c5900000-0000-0000-0000-000000000001' AND type = 'expired') <> 70000 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: expected one expired row of 70000'; END IF;
  RAISE NOTICE 'TEST 1 ok: 70000 expired, balance 50000, idempotent';
END $$;

-- TEST 2: next expiry = the fresh 50 000, 12 months after it was earned
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.cashback_next_expiry('c5900000-0000-0000-0000-000000000001');
  IF r.amount <> 50000 OR r.expires_on <> ((now() - interval '1 month') + interval '12 months')::date THEN
    RAISE EXCEPTION 'TEST 2 FAILED: %', row_to_json(r); END IF;
  RAISE NOTICE 'TEST 2 ok: next expiry %', row_to_json(r);
END $$;

-- TEST 3: manual add / subtract by a finance editor; overdraw and empty reason rejected
SELECT set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000001', false);
DO $$
DECLARE bal numeric;
BEGIN
  PERFORM public.adjust_cashback('c5900000-0000-0000-0000-000000000001', 'add', 20000, 'Bonus');
  PERFORM public.adjust_cashback('c5900000-0000-0000-0000-000000000001', 'subtract', 5000, 'Tuzatish');
  SELECT cashback_balance INTO bal FROM public.clients WHERE id = 'c5900000-0000-0000-0000-000000000001';
  IF bal <> 65000 THEN RAISE EXCEPTION 'TEST 3 FAILED: balance = % (want 65000)', bal; END IF;
  BEGIN
    PERFORM public.adjust_cashback('c5900000-0000-0000-0000-000000000001', 'subtract', 999999, 'Ko''p');
    RAISE EXCEPTION 'TEST 3 FAILED: overdraw accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'cashback_insufficient%' THEN RAISE EXCEPTION 'TEST 3 FAILED: %', SQLERRM; END IF;
  END;
  BEGIN
    PERFORM public.adjust_cashback('c5900000-0000-0000-0000-000000000001', 'add', 1, '  ');
    RAISE EXCEPTION 'TEST 3 FAILED: empty reason accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'reason_required' THEN RAISE EXCEPTION 'TEST 3 FAILED: %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'TEST 3 ok: add/subtract with checks';
END $$;

-- TEST 4: staff without finance rights can't adjust; nobody writes the ledger directly
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000002', false);
DO $$
BEGIN
  BEGIN
    PERFORM public.adjust_cashback('c5900000-0000-0000-0000-000000000001', 'add', 1000, 'x');
    RAISE EXCEPTION 'TEST 4 FAILED: non-finance staff adjusted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'forbidden: finance_only' THEN RAISE EXCEPTION 'TEST 4 FAILED: %', SQLERRM; END IF;
  END;
END $$;
SELECT set_config('request.jwt.claim.sub', '59000000-0000-0000-0000-000000000001', false);
DO $$
BEGIN
  INSERT INTO public.cashback_transactions (client_id, type, amount) VALUES ('c5900000-0000-0000-0000-000000000001', 'manual_add', 1);
  RAISE EXCEPTION 'TEST 4 FAILED: direct ledger insert allowed';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'TEST 4 ok: adjust needs finance rights, ledger is function-only';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);

SELECT '059 cashback manual + expiry: all tests passed' AS result;
