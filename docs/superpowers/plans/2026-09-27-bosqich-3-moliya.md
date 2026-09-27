# Bosqich 3 — Moliya yadrosi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Moliya — barcha tadbirlar bo'yicha global pul nazorati:
- filtrlar (davr, tadbir, sotuvchi, usul);
- bazadan hisoblangan KPI'lar;
- To'lovlar va Qarzdorlar tablari;
- yangi mijozga ham bitta oynadan to'lov kiritish;
- to'lovni bekor qilish va pulni qaytarish.

Pul bazada qulflanadi: to'lovlar jadvaliga to'g'ridan-to'g'ri yozib ham, o'chirib ham bo'lmaydi.

**Architecture:**
- **Migratsiya `051`.** Pul harakati faqat `SECURITY DEFINER` RPC'lar orqali bo'ladi: `record_payment`, `void_payment`, `refund_payment`. `payments` jadvalida yozish uchun policy qolmaydi, o'qishni faqat Moliya ruxsati bor foydalanuvchi qila oladi. KPI va qarzdorlar ro'yxati `SECURITY INVOKER` RPC'lardan olinadi: `finance_summary`, `finance_debtors`.
- **Frontend.** Moliya sahifasi tadbir tablarisiz qayta yoziladi va hammasi `src/components/moliya/` ichiga ko'chadi. Filtr holati URL'da saqlanadi. Barcha pul so'rovlari bitta `FINANCE_KEY` prefiksi ostida.

**Tech Stack:** React 19, react-router-dom 7 (`useSearchParams`), TanStack Query 5, TypeScript strict, Supabase Postgres (plpgsql), bun.

**Spec:** `docs/superpowers/specs/2026-09-27-tadbirlar-moliya-design.md` (§5.2, §6 — To'lovlar va Qarzdorlar tablari; Xarajatlar va Tadbirlar tablari 4-bosqichda)

## Global Constraints

- bun; TypeScript strict, `any` yo'q; `verbatimModuleSyntax`; `erasableSyntaxOnly`.
- Eski migratsiyalar o'zgartirilmaydi — faqat `051_finance_core.sql`. `event_finance_totals()` **051 da o'chirilmaydi** (spec: 052 da), chunki 051 qo'llangach eski frontend uni chaqirib turadi.
- Yangi `SECURITY DEFINER` funksiyalar `SET search_path = public, pg_temp` bilan; RPC'lar `REVOKE … FROM PUBLIC, anon; GRANT … TO authenticated, service_role`.
- Pul yozish huquqi = `tadbirlar-moliya` modulida **`can_edit`** (yoki admin); o'qish = `can_view` (`has_permission`). UI'da ham xuddi shunday: `canEdit("tadbirlar-moliya")` bo'lmasa, amal tugmalari ko'rinmaydi.
- KPI'lar bazada hisoblanadi, brauzerda qo'shilmaydi. Yig'ish foizi faqat ikkita server summasining nisbati.
- Sana filtri Toshkent kalendar kuni bo'yicha ishlaydi (UTC+5, yozgi vaqt yo'q). To'lovlarga `paid_at` bo'yicha, qarzga `created_at` (yozilgan kun) bo'yicha qo'llanadi.
- UI matnlari o'zbekcha; `rounded-[8px]`; `@phosphor-icons/react`; native `<select>`/`<input type="date">`.
- **Commit faqat foydalanuvchi tasdig'i bilan** — tasklar `git add` bilan tugaydi, commit Task 10 da.
- SQL testlar faqat vaqtinchalik Docker stendda. UI faqat mahalliy Supabase'da.

## Spec'dan og'ishlar (rejani ko'rib chiqishda tasdiqlanadi)

