-- Behavioural tests for migration 047 (tadbirlar-moliya module + finance totals RPC).
-- No test runner in this project — run against a THROWAWAY database, never prod:
--
--   docker run -d --name fy-test -e POSTGRES_PASSWORD=postgres \
--     public.ecr.aws/supabase/postgres:17.6.1.106
--   # stub GoTrue + migration history (see CLAUDE.md "Tests"), then replay
--   # supabase/migrations/*.sql, then:
--   docker cp supabase/migrations/047_tadbirlar_moliya_module.sql fy-test:/tmp/m047.sql
--   #   ^ TEST 3 re-applies this exact file via \i to exercise the real backfill.
--   docker cp supabase/tests/047_tadbirlar_moliya_module_test.sql fy-test:/tmp/t.sql
--   docker exec fy-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql
--
-- Every block RAISEs on failure; the last line prints on success.
\set ON_ERROR_STOP on

-- ─── FIXTURES ────────────────────────────────────────────────────────────────
-- handle_new_user() auto-creates the profiles row for staff users.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('47000000-0000-0000-0000-000000000001', 'perm@fy.uz',
   '{"full_name":"Perm User","role":"xodim"}'::jsonb);

-- Used by TEST 1/2 only (CHECK constraint checks) — inserted after 047 already
-- ran in this stand, so it is NOT used to verify the backfill. TEST 3 below
-- seeds its own separate users for that.
INSERT INTO public.user_permissions (user_id, module, can_view, can_edit, can_delete)
VALUES ('47000000-0000-0000-0000-000000000001', 'tadbirlar', true, true, false);

-- ─── TEST 1: CHECK accepts the new module ────────────────────────────────────
DO $$
BEGIN
  INSERT INTO public.user_permissions (user_id, module, can_view, can_edit, can_delete)
  VALUES ('47000000-0000-0000-0000-000000000001', 'tadbirlar-moliya', true, false, false);
  RAISE NOTICE 'TEST 1 ok: CHECK accepts tadbirlar-moliya';
EXCEPTION WHEN check_violation THEN
  RAISE EXCEPTION 'TEST 1 FAILED: CHECK rejected tadbirlar-moliya';
END $$;

-- ─── TEST 2: CHECK still rejects garbage ─────────────────────────────────────
DO $$
BEGIN
  INSERT INTO public.user_permissions (user_id, module, can_view)
  VALUES ('47000000-0000-0000-0000-000000000001', 'yaroqsiz-modul', true);
  RAISE EXCEPTION 'TEST 2 FAILED: CHECK accepted an unknown module';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'TEST 2 ok: CHECK rejects unknown module';
END $$;

