# Bosqich 4 — Xarajatlar va tadbir foydasi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Moliyaga chiqim tomonini qo'shish:
- xarajatlarni kiritish va bekor qilish (tadbirga bog'liq yoki umumiy);
- "Chiqim" va "Sof cashflow" KPI'lari;
- **Xarajatlar** tabi;
- **Tadbirlar** tabi — har tadbir bo'yicha kelishuv, yig'ilgan, qarz, xarajat, foyda va reja bajarilishi.

**Architecture:**
- **Migratsiya `054`.** `expenses` jadvali; o'qish faqat Moliya ruxsati bilan, yozish faqat RPC orqali (`add_expense`, `void_expense`, ikkalasi `can_edit_finance`). `finance_summary` ga `expense` va `net` qo'shiladi. Yangi `event_profit` RPC (`SECURITY INVOKER`). Eski `event_finance_totals()` o'chiriladi.
- **Frontend.** Yangi so'rovlar `queries/finance.ts` va `hooks/useFinance.ts` ga, `FINANCE_KEY` prefiksi ostida qo'shiladi. Ikki yangi tab (`ExpensesTab`, `EventProfitTab`) va xarajat oynalari (`ExpenseModals`) `components/moliya/` ichida.

**Tech Stack:** React 19, TanStack Query 5, TypeScript strict, Supabase Postgres (SQL/plpgsql), bun.

**Spec:** `docs/superpowers/specs/2026-09-27-tadbirlar-moliya-design.md` (§5.3, §6 — Xarajatlar va Tadbirlar tablari, KPI Chiqim / Sof cashflow)

## Global Constraints

- bun; TypeScript strict, `any` yo'q; `verbatimModuleSyntax` (`import type`); `erasableSyntaxOnly`.
- Eski migratsiyalar o'zgartirilmaydi — faqat yangi `054_expenses.sql`.
- Yangi `SECURITY DEFINER` funksiyalarda `SET search_path = public, pg_temp`. Har RPC'da `REVOKE … FROM PUBLIC, anon; GRANT … TO authenticated, service_role`.
- Pul yozish huquqi = `can_edit_finance(auth.uid())`, o'qish = `has_permission(auth.uid(),'tadbirlar-moliya')`. UI'da amal tugmalari faqat `canEdit("tadbirlar-moliya")` bo'lsa ko'rinadi.
- Summalar bazada hisoblanadi, brauzerda qo'shilmaydi. Istisno: ikki server summasining nisbati (foiz).
- Sana filtri Toshkent kalendar kuni bo'yicha: to'lovlar `paid_at`, qarz/kelishuv `created_at`, xarajat `spent_at` (`date`).
- UI: Broom Plexus tokenlari (`bg-surface`, `text-ink`, `border-line`, `rounded-control`…), hex va soya yo'q, max weight 600, `tbl` jadval uslubi, 20 qatorli `Pager`, `@phosphor-icons/react` (16px regular). Matnlar o'zbekcha.
- **Commit faqat foydalanuvchi tasdig'i bilan** — tasklar `git add` bilan tugaydi, commit Task 6 da.
- SQL testlar faqat vaqtinchalik Docker stendda (CLAUDE.md §5). UI faqat mahalliy Supabase'da.

## Spec'dan og'ishlar (rejani ko'rib chiqishda tasdiqlanadi)

1. **Migratsiya raqami `054`**, spec'da `052` edi (raqamlar AmoCRM merge'dan keyin siljigan).
2. **Tadbirlar tabida davr pul sanasiga qo'llanadi, tadbir sanasiga emas.** To'lovlar `paid_at`, xarajatlar `spent_at`, kelishuv va qarz `created_at` bo'yicha filtrlanadi, xuddi KPI'lardagidek. Shunda jadvaldagi foydalar yig'indisi "Sof cashflow" KPI'siga teng bo'ladi. "Butun davr"da esa bu oddiy "har tadbir qancha foyda qildi" jadvali.
3. **Foyda = yig'ilgan naqd pul − xarajat** (kassa usuli). Keshbek pul emas, shuning uchun kirmaydi. Qarz va kelishuv alohida ustunda ko'rinadi.
4. **Tadbirga bog'lanmagan xarajatlar Tadbirlar tabida "Umumiy xarajatlar" qatori bo'lib chiqadi.** Tadbir filtri tanlansa, bu qator chiqmaydi.
5. **Sotuvchi yoki usul filtri tanlanganda "Chiqim" va "Sof cashflow" o'rnida "—" chiqadi.** Xarajatda sotuvchi ham, to'lov usuli ham yo'q. Barcha xarajatni bitta sotuvchining kirimidan ayirish noto'g'ri raqam beradi. Xarajatlar va Tadbirlar tablari bu ikki filtrni e'tiborsiz qoldiradi va buni bir qator izoh bilan aytadi.
6. **"Reja" ustuni** — `yig'ilgan ÷ events.total_value`. 3-bosqichda vaqtincha olib tashlangan "Qiymat bajarilishi" shu ko'rinishda qaytadi.
7. **Xarajat tahrirlanmaydi**, faqat bekor qilinadi (sabab majburiy) va qaytadan kiritiladi. Bu to'lovlardagi qoida bilan bir xil.
8. **KPI'lar ikki qator:** 1-qator cashflow (Kirim · Chiqim · Sof cashflow), 2-qator qarz (Qolgan qarz · Muddati o'tgan · Yig'ish · Keshbek qoldig'i).

## Review Focus

- **Voided xarajat hisobga kirmasligi kerak** — KPI'da ham, Tadbirlar tabida ham (Task 1 testi D, E, F).
- **Tadbir o'chirilsa, xarajati yo'qolmaydi** — "Umumiy"ga o'tadi (`ON DELETE SET NULL`), Chiqim o'zgarmaydi (Task 1 testi H).
- **Foydalar yig'indisi = Sof cashflow** — filtrsiz va davr filtri bilan (Task 1 testi F).
- **Faqat ko'ruvchi xarajat kirita olmaydi**, huquqsiz hodim xarajatlarni umuman ko'rmaydi (Task 1 testi B, C; UI — Task 5 Step 3.6).
- **Sotuvchi/usul filtrida Chiqim noto'g'ri raqam ko'rsatmasligi kerak** — "—" chiqadi (Task 3; Task 5 Step 3.4).

---

### Task 1: Migratsiya 054 — `expenses`, RPC'lar, KPI, `event_profit`

**Files:**
- Create: `supabase/migrations/054_expenses.sql`
- Test: `supabase/tests/054_expenses_test.sql`