1. **"Holat" filtri (qarzdor / muddati o'tgan / to'liq to'lagan) global filtrlar qatorida emas, Qarzdorlar tabi ichida turadi.** U faqat shu ro'yxatga ta'sir qiladi. Global qatorda tursa, KPI'lar va To'lovlar ro'yxati unga bo'ysunmasligi chalkash bo'lardi.
2. **Qarzdorlar tabida tarif almashtirilmaydi.** Chegirma uchun kelishuv summasini tahrirlash yetarli. Tarif nomi faqat ko'rsatiladi, almashtirish keyingi iteratsiyaga qoldiriladi.
3. **Pul yozish uchun `can_view` emas, `can_edit` talab qilinadi.** Spec'da "faqat Moliya" deyilgan edi. Bu ilovadagi `canEdit` bilan bir xil: faqat ko'rish huquqi bor foydalanuvchi pulni ko'radi, lekin kirita olmaydi.
4. **"Qiymat bajarilishi" kartasi vaqtincha yo'qoladi.** Bu `total_value` bo'yicha progress kartasi edi. U 4-bosqichdagi Tadbirlar tabida (har tadbir foydasi) qaytadi.
5. **KPI kartalari 5 ta: Kirim, Qolgan qarz, Muddati o'tgan, Yig'ish %, Keshbek qoldig'i.** "Chiqim" va "Sof cashflow" 4-bosqichda, xarajatlar bilan birga qo'shiladi.

## Review Focus

- **Qarzdan ortiq to'lov.** Bir vaqtda ikki kishi bitta ishtirokchiga to'lov kiritsa, jami qarzdan oshmasligi kerak. `record_payment` ishtirokchi qatorini `FOR UPDATE` bilan qulflaydi (Task 1 testi A–D). UI keshdagi qarz bo'yicha oldindan tekshiradi, baribir DB xabari aniq chiqadi (Task 7).
- **Qaytarishni bekor qilish.** U ishtirokchining to'lagan summasini kelishuvdan oshirib yubormasligi kerak (Task 1 testi G).
- **Eski frontend va 051.** Production'da 051 qo'llangach, yangi frontend chiqquncha eski saytda to'lov qo'shish (to'g'ridan-to'g'ri INSERT) ishlamaydi. Deploy'da migratsiya va push ketma-ket bajariladi (Task 10, deploy izohi).
- **Kontaktsiz eski ishtirokchilar.** `contact_id = NULL` bo'lgan ishtirokchilarga Qarzdorlar tabidan to'lov kiritib bo'lmaydi, chunki `record_payment` mijozni `contact_id` orqali topadi. Tugma o'chiq bo'ladi va sababi ko'rsatiladi (Task 8).
- **Davr chegaralari.** "O'tgan oy" yanvarda o'tgan yilning dekabri bo'lishi, fevral kabisa yilini hisobga olishi kerak. UTC 19:00 dan keyin Toshkentda ertangi kun boshlanadi (Task 2 tekshiruvi).

---

### Task 1: Migratsiya 051 — void/refund, RPC'lar, RLS, himoyalar, KPI

**Files:**
- Create: `supabase/tests/051_finance_core_test.sql`
- Create: `supabase/migrations/051_finance_core.sql`

**Interfaces:**
- Consumes: 050 dagi `enroll_participant(p_event_id, p_tariff_id, p_seller_id, p_client_id, p_full_name, p_phone)` va uning xato matnlari; 043 dagi `recalc_participant_paid`, `auto_award_cashback`.
- Produces (DB):
  - `payments.kind text ('payment'|'refund')`, `payments.voided_at timestamptz`, `payments.voided_by uuid`, `payments.void_reason text`; `event_participants.next_due_date date`
  - `can_edit_finance(p_user uuid) RETURNS bool`
  - `record_payment(p_event_id uuid, p_amount numeric, p_method text, p_paid_at timestamptz DEFAULT now(), p_client_id uuid DEFAULT NULL, p_full_name text DEFAULT NULL, p_phone text DEFAULT NULL, p_tariff_id uuid DEFAULT NULL, p_seller_id uuid DEFAULT NULL, p_price numeric DEFAULT NULL, p_next_due_date date DEFAULT NULL, p_note text DEFAULT NULL) RETURNS uuid`
  - `void_payment(p_payment_id uuid, p_reason text) RETURNS void`
  - `refund_payment(p_participant_id uuid, p_amount numeric, p_method text, p_note text DEFAULT NULL) RETURNS uuid`
  - `finance_summary(p_from date, p_to date, p_event_id uuid, p_seller_id uuid, p_no_seller boolean, p_method text)` (hammasi DEFAULT NULL/false) `RETURNS TABLE(income, debt, overdue_debt, agreed, collected, cashback_balance numeric)`
  - `finance_debtors(p_from, p_to, p_event_id, p_seller_id, p_no_seller, p_status text DEFAULT 'debt') RETURNS TABLE(participant_id, event_id, event_name, client_id, full_name, phone, seller_id, seller_name, tariff_id, tariff_name, price, paid, debt, cashback_used, cashback_earned, cashback_percent, event_cashback_percent, cashback_balance, next_due_date, enrolled_at, age_days)`
  - Xato matnlari: `forbidden: finance_only`, `forbidden: finance_fields`, `invalid_amount`, `invalid_price`, `enroll_required`, `amount_exceeds_debt (debt=<n>)`, `reason_required`, `payment_not_found`, `already_voided`, `void_would_overpay`, `participant_not_found`, `refund_exceeds_paid (paid=<n>)`, `participant_has_payments`, plus 050 dagilari.

- [ ] **Step 1: Testni yozish**

`supabase/tests/051_finance_core_test.sql`:

```sql
-- Behavioural tests for migration 051 (Moliya core).
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

INSERT INTO public.events (id, name, cashback_percent) VALUES
  ('e5100000-0000-0000-0000-000000000001', 'Event 1', 10),
  ('e5100000-0000-0000-0000-000000000002', 'Event 2', 0),
  ('e5100000-0000-0000-0000-000000000003', 'Event 3', 0);
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
     public.profiles, public.user_permissions
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

-- ─── C: existing client not in the event, no tariff → enroll_required ───────
DO $$
BEGIN
  PERFORM pg_temp.as_user('51000000-0000-0000-0000-000000000001');
  PERFORM public.record_payment(
    p_event_id => 'e5100000-0000-0000-0000-000000000001', p_amount => 1000, p_method => 'naqd',
    p_client_id => 'c5100000-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'C FAILED: tarifsiz yozildi';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'enroll_required' THEN RAISE EXCEPTION 'C FAILED: %', SQLERRM; END IF;
  RAISE NOTICE 'C ok: enroll_required';
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

SELECT '051: hamma testlar o''tdi ✓' AS natija;
```

- [ ] **Step 2: Stendni ko'tarish (001–050), eski manfiy to'lovni qo'shish, testni qizil ekanini ko'rish**

CLAUDE.md §5 retsepti: `fy-test`, `supabase_migrations` stub, `supabase/migrations/0[0-4]*.sql` va `050_event_tariffs.sql`. Kutilgan xatolar: 013/014/016/019/021/025/029/042/048.

N testi uchun backfill oldidan eski manfiy to'lov qo'shiladi:

```bash
docker exec -i fy-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.events (id, name) VALUES ('e5100000-0000-0000-0000-0000000000ff', 'Legacy');
INSERT INTO public.event_participants (id, event_id, full_name, price)
VALUES ('40510000-0000-0000-0000-0000000000ff', 'e5100000-0000-0000-0000-0000000000ff', 'Legacy', 1000);
INSERT INTO public.payments (participant_id, amount, method, note)
VALUES ('40510000-0000-0000-0000-0000000000ff', 500, 'naqd', 'legacy-positive'),
       ('40510000-0000-0000-0000-0000000000ff', -200, 'naqd', 'legacy-negative');
SQL
docker cp supabase/tests/051_finance_core_test.sql fy-test:/tmp/t.sql
docker exec fy-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql; echo "exit=$?"
```
Expected: `function public.record_payment(...) does not exist`, `exit=3`. Keyin testning fixture qoldiqlarini tozalang (Task 1, 2-bosqich tajribasi):

```bash
docker exec fy-test psql -U postgres -d postgres -q -c "delete from public.clients where id::text like 'c5100000%'; delete from public.events where id::text like 'e5100000%' and id::text <> 'e5100000-0000-0000-0000-0000000000ff'; delete from public.user_permissions where user_id::text like '51000000%'; delete from public.profiles where id::text like '51000000%'; delete from auth.users where id::text like '51000000%';"
```

- [ ] **Step 3: Migratsiyani yozish**

`supabase/migrations/051_finance_core.sql`:

```sql
-- 051: Moliya core — money moves only through RPCs, payments are voided or
-- refunded (never deleted), finance-only reads, KPIs from the DB.
-- Spec: docs/superpowers/specs/2026-09-27-tadbirlar-moliya-design.md §5.2
-- event_finance_totals() stays until 052: the old frontend calls it until the
-- new one is deployed.

BEGIN;

-- ─── payments: kind + void ───────────────────────────────────────────────────
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS kind        text NOT NULL DEFAULT 'payment',
  ADD COLUMN IF NOT EXISTS voided_at   timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS void_reason text;

-- 035 accepted any non-zero amount; a negative row can only have been a refund.
UPDATE public.payments SET kind = 'refund' WHERE amount < 0;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_kind_check CHECK (kind IN ('payment', 'refund')),
  ADD CONSTRAINT payments_kind_sign_check
    CHECK ((kind = 'payment' AND amount > 0) OR (kind = 'refund' AND amount < 0)),
  ADD CONSTRAINT payments_void_reason_check
    CHECK (voided_at IS NULL OR btrim(COALESCE(void_reason, '')) <> '');

-- paid = active (non-voided) payments + cashback spent. The sync trigger (043)
-- already fires on UPDATE, so voiding recalculates and claws back cashback.
CREATE OR REPLACE FUNCTION public.recalc_participant_paid(p_participant_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.event_participants ep
  SET paid = COALESCE(
        (SELECT SUM(p.amount) FROM public.payments p
         WHERE p.participant_id = p_participant_id AND p.voided_at IS NULL),
        0
      ) + COALESCE(ep.cashback_used, 0)
  WHERE ep.id = p_participant_id;
$$;

-- ─── event_participants: next due date ───────────────────────────────────────
ALTER TABLE public.event_participants ADD COLUMN IF NOT EXISTS next_due_date date;

-- ─── who may edit money ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_edit_finance(p_user uuid)
RETURNS bool
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_admin(p_user) OR EXISTS (
    SELECT 1 FROM public.user_permissions
    WHERE user_id = p_user AND module = 'tadbirlar-moliya' AND can_edit
  );
$$;
REVOKE EXECUTE ON FUNCTION public.can_edit_finance(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_edit_finance(uuid) TO authenticated, service_role;

-- ─── payments RLS: finance reads, nobody writes directly ─────────────────────
DROP POLICY IF EXISTS "payments select staff" ON public.payments;
DROP POLICY IF EXISTS "payments insert staff" ON public.payments;
DROP POLICY IF EXISTS "payments update staff" ON public.payments;
DROP POLICY IF EXISTS "payments delete staff" ON public.payments;
CREATE POLICY "payments select finance" ON public.payments
  FOR SELECT USING (public.has_permission(auth.uid(), 'tadbirlar-moliya'));
-- "payments select own" (members, 035) stays.

-- ─── participant guards ──────────────────────────────────────────────────────
-- Agreed price and due date are money: only finance editors change them.
-- auth.uid() is NULL for SQL maintenance / service role — only app users are gated.
CREATE OR REPLACE FUNCTION public.guard_participant_finance_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND (NEW.price IS DISTINCT FROM OLD.price OR NEW.next_due_date IS DISTINCT FROM OLD.next_due_date)
     AND NOT public.can_edit_finance(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: finance_fields';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.guard_participant_finance_fields() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trigger_guard_participant_finance_fields
  BEFORE UPDATE ON public.event_participants
  FOR EACH ROW EXECUTE FUNCTION public.guard_participant_finance_fields();

-- A participant with live payments is money history: void them in Moliya first.
-- Also blocks deleting an event that has such participants (the cascade fires this).
CREATE OR REPLACE FUNCTION public.guard_participant_has_payments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.payments WHERE participant_id = OLD.id AND voided_at IS NULL) THEN
    RAISE EXCEPTION 'participant_has_payments';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.guard_participant_has_payments() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trigger_guard_participant_has_payments
  BEFORE DELETE ON public.event_participants
  FOR EACH ROW EXECUTE FUNCTION public.guard_participant_has_payments();

-- ─── record_payment ──────────────────────────────────────────────────────────
-- One call for "client X paid N for event E": finds the client's participation,
-- or enrols them (existing client by id, or new by name + phone via 050's
-- enroll_participant), then inserts the payment. All or nothing.
CREATE OR REPLACE FUNCTION public.record_payment(
  p_event_id      uuid,
  p_amount        numeric,
  p_method        text,
  p_paid_at       timestamptz DEFAULT now(),
  p_client_id     uuid        DEFAULT NULL,
  p_full_name     text        DEFAULT NULL,
  p_phone         text        DEFAULT NULL,
  p_tariff_id     uuid        DEFAULT NULL,
  p_seller_id     uuid        DEFAULT NULL,
  p_price         numeric     DEFAULT NULL,
  p_next_due_date date        DEFAULT NULL,
  p_note          text        DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_participant uuid;
  v_price       numeric(12,2);
  v_paid        numeric(12,2);
  v_payment     uuid;
BEGIN
  IF NOT public.can_edit_finance(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: finance_only';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  IF p_client_id IS NOT NULL THEN
    SELECT id INTO v_participant
    FROM public.event_participants
    WHERE event_id = p_event_id AND contact_id = p_client_id;
  END IF;

  IF v_participant IS NULL THEN
    IF p_tariff_id IS NULL OR p_seller_id IS NULL THEN
      RAISE EXCEPTION 'enroll_required';
    END IF;
    v_participant := public.enroll_participant(
      p_event_id, p_tariff_id, p_seller_id, p_client_id, p_full_name, p_phone);
    IF p_price IS NOT NULL THEN
      IF p_price < 0 THEN RAISE EXCEPTION 'invalid_price'; END IF;
      UPDATE public.event_participants SET price = p_price WHERE id = v_participant;
    END IF;
  END IF;

  -- Lock the row: two cashiers paying the same debt at once can't overshoot it.
  SELECT price, paid INTO v_price, v_paid
  FROM public.event_participants WHERE id = v_participant FOR UPDATE;
  IF p_amount > v_price - v_paid THEN
    RAISE EXCEPTION 'amount_exceeds_debt (debt=%)', GREATEST(v_price - v_paid, 0);
  END IF;

  INSERT INTO public.payments (participant_id, amount, method, paid_at, recorded_by, note, kind)
  VALUES (v_participant, p_amount, p_method, COALESCE(p_paid_at, now()), auth.uid(),
          NULLIF(btrim(COALESCE(p_note, '')), ''), 'payment')
  RETURNING id INTO v_payment;

  -- The old due date is settled by this payment; keep the new one only while debt remains.
  UPDATE public.event_participants
  SET next_due_date = CASE WHEN price > paid THEN p_next_due_date ELSE NULL END
  WHERE id = v_participant;

  RETURN v_payment;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_payment(uuid, numeric, text, timestamptz, uuid, text, text, uuid, uuid, numeric, date, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.record_payment(uuid, numeric, text, timestamptz, uuid, text, text, uuid, uuid, numeric, date, text) TO authenticated, service_role;

-- ─── void_payment ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.void_payment(p_payment_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r       public.payments%ROWTYPE;
  v_price numeric(12,2);
  v_paid  numeric(12,2);
BEGIN
  IF NOT public.can_edit_finance(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: finance_only';
  END IF;
  IF btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT * INTO r FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_not_found'; END IF;
  IF r.voided_at IS NOT NULL THEN RAISE EXCEPTION 'already_voided'; END IF;

  -- Voiding a refund puts the money back on the participant: never past the price.
  IF r.kind = 'refund' THEN
    SELECT price, paid INTO v_price, v_paid
    FROM public.event_participants WHERE id = r.participant_id FOR UPDATE;
    IF v_paid - r.amount > v_price THEN
      RAISE EXCEPTION 'void_would_overpay';
    END IF;
  END IF;

  UPDATE public.payments
  SET voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
  WHERE id = p_payment_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.void_payment(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.void_payment(uuid, text) TO authenticated, service_role;

-- ─── refund_payment ──────────────────────────────────────────────────────────
-- Money handed back is its own negative row; capped by cash actually paid
-- (cashback spent isn't cash and goes back through the cashback ledger).
CREATE OR REPLACE FUNCTION public.refund_payment(
  p_participant_id uuid,
  p_amount         numeric,
  p_method         text,
  p_note           text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cash numeric(12,2);
  v_id   uuid;
BEGIN
  IF NOT public.can_edit_finance(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: finance_only';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  SELECT paid - COALESCE(cashback_used, 0) INTO v_cash
  FROM public.event_participants WHERE id = p_participant_id FOR UPDATE;
  IF v_cash IS NULL THEN RAISE EXCEPTION 'participant_not_found'; END IF;
  IF p_amount > v_cash THEN
    RAISE EXCEPTION 'refund_exceeds_paid (paid=%)', v_cash;
  END IF;

  INSERT INTO public.payments (participant_id, amount, method, paid_at, recorded_by, note, kind)
  VALUES (p_participant_id, -p_amount, p_method, now(), auth.uid(),
          NULLIF(btrim(COALESCE(p_note, '')), ''), 'refund')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.refund_payment(uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.refund_payment(uuid, numeric, text, text) TO authenticated, service_role;

-- ─── finance_summary (KPIs) ──────────────────────────────────────────────────
-- SECURITY INVOKER: payments RLS applies. Dates are Tashkent calendar days:
-- payments filter on paid_at, debt/agreed/collected on enrolment (created_at).
CREATE OR REPLACE FUNCTION public.finance_summary(
  p_from      date    DEFAULT NULL,
  p_to        date    DEFAULT NULL,
  p_event_id  uuid    DEFAULT NULL,
  p_seller_id uuid    DEFAULT NULL,
  p_no_seller boolean DEFAULT false,
  p_method    text    DEFAULT NULL
)
RETURNS TABLE (
  income           numeric,
  debt             numeric,
  overdue_debt     numeric,
  agreed           numeric,
  collected        numeric,
  cashback_balance numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH parts AS (
    SELECT ep.*
    FROM public.event_participants ep
    WHERE public.has_permission(auth.uid(), 'tadbirlar-moliya')
      AND (p_event_id IS NULL OR ep.event_id = p_event_id)
      AND (p_seller_id IS NULL OR ep.seller_id = p_seller_id)
      AND (NOT p_no_seller OR ep.seller_id IS NULL)
  ),
  dated AS (
    SELECT * FROM parts
    WHERE (p_from IS NULL OR (created_at AT TIME ZONE 'Asia/Tashkent')::date >= p_from)
      AND (p_to   IS NULL OR (created_at AT TIME ZONE 'Asia/Tashkent')::date <= p_to)
  )
  SELECT
    (SELECT COALESCE(SUM(p.amount), 0)
     FROM public.payments p JOIN parts ON parts.id = p.participant_id
     WHERE p.voided_at IS NULL
       AND (p_method IS NULL OR p.method = p_method)
       AND (p_from IS NULL OR (p.paid_at AT TIME ZONE 'Asia/Tashkent')::date >= p_from)
       AND (p_to   IS NULL OR (p.paid_at AT TIME ZONE 'Asia/Tashkent')::date <= p_to)),
    (SELECT COALESCE(SUM(GREATEST(price - paid, 0)), 0) FROM dated),
    (SELECT COALESCE(SUM(GREATEST(price - paid, 0)), 0) FROM dated
     WHERE next_due_date < (now() AT TIME ZONE 'Asia/Tashkent')::date),
    (SELECT COALESCE(SUM(price), 0) FROM dated),
    (SELECT COALESCE(SUM(paid), 0) FROM dated),
    (SELECT COALESCE(SUM(cashback_balance), 0) FROM public.clients
     WHERE public.has_permission(auth.uid(), 'tadbirlar-moliya'));
$$;
REVOKE EXECUTE ON FUNCTION public.finance_summary(date, date, uuid, uuid, boolean, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.finance_summary(date, date, uuid, uuid, boolean, text) TO authenticated, service_role;

-- ─── finance_debtors (Qarzdorlar tab) ────────────────────────────────────────
-- PostgREST can't compare two columns (price > paid), so the list is an RPC.
CREATE OR REPLACE FUNCTION public.finance_debtors(
  p_from      date    DEFAULT NULL,
  p_to        date    DEFAULT NULL,
  p_event_id  uuid    DEFAULT NULL,
  p_seller_id uuid    DEFAULT NULL,
  p_no_seller boolean DEFAULT false,
  p_status    text    DEFAULT 'debt'   -- debt | overdue | paid | all
)
RETURNS TABLE (
  participant_id         uuid,
  event_id               uuid,
  event_name             text,
  client_id              uuid,
  full_name              text,
  phone                  text,
  seller_id              uuid,
  seller_name            text,
  tariff_id              uuid,
  tariff_name            text,
  price                  numeric,
  paid                   numeric,
  debt                   numeric,
  cashback_used          numeric,
  cashback_earned        numeric,
  cashback_percent       numeric,
  event_cashback_percent numeric,
  cashback_balance       numeric,
  next_due_date          date,
  enrolled_at            timestamptz,
  age_days               int
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    ep.id, ep.event_id, e.name, ep.contact_id, ep.full_name, ep.phone,
    ep.seller_id, s.full_name, ep.tariff_id, t.name,
    ep.price, ep.paid, ep.price - ep.paid,
    COALESCE(ep.cashback_used, 0), COALESCE(ep.cashback_earned, 0),
    ep.cashback_percent, COALESCE(e.cashback_percent, 0),
    COALESCE(c.cashback_balance, 0), ep.next_due_date, ep.created_at,
    ((now() AT TIME ZONE 'Asia/Tashkent')::date - (ep.created_at AT TIME ZONE 'Asia/Tashkent')::date)
  FROM public.event_participants ep
  JOIN public.events e ON e.id = ep.event_id
  LEFT JOIN public.profiles s ON s.id = ep.seller_id
  LEFT JOIN public.event_tariffs t ON t.id = ep.tariff_id
  LEFT JOIN public.clients c ON c.id = ep.contact_id
  WHERE public.has_permission(auth.uid(), 'tadbirlar-moliya')
    AND (p_event_id IS NULL OR ep.event_id = p_event_id)
    AND (p_seller_id IS NULL OR ep.seller_id = p_seller_id)
    AND (NOT p_no_seller OR ep.seller_id IS NULL)
    AND (p_from IS NULL OR (ep.created_at AT TIME ZONE 'Asia/Tashkent')::date >= p_from)
    AND (p_to   IS NULL OR (ep.created_at AT TIME ZONE 'Asia/Tashkent')::date <= p_to)
    AND CASE p_status
          WHEN 'all'     THEN true
          WHEN 'paid'    THEN ep.price <= ep.paid
          WHEN 'overdue' THEN ep.price > ep.paid
                              AND ep.next_due_date < (now() AT TIME ZONE 'Asia/Tashkent')::date
          ELSE ep.price > ep.paid
        END
  ORDER BY ep.price - ep.paid DESC, ep.created_at
  -- ponytail: 1000 rows = PostgREST max_rows; paginate if a filter ever returns more.
  LIMIT 1000;
$$;
REVOKE EXECUTE ON FUNCTION public.finance_debtors(date, date, uuid, uuid, boolean, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.finance_debtors(date, date, uuid, uuid, boolean, text) TO authenticated, service_role;

COMMIT;
```

- [ ] **Step 4: Qo'llash va testni yashil ekanini ko'rish**

```bash
docker cp supabase/migrations/051_finance_core.sql fy-test:/tmp/m.sql
docker exec fy-test psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 -f /tmp/m.sql; echo "apply exit=$?"
docker exec fy-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql 2>&1 | grep -E "ERROR|ok|✓"; echo "exit=${PIPESTATUS[0]}"
```
Expected: `apply exit=0`; A…N `ok`; `051: hamma testlar o'tdi ✓`. Qizil bo'lsa: testmi yoki kodmi — `superpowers:systematic-debugging`. **PL/pgSQL eslatma:** `EXCEPTION` bloki o'z ichidagi hamma yozuvlarni orqaga qaytaradi (2-bosqich saboqi).

- [ ] **Step 5: 050 testi hali ham yashil (regressiya)**

Xuddi shu stendda (051 qo'llangan) 050 testini ishga tushiring — fixture id va telefonlari 051 testiniki bilan to'qnashmaydi:
```bash
docker cp supabase/tests/050_event_tariffs_test.sql fy-test:/tmp/t50.sql
docker exec fy-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t50.sql 2>&1 | tail -2
```
Expected: `050: hamma testlar o'tdi ✓`. Diqqat: 050 testining T10 qismi tadbirni o'chiradi. Unda to'lov yo'q, shuning uchun 051 dagi to'siq unga ta'sir qilmaydi.

- [ ] **Step 6: Stendni tozalash va stage**

```bash
docker rm -f fy-test
git add supabase/migrations/051_finance_core.sql supabase/tests/051_finance_core_test.sql
```

---

### Task 2: Davrlar (Toshkent kalendari) — `src/lib/period.ts`

**Files:**
- Create: `scripts/checks/period.check.ts`
- Create: `src/lib/period.ts`

**Interfaces:**
- Produces: `type Period = "all" | "today" | "month" | "last" | "custom"`, `PERIOD_LABELS: Record<Period, string>`, `tashkentToday(now?: Date): string` (YYYY-MM-DD), `periodRange(period, customFrom, customTo, today?): { from: string | null; to: string | null }`, `dayStart(d: string): string`, `dayEnd(d: string): string`.

- [ ] **Step 1: Tekshiruvni yozish**

`scripts/checks/period.check.ts` (tsconfig `src` ni oladi, `scripts/` ni emas — build'ga ta'sir qilmaydi):

```ts
// Runnable check: `bun scripts/checks/period.check.ts` — exits non-zero on failure.
import assert from "node:assert/strict"
import { dayEnd, dayStart, periodRange, tashkentToday } from "../../src/lib/period"

assert.deepEqual(periodRange("all", null, null, "2026-09-27"), { from: null, to: null })
assert.deepEqual(periodRange("today", null, null, "2026-09-27"), { from: "2026-09-27", to: "2026-09-27" })
assert.deepEqual(periodRange("month", null, null, "2026-09-27"), { from: "2026-09-01", to: "2026-09-27" })
assert.deepEqual(periodRange("last", null, null, "2026-01-15"), { from: "2025-12-01", to: "2025-12-31" })
assert.deepEqual(periodRange("last", null, null, "2028-03-10"), { from: "2028-02-01", to: "2028-02-29" })
assert.deepEqual(periodRange("custom", "2026-05-01", "2026-05-20", "2026-09-27"), { from: "2026-05-01", to: "2026-05-20" })
// 20:00 UTC on 30 Sep is already 1 Oct in Tashkent (UTC+5).
assert.equal(tashkentToday(new Date("2026-09-30T20:00:00Z")), "2026-10-01")
assert.equal(dayStart("2026-09-01"), "2026-09-01T00:00:00+05:00")
assert.equal(dayEnd("2026-09-30"), "2026-09-30T23:59:59.999+05:00")
console.log("period.check: ok")
```

- [ ] **Step 2: Qizil ekanini ko'rish**

Run: `bun scripts/checks/period.check.ts; echo "exit=$?"`
Expected: `Cannot find module '../../src/lib/period'`, exit ≠ 0.

- [ ] **Step 3: Modulni yozish**

`src/lib/period.ts`:

```ts
// Calendar periods for the Moliya filters, in Tashkent days (UTC+5, no DST).
export type Period = "all" | "today" | "month" | "last" | "custom"

export const PERIOD_LABELS: Record<Period, string> = {
  all: "Butun davr",
  today: "Bugun",
  month: "Shu oy",
  last: "O'tgan oy",
  custom: "Oraliq",
}

export function tashkentToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(now)
}

export function periodRange(
  period: Period,
  customFrom: string | null,
  customTo: string | null,
  today: string = tashkentToday(),
): { from: string | null; to: string | null } {
  switch (period) {
    case "today":
      return { from: today, to: today }
    case "month":
      return { from: `${today.slice(0, 8)}01`, to: today }
    case "last": {
      const [y, m] = today.split("-").map(Number)
      const iso = (d: Date) => d.toISOString().slice(0, 10)
      return { from: iso(new Date(Date.UTC(y, m - 2, 1))), to: iso(new Date(Date.UTC(y, m - 1, 0))) }
    }
    case "custom":
      return { from: customFrom, to: customTo }
    default:
      return { from: null, to: null }
  }
}

// Inclusive timestamptz bounds of a Tashkent calendar day, for PostgREST filters.
export function dayStart(d: string): string {
  return `${d}T00:00:00+05:00`
}

export function dayEnd(d: string): string {
  return `${d}T23:59:59.999+05:00`
}
```

- [ ] **Step 4: Yashil ekanini ko'rish**

Run: `bun scripts/checks/period.check.ts; echo "exit=$?"`
Expected: `period.check: ok`, `exit=0`.

- [ ] **Step 5: Stage** — `git add scripts/checks/period.check.ts src/lib/period.ts`

---
### Task 3: Query qatlami va hook'lar — `finance.ts`, `useFinance.ts`, `FINANCE_KEY`

**Files:**
- Create: `src/lib/supabase/queries/finance.ts`
- Create: `src/hooks/useFinance.ts`
- Modify: `src/lib/supabase/queries/events.ts` (`const ENROLL_ERRORS` → `export const ENROLL_ERRORS`)
- Modify: `src/hooks/useEvents.ts`, `src/hooks/useCashback.ts`, `src/hooks/usePayments.ts` (`FINANCE_TOTALS_KEY` → `FINANCE_KEY`)

**Interfaces:**
- Consumes: Task 1 RPC nomlari/parametrlari/xato matnlari; Task 2 `dayStart`, `dayEnd`; `events.ts` dagi `ClientExistsError`, `EnrollClient`, `ENROLL_ERRORS`.
- Produces:
  - `finance.ts`: `type DebtStatus = "debt" | "overdue" | "paid" | "all"`; `interface FinanceFilters { from: string | null; to: string | null; eventId: string | null; seller: string | null; method: PaymentMethod | null }`; `interface FinanceSummary { income; debt; overdue_debt; agreed; collected; cashback_balance: number }`; `getFinanceSummary(f)`; `PAYMENTS_PAGE = 50`; `interface PaymentRow { id; participant_id; amount; kind: "payment" | "refund"; method; paid_at; note; voided_at; void_reason; recorder_name; client_name; client_phone; event_name; seller_name; participant_cash_paid }`; `listPayments(f, limit)`; `interface DebtorRow {…Task 1 finance_debtors ustunlari…}`; `listDebtors(f, status)`; `interface RecordPaymentInput { eventId; amount; method; paidAt; client: EnrollClient; enroll: { tariffId; sellerId; price } | null; nextDueDate: string | null; note: string }`; `recordPayment(i): Promise<string>`; `voidPayment(id, reason)`; `refundPayment({ participantId, amount, method, note })`; `interface ParticipantFinancePatch { price?: number; seller_id?: string | null; next_due_date?: string | null }`; `updateParticipantFinance(id, patch)`.
  - `useFinance.ts`: `useFinanceSummary(f)`, `usePaymentsList(f, limit)`, `useDebtors(f, status)`, `useRecordPayment()`, `useVoidPayment()` (`mutate({ id, reason })`), `useRefundPayment()`, `useUpdateParticipantFinance()` (`mutate({ id, patch })`).
  - `useEvents.ts`: `FINANCE_KEY = ["finance"] as const` (eski `FINANCE_TOTALS_KEY` o'rniga; barcha Moliya so'rovlari shu prefiks ostida).

- [ ] **Step 1: `ENROLL_ERRORS` ni eksport qilish**

`src/lib/supabase/queries/events.ts`: `const ENROLL_ERRORS: Record<string, string> = {` → `export const ENROLL_ERRORS: Record<string, string> = {`.

- [ ] **Step 2: `FINANCE_KEY` ga qayta nomlash**

`src/hooks/useEvents.ts` da:

```ts
// Declared here (not in usePayments.ts) to avoid a circular import: usePayments.ts
// already imports from useEvents.ts, so the reverse would form a cycle.
export const FINANCE_TOTALS_KEY = ["finance-totals"] as const
```
→
```ts
// Prefix of every Moliya query (KPIs, payments log, debtors). Declared here, not in
// useFinance.ts, because useFinance/useCashback/usePayments all import useEvents.
export const FINANCE_KEY = ["finance"] as const
```

Keyin qolgan hamma joyda almashtiring:

Run: `grep -rl "FINANCE_TOTALS_KEY" src | xargs sed -i '' 's/FINANCE_TOTALS_KEY/FINANCE_KEY/g' && grep -rn "FINANCE_TOTALS_KEY" src`
Expected: oxirgi grep hech narsa topmaydi.

`src/hooks/useCashback.ts` dagi `useSetParticipantCashbackPercent` ning `onSuccess` ichiga (Qarzdorlar ro'yxati ham yangilanishi uchun) qo'shing:

```ts
      qc.invalidateQueries({ queryKey: FINANCE_KEY })
```

- [ ] **Step 3: `finance.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase } from "../client"
import type { PaymentMethod } from "./payments"
import { ClientExistsError, ENROLL_ERRORS, type EnrollClient } from "./events"
import { dayEnd, dayStart } from "@/lib/period"
import { formatMoney } from "@/lib/format"

// ponytail: untyped client until `bun run gen:types` picks up migration 051.
const db = supabase as unknown as SupabaseClient

export type DebtStatus = "debt" | "overdue" | "paid" | "all"

export interface FinanceFilters {
  from: string | null            // YYYY-MM-DD, Tashkent calendar day
  to: string | null
  eventId: string | null
  seller: string | null          // profile id; "none" = no seller; null = any
  method: PaymentMethod | null
}

function filterParams(f: FinanceFilters) {
  return {
    p_from: f.from,
    p_to: f.to,
    p_event_id: f.eventId,
    p_seller_id: f.seller && f.seller !== "none" ? f.seller : null,
    p_no_seller: f.seller === "none",
  }
}

const FINANCE_ERRORS: Record<string, string> = {
  ...ENROLL_ERRORS,
  "forbidden: finance_only": "Moliyani tahrirlash uchun ruxsat yo'q",
  "forbidden: finance_fields": "Kelishuv summasi va to'lov sanasini faqat Moliya o'zgartiradi",
  invalid_amount: "Summa 0 dan katta bo'lishi kerak",
  invalid_price: "Kelishuv summasi manfiy bo'lishi mumkin emas",
  enroll_required: "Mijoz bu tadbirda yo'q — tarif va sotuvchini tanlang",
  reason_required: "Bekor qilish sababini yozing",
  already_voided: "Bu to'lov allaqachon bekor qilingan",
  payment_not_found: "To'lov topilmadi",
  participant_not_found: "Ishtirokchi topilmadi",
  void_would_overpay: "Bu qaytarishni bekor qilsak, to'langan summa kelishuvdan oshib ketadi",
}

function financeError(e: { message: string; code?: string }): Error {
  const exists = /^client_exists:([0-9a-f-]{36}):(.*)$/s.exec(e.message)
  if (exists) return new ClientExistsError(exists[1], exists[2])
  const debt = /^amount_exceeds_debt \(debt=([\d.]+)\)$/.exec(e.message)
  if (debt) return new Error(`To'lov qarzdan ko'p. Qolgan qarz: ${formatMoney(Number(debt[1]))}`)
  const cash = /^refund_exceeds_paid \(paid=([\d.]+)\)$/.exec(e.message)
  if (cash) return new Error(`Qaytarish to'langan puldan ko'p. Ko'pi bilan: ${formatMoney(Number(cash[1]))}`)
  if (e.code === "23505") return new Error("Bu telefon raqam boshqa mijozda band")
  return new Error(FINANCE_ERRORS[e.message] ?? e.message)
}

// ─── KPIs ────────────────────────────────────────────────────────────────────

export interface FinanceSummary {
  income: number            // active payments − refunds (cashback excluded)
  debt: number
  overdue_debt: number
  agreed: number            // SUM(price)
  collected: number         // SUM(paid)
  cashback_balance: number  // all clients, unfiltered
}

export async function getFinanceSummary(f: FinanceFilters): Promise<FinanceSummary> {
  const { data, error } = await db.rpc("finance_summary", { ...filterParams(f), p_method: f.method })
  if (error) throw financeError(error)
  const row = ((data ?? []) as Array<Record<keyof FinanceSummary, number | string | null>>)[0]
  return {
    income: Number(row?.income ?? 0),
    debt: Number(row?.debt ?? 0),
    overdue_debt: Number(row?.overdue_debt ?? 0),
    agreed: Number(row?.agreed ?? 0),
    collected: Number(row?.collected ?? 0),
    cashback_balance: Number(row?.cashback_balance ?? 0),
  }
}

// ─── Payments log ────────────────────────────────────────────────────────────

export const PAYMENTS_PAGE = 50

export interface PaymentRow {
  id: string
  participant_id: string
  amount: number                  // negative for refunds
  kind: "payment" | "refund"
  method: PaymentMethod
  paid_at: string
  note: string | null
  voided_at: string | null
  void_reason: string | null
  recorder_name: string | null
  client_name: string
  client_phone: string | null
  event_name: string | null
  seller_name: string | null
  participant_cash_paid: number   // paid − cashback_used: the most that can be refunded
}

interface PaymentJoin {
  id: string
  participant_id: string
  amount: number | string
  kind: "payment" | "refund"
  method: PaymentMethod
  paid_at: string
  note: string | null
  voided_at: string | null
  void_reason: string | null
  recorder: { full_name: string } | null
  participant: {
    full_name: string
    phone: string | null
    paid: number | string
    cashback_used: number | string | null
    event: { name: string } | null
    seller: { full_name: string } | null
  } | null
}

export async function listPayments(f: FinanceFilters, limit: number): Promise<PaymentRow[]> {
  let q = db
    .from("payments")
    .select(
      "id, participant_id, amount, kind, method, paid_at, note, voided_at, void_reason, " +
        "recorder:recorded_by(full_name), " +
        "participant:participant_id!inner(full_name, phone, paid, cashback_used, event_id, seller_id, " +
        "event:event_id(name), seller:seller_id(full_name))",
    )
    .order("paid_at", { ascending: false })
    .range(0, limit - 1)
  if (f.from) q = q.gte("paid_at", dayStart(f.from))
  if (f.to) q = q.lte("paid_at", dayEnd(f.to))
  if (f.method) q = q.eq("method", f.method)
  if (f.eventId) q = q.eq("participant.event_id", f.eventId)
  if (f.seller === "none") q = q.is("participant.seller_id", null)
  else if (f.seller) q = q.eq("participant.seller_id", f.seller)

  const { data, error } = await q
  if (error) throw financeError(error)
  return ((data ?? []) as unknown as PaymentJoin[]).map((r) => ({
    id: r.id,
    participant_id: r.participant_id,
    amount: Number(r.amount),
    kind: r.kind,
    method: r.method,
    paid_at: r.paid_at,
    note: r.note,
    voided_at: r.voided_at,
    void_reason: r.void_reason,
    recorder_name: r.recorder?.full_name ?? null,
    client_name: r.participant?.full_name ?? "—",
    client_phone: r.participant?.phone ?? null,
    event_name: r.participant?.event?.name ?? null,
    seller_name: r.participant?.seller?.full_name ?? null,
    participant_cash_paid: Number(r.participant?.paid ?? 0) - Number(r.participant?.cashback_used ?? 0),
  }))
}

// ─── Debtors ─────────────────────────────────────────────────────────────────

export interface DebtorRow {
  participant_id: string
  event_id: string
  event_name: string
  client_id: string | null
  full_name: string
  phone: string | null
  seller_id: string | null
  seller_name: string | null
  tariff_id: string | null
  tariff_name: string | null
  price: number
  paid: number
  debt: number
  cashback_used: number
  cashback_earned: number
  cashback_percent: number | null
  event_cashback_percent: number
  cashback_balance: number
  next_due_date: string | null
  enrolled_at: string
  age_days: number
}

export async function listDebtors(f: FinanceFilters, status: DebtStatus): Promise<DebtorRow[]> {
  const { data, error } = await db.rpc("finance_debtors", { ...filterParams(f), p_status: status })
  if (error) throw financeError(error)
  // Normalise numerics once here so the UI never does arithmetic on strings.
  return ((data ?? []) as Array<DebtorRow & Record<string, unknown>>).map((r) => ({
    ...r,
    price: Number(r.price),
    paid: Number(r.paid),
    debt: Number(r.debt),
    cashback_used: Number(r.cashback_used),
    cashback_earned: Number(r.cashback_earned),
    cashback_percent: r.cashback_percent === null ? null : Number(r.cashback_percent),
    event_cashback_percent: Number(r.event_cashback_percent),
    cashback_balance: Number(r.cashback_balance),
    age_days: Number(r.age_days),
  }))
}

// ─── Money movements (RPC only — payments has no write policy) ──────────────

export interface RecordPaymentInput {
  eventId: string
  amount: number
  method: PaymentMethod
  paidAt: string
  client: EnrollClient
  // Required when the client isn't in the event yet: enrols them in the same transaction.
  enroll: { tariffId: string; sellerId: string; price: number } | null
  nextDueDate: string | null
  note: string
}

export async function recordPayment(i: RecordPaymentInput): Promise<string> {
  const c = i.client
  const { data, error } = await db.rpc("record_payment", {
    p_event_id: i.eventId,
    p_amount: i.amount,
    p_method: i.method,
    p_paid_at: i.paidAt,
    p_client_id: "clientId" in c ? c.clientId : null,
    p_full_name: "fullName" in c ? c.fullName : null,
    p_phone: "phone" in c ? c.phone : null,
    p_tariff_id: i.enroll?.tariffId ?? null,
    p_seller_id: i.enroll?.sellerId ?? null,
    p_price: i.enroll?.price ?? null,
    p_next_due_date: i.nextDueDate,
    p_note: i.note || null,
  })
  if (error) throw financeError(error)
  return data as string
}

export async function voidPayment(id: string, reason: string): Promise<void> {
  const { error } = await db.rpc("void_payment", { p_payment_id: id, p_reason: reason })
  if (error) throw financeError(error)
}

export async function refundPayment(v: {
  participantId: string
  amount: number
  method: PaymentMethod
  note: string
}): Promise<void> {
  const { error } = await db.rpc("refund_payment", {
    p_participant_id: v.participantId,
    p_amount: v.amount,
    p_method: v.method,
    p_note: v.note || null,
  })
  if (error) throw financeError(error)
}

export interface ParticipantFinancePatch {
  price?: number
  seller_id?: string | null
  next_due_date?: string | null
}

// price / next_due_date are guarded in the DB (051): non-finance users get forbidden: finance_fields.
export async function updateParticipantFinance(id: string, patch: ParticipantFinancePatch): Promise<void> {
  const { error } = await db.from("event_participants").update(patch).eq("id", id)
  if (error) throw financeError(error)
}
```

- [ ] **Step 4: `useFinance.ts`**

```ts
import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query"
import {
  getFinanceSummary,
  listPayments,
  listDebtors,
  recordPayment,
  voidPayment,
  refundPayment,
  updateParticipantFinance,
  type FinanceFilters,
  type FinanceSummary,
  type PaymentRow,
  type DebtorRow,
  type DebtStatus,
  type ParticipantFinancePatch,
} from "@/lib/supabase/queries/finance"
import { FINANCE_KEY, PARTICIPANTS_KEY, EVENT_COUNTS_KEY } from "@/hooks/useEvents"
import { CLIENTS_KEY } from "@/hooks/useClients"
import { CLIENT_CASHBACK_KEY } from "@/hooks/useCashback"

// Money must never look stale: every view that shows it, after any movement.
function invalidateMoney(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: FINANCE_KEY })
  qc.invalidateQueries({ queryKey: PARTICIPANTS_KEY })
  qc.invalidateQueries({ queryKey: EVENT_COUNTS_KEY })
  qc.invalidateQueries({ queryKey: CLIENTS_KEY })
  qc.invalidateQueries({ queryKey: CLIENT_CASHBACK_KEY })
  qc.invalidateQueries({ queryKey: ["client-journey"] })
  qc.invalidateQueries({ queryKey: ["client-participations"] })
}