-- ─── TEST 3: the migration backfills tadbirlar → tadbirlar-moliya ───────────
-- 018 seeds no user_permissions rows at all, so there is nothing to inherit by
-- default — this fixture creates the "pre-existing data" itself: several NEW
-- users get a 'tadbirlar' row (differing can_view/can_edit/can_delete
-- combinations, no 'tadbirlar-moliya' twin), then we re-apply the REAL
-- migration file (docker cp'd to /tmp/m047.sql — see header) via \i, so the
-- actual backfill INSERT ... SELECT runs against this data, not a copy of it.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('47000000-0000-0000-0000-000000000002', 'perm2@fy.uz', '{"full_name":"Perm User 2","role":"xodim"}'::jsonb),
  ('47000000-0000-0000-0000-000000000003', 'perm3@fy.uz', '{"full_name":"Perm User 3","role":"xodim"}'::jsonb),
  ('47000000-0000-0000-0000-000000000004', 'perm4@fy.uz', '{"full_name":"Perm User 4","role":"xodim"}'::jsonb);

INSERT INTO public.user_permissions (user_id, module, can_view, can_edit, can_delete) VALUES
  ('47000000-0000-0000-0000-000000000002', 'tadbirlar', true,  true,  false),
  ('47000000-0000-0000-0000-000000000003', 'tadbirlar', true,  false, true),
  ('47000000-0000-0000-0000-000000000004', 'tadbirlar', false, false, false);

\i /tmp/m047.sql

DO $$
DECLARE
  bad record;
  bad_count int := 0;
BEGIN
  FOR bad IN
    SELECT t.user_id, t.can_view, t.can_edit, t.can_delete,
           m.can_view AS m_view, m.can_edit AS m_edit, m.can_delete AS m_delete
    FROM public.user_permissions t
    LEFT JOIN public.user_permissions m
      ON m.user_id = t.user_id AND m.module = 'tadbirlar-moliya'
    WHERE t.module = 'tadbirlar'
      AND t.user_id IN (
        '47000000-0000-0000-0000-000000000002',
        '47000000-0000-0000-0000-000000000003',
        '47000000-0000-0000-0000-000000000004'
      )
  LOOP
    IF bad.m_view IS NULL THEN
      bad_count := bad_count + 1;
      RAISE WARNING 'TEST 3: user % has no tadbirlar-moliya twin', bad.user_id;
    ELSIF bad.m_view IS DISTINCT FROM bad.can_view
       OR bad.m_edit IS DISTINCT FROM bad.can_edit
       OR bad.m_delete IS DISTINCT FROM bad.can_delete THEN
      bad_count := bad_count + 1;
      RAISE WARNING 'TEST 3: user % twin flags (%,%,%) != source (%,%,%)',
        bad.user_id, bad.m_view, bad.m_edit, bad.m_delete, bad.can_view, bad.can_edit, bad.can_delete;
    END IF;
  END LOOP;

  IF bad_count > 0 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: % seeded tadbirlar row(s) have a missing/mismatched tadbirlar-moliya twin', bad_count;
  END IF;
  RAISE NOTICE 'TEST 3 ok: backfill mirrored all seeded tadbirlar rows onto tadbirlar-moliya';
END $$;

-- Idempotency: re-applying 047 a second time must be a no-op for rows that
-- already have a twin (UNIQUE(user_id, module) + ON CONFLICT DO NOTHING) —
-- it must not duplicate the twin or silently overwrite its flags.
UPDATE public.user_permissions
SET can_edit = NOT can_edit
WHERE user_id = '47000000-0000-0000-0000-000000000002' AND module = 'tadbirlar-moliya';

\i /tmp/m047.sql

DO $$
DECLARE
  v_edit  boolean;
  v_count int;
BEGIN
  SELECT can_edit INTO v_edit
  FROM public.user_permissions
  WHERE user_id = '47000000-0000-0000-0000-000000000002' AND module = 'tadbirlar-moliya';

  IF v_edit IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'TEST 3 FAILED (idempotency): re-applying 047 overwrote the twin''s can_edit (got %, expected false untouched)', v_edit;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.user_permissions
  WHERE user_id = '47000000-0000-0000-0000-000000000002' AND module = 'tadbirlar-moliya';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 3 FAILED (idempotency): re-applying 047 duplicated the twin (% rows)', v_count;
  END IF;

  RAISE NOTICE 'TEST 3 ok: re-applying 047 is idempotent (ON CONFLICT DO NOTHING left the twin untouched)';
END $$;

-- ─── FIXTURES for the RPC ────────────────────────────────────────────────────
TRUNCATE public.payments, public.event_participants, public.cashback_transactions,
         public.events, public.clients CASCADE;

INSERT INTO public.clients (id, full_name, phone) VALUES
  ('47c00000-0000-0000-0000-000000000001', 'Client A', '+998900000001'),
  ('47c00000-0000-0000-0000-000000000002', 'Client B', '+998900000002');

INSERT INTO public.events (id, name, cashback_percent) VALUES
  ('47e00000-0000-0000-0000-000000000001', 'Finance Event', 0);

-- A: price 1 000 000, will pay 400 000  → debt 600 000
-- B: price   500 000, will pay 700 000  → OVERPAID, debt must clamp to 0
INSERT INTO public.event_participants (id, event_id, contact_id, full_name, price) VALUES
  ('47a00000-0000-0000-0000-000000000001', '47e00000-0000-0000-0000-000000000001',
   '47c00000-0000-0000-0000-000000000001', 'Client A', 1000000),
  ('47a00000-0000-0000-0000-000000000002', '47e00000-0000-0000-0000-000000000001',
   '47c00000-0000-0000-0000-000000000002', 'Client B', 500000);

-- Payments are the source of truth; sync_participant_paid keeps `paid` in sync.
INSERT INTO public.payments (participant_id, amount, method, paid_at) VALUES
  ('47a00000-0000-0000-0000-000000000001', 400000, 'naqd',  now()),
  ('47a00000-0000-0000-0000-000000000002', 700000, 'karta', now());

-- Cashback ledger drives clients.cashback_balance via trigger.
INSERT INTO public.cashback_transactions (client_id, amount, type, description) VALUES
  ('47c00000-0000-0000-0000-000000000001', 25000, 'manual_add', 'test balance');

-- ─── TEST 4: total_income = SUM(payments.amount), cashback excluded ──────────
DO $$
DECLARE
  t record;
BEGIN
  SELECT * INTO t FROM public.event_finance_totals();

  IF t.total_income <> 1100000 THEN
    RAISE EXCEPTION 'TEST 4 FAILED: total_income = % (expected 1100000)', t.total_income;
  END IF;
  RAISE NOTICE 'TEST 4 ok: total_income = %', t.total_income;
END $$;

-- ─── TEST 5: total_debt clamps overpayment to 0 (GREATEST) ──────────────────
DO $$
DECLARE
  t record;
BEGIN
  SELECT * INTO t FROM public.event_finance_totals();

  -- A owes 600000; B overpaid by 200000 but must contribute 0, not -200000.
  IF t.total_debt <> 600000 THEN
    RAISE EXCEPTION 'TEST 5 FAILED: total_debt = % (expected 600000 — overpayment must not net out debt)', t.total_debt;
  END IF;
  RAISE NOTICE 'TEST 5 ok: total_debt = %', t.total_debt;
END $$;

-- ─── TEST 6: total_cashback_balance reads the ledger-driven balance ─────────
DO $$
DECLARE
  t record;
BEGIN
  SELECT * INTO t FROM public.event_finance_totals();

  IF t.total_cashback_balance <> 25000 THEN
    RAISE EXCEPTION 'TEST 6 FAILED: total_cashback_balance = % (expected 25000)', t.total_cashback_balance;
  END IF;
  RAISE NOTICE 'TEST 6 ok: total_cashback_balance = %', t.total_cashback_balance;
END $$;

-- ─── TEST 7: empty DB → zeros, not NULL ─────────────────────────────────────
DO $$
DECLARE
  t record;
BEGIN
  TRUNCATE public.payments, public.event_participants, public.cashback_transactions,
           public.events, public.clients CASCADE;

  SELECT * INTO t FROM public.event_finance_totals();

  IF t.total_income IS DISTINCT FROM 0
     OR t.total_debt IS DISTINCT FROM 0
     OR t.total_cashback_balance IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'TEST 7 FAILED: empty DB returned (%, %, %) — expected zeros, COALESCE missing',
      t.total_income, t.total_debt, t.total_cashback_balance;
  END IF;
  RAISE NOTICE 'TEST 7 ok: empty DB returns zeros';
END $$;

-- ─── TEST 8: anon cannot execute the RPC ────────────────────────────────────
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.event_finance_totals()', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 8 FAILED: anon can execute event_finance_totals()';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.event_finance_totals()', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST 8 FAILED: authenticated cannot execute event_finance_totals()';
  END IF;
  RAISE NOTICE 'TEST 8 ok: anon revoked, authenticated granted';
END $$;

-- ─── TEST 9: RPC must NOT be SECURITY DEFINER (RLS must apply) ──────────────
DO $$
DECLARE
  is_definer bool;
BEGIN
  SELECT p.prosecdef INTO is_definer
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'event_finance_totals';

  IF is_definer THEN
    RAISE EXCEPTION 'TEST 9 FAILED: event_finance_totals is SECURITY DEFINER — members would bypass RLS and read club-wide money';
  END IF;
  RAISE NOTICE 'TEST 9 ok: SECURITY INVOKER, RLS applies';
END $$;

SELECT '047 tests passed' AS result;