**Interfaces:**
- Consumes: `can_edit_finance(uuid)` (053), `has_permission(uuid,text)` (019), `record_payment(...)` (053, faqat test fixturalarida).
- Produces:
  - jadval `public.expenses(id, event_id, category, amount, spent_at, note, recorded_by, voided_at, voided_by, void_reason, created_at)`;
  - `add_expense(p_category text, p_amount numeric, p_spent_at date, p_event_id uuid DEFAULT NULL, p_note text DEFAULT NULL) RETURNS uuid`;
  - `void_expense(p_expense_id uuid, p_reason text) RETURNS void`;
  - `finance_summary(p_from, p_to, p_event_id, p_seller_id, p_no_seller, p_method)` → `income, expense, net, debt, overdue_debt, agreed, collected, cashback_balance`;
  - `event_profit(p_from date, p_to date, p_event_id uuid) RETURNS TABLE(event_id uuid, event_name text, event_date timestamptz, total_value numeric, agreed numeric, collected numeric, debt numeric, expense numeric, profit numeric)`.
  - Xato matnlari: `forbidden: finance_only`, `invalid_amount`, `reason_required`, `expense_not_found`, `already_voided`.

- [ ] **Step 1: Test stendini tayyorlash**

CLAUDE.md §5 "Tests" dagi retsept: `fy-test` konteyneri, `auth` stub, **001–053** migratsiyalarni qayta qo'llash (storage migratsiyalari va 042 yiqilishi kutiladi).

- [ ] **Step 2: Yiqiladigan testni yozish**

`supabase/tests/054_expenses_test.sql`:

```sql
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
```

- [ ] **Step 3: Testni migratsiyasiz ishga tushirish**

Run: `docker cp supabase/tests/054_expenses_test.sql fy-test:/tmp/t.sql && docker exec fy-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql`
Expected: FAIL — `relation "public.expenses" does not exist` (GRANT qatorida).