export function useFinanceSummary(f: FinanceFilters) {
  return useQuery<FinanceSummary>({
    queryKey: [...FINANCE_KEY, "summary", f],
    queryFn: () => getFinanceSummary(f),
  })
}

export function usePaymentsList(f: FinanceFilters, limit: number) {
  return useQuery<PaymentRow[]>({
    queryKey: [...FINANCE_KEY, "payments", f, limit],
    queryFn: () => listPayments(f, limit),
    placeholderData: (prev) => prev, // "Ko'proq yuklash" keeps the rows on screen
  })
}

export function useDebtors(f: FinanceFilters, status: DebtStatus) {
  return useQuery<DebtorRow[]>({
    queryKey: [...FINANCE_KEY, "debtors", f, status],
    queryFn: () => listDebtors(f, status),
  })
}

function useMoneyMutation<V>(fn: (vars: V) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => invalidateMoney(qc) })
}

export const useRecordPayment = () => useMoneyMutation(recordPayment)
export const useVoidPayment = () =>
  useMoneyMutation((v: { id: string; reason: string }) => voidPayment(v.id, v.reason))
export const useRefundPayment = () => useMoneyMutation(refundPayment)
export const useUpdateParticipantFinance = () =>
  useMoneyMutation((v: { id: string; patch: ParticipantFinancePatch }) => updateParticipantFinance(v.id, v.patch))
