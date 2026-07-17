-- Behavioural tests for migration 043 (money guards).
-- No test runner in this project — run against a THROWAWAY database, never prod:
--
--   docker run -d --name fy-test -e POSTGRES_PASSWORD=postgres -p 55499:5432 \
--     public.ecr.aws/supabase/postgres:17.6.1.106
--   # stub GoTrue: CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key,
--   #   email text, raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
--   for f in supabase/migrations/*.sql; do docker exec -i fy-test psql -U postgres -d postgres < $f; done
--   docker exec -i fy-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/043_money_guards_test.sql
--
-- Every block RAISEs on failure; the last line prints on success.
-- Verified: on 001–042 (pre-043) 10 of these 13 fail — each failure is the bug 043 fixes.

-- Behavioural tests for migration 043. Each block RAISEs on failure.
\set ON_ERROR_STOP on

-- ─── FIXTURES ────────────────────────────────────────────────────────────────
-- handle_new_user() auto-creates the profiles row for staff, and skips it when
-- user_metadata.user_type = 'member' — which is exactly what makes is_staff() false.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('11111111-1111-1111-1111-111111111111', 's@fy.uz',
   '{"full_name":"Staff","role":"admin"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'm@fy.uz',
   '{"full_name":"Member","user_type":"member"}'::jsonb);

DO $$
BEGIN
  IF NOT public.is_staff('11111111-1111-1111-1111-111111111111') THEN
    RAISE EXCEPTION 'fixture FAILED: staff user has no active profile';
  END IF;
  IF public.is_staff('22222222-2222-2222-2222-222222222222') THEN
    RAISE EXCEPTION 'fixture FAILED: member counted as staff';
  END IF;
  RAISE NOTICE 'fixture: staff=is_staff true, member=is_staff false';
END $$;

INSERT INTO public.events (id, name, cashback_percent) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'Event 1', 5),
  ('e0000000-0000-0000-0000-000000000002', 'Event 2', 5);

CREATE OR REPLACE FUNCTION pg_temp.as_staff()  RETURNS void LANGUAGE sql AS
  $$ SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false)::void $$;
CREATE OR REPLACE FUNCTION pg_temp.as_member() RETURNS void LANGUAGE sql AS
  $$ SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false)::void $$;

-- ═══ A. spend_cashback guards ════════════════════════════════════════════════
-- Balance is seeded through the LEDGER (not by writing the column), because the
-- ledger is the source of truth — writing the column directly is not a state the
-- app can produce.
INSERT INTO public.clients (id, full_name) VALUES
  ('c0000000-0000-0000-0000-00000000000a', 'Client A');
INSERT INTO public.cashback_transactions (client_id, type, amount, description, created_by)
VALUES ('c0000000-0000-0000-0000-00000000000a', 'manual_add', 100000, 'seed', 'test');

INSERT INTO public.event_participants (id, event_id, contact_id, full_name, price, paid)
VALUES ('40000000-0000-0000-0000-00000000000a',
        'e0000000-0000-0000-0000-000000000001',
        'c0000000-0000-0000-0000-00000000000a', 'Client A', 1000000, 0);

-- A1: member may not spend cashback
DO $$
BEGIN
  PERFORM pg_temp.as_member();
  BEGIN
    PERFORM public.spend_cashback('40000000-0000-0000-0000-00000000000a',
                                  'c0000000-0000-0000-0000-00000000000a',
                                  'e0000000-0000-0000-0000-000000000001', 10000);
    RAISE EXCEPTION 'A1 FAILED: member was allowed to spend cashback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'A1 FAILED%' THEN RAISE; END IF;
    RAISE NOTICE 'A1 PASS (member rejected): %', SQLERRM;
  END;
END $$;

-- A2: negative amount must be rejected (was: minted balance)
DO $$
DECLARE v_bal numeric;
BEGIN
  PERFORM pg_temp.as_staff();
  BEGIN
    PERFORM public.spend_cashback('40000000-0000-0000-0000-00000000000a',
                                  'c0000000-0000-0000-0000-00000000000a',
                                  'e0000000-0000-0000-0000-000000000001', -1000000);
    RAISE EXCEPTION 'A2 FAILED: negative amount accepted — balance would be minted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'A2 FAILED%' THEN RAISE; END IF;
    RAISE NOTICE 'A2 PASS (negative rejected): %', SQLERRM;
  END;
  SELECT cashback_balance INTO v_bal FROM public.clients WHERE id='c0000000-0000-0000-0000-00000000000a';
  IF v_bal <> 100000 THEN RAISE EXCEPTION 'A2 FAILED: balance changed to %', v_bal; END IF;
END $$;

-- A3: zero amount must be rejected (was: stranded skip_cashback_award)
DO $$
DECLARE v_skip bool;
BEGIN
  PERFORM pg_temp.as_staff();
  BEGIN
    PERFORM public.spend_cashback('40000000-0000-0000-0000-00000000000a',
                                  'c0000000-0000-0000-0000-00000000000a',
                                  'e0000000-0000-0000-0000-000000000001', 0);
    RAISE EXCEPTION 'A3 FAILED: zero amount accepted — skip flag would strand';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'A3 FAILED%' THEN RAISE; END IF;
    RAISE NOTICE 'A3 PASS (zero rejected): %', SQLERRM;
  END;
  SELECT skip_cashback_award INTO v_skip FROM public.event_participants WHERE id='40000000-0000-0000-0000-00000000000a';
  IF COALESCE(v_skip,false) THEN RAISE EXCEPTION 'A3 FAILED: skip flag stranded true'; END IF;
END $$;

-- A4: cannot spend past the real debt
DO $$
BEGIN
  PERFORM pg_temp.as_staff();
  UPDATE public.event_participants SET price = 10000 WHERE id='40000000-0000-0000-0000-00000000000a';
  BEGIN
    PERFORM public.spend_cashback('40000000-0000-0000-0000-00000000000a',
                                  'c0000000-0000-0000-0000-00000000000a',
                                  'e0000000-0000-0000-0000-000000000001', 50000);
    RAISE EXCEPTION 'A4 FAILED: spent 50000 against a 10000 debt';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'A4 FAILED%' THEN RAISE; END IF;
    RAISE NOTICE 'A4 PASS (debt cap): %', SQLERRM;
  END;
  UPDATE public.event_participants SET price = 1000000 WHERE id='40000000-0000-0000-0000-00000000000a';
END $$;

-- A5: happy path still works, and awards nothing for the cashback part
DO $$
DECLARE v_bal numeric; v_used numeric; v_paid numeric; v_skip bool; v_earned_rows int;
BEGIN
  PERFORM pg_temp.as_staff();
  PERFORM public.spend_cashback('40000000-0000-0000-0000-00000000000a',
                                'c0000000-0000-0000-0000-00000000000a',
                                'e0000000-0000-0000-0000-000000000001', 50000);
  SELECT cashback_balance INTO v_bal FROM public.clients WHERE id='c0000000-0000-0000-0000-00000000000a';
  SELECT cashback_used, paid, skip_cashback_award INTO v_used, v_paid, v_skip
  FROM public.event_participants WHERE id='40000000-0000-0000-0000-00000000000a';
  SELECT COUNT(*) INTO v_earned_rows FROM public.cashback_transactions
   WHERE participant_id='40000000-0000-0000-0000-00000000000a' AND type='earned';

  IF v_bal  <> 50000  THEN RAISE EXCEPTION 'A5 FAILED: balance % (kutilgan 50000)', v_bal; END IF;
  IF v_used <> 50000  THEN RAISE EXCEPTION 'A5 FAILED: cashback_used %', v_used; END IF;
  IF v_paid <> 50000  THEN RAISE EXCEPTION 'A5 FAILED: paid %', v_paid; END IF;
  IF COALESCE(v_skip,false) THEN RAISE EXCEPTION 'A5 FAILED: skip flag left true'; END IF;
  IF v_earned_rows <> 0 THEN RAISE EXCEPTION 'A5 FAILED: cashback awarded on a cashback spend'; END IF;
  RAISE NOTICE 'A5 PASS (spend: balans 100000→50000, paid=50000, award yo''q)';
END $$;

-- ═══ B. clawback capped by cashback_earned (038:67) ══════════════════════════
INSERT INTO public.clients (id, full_name, cashback_balance)
VALUES ('c0000000-0000-0000-0000-00000000000b', 'Client B', 0);

INSERT INTO public.event_participants (id, event_id, contact_id, full_name, price, paid) VALUES
  ('40000000-0000-0000-0000-0000000000b1','e0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-00000000000b','Client B',1000000,0),
  ('40000000-0000-0000-0000-0000000000b2','e0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-00000000000b','Client B',1000000,0);

INSERT INTO public.payments (id, participant_id, amount, method) VALUES
  ('9a000000-0000-0000-0000-0000000000b1','40000000-0000-0000-0000-0000000000b1',1000000,'naqd'),
  ('9a000000-0000-0000-0000-0000000000b2','40000000-0000-0000-0000-0000000000b2',1000000,'naqd');

DO $$
DECLARE v_bal numeric; v_e1 numeric; v_e2 numeric;
BEGIN
  SELECT cashback_balance INTO v_bal FROM public.clients WHERE id='c0000000-0000-0000-0000-00000000000b';
  SELECT cashback_earned INTO v_e1 FROM public.event_participants WHERE id='40000000-0000-0000-0000-0000000000b1';
  SELECT cashback_earned INTO v_e2 FROM public.event_participants WHERE id='40000000-0000-0000-0000-0000000000b2';
  IF v_bal <> 100000 OR v_e1 <> 50000 OR v_e2 <> 50000 THEN
    RAISE EXCEPTION 'B setup FAILED: balance=%, e1=%, e2=%', v_bal, v_e1, v_e2;
  END IF;
  RAISE NOTICE 'B setup: 2 ta tadbirda 50000+50000 = balans 100000';
END $$;

-- Raise participant 2's percent AFTER the award, then refund it
UPDATE public.event_participants SET cashback_percent = 10 WHERE id='40000000-0000-0000-0000-0000000000b2';
DELETE FROM public.payments WHERE id='9a000000-0000-0000-0000-0000000000b2';

DO $$
DECLARE v_bal numeric; v_e2 numeric;
BEGIN
  SELECT cashback_balance INTO v_bal FROM public.clients WHERE id='c0000000-0000-0000-0000-00000000000b';
  SELECT cashback_earned INTO v_e2 FROM public.event_participants WHERE id='40000000-0000-0000-0000-0000000000b2';
  -- old code: clawback = ROUND(1000000*10/100) = 100000, capped only by balance → 0 left (event 1's 50000 destroyed)
  IF v_bal <> 50000 THEN
    RAISE EXCEPTION 'B FAILED: balance % (kutilgan 50000 — 1-tadbir keshbegi saqlanishi kerak)', v_bal;
  END IF;
  IF v_e2 <> 0 THEN RAISE EXCEPTION 'B FAILED: participant-2 cashback_earned %', v_e2; END IF;
  RAISE NOTICE 'B PASS (foiz 5→10 bo''lsa ham clawback 50000 bilan cheklandi, 1-tadbir keshbegi saqlanib qoldi)';
END $$;

-- ═══ C. balance trigger reacts to ledger DELETE (040:30) ═════════════════════
-- Own client, own ledger row — must not depend on any earlier test's state.
INSERT INTO public.clients (id, full_name) VALUES
  ('c0000000-0000-0000-0000-00000000000c', 'Client C');
INSERT INTO public.cashback_transactions (id, client_id, type, amount, description, created_by)
VALUES ('7c000000-0000-0000-0000-0000000000c1','c0000000-0000-0000-0000-00000000000c',
        'manual_add', 50000, 'seed', 'test');

DO $$
DECLARE v_bal numeric;
BEGIN
  SELECT cashback_balance INTO v_bal FROM public.clients WHERE id='c0000000-0000-0000-0000-00000000000c';
  IF v_bal <> 50000 THEN RAISE EXCEPTION 'C setup FAILED: balance %', v_bal; END IF;

  -- Staff RLS (028) permits this; the old INSERT-only trigger ignored it.
  DELETE FROM public.cashback_transactions WHERE id='7c000000-0000-0000-0000-0000000000c1';

  SELECT cashback_balance INTO v_bal FROM public.clients WHERE id='c0000000-0000-0000-0000-00000000000c';
  IF v_bal <> 0 THEN
    RAISE EXCEPTION 'C FAILED: balance % (kutilgan 0 — ledger o''chdi, balans ergashmadi)', v_bal;
  END IF;
  RAISE NOTICE 'C PASS (tranzaksiya o''chirilganda balans ledger bo''yicha qayta hisoblandi)';
END $$;

-- ═══ D. participant delete refunds cashback_used (038:147) ═══════════════════
INSERT INTO public.clients (id, full_name) VALUES
  ('c0000000-0000-0000-0000-00000000000d', 'Client D');
INSERT INTO public.cashback_transactions (client_id, type, amount, description, created_by)
VALUES ('c0000000-0000-0000-0000-00000000000d', 'manual_add', 100000, 'seed', 'test');

INSERT INTO public.event_participants (id, event_id, contact_id, full_name, price, paid)
VALUES ('40000000-0000-0000-0000-0000000000d1','e0000000-0000-0000-0000-000000000001',
        'c0000000-0000-0000-0000-00000000000d','Client D',1000000,0);

DO $$
DECLARE v_bal numeric;
BEGIN
  PERFORM pg_temp.as_staff();
  PERFORM public.spend_cashback('40000000-0000-0000-0000-0000000000d1',
                                'c0000000-0000-0000-0000-00000000000d',
                                'e0000000-0000-0000-0000-000000000001', 50000);
  SELECT cashback_balance INTO v_bal FROM public.clients WHERE id='c0000000-0000-0000-0000-00000000000d';
  IF v_bal <> 50000 THEN RAISE EXCEPTION 'D setup FAILED: balance %', v_bal; END IF;

  DELETE FROM public.event_participants WHERE id='40000000-0000-0000-0000-0000000000d1';

  SELECT cashback_balance INTO v_bal FROM public.clients WHERE id='c0000000-0000-0000-0000-00000000000d';
  IF v_bal <> 100000 THEN
    RAISE EXCEPTION 'D FAILED: balance % (kutilgan 100000 — ishlatilgan keshbek qaytarilishi kerak)', v_bal;
  END IF;
  RAISE NOTICE 'D PASS (ishtirokchi o''chirilganda 50000 ishlatilgan keshbek qaytarildi)';
END $$;

-- ═══ E. payment re-point recomputes BOTH participants (035:61) ═══════════════
-- A payment recorded against the WRONG participant, then corrected to the right
-- one (a client may only appear once per event, so these are two clients).
INSERT INTO public.clients (id, full_name) VALUES
  ('c0000000-0000-0000-0000-00000000000e', 'Client E-a'),
  ('c0000000-0000-0000-0000-00000000000f', 'Client E-b');

INSERT INTO public.event_participants (id, event_id, contact_id, full_name, price, paid, cashback_percent) VALUES
  ('40000000-0000-0000-0000-0000000000e1','e0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-00000000000e','E-a',1000000,0,0),
  ('40000000-0000-0000-0000-0000000000e2','e0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-00000000000f','E-b',1000000,0,0);

INSERT INTO public.payments (id, participant_id, amount, method)
VALUES ('9a000000-0000-0000-0000-0000000000e1','40000000-0000-0000-0000-0000000000e1',500000,'naqd');

UPDATE public.payments SET participant_id='40000000-0000-0000-0000-0000000000e2'
WHERE id='9a000000-0000-0000-0000-0000000000e1';

DO $$
DECLARE v_a numeric; v_b numeric;
BEGIN
  SELECT paid INTO v_a FROM public.event_participants WHERE id='40000000-0000-0000-0000-0000000000e1';
  SELECT paid INTO v_b FROM public.event_participants WHERE id='40000000-0000-0000-0000-0000000000e2';
  IF v_a <> 0 THEN RAISE EXCEPTION 'E FAILED: eski ishtirokchi paid=% (kutilgan 0)', v_a; END IF;
  IF v_b <> 500000 THEN RAISE EXCEPTION 'E FAILED: yangi ishtirokchi paid=%', v_b; END IF;
  RAISE NOTICE 'E PASS (to''lov ko''chirilganda ikkala ishtirokchi ham qayta hisoblandi: 0 / 500000)';
END $$;

-- ═══ F. close_crm_lead_won: staff only + junk phones stay separate ═══════════
INSERT INTO public.crm_contacts (id, name, phone) VALUES
  ('c1000000-0000-0000-0000-0000000000f1', 'Nomsiz 1', '-'),
  ('c1000000-0000-0000-0000-0000000000f2', 'Nomsiz 2', 'yo''q');
INSERT INTO public.crm_leads (id, name, contact_id, price) VALUES
  ('1ead0000-0000-0000-0000-0000000000f1', 'Lead 1', 'c1000000-0000-0000-0000-0000000000f1', 5000000),
  ('1ead0000-0000-0000-0000-0000000000f2', 'Lead 2', 'c1000000-0000-0000-0000-0000000000f2', 7000000);

-- F1: member may not close a lead as won
DO $$
BEGIN
  PERFORM pg_temp.as_member();
  BEGIN
    PERFORM public.close_crm_lead_won('1ead0000-0000-0000-0000-0000000000f1');
    RAISE EXCEPTION 'F1 FAILED: member closed a lead as won (KPI inflation)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'F1 FAILED%' THEN RAISE; END IF;
    RAISE NOTICE 'F1 PASS (member rejected): %', SQLERRM;
  END;
END $$;

-- F2: two junk-phone contacts must NOT collapse into one client
DO $$
DECLARE v_c1 uuid; v_c2 uuid; v_phone text;
BEGIN
  PERFORM pg_temp.as_staff();
  v_c1 := (public.close_crm_lead_won('1ead0000-0000-0000-0000-0000000000f1') ->> 'client_id')::uuid;
  v_c2 := (public.close_crm_lead_won('1ead0000-0000-0000-0000-0000000000f2') ->> 'client_id')::uuid;

  IF v_c1 IS NULL OR v_c2 IS NULL THEN RAISE EXCEPTION 'F2 FAILED: client yaratilmadi'; END IF;
  IF v_c1 = v_c2 THEN
    RAISE EXCEPTION 'F2 FAILED: telefonsiz ikki kontakt bitta mijozga yopishdi (%)', v_c1;
  END IF;

  SELECT phone INTO v_phone FROM public.clients WHERE id = v_c1;
  IF v_phone IS NOT NULL THEN RAISE EXCEPTION 'F2 FAILED: chala telefon saqlandi: %', v_phone; END IF;
  RAISE NOTICE 'F2 PASS (2 ta alohida mijoz, telefon NULL — birlashib ketmadi)';
END $$;

-- ═══ G. CRM RLS: members cannot write lead prices ════════════════════════════
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_leads TO authenticated;

DO $$
DECLARE v_price numeric;
BEGIN
  PERFORM pg_temp.as_member();
  SET LOCAL ROLE authenticated;
  UPDATE public.crm_leads SET price = 999999999 WHERE id='1ead0000-0000-0000-0000-0000000000f1';
  RESET ROLE;

  SELECT price INTO v_price FROM public.crm_leads WHERE id='1ead0000-0000-0000-0000-0000000000f1';
  IF v_price <> 5000000 THEN
    RAISE EXCEPTION 'G FAILED: a''zo lead narxini o''zgartirdi → %', v_price;
  END IF;
  RAISE NOTICE 'G1 PASS (a''zo crm_leads.price ni o''zgartira olmadi)';
END $$;

DO $$
DECLARE v_price numeric;
BEGIN
  PERFORM pg_temp.as_staff();
  SET LOCAL ROLE authenticated;
  UPDATE public.crm_leads SET price = 6000000 WHERE id='1ead0000-0000-0000-0000-0000000000f1';
  RESET ROLE;

  SELECT price INTO v_price FROM public.crm_leads WHERE id='1ead0000-0000-0000-0000-0000000000f1';
  IF v_price <> 6000000 THEN
    RAISE EXCEPTION 'G FAILED: xodim lead narxini o''zgartira olmadi (% qoldi) — RLS xodimni ham bloklab qo''ydi', v_price;
  END IF;
  RAISE NOTICE 'G2 PASS (xodim hali ham o''zgartira oladi — RLS ish oqimini buzmadi)';
END $$;

SELECT 'BARCHA TESTLAR O''TDI' AS natija;