Keyin stendni qayta yarating (fixturalar yarim yozilgan bo'ladi): `docker rm -f fy-test` va Step 1.

- [ ] **Step 4: Migratsiyani yozish**

`supabase/migrations/054_expenses.sql`:

```sql
-- 054: Moliya — xarajatlar (chiqim), Chiqim / Sof cashflow KPI, har tadbir foydasi.
-- Expenses are event-bound or general (event_id NULL). Money rules match payments (053):
-- readable only with the Moliya module, written only through SECURITY DEFINER RPCs that
-- require can_edit_finance(), never deleted — voided with a reason.
-- Also drops event_finance_totals() (047): nothing calls it since the stage-3 frontend.
BEGIN;

CREATE TABLE public.expenses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid REFERENCES public.events(id) ON DELETE SET NULL,
  category    text NOT NULL
              CHECK (category IN ('zal','spiker','kofe_brek','reklama','maosh','ofis','boshqa')),
  amount      numeric(12,2) NOT NULL CHECK (amount > 0),
  spent_at    date NOT NULL,
  note        text,
  recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  voided_at   timestamptz,
  voided_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  void_reason text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expenses_void_has_reason CHECK ((voided_at IS NULL) = (void_reason IS NULL))
);
CREATE INDEX expenses_spent_at_idx ON public.expenses (spent_at DESC, created_at DESC);
CREATE INDEX expenses_event_id_idx ON public.expenses (event_id);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses select finance" ON public.expenses
  FOR SELECT USING (public.has_permission(auth.uid(), 'tadbirlar-moliya'));
-- No INSERT/UPDATE/DELETE policy: add_expense / void_expense only.

-- ─── add_expense ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_expense(
  p_category text,
  p_amount   numeric,
  p_spent_at date,
  p_event_id uuid DEFAULT NULL,
  p_note     text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.can_edit_finance(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: finance_only';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  INSERT INTO public.expenses (event_id, category, amount, spent_at, note, recorded_by)
  VALUES (p_event_id, p_category, p_amount, p_spent_at, NULLIF(btrim(p_note), ''), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.add_expense(text, numeric, date, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.add_expense(text, numeric, date, uuid, text) TO authenticated, service_role;

-- ─── void_expense ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.void_expense(p_expense_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_voided timestamptz;
BEGIN
  IF NOT public.can_edit_finance(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: finance_only';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT voided_at INTO v_voided FROM public.expenses WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense_not_found';
  END IF;
  IF v_voided IS NOT NULL THEN
    RAISE EXCEPTION 'already_voided';
  END IF;

  UPDATE public.expenses
  SET voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
  WHERE id = p_expense_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.void_expense(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.void_expense(uuid, text) TO authenticated, service_role;

-- ─── finance_summary: + expense, net ────────────────────────────────────────
-- The return type changes, so CREATE OR REPLACE can't do it: drop and recreate
-- in this transaction. Expenses follow the period (spent_at) and event filters;
-- they have no seller or method, so those two filters don't touch them (the UI
-- shows "—" for Chiqim / Sof cashflow while either is set).
DROP FUNCTION public.finance_summary(date, date, uuid, uuid, boolean, text);
CREATE FUNCTION public.finance_summary(
  p_from      date    DEFAULT NULL,
  p_to        date    DEFAULT NULL,
  p_event_id  uuid    DEFAULT NULL,
  p_seller_id uuid    DEFAULT NULL,
  p_no_seller boolean DEFAULT false,
  p_method    text    DEFAULT NULL
)
RETURNS TABLE (
  income           numeric,
  expense          numeric,
  net              numeric,
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
  ),
  inc AS (
    SELECT COALESCE(SUM(p.amount), 0) AS v
    FROM public.payments p JOIN parts ON parts.id = p.participant_id
    WHERE p.voided_at IS NULL
      AND (p_method IS NULL OR p.method = p_method)
      AND (p_from IS NULL OR (p.paid_at AT TIME ZONE 'Asia/Tashkent')::date >= p_from)
      AND (p_to   IS NULL OR (p.paid_at AT TIME ZONE 'Asia/Tashkent')::date <= p_to)
  ),
  exp AS (
    SELECT COALESCE(SUM(x.amount), 0) AS v
    FROM public.expenses x
    WHERE public.has_permission(auth.uid(), 'tadbirlar-moliya')
      AND x.voided_at IS NULL
      AND (p_event_id IS NULL OR x.event_id = p_event_id)
      AND (p_from IS NULL OR x.spent_at >= p_from)
      AND (p_to   IS NULL OR x.spent_at <= p_to)
  )
  SELECT
    inc.v,
    exp.v,
    inc.v - exp.v,
    (SELECT COALESCE(SUM(GREATEST(price - paid, 0)), 0) FROM dated),
    (SELECT COALESCE(SUM(GREATEST(price - paid, 0)), 0) FROM dated
     WHERE next_due_date < (now() AT TIME ZONE 'Asia/Tashkent')::date),
    (SELECT COALESCE(SUM(price), 0) FROM dated),
    (SELECT COALESCE(SUM(paid), 0) FROM dated),
    (SELECT COALESCE(SUM(cashback_balance), 0) FROM public.clients
     WHERE public.has_permission(auth.uid(), 'tadbirlar-moliya'))
  FROM inc, exp;
$$;
REVOKE EXECUTE ON FUNCTION public.finance_summary(date, date, uuid, uuid, boolean, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.finance_summary(date, date, uuid, uuid, boolean, text) TO authenticated, service_role;

-- ─── event_profit (Tadbirlar tab) ───────────────────────────────────────────
-- One row per event with any money in the period, plus one event_id NULL row for
-- general expenses. Dates filter the same columns as finance_summary, so with the
-- same period/event the rows' SUM(profit) equals finance_summary.net.
-- Profit is cash: collected (payments − refunds, no cashback) − expenses.
CREATE OR REPLACE FUNCTION public.event_profit(
  p_from     date DEFAULT NULL,
  p_to       date DEFAULT NULL,
  p_event_id uuid DEFAULT NULL
)
RETURNS TABLE (
  event_id    uuid,
  event_name  text,
  event_date  timestamptz,
  total_value numeric,
  agreed      numeric,
  collected   numeric,
  debt        numeric,
  expense     numeric,
  profit      numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH dated AS (
    SELECT ep.event_id, SUM(ep.price) AS agreed, SUM(GREATEST(ep.price - ep.paid, 0)) AS debt
    FROM public.event_participants ep
    WHERE (p_from IS NULL OR (ep.created_at AT TIME ZONE 'Asia/Tashkent')::date >= p_from)
      AND (p_to   IS NULL OR (ep.created_at AT TIME ZONE 'Asia/Tashkent')::date <= p_to)
    GROUP BY ep.event_id
  ),
  cash AS (
    SELECT ep.event_id, SUM(p.amount) AS collected
    FROM public.payments p JOIN public.event_participants ep ON ep.id = p.participant_id
    WHERE p.voided_at IS NULL
      AND (p_from IS NULL OR (p.paid_at AT TIME ZONE 'Asia/Tashkent')::date >= p_from)
      AND (p_to   IS NULL OR (p.paid_at AT TIME ZONE 'Asia/Tashkent')::date <= p_to)
    GROUP BY ep.event_id
  ),
  spent AS (
    SELECT x.event_id, SUM(x.amount) AS expense
    FROM public.expenses x
    WHERE x.voided_at IS NULL
      AND (p_from IS NULL OR x.spent_at >= p_from)
      AND (p_to   IS NULL OR x.spent_at <= p_to)
    GROUP BY x.event_id
  ),
  ids AS (  -- UNION also collapses the NULL (general) key into one row
    SELECT event_id FROM dated UNION SELECT event_id FROM cash UNION SELECT event_id FROM spent
  )
  SELECT
    ids.event_id,
    e.name,
    e.date,
    COALESCE(e.total_value, 0),
    COALESCE(d.agreed, 0),
    COALESCE(c.collected, 0),
    COALESCE(d.debt, 0),
    COALESCE(s.expense, 0),
    COALESCE(c.collected, 0) - COALESCE(s.expense, 0)
  FROM ids
  LEFT JOIN public.events e ON e.id = ids.event_id
  LEFT JOIN dated d ON d.event_id IS NOT DISTINCT FROM ids.event_id
  LEFT JOIN cash  c ON c.event_id IS NOT DISTINCT FROM ids.event_id
  LEFT JOIN spent s ON s.event_id IS NOT DISTINCT FROM ids.event_id
  WHERE public.has_permission(auth.uid(), 'tadbirlar-moliya')
    AND (p_event_id IS NULL OR ids.event_id = p_event_id)
  ORDER BY ids.event_id IS NULL, e.date DESC NULLS LAST, e.name;
$$;
REVOKE EXECUTE ON FUNCTION public.event_profit(date, date, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.event_profit(date, date, uuid) TO authenticated, service_role;

-- ─── event_finance_totals (047) — replaced by finance_summary in 053 ────────
DROP FUNCTION IF EXISTS public.event_finance_totals();

COMMIT;
```

- [ ] **Step 5: Migratsiyani qo'llab, testni ishga tushirish**

```bash
docker cp supabase/migrations/054_expenses.sql fy-test:/tmp/m.sql
docker exec fy-test psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 -f /tmp/m.sql
docker cp supabase/tests/054_expenses_test.sql fy-test:/tmp/t.sql
docker exec fy-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql
```
Expected: `A ok` … `H ok`, oxirida `054: hamma testlar o'tdi ✓`.

- [ ] **Step 6: Eski testlar buzilmaganini tekshirish**

Yangi stendda 001–054 qo'llanadi, keyin `053_finance_core_test.sql` ishga tushiriladi.
Expected: `053: hamma testlar o'tdi ✓`. 053 testi `finance_summary` ustunlarini nomi bo'yicha o'qiydi, shuning uchun yangi ustunlar unga ta'sir qilmaydi. Agar yiqilsa, `Ruling:` yozib, sababini tuzating.

- [ ] **Step 7: Stage**

```bash
git add supabase/migrations/054_expenses.sql supabase/tests/054_expenses_test.sql
```

---

### Task 2: Query qatlami va hook'lar

**Files:**
- Modify: `src/lib/supabase/queries/finance.ts`
- Modify: `src/hooks/useFinance.ts`

**Interfaces:**
- Consumes: Task 1 RPC'lari va `expenses` jadvali.
- Produces:
  - `finance.ts`: `FinanceSummary` + `expense`, `net`; `type ExpenseCategory`; `EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory,string>`; `interface ExpenseRow`; `listExpenses(f, page): Promise<ExpenseRow[]>`; `countExpenses(f): Promise<number>`; `interface AddExpenseInput { category; amount; spentAt; eventId; note }`; `addExpense(i): Promise<string>`; `voidExpense(id, reason): Promise<void>`; `interface EventProfitRow`; `listEventProfit(f): Promise<EventProfitRow[]>`.
  - `useFinance.ts`: `useExpensesList(f, page)`, `useExpensesCount(f)`, `useEventProfit(f)`, `useAddExpense()`, `useVoidExpense()` (mutate `{ id, reason }`).

- [ ] **Step 1: `finance.ts` — xato matnlari**

`FINANCE_ERRORS` ichida `already_voided` qatorini almashtiring va yangisini qo'shing:

```ts
  already_voided: "Bu yozuv allaqachon bekor qilingan",
  expense_not_found: "Xarajat topilmadi",
```

- [ ] **Step 2: `finance.ts` — KPI turi**

`FinanceSummary` va `getFinanceSummary` ni almashtiring:

```ts
export interface FinanceSummary {
  income: number            // active payments − refunds (cashback excluded)
  expense: number           // active expenses; ignores seller / method filters
  net: number               // income − expense
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
    expense: Number(row?.expense ?? 0),
    net: Number(row?.net ?? 0),
    debt: Number(row?.debt ?? 0),
    overdue_debt: Number(row?.overdue_debt ?? 0),
    agreed: Number(row?.agreed ?? 0),
    collected: Number(row?.collected ?? 0),
    cashback_balance: Number(row?.cashback_balance ?? 0),
  }
}
```

- [ ] **Step 3: `finance.ts` — xarajatlar va tadbir foydasi**

Fayl oxiriga qo'shing:

```ts
// ─── Expenses (RPC writes only — expenses has no write policy) ───────────────

export type ExpenseCategory = "zal" | "spiker" | "kofe_brek" | "reklama" | "maosh" | "ofis" | "boshqa"

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  zal: "Zal",
  spiker: "Spiker",
  kofe_brek: "Kofe-brek",
  reklama: "Reklama",
  maosh: "Maosh",
  ofis: "Ofis",
  boshqa: "Boshqa",
}

export interface ExpenseRow {
  id: string
  event_id: string | null         // null = general expense
  event_name: string | null
  category: ExpenseCategory
  amount: number
  spent_at: string                // YYYY-MM-DD
  note: string | null
  voided_at: string | null
  void_reason: string | null
  recorder_name: string | null
}

interface ExpenseJoin extends Omit<ExpenseRow, "amount" | "event_name" | "recorder_name"> {
  amount: number | string
  event: { name: string } | null
  recorder: { full_name: string } | null
}

// Expenses have no seller or payment method: only the period and event filters apply.
export async function listExpenses(f: FinanceFilters, page: number): Promise<ExpenseRow[]> {
  let q = db
    .from("expenses")
    .select("id, event_id, category, amount, spent_at, note, voided_at, void_reason, event:event_id(name), recorder:recorded_by(full_name)")
    .order("spent_at", { ascending: false })
    .order("created_at", { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
  if (f.from) q = q.gte("spent_at", f.from)
  if (f.to) q = q.lte("spent_at", f.to)
  if (f.eventId) q = q.eq("event_id", f.eventId)

  const { data, error } = await q
  if (error) throw financeError(error)
  return ((data ?? []) as unknown as ExpenseJoin[]).map(({ event, recorder, ...r }) => ({
    ...r,
    amount: Number(r.amount),
    event_name: event?.name ?? null,
    recorder_name: recorder?.full_name ?? null,
  }))
}

export async function countExpenses(f: FinanceFilters): Promise<number> {
  let q = db.from("expenses").select("id", { count: "exact", head: true })
  if (f.from) q = q.gte("spent_at", f.from)
  if (f.to) q = q.lte("spent_at", f.to)
  if (f.eventId) q = q.eq("event_id", f.eventId)

  const { count, error } = await q
  if (error) throw financeError(error)
  return count ?? 0
}

export interface AddExpenseInput {
  category: ExpenseCategory
  amount: number
  spentAt: string                 // YYYY-MM-DD
  eventId: string | null
  note: string
}

export async function addExpense(i: AddExpenseInput): Promise<string> {
  const { data, error } = await db.rpc("add_expense", {
    p_category: i.category,
    p_amount: i.amount,
    p_spent_at: i.spentAt,
    p_event_id: i.eventId,
    p_note: i.note || null,
  })
  if (error) throw financeError(error)
  return data as string
}

export async function voidExpense(id: string, reason: string): Promise<void> {
  const { error } = await db.rpc("void_expense", { p_expense_id: id, p_reason: reason })
  if (error) throw financeError(error)
}

// ─── Per-event profit (Tadbirlar tab) ────────────────────────────────────────

export interface EventProfitRow {
  event_id: string | null         // null = general (no-event) expenses
  event_name: string | null
  event_date: string | null
  total_value: number             // plan (events.total_value); 0 = not set
  agreed: number
  collected: number               // cash: payments − refunds
  debt: number
  expense: number
  profit: number                  // collected − expense
}

export async function listEventProfit(f: FinanceFilters): Promise<EventProfitRow[]> {
  const { data, error } = await db.rpc("event_profit", { p_from: f.from, p_to: f.to, p_event_id: f.eventId })
  if (error) throw financeError(error)
  return ((data ?? []) as Array<EventProfitRow & Record<string, unknown>>).map((r) => ({
    ...r,
    total_value: Number(r.total_value),
    agreed: Number(r.agreed),
    collected: Number(r.collected),
    debt: Number(r.debt),
    expense: Number(r.expense),
    profit: Number(r.profit),
  }))
}
```

- [ ] **Step 4: `useFinance.ts` — hook'lar**

Importga qo'shing: `listExpenses, countExpenses, addExpense, voidExpense, listEventProfit, type ExpenseRow, type EventProfitRow`. `useDebtors` dan keyin:

```ts
export function useExpensesList(f: FinanceFilters, page: number) {
  return useQuery<ExpenseRow[]>({
    queryKey: [...FINANCE_KEY, "expenses", f, page],
    queryFn: () => listExpenses(f, page),
    placeholderData: (prev) => prev,
    refetchOnMount: true,
  })
}

export function useExpensesCount(f: FinanceFilters) {
  return useQuery<number>({
    queryKey: [...FINANCE_KEY, "expenses-count", f],
    queryFn: () => countExpenses(f),
    refetchOnMount: true,
  })
}

export function useEventProfit(f: FinanceFilters) {
  return useQuery<EventProfitRow[]>({
    queryKey: [...FINANCE_KEY, "event-profit", f],
    queryFn: () => listEventProfit(f),
    refetchOnMount: true,
  })
}
```

Fayl oxiriga:

```ts
export const useAddExpense = () => useMoneyMutation(addExpense)
export const useVoidExpense = () =>
  useMoneyMutation((v: { id: string; reason: string }) => voidExpense(v.id, v.reason))
```

(`invalidateMoney` xarajat uchun ishtirokchi/mijoz keshlarini ham yangilaydi. Bu ortiqcha, lekin zararsiz. Alohida funksiya yozilmaydi.)

- [ ] **Step 5: Tekshirish**

Run: `bun run build`
Expected: 0 xato.

- [ ] **Step 6: Stage** — `git add src/lib/supabase/queries/finance.ts src/hooks/useFinance.ts`

---

### Task 3: KPI kartalari — Chiqim va Sof cashflow

**Files:**
- Modify: `src/components/moliya/FinanceKpis.tsx`

**Interfaces:**
- Consumes: `FinanceSummary.expense`, `.net` (Task 2).

- [ ] **Step 1: `FinanceKpis` ni almashtirish**

Import: `import { TrendUp, TrendDown, Scales, Wallet, Warning, ChartPie, Gift } from "@phosphor-icons/react"`. `FinanceKpis` funksiyasi (`Kpi` o'zgarmaydi):

```tsx
export function FinanceKpis({ filters }: { filters: FinanceFilters }) {
  const { data: s, isLoading } = useFinanceSummary(filters)
  const rate = s && s.agreed > 0 ? Math.round((s.collected / s.agreed) * 100) : null
  // Expenses have no seller or method — under those filters Chiqim / Sof would mix
  // one seller's income with every expense, so show a dash instead of a wrong number.
  const noExpense = !!filters.seller || !!filters.method
  const expenseHint = noExpense ? "Sotuvchi/usul filtrida hisoblanmaydi" : undefined

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Kpi icon={<TrendUp size={16} />} label="Kirim" hint="To'lovlar − qaytarishlar" loading={isLoading} value={s ? formatMoney(s.income) : ""} />
        <Kpi icon={<TrendDown size={16} />} label="Chiqim" hint={expenseHint ?? "Xarajatlar"} loading={isLoading} value={noExpense ? "—" : s ? formatMoney(s.expense) : ""} />
        <Kpi
          icon={<Scales size={16} />}
          label="Sof cashflow"
          hint={expenseHint ?? "Kirim − chiqim"}
          loading={isLoading}
          value={noExpense ? "—" : s ? formatMoney(s.net) : ""}
          danger={!noExpense && (s?.net ?? 0) < 0}
        />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={<Wallet size={16} />} label="Qolgan qarz" loading={isLoading} value={s ? formatMoney(s.debt) : ""} danger={(s?.debt ?? 0) > 0} />
        <Kpi icon={<Warning size={16} />} label="Muddati o'tgan" loading={isLoading} value={s ? formatMoney(s.overdue_debt) : ""} danger={(s?.overdue_debt ?? 0) > 0} />
        <Kpi
          icon={<ChartPie size={16} />}
          label="Yig'ish"
          hint={s ? `${formatMoney(s.collected)} / ${formatMoney(s.agreed)}` : undefined}
          loading={isLoading}
          value={rate === null ? "—" : `${rate}%`}
        />
        <Kpi icon={<Gift size={16} />} label="Keshbek qoldig'i" hint="Barcha mijozlar, filtrsiz" loading={isLoading} value={s ? formatMoney(s.cashback_balance) : ""} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Tekshirish** — `bun run build` → 0 xato.

- [ ] **Step 3: Stage** — `git add src/components/moliya/FinanceKpis.tsx`

---

### Task 4: Xarajatlar tabi va oynalari

**Files:**
- Modify: `src/components/moliya/PaymentActionModals.tsx` (`ModalShell`, `INPUT`, `LABEL` export qilinadi)
- Modify: `src/components/moliya/PaymentsTab.tsx` (`RowAction` export qilinadi)
- Create: `src/components/moliya/ExpenseModals.tsx`
- Create: `src/components/moliya/ExpensesTab.tsx`

**Interfaces:**
- Consumes: `useExpensesList`, `useExpensesCount`, `useAddExpense`, `useVoidExpense`, `EXPENSE_CATEGORY_LABEL`, `ExpenseRow`, `ExpenseCategory` (Task 2); `useEvents()` (`hooks/useEvents`); `tashkentToday()` (`lib/period`).
- Produces: `export function ExpensesTab({ filters, canEdit }: { filters: FinanceFilters; canEdit: boolean })`.

- [ ] **Step 1: Mavjud bo'laklarni export qilish**

`PaymentActionModals.tsx`: `const INPUT` → `export const INPUT`, `const LABEL` → `export const LABEL`, `function ModalShell` → `export function ModalShell`.
`PaymentsTab.tsx`: `function RowAction` → `export function RowAction`.

- [ ] **Step 2: `ExpenseModals.tsx`**

```tsx
import { useId, useState } from "react"
import { useEvents } from "@/hooks/useEvents"
import { useAddExpense, useVoidExpense } from "@/hooks/useFinance"
import { EXPENSE_CATEGORY_LABEL, type ExpenseCategory, type ExpenseRow } from "@/lib/supabase/queries/finance"
import { ModalShell, INPUT, LABEL } from "@/components/moliya/PaymentActionModals"
import { tashkentToday } from "@/lib/period"
import { formatMoney, formatNumber } from "@/lib/format"

// Both modals are mounted only while open, so their state starts fresh.
export function AddExpenseModal({ defaultEventId, onClose }: { defaultEventId: string | null; onClose: () => void }) {
  const add = useAddExpense()
  const { data: events = [] } = useEvents()
  const categoryId = useId()
  const eventId = useId()
  const amountId = useId()
  const dateId = useId()
  const noteId = useId()
  const [category, setCategory] = useState<ExpenseCategory | "">("")
  const [event, setEvent] = useState(defaultEventId ?? "")
  const [amount, setAmount] = useState("")
  const [spentAt, setSpentAt] = useState(tashkentToday())
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const amountNum = amount ? Number(amount) : 0

  return (
    <ModalShell
      title="Xarajat qo'shish"
      error={error}
      submitLabel="Saqlash"
      canSubmit={category !== "" && amountNum > 0 && spentAt !== ""}
      pending={add.isPending}
      onClose={onClose}
      onSubmit={() =>
        category !== "" &&
        add.mutate(
          { category, amount: amountNum, spentAt, eventId: event || null, note: note.trim() },
          { onSuccess: onClose, onError: (e) => setError(e.message) },
        )
      }
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={categoryId} className={LABEL}>Kategoriya *</label>
        <select id={categoryId} value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory | "")} className={INPUT} autoFocus>
          <option value="">Tanlang</option>
          {(Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[]).map((c) => (
            <option key={c} value={c}>{EXPENSE_CATEGORY_LABEL[c]}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={eventId} className={LABEL}>Tadbir</label>
        <select id={eventId} value={event} onChange={(e) => setEvent(e.target.value)} className={INPUT}>
          <option value="">Umumiy (tadbirsiz)</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.name}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={amountId} className={LABEL}>Summa *</label>
        <input
          id={amountId}
          inputMode="numeric"
          value={amount ? formatNumber(Number(amount)) : ""}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
          placeholder="0"
          className={INPUT}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={dateId} className={LABEL}>Sana *</label>
        <input id={dateId} type="date" value={spentAt} max={tashkentToday()} onChange={(e) => setSpentAt(e.target.value)} className={INPUT} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={noteId} className={LABEL}>Izoh</label>
        <input id={noteId} value={note} onChange={(e) => setNote(e.target.value)} className={INPUT} placeholder="Masalan: zal ijarasi, 2-kun" />
      </div>
    </ModalShell>
  )
}

export function VoidExpenseModal({ expense, onClose }: { expense: ExpenseRow; onClose: () => void }) {
  const voidExp = useVoidExpense()
  const reasonId = useId()
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)

  return (
    <ModalShell
      title="Xarajatni bekor qilish"
      error={error}
      submitLabel="Bekor qilish"
      danger
      canSubmit={reason.trim().length > 0}
      pending={voidExp.isPending}
      onClose={onClose}
      onSubmit={() =>
        voidExp.mutate({ id: expense.id, reason: reason.trim() }, { onSuccess: onClose, onError: (e) => setError(e.message) })
      }
    >
      <p className="text-sm text-ink-muted">
        <span className="font-semibold text-ink">{EXPENSE_CATEGORY_LABEL[expense.category]}</span> · {formatMoney(expense.amount)}.
        Yozuv o'chirilmaydi — ro'yxatda chizilgan holda qoladi va hisobga kirmaydi.
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={reasonId} className={LABEL}>Sabab *</label>
        <textarea id={reasonId} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus className={`${INPUT} resize-none`} placeholder="Masalan: summa xato kiritilgan" />
      </div>
    </ModalShell>
  )
}
```

- [ ] **Step 3: `ExpensesTab.tsx`**

```tsx
import { useState } from "react"
import { Plus, Prohibit } from "@phosphor-icons/react"
import { useExpensesList, useExpensesCount } from "@/hooks/useFinance"
import { EXPENSE_CATEGORY_LABEL, type ExpenseRow, type FinanceFilters } from "@/lib/supabase/queries/finance"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { RowAction } from "@/components/moliya/PaymentsTab"
import { AddExpenseModal, VoidExpenseModal } from "@/components/moliya/ExpenseModals"
import { tbl } from "@/components/ui/table"
import { Pager, PAGE_SIZE } from "@/components/ui/Pager"
import { formatDate, formatMoney } from "@/lib/format"
import { ThinkingOrb } from "thinking-orbs"

export function ExpensesTab({ filters, canEdit }: { filters: FinanceFilters; canEdit: boolean }) {
  const [page, setPage] = useState(0)
  // Same page-reset-on-filter-change pattern as PaymentsTab.
  const filtersKey = JSON.stringify(filters)
  const [prevFiltersKey, setPrevFiltersKey] = useState(filtersKey)
  if (prevFiltersKey !== filtersKey) {
    setPrevFiltersKey(filtersKey)
    setPage(0)
  }

  const { data: rows = [], isLoading } = useExpensesList(filters, page)
  const { data: total = 0 } = useExpensesCount(filters)
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const [adding, setAdding] = useState(false)
  const [voiding, setVoiding] = useState<ExpenseRow | null>(null)
  const ignoredFilters = !!filters.seller || !!filters.method

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-ink-muted">
          {ignoredFilters && "Sotuvchi va usul filtrlari xarajatlarga taalluqli emas"}
        </span>
        {canEdit && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3 h-control-md rounded-control text-base font-medium text-ink bg-mute-soft hover:bg-mute-soft-hover transition-colors"
          >
            <Plus size={16} /> Xarajat qo'shish
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="py-10 flex items-center justify-center">
          <ThinkingOrb state="searching" size={20} theme="light" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-base text-ink-muted">Bu filtrlar bo'yicha xarajat yo'q</div>
      ) : (
        <>
          <div className={tbl.scroll}>
            <table className={tbl.table}>
              <thead>
                <tr>
                  <th className={tbl.th}>Sana</th>
                  <th className={tbl.th}>Kategoriya</th>
                  <th className={tbl.th}>Tadbir</th>
                  <th className={`${tbl.th} text-right`}>Summa</th>
                  <th className={tbl.th}>Izoh</th>
                  <th className={tbl.th}>Kiritgan</th>
                  {canEdit && <th className={`${tbl.th} text-right`}>Amal</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => {
                  const voided = !!x.voided_at
                  return (
                    <tr key={x.id} className={`${tbl.tr} ${voided ? "opacity-50" : ""}`}>
                      <td className={`${tbl.td} text-sm text-ink-muted whitespace-nowrap`}>{formatDate(x.spent_at)}</td>
                      <td className={`${tbl.td} whitespace-nowrap`}>
                        {voided ? (
                          <span title={x.void_reason ?? undefined}>
                            <StatusBadge label="Bekor qilingan" variant="warning" />
                          </span>
                        ) : (
                          <StatusBadge label={EXPENSE_CATEGORY_LABEL[x.category]} variant="neutral" />
                        )}
                      </td>
                      <td className={`${tbl.td} text-ink-muted whitespace-nowrap`}>{x.event_name ?? "Umumiy"}</td>
                      <td className={`${tbl.td} font-medium text-right tabular-nums whitespace-nowrap text-danger-text ${voided ? "line-through" : ""}`}>
                        −{formatMoney(x.amount)}
                      </td>
                      <td className={`${tbl.td} text-ink-muted max-w-[280px] truncate`} title={x.note ?? undefined}>{x.note ?? "—"}</td>
                      <td className={`${tbl.td} text-ink-muted whitespace-nowrap`}>{x.recorder_name ?? "—"}</td>
                      {canEdit && (
                        <td className={`${tbl.td} text-right whitespace-nowrap`}>
                          {!voided && <RowAction onClick={() => setVoiding(x)} label="Bekor qilish" icon={<Prohibit size={16} />} danger />}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} pageCount={pageCount} total={total} onPage={setPage} />
        </>
      )}

      {adding && <AddExpenseModal defaultEventId={filters.eventId} onClose={() => setAdding(false)} />}
      {voiding && <VoidExpenseModal expense={voiding} onClose={() => setVoiding(null)} />}
    </div>
  )
}
```

- [ ] **Step 4: Tekshirish** — `bun run build && bun run lint` → build 0 xato; lint'da yangi xato yo'q (bazaviy 3 ta muammo qoladi).

- [ ] **Step 5: Stage** — `git add src/components/moliya/`

---

### Task 5: Tadbirlar (foyda) tabi, sahifaga ulash, brauzer tekshiruvi

**Files:**
- Create: `src/components/moliya/EventProfitTab.tsx`
- Modify: `src/components/pages/EventsMoliya.tsx`

**Interfaces:**
- Consumes: `useEventProfit`, `EventProfitRow` (Task 2); `ExpensesTab` (Task 4); `usePaged`, `Pager` (`components/ui/Pager`).

- [ ] **Step 1: `EventProfitTab.tsx`**

```tsx
import { useEventProfit } from "@/hooks/useFinance"
import type { FinanceFilters } from "@/lib/supabase/queries/finance"
import { tbl } from "@/components/ui/table"
import { Pager, usePaged } from "@/components/ui/Pager"
import { formatDate, formatMoney } from "@/lib/format"
import { ThinkingOrb } from "thinking-orbs"

// Per-event breakdown of the KPIs: with the same period/event filter the
// profits add up to "Sof cashflow". The general-expenses row comes last.
export function EventProfitTab({ filters }: { filters: FinanceFilters }) {
  const { data: rows = [], isLoading } = useEventProfit(filters)
  const paged = usePaged(rows)
  const ignoredFilters = !!filters.seller || !!filters.method

  return (
    <div className="flex flex-col gap-3">
      {ignoredFilters && <span className="text-sm text-ink-muted">Sotuvchi va usul filtrlari bu jadvalga taalluqli emas</span>}
      {isLoading ? (
        <div className="py-10 flex items-center justify-center">
          <ThinkingOrb state="searching" size={20} theme="light" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-base text-ink-muted">Bu davrda pul harakati yo'q</div>
      ) : (
        <>
          <div className={tbl.scroll}>
            <table className={tbl.table}>
              <thead>
                <tr>
                  <th className={tbl.th}>Tadbir</th>
                  <th className={`${tbl.th} text-right`}>Kelishuv</th>
                  <th className={`${tbl.th} text-right`}>Yig'ildi</th>
                  <th className={`${tbl.th} text-right`}>Qarz</th>
                  <th className={`${tbl.th} text-right`}>Xarajat</th>
                  <th className={`${tbl.th} text-right`}>Foyda</th>
                  <th className={`${tbl.th} text-right`}>Reja</th>
                </tr>
              </thead>
              <tbody>
                {paged.pageItems.map((r) => (
                  <tr key={r.event_id ?? "general"} className={tbl.tr}>
                    <td className={`${tbl.td} whitespace-nowrap`}>
                      <div className="font-medium text-ink">{r.event_id ? r.event_name : "Umumiy xarajatlar"}</div>
                      <div className="text-xs text-ink-muted">{r.event_id ? formatDate(r.event_date) : "Tadbirga bog'lanmagan"}</div>
                    </td>
                    <td className={`${tbl.td} text-right tabular-nums whitespace-nowrap text-ink-muted`}>{r.event_id ? formatMoney(r.agreed) : "—"}</td>
                    <td className={`${tbl.td} text-right tabular-nums whitespace-nowrap`}>{r.event_id ? formatMoney(r.collected) : "—"}</td>
                    <td className={`${tbl.td} text-right tabular-nums whitespace-nowrap ${r.debt > 0 ? "text-danger-text" : "text-ink-muted"}`}>
                      {r.event_id ? formatMoney(r.debt) : "—"}
                    </td>
                    <td className={`${tbl.td} text-right tabular-nums whitespace-nowrap text-ink-muted`}>{formatMoney(r.expense)}</td>
                    <td className={`${tbl.td} text-right tabular-nums whitespace-nowrap font-semibold ${r.profit < 0 ? "text-danger-text" : "text-success-text"}`}>
                      {formatMoney(r.profit)}
                    </td>
                    <td className={`${tbl.td} text-right tabular-nums whitespace-nowrap text-ink-muted`} title={r.total_value > 0 ? `Reja: ${formatMoney(r.total_value)}` : undefined}>
                      {r.total_value > 0 ? `${Math.round((r.collected / r.total_value) * 100)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={paged.page} pageCount={paged.pageCount} total={rows.length} onPage={paged.setPage} />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: `EventsMoliya.tsx` ga ulash**

Importlar: `import { ExpensesTab } from "@/components/moliya/ExpensesTab"`, `import { EventProfitTab } from "@/components/moliya/EventProfitTab"`.

`TABS` va `tab`:

```tsx
const TABS = [
  { id: "payments", label: "To'lovlar" },
  { id: "debtors", label: "Qarzdorlar" },
  { id: "expenses", label: "Xarajatlar" },
  { id: "events", label: "Tadbirlar" },
] as const
type TabId = (typeof TABS)[number]["id"]
```

```tsx
  const tab: TabId = TABS.find((t) => t.id === get("tab"))?.id ?? "payments"
```

Tab tanlangan qism (`{tab === "payments" ? … : …}`) ni almashtiring:

```tsx
      {tab === "payments" && <PaymentsTab filters={filters} canEdit={editable} />}
      {tab === "debtors" && (
        <DebtorsTab
          filters={filters}
          canEdit={editable}
          onPay={(r) =>
            r.client_id &&
            setRecording({ client: { id: r.client_id, full_name: r.full_name, phone: r.phone, image: null }, eventId: r.event_id })
          }
        />
      )}
      {tab === "expenses" && <ExpensesTab filters={filters} canEdit={editable} />}
      {tab === "events" && <EventProfitTab filters={filters} />}
```

Run: `bun run build && bun run lint` → build 0 xato; lint'da yangi xato yo'q.

- [ ] **Step 3: Mahalliy stekda brauzer tekshiruvi**

**Tayyorgarlik.** `lsof -nP -iTCP:54321 -iTCP:54322 -iTCP:54323 -sTCP:LISTEN` bilan portlarni tekshiring. Ular band bo'lsa (heva stek), uni to'xtatish uchun **foydalanuvchidan so'rang** — ruxsat har safar alohida olinadi. Keyin:
1. `bun run supabase:start` va `supabase migration up --local` → `054` qo'llanadi.
2. Mahalliy baza bo'sh bo'lsa: 3-bosqichdagi `test-admin@fy.local` (admin, `department='sotuv'`) va `test-viewer@fy.local` (`tadbirlar-moliya` bo'yicha faqat ko'rish) foydalanuvchilarini yarating. Parollar scratchpad faylida saqlanadi, chatga yozilmaydi.
3. Kamida 2 tadbir, tariflar va 1–2 to'lov bo'lsin.
4. Main'dagi `.claude/launch.json` prod'ga ulanadi. Uning o'rniga vaqtincha mahalliy konfiguratsiya qo'shing (`doppler … -c dev`, port 5011). Tekshiruvdan keyin `git restore .claude/launch.json`.

**Tekshiruvlar** (admin sifatida, `/tadbirlar/moliya`):
1. **Xarajat qo'shish.** Xarajatlar tabi → "Xarajat qo'shish" → Zal, tadbir A, 1,000,000, bugungi sana → Saqlash. Ro'yxatda "−1,000,000 UZS" chiqadi. KPI'larda Chiqim 1 mln bo'ladi va Sof cashflow = Kirim − 1 mln.
2. **Umumiy xarajat.** "Umumiy (tadbirsiz)" Ofis 500,000 kiritiladi. Tadbirlar tabida "Umumiy xarajatlar" qatori chiqadi va uning foydasi −500,000.
3. **Bekor qilish.** Zal xarajati sababsiz bekor qilinmaydi — tugma o'chiq. Sabab bilan bekor qilinganda qator chizilgan holda "Bekor qilingan" bo'ladi, Chiqim 1 mln'ga kamayadi.
4. **Filtrlar.** Tadbir = A tanlanganda Umumiy qator va umumiy xarajat yo'qoladi. Sotuvchi yoki Usul filtri tanlanganda Chiqim va Sof cashflow "—" bo'ladi, izoh chiqadi, Xarajatlar va Tadbirlar tablarida izoh qatori ko'rinadi. Davr = "O'tgan oy" bo'lsa, bugungi xarajatlar yo'qoladi.
5. **Tadbirlar tabi.** "Butun davr"da har tadbir uchun kelishuv, yig'ilgan, qarz, xarajat va foyda chiqadi. Foydalar yig'indisi Sof cashflow KPI'siga teng — qo'lda solishtiring. `total_value` > 0 bo'lgan tadbirda Reja % ko'rinadi.
6. **Ko'ruvchi (`test-viewer`).** Xarajatlar va Tadbirlar ko'rinadi, lekin "Xarajat qo'shish" va "Bekor qilish" tugmalari yo'q.
7. **Dark rejim va tor ekran (1280px).** Jadvallar sig'adi, KPI ikki qator bo'lib turadi.
8. **Konsol.** `read_console_messages` bo'yicha kutilmagan xato yo'q.

Topilgan xato tegishli task faylida tuzatiladi va jurnalga `Ruling:` bilan yoziladi.

**Tozalash:** dev server va `bun run supabase:stop`. Boshqa loyiha to'xtatilgan bo'lsa, uni qayta yoqing. `git restore .claude/launch.json`, viewport tiklanadi.

- [ ] **Step 4: Stage** — `git add src/components/moliya/EventProfitTab.tsx src/components/pages/EventsMoliya.tsx`

---

### Task 6: CLAUDE.md, yakuniy build, commit

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: CLAUDE.md**

- §2 va §3: `001`–`053` → `001`–`054`.
- §7 **Moliya** punktida `tabs **To'lovlar** … and **Qarzdorlar** (…)` jumlasidan keyin shuni qo'shing:

```markdown
 Plus **Xarajatlar** (expenses log; add / void with reason — `ExpensesTab`, `ExpenseModals`) and **Tadbirlar** (per-event agreed / collected / debt / expense / profit and plan % vs `events.total_value` — `EventProfitTab`).
```

- §7 **Finance numbers** punktida `finance_summary() (KPIs)` ni `finance_summary() (KPIs, incl. expense / net since 054)` ga, `and finance_debtors()` ni `, finance_debtors() … and event_profit() (054; its rows' profit sums to finance_summary.net for the same period/event)` ga almashtiring. `event_finance_totals() (047) is unused and dropped in 054.` jumlasini `event_finance_totals() (047) was dropped in 054.` ga almashtiring.
- §7 ga yangi punkt (Payments punktidan keyin):

```markdown
- **Expenses** (migration `054`): `expenses` rows are event-bound or general (`event_id` NULL; deleting an event turns its expenses general — `ON DELETE SET NULL`). Fixed categories (`zal, spiker, kofe_brek, reklama, maosh, ofis, boshqa`). Same money rules as payments: readable only with `tadbirlar-moliya`, no write policy — `add_expense` / `void_expense` (reason required) need `can_edit_finance()`; rows are never deleted or edited. Expenses have no seller or payment method, so under a seller/method filter the UI shows "—" for Chiqim / Sof cashflow. Profit is cash-basis: payments − refunds − expenses (cashback isn't cash).
```

- [ ] **Step 2: Yakuniy tekshiruv**

Run: `bun run build && bun run lint && bun scripts/checks/period.check.ts && (cd mobile && bunx tsc --noEmit)`
Expected: build 0; lint bazaviy 3 ta yoki kamroq; `period.check: ok`; mobil tsc 0.

- [ ] **Step 3: Commit — foydalanuvchi tasdig'i bilan**

`git status --short` va `git diff --cached --stat` ni ko'rsatib, tasdiq so'rang. Keyin:

```bash
git add CLAUDE.md docs/superpowers/plans/2026-09-28-bosqich-4-xarajatlar.md
git commit -m "feat(moliya): expenses, Chiqim / Sof cashflow KPIs, per-event profit tab

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Deploy (bu rejaga kirmaydi — alohida, foydalanuvchi tasdig'i bilan):**
1. Backup.
2. 054 ni avval `BEGIN … ROLLBACK` bilan sinash, keyin qo'llash.
3. `schema_migrations` ga `054` yozish.
4. `docker restart supabase-rest-1`.
5. **Darhol** `main` ga push (Coolify), keyin `git -C ~/Desktop/fy-system pull --ff-only`.

`finance_summary` ga yangi ustunlar qo'shiladi, xolos: push'dan oldingi daqiqalarda eski sayt ishlashda davom etadi. `event_finance_totals` ni eski frontend chaqirmaydi.