```

- [ ] **Step 5: Tekshirish**

Run: `bun run build && bun run lint`
Expected: build exit 0; lint baseline (3). `useCashback.ts` ↔ `useFinance.ts` sikl yo'q (`useFinance` → `useCashback` → `useEvents`).

- [ ] **Step 6: Stage** — `git add src/lib/supabase/queries/finance.ts src/hooks/useFinance.ts src/lib/supabase/queries/events.ts src/hooks/useEvents.ts src/hooks/useCashback.ts src/hooks/usePayments.ts`

---

### Task 4: Filtrlar (URL) va KPI kartalari

**Files:**
- Create: `src/hooks/useFinanceFilters.ts`
- Create: `src/components/moliya/FinanceFilterBar.tsx`
- Create: `src/components/moliya/FinanceKpis.tsx`

**Interfaces:**
- Consumes: `periodRange`, `PERIOD_LABELS`, `Period` (Task 2); `FinanceFilters` (Task 3); `useFinanceSummary` (Task 3).
- Produces: `useFinanceFilters(): { filters: FinanceFilters; period: Period; get(key): string | null; set(patch: Partial<Record<FilterKey, string | null>>): void }`, bunda `FilterKey = "period" | "from" | "to" | "event" | "seller" | "method" | "tab" | "status"`; `<FinanceFilterBar />`; `<FinanceKpis filters />`.

- [ ] **Step 1: `useFinanceFilters.ts`**

```ts
import { useSearchParams } from "react-router-dom"
import type { FinanceFilters } from "@/lib/supabase/queries/finance"
import type { PaymentMethod } from "@/lib/supabase/queries/payments"
import { periodRange, type Period } from "@/lib/period"

export type FilterKey = "period" | "from" | "to" | "event" | "seller" | "method" | "tab" | "status"

const PERIODS: Period[] = ["all", "today", "month", "last", "custom"]
const METHODS: PaymentMethod[] = ["naqd", "karta", "transfer"]

// Filter state lives in the URL: a refresh or a shared link keeps it.
export function useFinanceFilters() {
  const [params, setParams] = useSearchParams()
  const get = (k: FilterKey) => params.get(k)

  const rawPeriod = get("period")
  const period: Period = PERIODS.includes(rawPeriod as Period) ? (rawPeriod as Period) : "all"
  const rawMethod = get("method")
  const { from, to } = periodRange(period, get("from"), get("to"))

  const filters: FinanceFilters = {
    from,
    to,
    eventId: get("event"),
    seller: get("seller"),
    method: METHODS.includes(rawMethod as PaymentMethod) ? (rawMethod as PaymentMethod) : null,
  }

  function set(patch: Partial<Record<FilterKey, string | null>>) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v)
          else next.delete(k)
        }
        return next
      },
      { replace: true },
    )
  }

  return { filters, period, get, set }
}
```

- [ ] **Step 2: `FinanceFilterBar.tsx`**

```tsx
import { useEvents } from "@/hooks/useEvents"
import { useUsers } from "@/hooks/useUsers"
import { useFinanceFilters } from "@/hooks/useFinanceFilters"
import { PERIOD_LABELS, type Period } from "@/lib/period"

const SELECT =
  "border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] bg-white focus:outline-none focus:border-[#141414] transition-colors"

export function FinanceFilterBar() {
  const { period, get, set } = useFinanceFilters()
  const { data: events = [] } = useEvents()
  const { data: users = [] } = useUsers()
  // Inactive sellers stay listed: their past sales still need filtering.
  const sellers = users.filter((u) => u.department === "sotuv")
  const active = period !== "all" || !!get("event") || !!get("seller") || !!get("method")

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Davr"
        value={period}
        onChange={(e) => set({ period: e.target.value === "all" ? null : e.target.value, from: null, to: null })}
        className={SELECT}
      >
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <option key={p} value={p}>{PERIOD_LABELS[p]}</option>
        ))}
      </select>

      {period === "custom" && (
        <>
          <input
            type="date"
            aria-label="Boshlanish sanasi"
            value={get("from") ?? ""}
            max={get("to") ?? undefined}
            onChange={(e) => set({ from: e.target.value || null })}
            className={SELECT}
          />
          <span className="text-[#999] text-[12px]">—</span>
          <input
            type="date"
            aria-label="Tugash sanasi"
            value={get("to") ?? ""}
            min={get("from") ?? undefined}
            onChange={(e) => set({ to: e.target.value || null })}
            className={SELECT}
          />
        </>
      )}

      <select aria-label="Tadbir" value={get("event") ?? ""} onChange={(e) => set({ event: e.target.value || null })} className={SELECT}>
        <option value="">Barcha tadbirlar</option>
        {events.map((ev) => (
          <option key={ev.id} value={ev.id}>{ev.name}</option>
        ))}
      </select>

      <select aria-label="Sotuvchi" value={get("seller") ?? ""} onChange={(e) => set({ seller: e.target.value || null })} className={SELECT}>
        <option value="">Barcha sotuvchilar</option>
        {sellers.map((s) => (
          <option key={s.id} value={s.id}>{s.full_name}</option>
        ))}
        <option value="none">Belgilanmagan</option>
      </select>

      <select aria-label="To'lov usuli" value={get("method") ?? ""} onChange={(e) => set({ method: e.target.value || null })} className={SELECT}>
        <option value="">Barcha usullar</option>
        <option value="naqd">Naqd</option>
        <option value="karta">Karta</option>
        <option value="transfer">Transfer</option>
      </select>

      {active && (
        <button
          onClick={() => set({ period: null, from: null, to: null, event: null, seller: null, method: null })}
          className="px-3 py-2 text-[12px] font-semibold text-[#666] hover:text-[#141414] transition-colors"
        >
          Filtrlarni tozalash
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 3: `FinanceKpis.tsx`**

```tsx
import { TrendUp, Wallet, Warning, ChartPie, Gift } from "@phosphor-icons/react"
import { useFinanceSummary } from "@/hooks/useFinance"
import type { FinanceFilters } from "@/lib/supabase/queries/finance"
import { formatMoney } from "@/lib/format"

export function FinanceKpis({ filters }: { filters: FinanceFilters }) {
  const { data: s, isLoading } = useFinanceSummary(filters)
  const rate = s && s.agreed > 0 ? Math.round((s.collected / s.agreed) * 100) : null

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <Kpi icon={<TrendUp size={15} weight="bold" />} label="Kirim" hint="To'lovlar − qaytarishlar" loading={isLoading} value={s ? formatMoney(s.income) : ""} />
      <Kpi icon={<Wallet size={15} weight="bold" />} label="Qolgan qarz" loading={isLoading} value={s ? formatMoney(s.debt) : ""} danger={(s?.debt ?? 0) > 0} />
      <Kpi icon={<Warning size={15} weight="bold" />} label="Muddati o'tgan" loading={isLoading} value={s ? formatMoney(s.overdue_debt) : ""} danger={(s?.overdue_debt ?? 0) > 0} />
      <Kpi
        icon={<ChartPie size={15} weight="bold" />}
        label="Yig'ish"
        hint={s ? `${formatMoney(s.collected)} / ${formatMoney(s.agreed)}` : undefined}
        loading={isLoading}
        value={rate === null ? "—" : `${rate}%`}
      />
      <Kpi icon={<Gift size={15} weight="bold" />} label="Keshbek qoldig'i" hint="Barcha mijozlar, filtrsiz" loading={isLoading} value={s ? formatMoney(s.cashback_balance) : ""} />
    </div>
  )
}

function Kpi({
  icon,
  label,
  value,
  hint,
  loading,
  danger,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  loading: boolean
  danger?: boolean
}) {
  return (
    <div className="bg-white border border-[#F0F0F0] rounded-[12px] p-4 flex flex-col gap-2">
      <span className="flex items-center gap-2 text-[12px] font-bold text-[#999]">{icon} {label}</span>
      {loading ? (
        <div className="animate-pulse bg-[#F0F0F0] rounded-[6px] h-7 w-28" />
      ) : (
        <span className="text-[20px] font-bold leading-none" style={{ color: danger ? "#D13328" : "#141414" }}>{value}</span>
      )}
      {hint && <span className="text-[11px] text-[#999]">{hint}</span>}
    </div>
  )
}
```

- [ ] **Step 4: Tekshirish**

Run: `bun run build && bun run lint`
Expected: build exit 0; lint baseline (3).

- [ ] **Step 5: Stage** — `git add src/hooks/useFinanceFilters.ts src/components/moliya/FinanceFilterBar.tsx src/components/moliya/FinanceKpis.tsx`

---

### Task 5: To'lovlar tabi — ro'yxat, bekor qilish, qaytarish

**Files:**
- Create: `src/components/moliya/PaymentActionModals.tsx`
- Create: `src/components/moliya/PaymentsTab.tsx`

**Interfaces:**
- Consumes: `usePaymentsList`, `useVoidPayment`, `useRefundPayment` (Task 3); `PaymentRow`, `PAYMENTS_PAGE`, `FinanceFilters`.
- Produces: `<PaymentsTab filters canEdit />`; `<VoidPaymentModal payment onClose />`; `<RefundModal payment onClose />`.

- [ ] **Step 1: `PaymentActionModals.tsx`**

```tsx
import { useId, useState } from "react"
import { X } from "@phosphor-icons/react"
import type { PaymentMethod } from "@/lib/supabase/queries/payments"
import type { PaymentRow } from "@/lib/supabase/queries/finance"
import { useRefundPayment, useVoidPayment } from "@/hooks/useFinance"
import { useDialog } from "@/hooks/useDialog"
import { formatMoney, formatNumber } from "@/lib/format"

const INPUT =
  "w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] placeholder:text-[#CCCCCC] focus:outline-none focus:border-[#141414] transition-colors"
const LABEL = "text-[12px] font-medium text-[#999999]"
const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "naqd", label: "Naqd" },
  { value: "karta", label: "Karta" },
  { value: "transfer", label: "Transfer" },
]

// Both modals are mounted only while open, so their state starts fresh.
function ModalShell({
  title,
  error,
  submitLabel,
  canSubmit,
  pending,
  danger,
  onSubmit,
  onClose,
  children,
}: {
  title: string
  error: string | null
  submitLabel: string
  canSubmit: boolean
  pending: boolean
  danger?: boolean
  onSubmit: () => void
  onClose: () => void
  children: React.ReactNode
}) {
  const titleId = useId()
  const panelRef = useDialog<HTMLDivElement>(onClose, true)
  const enabled = canSubmit && !pending
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="bg-white rounded-[12px] shadow-2xl w-full max-w-sm relative flex flex-col"
      >
        <div className="p-5 border-b border-[#F0F0F0] flex items-center justify-between">
          <h3 id={titleId} className="text-[16px] font-bold text-[#141414]">{title}</h3>
          <button onClick={onClose} aria-label="Yopish" className="p-1 hover:bg-[#F5F5F5] rounded-full transition-all">
            <X size={20} className="text-[#999999]" weight="bold" />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          {error && (
            <div role="alert" className="px-3 py-2 rounded-[8px] text-[12px] font-medium bg-red-50 text-red-700 border border-red-200">
              {error}
            </div>
          )}
          {children}
        </div>
        <div className="p-5 pt-0 flex gap-3">
          <button
            onClick={onClose}
            disabled={pending}
            className="flex-1 px-4 py-2.5 bg-[#F5F5F5] text-[#141414] rounded-[8px] text-[13px] font-bold hover:bg-[#EAEAEA] transition-all disabled:opacity-50"
          >
            Yopish
          </button>
          <button
            onClick={onSubmit}
            disabled={!enabled}
            className={`flex-1 px-4 py-2.5 rounded-[8px] text-[13px] font-bold transition-all ${
              enabled ? (danger ? "bg-[#D13328] text-white hover:bg-[#B02A20]" : "bg-[#141414] text-white hover:bg-black") : "bg-[#E0E0E0] text-[#999] cursor-not-allowed"
            }`}
          >
            {pending ? "Saqlanmoqda..." : submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function VoidPaymentModal({ payment, onClose }: { payment: PaymentRow; onClose: () => void }) {
  const voidPay = useVoidPayment()
  const reasonId = useId()
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)

  return (
    <ModalShell
      title={payment.kind === "refund" ? "Qaytarishni bekor qilish" : "To'lovni bekor qilish"}
      error={error}
      submitLabel="Bekor qilish"
      danger
      canSubmit={reason.trim().length > 0}
      pending={voidPay.isPending}
      onClose={onClose}
      onSubmit={() =>
        voidPay.mutate({ id: payment.id, reason: reason.trim() }, { onSuccess: onClose, onError: (e) => setError(e.message) })
      }
    >
      <p className="text-[12px] text-[#666]">
        <span className="font-bold text-[#141414]">{payment.client_name}</span> · {formatMoney(Math.abs(payment.amount))}.
        Yozuv o'chirilmaydi — ro'yxatda chizilgan holda qoladi, qarz va keshbek qayta hisoblanadi.
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={reasonId} className={LABEL}>Sabab *</label>
        <textarea id={reasonId} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus className={INPUT} placeholder="Masalan: summa xato kiritilgan" />
      </div>
    </ModalShell>
  )
}

export function RefundModal({ payment, onClose }: { payment: PaymentRow; onClose: () => void }) {
  const refund = useRefundPayment()
  const amountId = useId()
  const noteId = useId()
  const max = Math.max(payment.participant_cash_paid, 0)
  const [amount, setAmount] = useState(String(Math.round(Math.min(Math.abs(payment.amount), max))))
  const [method, setMethod] = useState<PaymentMethod>(payment.method)
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const amountNum = amount ? Number(amount) : 0

  return (
    <ModalShell
      title="Pulni qaytarish"
      error={error}
      submitLabel="Qaytarish"
      canSubmit={amountNum > 0 && amountNum <= max}
      pending={refund.isPending}
      onClose={onClose}
      onSubmit={() =>
        refund.mutate(
          { participantId: payment.participant_id, amount: amountNum, method, note: note.trim() },
          { onSuccess: onClose, onError: (e) => setError(e.message) },
        )
      }
    >
      <p className="text-[12px] text-[#666]">
        <span className="font-bold text-[#141414]">{payment.client_name}</span> · {payment.event_name ?? "—"}. Ko'pi bilan{" "}
        {formatMoney(max)} qaytarish mumkin.
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={amountId} className={LABEL}>Summa *</label>
        <input
          id={amountId}
          inputMode="numeric"
          value={amount ? formatNumber(Number(amount)) : ""}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
          aria-invalid={amountNum > max}
          className={`${INPUT} ${amountNum > max ? "border-[#D13328]" : ""}`}
        />
      </div>
      <div className="flex gap-2">
        {METHODS.map((m) => (
          <button
            key={m.value}
            onClick={() => setMethod(m.value)}
            aria-pressed={method === m.value}
            className={`flex-1 py-2 rounded-[8px] text-[12px] font-semibold border transition-colors ${
              method === m.value ? "bg-[#141414] text-white border-[#141414]" : "bg-white text-[#666] border-[#E0E0E0] hover:bg-[#F5F5F5]"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={noteId} className={LABEL}>Izoh</label>
        <input id={noteId} value={note} onChange={(e) => setNote(e.target.value)} className={INPUT} placeholder="Masalan: tadbirga kela olmadi" />
      </div>
    </ModalShell>
  )
}
```

- [ ] **Step 2: `PaymentsTab.tsx`**

```tsx
import { useState } from "react"
import { ArrowUUpLeft, Prohibit } from "@phosphor-icons/react"
import { usePaymentsList } from "@/hooks/useFinance"
import { PAYMENTS_PAGE, type FinanceFilters, type PaymentRow } from "@/lib/supabase/queries/finance"
import type { PaymentMethod } from "@/lib/supabase/queries/payments"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { RefundModal, VoidPaymentModal } from "@/components/moliya/PaymentActionModals"
import { formatDate, formatMoney, formatPhone } from "@/lib/format"
import { ThinkingOrb } from "thinking-orbs"

const METHOD_LABEL: Record<PaymentMethod, string> = { naqd: "Naqd", karta: "Karta", transfer: "Transfer" }

export function PaymentsTab({ filters, canEdit }: { filters: FinanceFilters; canEdit: boolean }) {
  const [limit, setLimit] = useState(PAYMENTS_PAGE)
  const { data: rows = [], isLoading } = usePaymentsList(filters, limit)
  const [voiding, setVoiding] = useState<PaymentRow | null>(null)
  const [refunding, setRefunding] = useState<PaymentRow | null>(null)

  return (
    <div className="bg-white border border-[#F0F0F0] rounded-[12px] overflow-hidden">
      {isLoading ? (
        <div className="py-10 flex items-center justify-center">
          <ThinkingOrb state="searching" size={20} theme="light" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-[#999]">Bu filtrlar bo'yicha to'lov yo'q</div>
      ) : (
        <>
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11px] font-bold text-[#999] border-b border-[#F0F0F0]">
                  <th className="px-4 py-2.5 font-bold">Sana</th>
                  <th className="px-4 py-2.5 font-bold">Mijoz</th>
                  <th className="px-4 py-2.5 font-bold">Tadbir</th>
                  <th className="px-4 py-2.5 font-bold">Sotuvchi</th>
                  <th className="px-4 py-2.5 font-bold text-right">Summa</th>
                  <th className="px-4 py-2.5 font-bold">Usul</th>
                  <th className="px-4 py-2.5 font-bold">Kiritgan</th>
                  {canEdit && <th className="px-4 py-2.5 font-bold text-right">Amal</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const voided = !!p.voided_at
                  return (
                    <tr key={p.id} className={`border-b border-[#F7F7F7] last:border-0 hover:bg-[#FBFBFB] transition-colors ${voided ? "opacity-50" : ""}`}>
                      <td className="px-4 py-2.5 text-[12px] text-[#999] whitespace-nowrap">{formatDate(p.paid_at)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="text-[13px] font-medium text-[#141414]">{p.client_name}</div>
                        <div className="text-[11px] text-[#999]">{formatPhone(p.client_phone)}</div>
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-[#666] whitespace-nowrap">{p.event_name ?? "—"}</td>
                      <td className="px-4 py-2.5 text-[13px] text-[#666] whitespace-nowrap">{p.seller_name ?? "—"}</td>
                      <td
                        className="px-4 py-2.5 text-[13px] font-bold text-right whitespace-nowrap"
                        style={{ color: p.amount < 0 ? "#D13328" : "#1E7E34", textDecoration: voided ? "line-through" : undefined }}
                      >
                        {p.amount < 0 ? "−" : "+"}
                        {formatMoney(Math.abs(p.amount))}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {voided ? (
                          <span title={p.void_reason ?? undefined}>
                            <StatusBadge label="Bekor qilingan" variant="warning" />
                          </span>
                        ) : (
                          <StatusBadge label={p.kind === "refund" ? `Qaytarish · ${METHOD_LABEL[p.method]}` : METHOD_LABEL[p.method]} variant="neutral" />
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-[#666] whitespace-nowrap">{p.recorder_name ?? "—"}</td>
                      {canEdit && (
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          {!voided && (
                            <span className="inline-flex gap-1.5">
                              {p.kind === "payment" && p.participant_cash_paid > 0 && (
                                <RowAction onClick={() => setRefunding(p)} label="Qaytarish" icon={<ArrowUUpLeft size={13} weight="bold" />} />
                              )}
                              <RowAction onClick={() => setVoiding(p)} label="Bekor qilish" icon={<Prohibit size={13} weight="bold" />} danger />
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {rows.length === limit && (
            <div className="p-3 border-t border-[#F0F0F0] flex justify-center">
              <button
                onClick={() => setLimit((l) => l + PAYMENTS_PAGE)}
                className="px-4 py-1.5 rounded-[8px] text-[12px] font-semibold text-[#666] border border-[#E0E0E0] hover:bg-[#F5F5F5] transition-colors"
              >
                Ko'proq yuklash
              </button>
            </div>
          )}
        </>
      )}

      {voiding && <VoidPaymentModal payment={voiding} onClose={() => setVoiding(null)} />}
      {refunding && <RefundModal payment={refunding} onClose={() => setRefunding(null)} />}
    </div>
  )
}

function RowAction({ onClick, label, icon, danger }: { onClick: () => void; label: string; icon: React.ReactNode; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-semibold border border-[#E0E0E0] hover:bg-[#F5F5F5] transition-colors ${
        danger ? "text-[#D13328]" : "text-[#141414]"
      }`}
    >
      {icon} {label}
    </button>
  )
}
```

- [ ] **Step 3: Tekshirish** — Run: `bun run build && bun run lint` → exit 0, lint baseline (3).

- [ ] **Step 4: Stage** — `git add src/components/moliya/PaymentActionModals.tsx src/components/moliya/PaymentsTab.tsx`

---

### Task 6: To'lov qo'shish oynasi — mavjud/yangi mijoz, tadbir, yozilish, summa

**Files:**
- Create: `src/components/moliya/RecordPaymentModal.tsx`

**Interfaces:**
- Consumes: `useRecordPayment` (Task 3), `ClientExistsError`, `searchContacts`, `ClientContact` (`events.ts`), `useEvents`, `useEventTariffs` (`useEvents.ts`), `useClientParticipations` (`usePayments.ts`, `{ participant_id, event_id, event_name, price, paid }[]`), `tashkentToday` (Task 2).
- Produces: `type PickedClient = Pick<ClientContact, "id" | "full_name" | "phone" | "image">`, `interface RecordPaymentPreset { client: PickedClient; eventId: string }`, `<RecordPaymentModal preset? onClose />` (ota-ona uni faqat ochiq paytda render qiladi).

- [ ] **Step 1: Faylni yozish**

```tsx
import { useState, useEffect, useId, useRef } from "react"
import { X, MagnifyingGlass, CaretLeft, Plus } from "@phosphor-icons/react"
import { searchContacts, ClientExistsError, type ClientContact } from "@/lib/supabase/queries/events"
import type { PaymentMethod } from "@/lib/supabase/queries/payments"
import { useEvents, useEventTariffs } from "@/hooks/useEvents"
import { useClientParticipations } from "@/hooks/usePayments"
import { useRecordPayment } from "@/hooks/useFinance"
import { useUsers } from "@/hooks/useUsers"
import { useDialog } from "@/hooks/useDialog"
import { tashkentToday } from "@/lib/period"
import { formatMoney, formatNumber, formatPhone } from "@/lib/format"

export type PickedClient = Pick<ClientContact, "id" | "full_name" | "phone" | "image">

export interface RecordPaymentPreset {
  client: PickedClient
  eventId: string
}

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "naqd", label: "Naqd" },
  { value: "karta", label: "Karta" },
  { value: "transfer", label: "Transfer" },
]

const INPUT =
  "w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] placeholder:text-[#CCCCCC] focus:outline-none focus:border-[#141414] transition-colors"
const LABEL = "text-[12px] font-medium text-[#999999]"

function onlyDigits(v: string): string {
  return v.replace(/\D/g, "")
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("")
}

function ClientAvatar({ c }: { c: PickedClient }) {
  return c.image ? (
    <img src={c.image} alt={c.full_name} className="w-8 h-8 rounded-full object-cover shrink-0" />
  ) : (
    <span className="w-8 h-8 rounded-full bg-[#EBEBEB] text-[#666] text-[11px] font-bold flex items-center justify-center shrink-0">
      {initials(c.full_name)}
    </span>
  )
}

function MoneyInput({ id, value, onChange, invalid, placeholder }: { id: string; value: string; onChange: (digits: string) => void; invalid?: boolean; placeholder?: string }) {
  return (
    <div className="relative">
      <input
        id={id}
        inputMode="numeric"
        value={value ? formatNumber(Number(value)) : ""}
        onChange={(e) => onChange(onlyDigits(e.target.value))}
        placeholder={placeholder}
        aria-invalid={invalid}
        className={`${INPUT} pr-12 ${invalid ? "border-[#D13328]" : ""}`}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[#999] pointer-events-none">UZS</span>
    </div>
  )
}

// Mounted only while open (the parent renders it conditionally), so every open starts fresh.
export function RecordPaymentModal({ preset, onClose }: { preset?: RecordPaymentPreset; onClose: () => void }) {
  const record = useRecordPayment()
  const { data: events = [] } = useEvents()
  const { data: users = [] } = useUsers()
  const sellers = users.filter((u) => u.is_active && u.department === "sotuv")
  const panelRef = useDialog<HTMLDivElement>(onClose, true)

  const titleId = useId()
  const searchId = useId()
  const nameId = useId()
  const phoneId = useId()
  const eventFieldId = useId()
  const tariffFieldId = useId()
  const priceId = useId()
  const sellerFieldId = useId()
  const amountId = useId()
  const dateId = useId()
  const dueId = useId()
  const noteId = useId()

  const [mode, setMode] = useState<"search" | "new">("search")
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ClientContact[]>([])
  const [client, setClient] = useState<PickedClient | null>(preset?.client ?? null)
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [suggestion, setSuggestion] = useState<PickedClient | null>(null)
  const [eventId, setEventId] = useState(preset?.eventId ?? "")
  const [tariffId, setTariffId] = useState("")
  const [price, setPrice] = useState("")
  const [sellerId, setSellerId] = useState("")
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState<PaymentMethod>("naqd")
  const [date, setDate] = useState(() => tashkentToday())
  const [due, setDue] = useState("")
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced client search (search mode, while no client is picked)
  useEffect(() => {
    if (client || mode !== "search") return
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(async () => {
      try {
        setResults(await searchContacts(query))
      } catch {
        setResults([])
      }
    }, 300)
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current)
    }
  }, [query, client, mode])

  const existing = mode === "search" ? client : null
  const { data: participations = [], isLoading: loadingParts } = useClientParticipations(existing?.id ?? "")
  const { data: tariffs = [] } = useEventTariffs(eventId)
  const enrolled = existing ? (participations.find((p) => p.event_id === eventId) ?? null) : null
  const checking = !!existing && loadingParts
  const needsEnroll = !!eventId && !enrolled && !checking

  const debt = enrolled ? Math.max(enrolled.price - enrolled.paid, 0) : price ? Number(price) : 0
  const amountNum = amount ? Number(amount) : 0
  const overDebt = amountNum > debt
  const remaining = Math.max(debt - amountNum, 0)
  const hasClient = existing ? true : mode === "new" && fullName.trim().length > 0 && onlyDigits(phone).length >= 9
  const enrollValid = !needsEnroll || (!!tariffId && !!sellerId && price !== "")
  const canSubmit = hasClient && !!eventId && !checking && enrollValid && amountNum > 0 && !overDebt && !record.isPending

  function pickTariff(id: string) {
    setTariffId(id)
    const t = tariffs.find((x) => x.id === id)
    if (t) setPrice(String(Math.round(t.price)))
  }

  function pick(c: PickedClient) {
    setMode("search")
    setClient(c)
    setSuggestion(null)
    setQuery("")
    setResults([])
    setError(null)
  }

  function startNew() {
    setMode("new")
    setClient(null)
    // A typed phone-looking query pre-fills the phone, anything else the name.
    if (/^[\d\s+()-]+$/.test(query.trim())) setPhone(query.trim())
    else setFullName(query.trim())
    setError(null)
  }

  function handleSubmit() {
    if (!canSubmit) return
    setError(null)
    setSuggestion(null)
    record.mutate(
      {
        eventId,
        amount: amountNum,
        method,
        // Today → the real moment; a back-dated entry → noon of that Tashkent day.
        paidAt: date === tashkentToday() ? new Date().toISOString() : `${date}T12:00:00+05:00`,
        client: existing ? { clientId: existing.id } : { fullName: fullName.trim(), phone },
        enroll: needsEnroll ? { tariffId, sellerId, price: Number(price) } : null,
        nextDueDate: remaining > 0 && due ? due : null,
        note: note.trim(),
      },
      {
        onSuccess: onClose,
        onError: (err) => {
          if (err instanceof ClientExistsError) {
            setSuggestion({ id: err.clientId, full_name: err.clientName, phone, image: null })
            return
          }
          setError(err instanceof Error ? err.message : "Xatolik yuz berdi")
        },
      },
    )
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="bg-white rounded-[12px] shadow-2xl w-full max-w-md relative overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-5 border-b border-[#F0F0F0] flex items-center justify-between">
          <h3 id={titleId} className="text-[16px] font-bold text-[#141414]">To'lov qo'shish</h3>
          <button onClick={onClose} aria-label="Yopish" className="p-1 hover:bg-[#F5F5F5] rounded-full transition-all">
            <X size={20} className="text-[#999999]" weight="bold" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4 overflow-y-auto">
          {error && (
            <div role="alert" className="px-3 py-2 rounded-[8px] text-[12px] font-medium bg-red-50 text-red-700 border border-red-200">
              {error}
            </div>
          )}

          {/* 1. Client */}
          {mode === "search" && !client && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor={searchId} className={LABEL}>Mijoz *</label>
                <button onClick={startNew} className="flex items-center gap-1 text-[11px] font-semibold text-[#666] hover:text-[#141414] transition-colors">
                  <Plus size={11} weight="bold" /> Yangi mijoz
                </button>
              </div>
              <div className="relative">
                <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999]" weight="bold" />
                <input
                  id={searchId}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ism yoki telefon bo'yicha qidirish..."
                  autoFocus
                  className={`${INPUT} pl-9`}
                />
              </div>
              {results.length > 0 && (
                <div className="flex flex-col max-h-[200px] overflow-y-auto no-scrollbar mt-1">
                  {results.map((c) => (
                    <button key={c.id} onClick={() => pick(c)} className="w-full flex items-center gap-2.5 p-2 rounded-[8px] hover:bg-[#F5F5F5] transition-colors text-left">
                      <ClientAvatar c={c} />
                      <span className="flex flex-col min-w-0 flex-1">
                        <span className="text-[13px] font-medium text-[#141414] truncate">{c.full_name}</span>
                        <span className="text-[11px] text-[#999]">{formatPhone(c.phone)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {query.trim() && results.length === 0 && (
                <button onClick={startNew} className="text-left text-[12px] text-[#666] py-2 hover:text-[#141414]">
                  Mijoz topilmadi — <span className="font-semibold underline">yangi mijoz qo'shish</span>
                </button>
              )}
            </div>
          )}

          {mode === "search" && client && (
            <div className="flex flex-col gap-1.5">
              <span className={LABEL}>Mijoz *</span>
              <div className="flex items-center gap-2.5 border border-[#E0E0E0] rounded-[8px] p-2">
                <ClientAvatar c={client} />
                <span className="flex flex-col min-w-0 flex-1">
                  <span className="text-[13px] font-medium text-[#141414] truncate">{client.full_name}</span>
                  <span className="text-[11px] text-[#999]">{formatPhone(client.phone)}</span>
                </span>
                <button onClick={() => setClient(null)} className="flex items-center gap-1 text-[11px] font-semibold text-[#999] hover:text-[#141414] transition-colors">
                  <CaretLeft size={12} weight="bold" /> O'zgartirish
                </button>
              </div>
            </div>
          )}

          {mode === "new" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold text-[#141414]">Yangi mijoz</span>
                <button
                  onClick={() => { setMode("search"); setSuggestion(null) }}
                  className="flex items-center gap-1 text-[11px] font-semibold text-[#999] hover:text-[#141414] transition-colors"
                >
                  <CaretLeft size={12} weight="bold" /> Mavjudlardan tanlash
                </button>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={nameId} className={LABEL}>Ism Familiya *</label>
                <input id={nameId} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Aliyev Vali" autoFocus className={INPUT} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={phoneId} className={LABEL}>Telefon *</label>
                <input
                  id={phoneId}
                  type="tel"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setSuggestion(null) }}
                  placeholder="+998 90 123 45 67"
                  className={INPUT}
                />
              </div>
              {suggestion && (
                <div role="alert" className="flex items-center justify-between gap-2 px-3 py-2 rounded-[8px] bg-[#FBFBFB] border border-[#E0E0E0] text-[12px]">
                  <span className="text-[#666]">Bu raqam <span className="font-bold text-[#141414]">{suggestion.full_name}</span>ga tegishli.</span>
                  <button onClick={() => pick(suggestion)} className="shrink-0 font-bold text-[#141414] underline">Shu mijozni tanlash</button>
                </div>
              )}
            </div>
          )}

          {/* 2. Event */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={eventFieldId} className={LABEL}>Tadbir *</label>
            <select
              id={eventFieldId}
              value={eventId}
              onChange={(e) => { setEventId(e.target.value); setTariffId(""); setPrice("") }}
              className={INPUT}
            >
              <option value="" disabled>Tadbirni tanlang</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
          </div>

          {/* 3a. Already in the event → current state */}
          {enrolled && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-[8px] bg-[#FBFBFB] border border-[#F0F0F0] text-[12px]">
              <span className="text-[#999]">Kelishuv {formatMoney(enrolled.price)} · to'langan {formatMoney(enrolled.paid)}</span>
              <span className="font-bold whitespace-nowrap" style={{ color: debt > 0 ? "#D13328" : "#1E7E34" }}>
                {debt > 0 ? `Qarz ${formatMoney(debt)}` : "Qarz yo'q"}
              </span>
            </div>
          )}

          {/* 3b. Not in the event yet → enrolled in the same call */}
          {needsEnroll && (
            <div className="flex flex-col gap-3 p-3 rounded-[8px] border border-dashed border-[#E0E0E0]">
              <span className="text-[11px] font-bold text-[#999]">Mijoz bu tadbirda yo'q — to'lov bilan birga yoziladi</span>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={tariffFieldId} className={LABEL}>Tarif *</label>
                <select id={tariffFieldId} value={tariffId} onChange={(e) => pickTariff(e.target.value)} disabled={tariffs.length === 0} className={INPUT}>
                  <option value="" disabled>{tariffs.length === 0 ? "Bu tadbirda tarif yo'q" : "Tarifni tanlang"}</option>
                  {tariffs.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} — {formatMoney(t.price)}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={priceId} className={LABEL}>Kelishuv summasi *</label>
                <MoneyInput id={priceId} value={price} onChange={setPrice} placeholder="17,000,000" />
                <span className="text-[11px] text-[#999]">Tarif narxi qo'yiladi; chegirma bo'lsa o'zgartiring</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={sellerFieldId} className={LABEL}>Sotuvchi *</label>
                <select id={sellerFieldId} value={sellerId} onChange={(e) => setSellerId(e.target.value)} className={INPUT}>
                  <option value="" disabled>Sotuvchini tanlang</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>{s.full_name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* 4. Payment */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={amountId} className={LABEL}>To'lov summasi *</label>
            <MoneyInput id={amountId} value={amount} onChange={setAmount} invalid={overDebt} placeholder="17,000,000" />
            {overDebt && <span className="text-[11px] text-[#D13328]">Qarzdan ko'p. Qolgan qarz: {formatMoney(debt)}</span>}
          </div>

          <div className="flex gap-2" role="group" aria-label="To'lov usuli">
            {METHODS.map((m) => (
              <button
                key={m.value}
                onClick={() => setMethod(m.value)}
                aria-pressed={method === m.value}
                className={`flex-1 py-2 rounded-[8px] text-[12px] font-semibold border transition-colors ${
                  method === m.value ? "bg-[#141414] text-white border-[#141414]" : "bg-white text-[#666] border-[#E0E0E0] hover:bg-[#F5F5F5]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <label htmlFor={dateId} className={LABEL}>To'lov sanasi</label>
              <input id={dateId} type="date" value={date} max={tashkentToday()} onChange={(e) => setDate(e.target.value || tashkentToday())} className={INPUT} />
            </div>
            {amountNum > 0 && !overDebt && remaining > 0 && (
              <div className="flex flex-col gap-1.5 flex-1">
                <label htmlFor={dueId} className={LABEL}>Keyingi to'lov sanasi</label>
                <input id={dueId} type="date" value={due} min={date} onChange={(e) => setDue(e.target.value)} className={INPUT} />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={noteId} className={LABEL}>Izoh</label>
            <input id={noteId} value={note} onChange={(e) => setNote(e.target.value)} className={INPUT} placeholder="Ixtiyoriy" />
          </div>

          {amountNum > 0 && !overDebt && (
            <div className="flex items-center justify-between px-3 py-2 rounded-[8px] bg-[#FBFBFB] border border-[#F0F0F0] text-[12px]">
              <span className="text-[#999]">To'lovdan keyin qarz</span>
              <span className="font-bold" style={{ color: remaining > 0 ? "#D13328" : "#1E7E34" }}>{formatMoney(remaining)}</span>
            </div>
          )}
        </div>

        <div className="p-5 pt-0 flex gap-3">
          <button
            onClick={onClose}
            disabled={record.isPending}
            className="flex-1 px-4 py-2.5 bg-[#F5F5F5] text-[#141414] rounded-[8px] text-[13px] font-bold hover:bg-[#EAEAEA] transition-all disabled:opacity-50"
          >
            Bekor qilish
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`flex-1 px-4 py-2.5 rounded-[8px] text-[13px] font-bold transition-all ${
              canSubmit ? "bg-[#141414] text-white hover:bg-black active:scale-95" : "bg-[#E0E0E0] text-[#999] cursor-not-allowed"
            }`}
          >
            {record.isPending ? "Saqlanmoqda..." : "Saqlash"}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Tekshirish** — Run: `bun run build && bun run lint` → exit 0, lint baseline (3). `react-refresh/only-export-components` bu fayldagi `type`/`interface` eksportlarini tanqid qilsa, ularni `src/lib/supabase/queries/finance.ts` ga ko'chiring va `Task 6: Ruling:` yozing.

- [ ] **Step 3: Stage** — `git add src/components/moliya/RecordPaymentModal.tsx`

---

### Task 7: Qarzdorlar tabi

**Files:**
- Create: `src/components/moliya/cells.tsx`
- Create: `src/components/moliya/DebtorsTab.tsx`
- Modify: `src/components/cashback/ApplyCashbackModal.tsx` (`participant` prop tipi)

**Interfaces:**
- Consumes: `useDebtors`, `useUpdateParticipantFinance` (Task 3); `useFinanceFilters` (Task 4); `useSetParticipantCashbackPercent(eventId)` (`useCashback.ts`, Task 3 da `FINANCE_KEY` ni ham invalidatsiya qiladi); `ApplyCashbackModal`; `tashkentToday`.
- Produces: `<DebtorsTab filters canEdit onPay={(row: DebtorRow) => void} />`; `cells.tsx`: `PriceCell({ value, onSave })`, `CashbackPercentCell({ percent, earned, defaultPercent, onSet })`.

- [ ] **Step 1: `ApplyCashbackModal` prop tipini kengaytirish**

`src/components/cashback/ApplyCashbackModal.tsx` dagi **ikkala** interfeysda (`ApplyCashbackModalProps` va `InnerProps`) `participant: Participant` →

```ts
  participant: Pick<Participant, "id" | "contact_id" | "event_id" | "full_name" | "price" | "paid">
```

(Modal faqat shu maydonlarni ishlatadi; eski `EventFinance` hali to'liq `Participant` beradi — mos.)

- [ ] **Step 2: `cells.tsx`**

`EventFinance.tsx` dagi `PriceCell` va `CashbackPercentCell` bu yerga ko'chiriladi; `CashbackPercentCell` `Participant` o'rniga oddiy qiymatlar oladi:

```tsx
import { useState } from "react"
import { PencilSimple } from "@phosphor-icons/react"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { formatMoney, formatNumber } from "@/lib/format"

// Inline-edit the agreed price (chegirma / individual deal).
export function PriceCell({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState("")

  if (!editing) {
    return (
      <button
        onClick={() => { setVal(value ? String(Math.round(value)) : ""); setEditing(true) }}
        className="group/price inline-flex items-center gap-1 text-[13px] text-[#141414]"
        title="Kelishuv summasini tahrirlash"
      >
        {formatMoney(value)}
        <PencilSimple size={12} weight="bold" className="text-[#CCC] opacity-0 group-hover/price:opacity-100 transition-opacity" />
      </button>
    )
  }

  function commit() {
    const next = val ? Number(val) : 0
    setEditing(false)
    if (next !== value) onSave(next)
  }

  return (
    <input
      autoFocus
      inputMode="numeric"
      aria-label="Kelishuv summasi"
      value={val ? formatNumber(Number(val)) : ""}
      onChange={(e) => setVal(e.target.value.replace(/\D/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit()
        if (e.key === "Escape") setEditing(false)
      }}
      className="w-28 border border-[#141414] rounded-[6px] px-2 py-1 text-[13px] text-right text-[#141414] focus:outline-none"
    />
  )
}

// Per-participant cashback % override; empty = the event default.
export function CashbackPercentCell({
  percent,
  earned,
  defaultPercent,
  onSet,
}: {
  percent: number | null
  earned: number
  defaultPercent: number
  onSet: (percent: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState("")
  const effective = percent ?? defaultPercent

  if (!editing) {
    return (
      <button
        onClick={() => { setVal(percent !== null ? String(percent) : ""); setEditing(true) }}
        className="inline-flex items-center gap-1.5 justify-end"
        title="Keshbek foizini tahrirlash (bo'sh = tadbir standarti)"
      >
        <StatusBadge label={`${effective}%`} variant={percent !== null ? "warning" : "neutral"} />
        {earned > 0 && <span className="text-[11px] text-[#666]">{formatMoney(earned)}</span>}
      </button>
    )
  }

  function commit() {
    setEditing(false)
    const trimmed = val.trim()
    if (trimmed === "") { onSet(null); return }
    const n = Number(trimmed)
    if (Number.isFinite(n) && n >= 0 && n <= 100) onSet(n)
  }

  return (
    <div className="relative inline-block">
      <input
        autoFocus
        type="number"
        min={0}
        max={100}
        step={0.5}
        aria-label="Keshbek foizi"
        value={val}
        placeholder={`${defaultPercent}`}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit()
          if (e.key === "Escape") setEditing(false)
        }}
        className="w-16 border border-[#141414] rounded-[6px] px-2 py-1 pr-5 text-[13px] text-right text-[#141414] focus:outline-none"
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-[#999] pointer-events-none">%</span>
    </div>
  )
}
```

- [ ] **Step 3: `DebtorsTab.tsx`**

```tsx
import { useState } from "react"
import { Coins } from "@phosphor-icons/react"
import { useDebtors, useUpdateParticipantFinance } from "@/hooks/useFinance"
import { useFinanceFilters } from "@/hooks/useFinanceFilters"
import { useSetParticipantCashbackPercent } from "@/hooks/useCashback"
import { useUsers } from "@/hooks/useUsers"
import type { DebtorRow, DebtStatus, FinanceFilters, ParticipantFinancePatch } from "@/lib/supabase/queries/finance"
import { ApplyCashbackModal } from "@/components/cashback/ApplyCashbackModal"
import { CashbackPercentCell, PriceCell } from "@/components/moliya/cells"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { tashkentToday } from "@/lib/period"
import { formatDate, formatMoney, formatPhone } from "@/lib/format"
import { ThinkingOrb } from "thinking-orbs"

const STATUS_LABEL: Record<DebtStatus, string> = {
  debt: "Qarzdorlar",
  overdue: "Muddati o'tganlar",
  paid: "To'liq to'laganlar",
  all: "Hammasi",
}

const SELECT =
  "border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] bg-white focus:outline-none focus:border-[#141414] transition-colors"

// Receivables aging, counted from the enrolment day.
function aging(days: number): { label: string; color: string } {
  if (days <= 30) return { label: "0–30 kun", color: "#999999" }
  if (days <= 60) return { label: "31–60 kun", color: "#B7791F" }
  return { label: "60+ kun", color: "#D13328" }
}

interface SellerOption {
  id: string
  full_name: string
}

export function DebtorsTab({ filters, canEdit, onPay }: { filters: FinanceFilters; canEdit: boolean; onPay: (row: DebtorRow) => void }) {
  const { get, set } = useFinanceFilters()
  const raw = get("status")
  const status: DebtStatus = raw === "overdue" || raw === "paid" || raw === "all" ? raw : "debt"
  const { data: rows = [], isLoading } = useDebtors(filters, status)
  const { data: users = [] } = useUsers()
  const sellers: SellerOption[] = users
    .filter((u) => u.is_active && u.department === "sotuv")
    .map((u) => ({ id: u.id, full_name: u.full_name }))
  const [spending, setSpending] = useState<DebtorRow | null>(null)
  const today = tashkentToday()

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <select
          aria-label="Holat"
          value={status}
          onChange={(e) => set({ status: e.target.value === "debt" ? null : e.target.value })}
          className={SELECT}
        >
          {(Object.keys(STATUS_LABEL) as DebtStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
        {!isLoading && <span className="text-[12px] text-[#999]">{rows.length} ta</span>}
      </div>

      <div className="bg-white border border-[#F0F0F0] rounded-[12px] overflow-hidden">
        {isLoading ? (
          <div className="py-10 flex items-center justify-center">
            <ThinkingOrb state="searching" size={20} theme="light" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-[#999]">Bu filtrlar bo'yicha ishtirokchi yo'q</div>
        ) : (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11px] font-bold text-[#999] border-b border-[#F0F0F0]">
                  <th className="px-4 py-2.5 font-bold">Mijoz</th>
                  <th className="px-4 py-2.5 font-bold">Tadbir</th>
                  <th className="px-4 py-2.5 font-bold">Sotuvchi</th>
                  <th className="px-4 py-2.5 font-bold">Tarif</th>
                  <th className="px-4 py-2.5 font-bold text-right">Kelishuv</th>
                  <th className="px-4 py-2.5 font-bold text-right">To'langan</th>
                  <th className="px-4 py-2.5 font-bold text-right">Qoldiq</th>
                  <th className="px-4 py-2.5 font-bold">Keyingi to'lov</th>
                  <th className="px-4 py-2.5 font-bold">Qarz yoshi</th>
                  <th className="px-4 py-2.5 font-bold text-right">Keshbek</th>
                  {canEdit && <th className="px-4 py-2.5 font-bold text-right">Amal</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <DebtorTableRow key={r.participant_id} r={r} sellers={sellers} today={today} canEdit={canEdit} onPay={onPay} onSpend={setSpending} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {spending && (
        <ApplyCashbackModal
          isOpen
          onClose={() => setSpending(null)}
          participant={{
            id: spending.participant_id,
            contact_id: spending.client_id,
            event_id: spending.event_id,
            full_name: spending.full_name,
            price: spending.price,
            paid: spending.paid,
          }}
          balance={spending.cashback_balance}
        />
      )}
    </div>
  )
}

// One row per component: the cashback-% hook is keyed by the row's event.
function DebtorTableRow({
  r,
  sellers,
  today,
  canEdit,
  onPay,
  onSpend,
}: {
  r: DebtorRow
  sellers: SellerOption[]
  today: string
  canEdit: boolean
  onPay: (row: DebtorRow) => void
  onSpend: (row: DebtorRow) => void
}) {
  const update = useUpdateParticipantFinance()
  const setPercent = useSetParticipantCashbackPercent(r.event_id)
  const inDebt = r.debt > 0
  const overdue = inDebt && !!r.next_due_date && r.next_due_date < today
  const age = aging(r.age_days)
  // A seller who has since left Sotuv still shows on their old sales.
  const sellerOptions =
    r.seller_id && !sellers.some((s) => s.id === r.seller_id)
      ? [...sellers, { id: r.seller_id, full_name: r.seller_name ?? "—" }]
      : sellers

  function patch(p: ParticipantFinancePatch) {
    update.mutate({ id: r.participant_id, patch: p }, { onError: (e) => window.alert(e.message) })
  }

  return (
    <tr className="border-b border-[#F7F7F7] last:border-0 hover:bg-[#FBFBFB] transition-colors">
      <td className="px-4 py-2.5 whitespace-nowrap">
        <div className="text-[13px] font-medium text-[#141414]">{r.full_name}</div>
        <div className="text-[11px] text-[#999]">{formatPhone(r.phone)}</div>
      </td>
      <td className="px-4 py-2.5 text-[13px] text-[#666] whitespace-nowrap">{r.event_name}</td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        {canEdit ? (
          <select
            aria-label={`${r.full_name} sotuvchisi`}
            value={r.seller_id ?? ""}
            onChange={(e) => patch({ seller_id: e.target.value || null })}
            className="border border-transparent hover:border-[#E0E0E0] rounded-[6px] px-1.5 py-1 text-[13px] text-[#666] bg-transparent focus:outline-none focus:border-[#141414]"
          >
            <option value="">Belgilanmagan</option>
            {sellerOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
        ) : (
          <span className="text-[13px] text-[#666]">{r.seller_name ?? "Belgilanmagan"}</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-[13px] text-[#666] whitespace-nowrap">{r.tariff_name ?? "Individual"}</td>
      <td className="px-4 py-2.5 text-right whitespace-nowrap">
        {canEdit ? <PriceCell value={r.price} onSave={(price) => patch({ price })} /> : <span className="text-[13px] text-[#141414]">{formatMoney(r.price)}</span>}
      </td>
      <td className="px-4 py-2.5 text-[13px] text-[#141414] text-right whitespace-nowrap">{formatMoney(r.paid)}</td>
      <td className="px-4 py-2.5 text-right whitespace-nowrap">
        {inDebt ? (
          <span className="text-[13px] font-bold" style={{ color: "#D13328" }}>{formatMoney(r.debt)}</span>
        ) : (
          <span className="inline-flex justify-end"><StatusBadge label="To'langan" variant="success" dot /></span>
        )}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        {canEdit && inDebt ? (
          <input
            type="date"
            aria-label={`${r.full_name} keyingi to'lov sanasi`}
            value={r.next_due_date ?? ""}
            onChange={(e) => patch({ next_due_date: e.target.value || null })}
            className="border border-[#E0E0E0] rounded-[6px] px-2 py-1 text-[12px] bg-white focus:outline-none focus:border-[#141414]"
            style={{ color: overdue ? "#D13328" : "#141414" }}
          />
        ) : (
          <span className="text-[12px]" style={{ color: overdue ? "#D13328" : "#999" }}>{r.next_due_date ? formatDate(r.next_due_date) : "—"}</span>
        )}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap text-[12px] font-semibold" style={{ color: inDebt ? age.color : "#CCCCCC" }}>
        {inDebt ? age.label : "—"}
      </td>
      <td className="px-4 py-2.5 text-right whitespace-nowrap">
        {canEdit ? (
          <CashbackPercentCell
            percent={r.cashback_percent}
            earned={r.cashback_earned}
            defaultPercent={r.event_cashback_percent}
            onSet={(percent) => setPercent.mutate({ participantId: r.participant_id, percent })}
          />
        ) : (
          <StatusBadge label={`${r.cashback_percent ?? r.event_cashback_percent}%`} variant="neutral" />
        )}
      </td>
      {canEdit && (
        <td className="px-4 py-2.5 text-right whitespace-nowrap">
          <span className="inline-flex items-center gap-1.5 justify-end">
            {r.client_id && r.cashback_balance > 0 && inDebt && (
              <button
                onClick={() => onSpend(r)}
                title={`Keshbek balansi: ${formatMoney(r.cashback_balance)}`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-semibold text-[#141414] bg-[#F5F5F5] hover:bg-[#EBEBEB] transition-colors"
              >
                Keshbek
              </button>
            )}
            {inDebt && (
              <button
                onClick={() => onPay(r)}
                disabled={!r.client_id}
                title={r.client_id ? "To'lov qo'shish" : "Mijoz kartasi bog'lanmagan — to'lovni kiritib bo'lmaydi"}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-semibold text-[#141414] border border-[#E0E0E0] hover:bg-[#F5F5F5] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Coins size={13} weight="bold" /> To'lov
              </button>
            )}
          </span>
        </td>
      )}
    </tr>
  )
}
```

- [ ] **Step 4: Tekshirish** — Run: `bun run build && bun run lint` → exit 0, lint baseline (3).

- [ ] **Step 5: Stage** — `git add src/components/moliya/cells.tsx src/components/moliya/DebtorsTab.tsx src/components/cashback/ApplyCashbackModal.tsx`

---

### Task 8: Moliya sahifasi va eski kodni tozalash

**Files:**
- Modify (to'liq qayta yoziladi): `src/components/pages/EventsMoliya.tsx`
- Delete: `src/components/events/EventFinance.tsx`, `src/components/events/FinanceOverview.tsx`, `src/components/events/PaymentsLog.tsx`, `src/components/events/ParticipantPaymentModal.tsx`, `src/components/events/AddPaymentModal.tsx`
- Modify: `src/lib/supabase/queries/payments.ts`, `src/hooks/usePayments.ts`, `src/components/events/EventTabs.tsx`, `src/components/pages/EventsBoshqaruv.tsx`

**Interfaces:**
- Consumes: Task 4–7 komponentlari; `useAuth().canEdit`.
- Produces: —

- [ ] **Step 1: `EventsMoliya.tsx`**

```tsx
import { useState } from "react"
import { Plus } from "@phosphor-icons/react"
import { useAuth } from "@/context/AuthContext"
import { useFinanceFilters } from "@/hooks/useFinanceFilters"
import { FinanceFilterBar } from "@/components/moliya/FinanceFilterBar"
import { FinanceKpis } from "@/components/moliya/FinanceKpis"
import { PaymentsTab } from "@/components/moliya/PaymentsTab"
import { DebtorsTab } from "@/components/moliya/DebtorsTab"
import { RecordPaymentModal, type RecordPaymentPreset } from "@/components/moliya/RecordPaymentModal"

const TABS = [
  { id: "payments", label: "To'lovlar" },
  { id: "debtors", label: "Qarzdorlar" },
] as const

// Global finance: one page over all events; an event is just a filter.
export function EventsMoliya() {
  const { canEdit } = useAuth()
  const editable = canEdit("tadbirlar-moliya")
  const { filters, get, set } = useFinanceFilters()
  const tab = get("tab") === "debtors" ? "debtors" : "payments"
  // undefined = closed; null = open blank; a preset = open for that client/event
  const [recording, setRecording] = useState<RecordPaymentPreset | null | undefined>(undefined)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FinanceFilterBar />
        {editable && (
          <button
            onClick={() => setRecording(null)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#141414] text-white rounded-[8px] text-[13px] font-bold hover:bg-[#333] transition-colors"
          >
            <Plus size={15} weight="bold" /> To'lov qo'shish
          </button>
        )}
      </div>

      <FinanceKpis filters={filters} />

      <div role="tablist" aria-label="Moliya bo'limlari" className="flex gap-1 border-b border-[#F0F0F0]">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => set({ tab: t.id === "payments" ? null : t.id })}
            className={`px-4 py-2 -mb-px text-[13px] font-semibold border-b-2 transition-colors ${
              tab === t.id ? "border-[#141414] text-[#141414]" : "border-transparent text-[#999] hover:text-[#141414]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "payments" ? (
        <PaymentsTab filters={filters} canEdit={editable} />
      ) : (
        <DebtorsTab
          filters={filters}
          canEdit={editable}
          onPay={(r) =>
            r.client_id &&
            setRecording({ client: { id: r.client_id, full_name: r.full_name, phone: r.phone, image: null }, eventId: r.event_id })
          }
        />
      )}

      {recording !== undefined && <RecordPaymentModal preset={recording ?? undefined} onClose={() => setRecording(undefined)} />}
    </div>
  )
}
```

- [ ] **Step 2: Eski komponentlarni o'chirish**

```bash
git rm src/components/events/EventFinance.tsx src/components/events/FinanceOverview.tsx src/components/events/PaymentsLog.tsx src/components/events/ParticipantPaymentModal.tsx src/components/events/AddPaymentModal.tsx
```

- [ ] **Step 3: `payments.ts` va `usePayments.ts`**

`src/lib/supabase/queries/payments.ts` dan olib tashlang:
- `addPayment` va `deletePayment` funksiyalari (051 dan keyin to'g'ridan-to'g'ri yozish RLS bilan yopiladi);
- `getRecentPayments` (yagona foydalanuvchisi `PaymentsLog` edi);
- `// ─── Finance KPI totals` bo'limi to'liq, ya'ni `FinanceTotals` va `getFinanceTotals`.

`Payment`, `PaymentMethod`, `getParticipantPayments`, `EventPayment`, `getEventPayments` va ularning yordamchilari, `ClientParticipation`, `getClientParticipations` qoladi.

`src/hooks/usePayments.ts` ni quyidagiga almashtiring (`useParticipantPayments`/`useEventPayments` — bizdan oldingi o'lik kod, tegilmaydi):

```ts
import { useQuery } from "@tanstack/react-query"
import {
  getParticipantPayments,
  getEventPayments,
  getClientParticipations,
} from "@/lib/supabase/queries/payments"

export const PAYMENTS_KEY = (participantId: string) =>
  ["payments", participantId] as const
export const EVENT_PAYMENTS_KEY = (eventId: string) =>
  ["event-payments", eventId] as const

export function useParticipantPayments(participantId: string) {
  return useQuery({
    queryKey: PAYMENTS_KEY(participantId),
    queryFn:  () => getParticipantPayments(participantId),
    enabled:  Boolean(participantId),
  })
}

export function useEventPayments(eventId: string) {
  return useQuery({
    queryKey: EVENT_PAYMENTS_KEY(eventId),
    queryFn:  () => getEventPayments(eventId),
    enabled:  Boolean(eventId),
  })
}

export const CLIENT_PARTICIPATIONS_KEY = (clientId: string) =>
  ["client-participations", clientId] as const

export function useClientParticipations(clientId: string) {
  return useQuery({
    queryKey: CLIENT_PARTICIPATIONS_KEY(clientId),
    queryFn:  () => getClientParticipations(clientId),
    enabled:  Boolean(clientId),
  })
}
```

- [ ] **Step 4: `EventTabs` — "Umumiy" tabi endi hech kimga kerak emas**

`src/components/events/EventTabs.tsx`:
- `EventTabsProps` dan `showUmumiy: boolean` qatorini olib tashlang;
- destructuring'dan `showUmumiy,` ni olib tashlang;
- `{showUmumiy && ( … )}` blokini to'liq olib tashlang;
- `UMUMIY` importini va, agar boshqa joyda ishlatilmasa, `SquaresFour` importini olib tashlang.

`src/components/pages/EventsBoshqaruv.tsx` dan `            showUmumiy={false}` qatorini olib tashlang.

- [ ] **Step 5: Qoldiqlarni tekshirish**

Run: `grep -rnw "EventFinance\|FinanceOverview\|PaymentsLog\|ParticipantPaymentModal\|AddPaymentModal\|useAddPayment\|addPayment\|useDeletePayment\|deletePayment\|useRecentPayments\|getRecentPayments\|useFinanceTotals\|getFinanceTotals\|showUmumiy\|FINANCE_TOTALS_KEY" src`
Expected: hech narsa.

Run: `bun run build && bun run lint`
Expected: build exit 0; lint baseline (3) yoki kamroq (`EventTabs.tsx` dagi eski muammo yo'qolsa — yaxshi).

- [ ] **Step 6: Stage** — `git add -A src/`

---

### Task 9: Mahalliy stekda brauzer tekshiruvi

**Files:** — (kod o'zgarmaydi; topilgan xato tegishli taskning fayliga tuzatiladi va `Ruling:` bilan jurnalga yoziladi)

- [ ] **Step 1: Mahalliy stekni ko'tarish**

`lsof -nP -iTCP:54321 -iTCP:54322 -iTCP:54323 -sTCP:LISTEN` — band bo'lsa, **foydalanuvchidan so'rang** (2-bosqichda heva'ni to'xtatishga ruxsat bergan, lekin ruxsat har safar alohida). Keyin `bun run supabase:start`. Mahalliy baza toza reset'dan keyin 042 da yiqilsa, 2-bosqichdagidek 042 ni oddiy `psql -f` bilan qo'llab, `schema_migrations` ga yozing va `supabase migration up --local` qiling. Tekshiring: `select to_regclass('public.event_tariffs'), (select max(version) from supabase_migrations.schema_migrations)` → `event_tariffs|051`.

- [ ] **Step 2: Test foydalanuvchilar va ma'lumot**

GoTrue admin API orqali ikkita foydalanuvchi yarating (parollar scratchpad faylida, chatda emas):
- `test-admin@fy.local` — `role='admin'`, `department='sotuv'`;
- `test-viewer@fy.local` — `role='xodim'`, `user_permissions`: `tadbirlar-moliya` bo'yicha `can_view=true, can_edit=false`, `tadbirlar` bo'yicha `can_view=true`.

Tadbir va mijoz UI orqali yaratiladi (Boshqaruv): "Biznes Nonushta #10", tariflar Standart 17 mln va VIP 25 mln, mavjud mijoz "Mavjud Mijoz" (SQL bilan).

- [ ] **Step 3: Tekshiruvlar (admin sifatida, `bun run dev:local`, port 5001 band bo'lsa `--port 5011 --strictPort`)**

1. **Yangi mijozga to'lov.** `/tadbirlar/moliya` → "To'lov qo'shish" → yangi mijoz (ism + telefon) → tadbir → VIP (25 mln qo'yiladi, 23 mln'ga tushiriladi) → sotuvchi → summa 10 mln → keyingi to'lov sanasi → Saqlash. Natija: To'lovlar ro'yxatida qator, KPI Kirim = 10 mln, Qolgan qarz = 13 mln. Qarzdorlarda qator (kelishuv 23 mln, qoldiq 13 mln). Mijoz `/mijozlar`da, Boshqaruv ishtirokchilar jadvalida (VIP, sotuvchi) ko'rinadi.
2. **Qarzdan ortiq summa.** Shu mijozga 20 mln kiritilsa, qizil xabar chiqadi va Saqlash tugmasi o'chiq bo'ladi.
3. **Qarzdorlardan "To'lov".** Mijoz va tadbir oldindan tanlangan, "Qarz 13 mln" ko'rinadi. 13 mln to'lansa, qator Qarzdorlar ro'yxatidan chiqib, "To'liq to'laganlar"ga o'tadi.
4. **Bekor qilish.** 13 mln'lik to'lov sababi bilan bekor qilinadi: qator chizilgan, "Bekor qilingan" belgisi bor, Kirim kamayadi, qarz qaytadi. Sababsiz bekor qilib bo'lmaydi.
5. **Qaytarish.** 10 mln'lik to'lovdan 2 mln qaytariladi: "−2,000,000", "Qaytarish · Naqd". Kirim 8 mln bo'ladi.
6. **Filtrlar.** Usul = Karta, Sotuvchi = Belgilanmagan, Davr = O'tgan oy tanlanadi. Ro'yxat va KPI o'zgaradi, URL'da parametrlar bor, sahifa yangilanganda filtrlar saqlanadi. "Filtrlarni tozalash" hammasini tozalaydi.
7. **Qarzdorlarda tahrirlash.** Kelishuv summasini o'zgartirish (chegirma) qoldiqni yangilaydi. O'tgan sana qo'yilsa, qator qizil bo'ladi va "Muddati o'tgan" KPI o'sadi. Sotuvchini almashtirish ishlaydi. Keshbek: tadbirga keshbek % bo'lsa, balans paydo bo'ladi va "Keshbek" tugmasi bilan sarflanadi.
8. **Boshqaruv.** To'lovi bor ishtirokchining axlat qutisi o'chiq. Tadbirni o'chirish alert beradi.
9. **Ko'ruvchi (`test-viewer`).** Moliya ochiladi, ro'yxat va KPI ko'rinadi. "To'lov qo'shish", "Bekor qilish", "Qaytarish", inline tahrirlar va "To'lov" tugmalari yo'q.
10. **Konsol.** `read_console_messages` bo'yicha kutilmagan xato yo'q (faqat ataylab chaqirilgan 4xx).

- [ ] **Step 4: Tozalash** — dev server va `bun run supabase:stop`; boshqa loyiha to'xtatilgan bo'lsa, uni qayta yoqing; viewport'ni tiklang; vaqtinchalik `.claude/launch.json` ni o'chiring.

---

### Task 10: CLAUDE.md, yakuniy build, commit

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: CLAUDE.md**

- §2 va §3: `001`–`050` → `001`–`051`.
- §7 "Payments are the source of truth…" punktini quyidagiga almashtiring:

```markdown
- **Payments are the source of truth for event money** (migrations `035`, `051`): the `payments` table holds each installment; `event_participants.paid` is a DERIVED total kept in sync by the `sync_participant_paid` trigger (`paid = SUM(non-voided payments.amount) + cashback_used`). **Money moves only through RPCs** (`051`): `record_payment` (finds or enrols the client — new client by name + phone — then inserts; refuses amounts above the debt), `void_payment` (reason required; rows are never deleted), `refund_payment` (a negative `kind='refund'` row, capped by cash paid). `payments` has no INSERT/UPDATE/DELETE policy and is readable only with `tadbirlar-moliya` view permission; writing money needs its `can_edit` (`can_edit_finance()`). A trigger also refuses changing `price` / `next_due_date` without that right, and refuses deleting a participant (or event) that still has live payments. Every payment/void/refund updates `paid`, which fires `auto_award_cashback` (award or clawback). Debt shown anywhere = `price - paid`.
```

- §7 "Events UI" punktidagi **Moliya** va **Finance KPIs** qatorlarini quyidagiga almashtiring:

```markdown
  - **Moliya** (`/tadbirlar/moliya`, module `tadbirlar-moliya`, `components/pages/EventsMoliya.tsx` + `components/moliya/`): ONE global page, no event tabs — the event is a filter. Filters (period in Tashkent days via `lib/period.ts`, event, seller incl. "Belgilanmagan", method) live in the URL (`useFinanceFilters`). KPI cards, then tabs **To'lovlar** (payments log, void/refund) and **Qarzdorlar** (status: debt/overdue/paid/all; inline price, seller, next due date, cashback %, cashback spend, "To'lov"). "To'lov qo'shish" (`RecordPaymentModal`) covers existing and brand-new clients. Actions render only with `canEdit("tadbirlar-moliya")`.
  - **Finance numbers come from the DB, never summed in the browser:** `finance_summary()` (KPIs) and `finance_debtors()` (the Qarzdorlar list — PostgREST can't compare `price > paid`), both `SECURITY INVOKER` + a `has_permission(…,'tadbirlar-moliya')` guard. Dates: payments filter on `paid_at`, debt on enrolment (`created_at`), both as Asia/Tashkent days. Every Moliya query key starts with `FINANCE_KEY` (`hooks/useEvents.ts`); money mutations go through `hooks/useFinance.ts`, which invalidates it plus participants/clients/cashback. `event_finance_totals()` (047) is unused and dropped in `052`.
```

- §7 dagi "Boshqaruv … share the selected-event tab via `useEventTab`…" jumlasini `Boshqaruv keeps the event tabs (`EventTabs` + `useEventTab`); Moliya no longer uses them.` ga moslang.

- [ ] **Step 2: Yakuniy tekshiruv**

Run: `bun run build && bun run lint && bun scripts/checks/period.check.ts`
Expected: build 0; lint baseline yoki kamroq; `period.check: ok`.

- [ ] **Step 3: Commit — foydalanuvchi tasdig'i bilan**

`git diff --cached --stat` ni ko'rsatib, tasdiq so'rang. Keyin:

```bash
git add CLAUDE.md docs/superpowers/plans/2026-09-27-bosqich-3-moliya.md
git commit -m "feat(moliya): global finance page, payments via RPC, void/refund, debtors, filters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Deploy (bu rejaga kirmaydi, alohida va foydalanuvchi tasdig'i bilan):** production'da hali 050 ham yo'q. Tartib: backup → 050 → 051 → `schema_migrations` → `docker restart supabase-rest-1` → **darhol** `main` ga push (Coolify). 051 va yangi frontend orasida eski saytda to'lov kiritish ishlamaydi. 049 esa mobil build tarqalgach qo'llanadi.
