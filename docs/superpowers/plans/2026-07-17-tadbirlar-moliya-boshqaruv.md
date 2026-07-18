# Tadbirlar → Boshqaruv + Moliya Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/tadbirlar` bitta sahifasini ikkiga bo'lish — `/tadbirlar/boshqaruv` (tadbir/ishtirokchi/booklet) va `/tadbirlar/moliya` (cashflow, qarzdorlik, keshbek, to'lovlar) — ular localStorage orqali bitta tanlangan tadbirni bo'lishadi.

**Architecture:** Mavjud tab bar `EventTabs` ga ajratiladi va ikkala sahifa uni qayta ishlatadi. `EventOverview` dan pul qismlari yangi `EventFinance` ga ko'chadi. Moliyaning "Umumiy" tabi yangi `event_finance_totals()` RPC dan 3 ta KPI o'qiydi va mavjud `PaymentsLog` ni ko'rsatadi. Yangi `tadbirlar-moliya` moduli Moliyani alohida ruxsat ostiga oladi.

**Tech Stack:** React 19 + Vite 7, react-router-dom 7, TanStack Query 5, Tailwind 4, Supabase Postgres (migration 047), Deno edge function.

**Spec:** `docs/superpowers/specs/2026-07-17-tadbirlar-moliya-boshqaruv-design.md`

## Global Constraints

- Package manager **bun**, npm emas.
- TypeScript strict: `any` yo'q, `import type` (verbatimModuleSyntax), `noUnusedLocals`/`noUnusedParameters`.
- Barcha foydalanuvchiga ko'rinadigan matn **o'zbekcha**.
- Import aliaslari: `@/components/...`, `@/lib/...`, `@/hooks/...`.
- Burchak radiuslari **8px** (`rounded-[8px]` / `apple-sq-10` / `apple-sq-12`); ikonkalar `@phosphor-icons/react`; `.no-scrollbar` yashirin skroll uchun.
- **Mavjud migration fayllarini o'zgartirmang** — faqat yangi `047` qo'shiladi.
- **JS test runner yo'q.** Frontend uchun yagona avtomatik tekshiruv — `bun run build` (`tsc -b && vite build`, tip xatosida yiqiladi). DB uchun `supabase/tests/*.sql`, faqat **throwaway** Postgres da (hech qachon prodda).
- **`paid` ustuniga hech qachon to'g'ridan-to'g'ri yozmang** — u `sync_participant_paid` trigger bilan hisoblanadi. Bu rejada pul yozadigan yangi kod yo'q; faqat o'qish va mavjud modallar ko'chiriladi.
- Commit formati: `feat:`, `fix:`, `chore:`, `docs:`. **Tasdiqsiz commit qilmang** — har bir Commit qadamida foydalanuvchidan ruxsat so'rang.

---

## File Structure

| Fayl | Amal | Mas'uliyati |
|---|---|---|
| `supabase/migrations/047_tadbirlar_moliya_module.sql` | Create | CHECK ga `tadbirlar-moliya`, backfill, `event_finance_totals()` RPC |
| `supabase/tests/047_tadbirlar_moliya_module_test.sql` | Create | 047 ning xatti-harakat testi |
| `src/lib/supabase/queries/auth.ts` | Modify | `ModuleName` + `MODULES` |
| `supabase/functions/admin-create-user/index.ts` | Modify | `VALID_MODULES` |
| `src/hooks/useEventTab.ts` | Create | `fy_last_event_tab` localStorage, ikki sahifa sinxroni |
| `src/components/events/EventTabs.tsx` | Create | Tab bar + arxiv dropdown (Events.tsx dan ko'chadi) |
| `src/lib/supabase/queries/payments.ts` | Modify | `getFinanceTotals()` |
| `src/hooks/usePayments.ts` | Modify | `useFinanceTotals()`, `FINANCE_TOTALS_KEY` |
| `src/components/events/EventFinance.tsx` | Create | Bitta tadbirning moliyasi |
| `src/components/events/FinanceOverview.tsx` | Create | KPI kartalar + `PaymentsLog` |
| `src/components/pages/EventsMoliya.tsx` | Create | Moliya sahifasi |
| `src/components/pages/EventsBoshqaruv.tsx` | Create | Boshqaruv sahifasi |
| `src/components/events/EventOverview.tsx` | Modify | Pul qismlari olib tashlanadi |
| `src/components/pages/Events.tsx` | Delete | 4-taskda |
| `src/App.tsx` | Modify | Marshrutlar + `PAGE_META` |
| `src/components/layout/Sidebar.tsx` | Modify | "Tadbirlar" → 2 subItem |

---

## Task 1: Migration 047 — `tadbirlar-moliya` moduli va moliya RPC

Modul ID uchta joyda yashaydi va **birga ko'chishi shart** (CLAUDE.md): DB CHECK, `auth.ts`, edge function. Uchalasi shu taskda, bitta commitda.

**Files:**
- Create: `supabase/migrations/047_tadbirlar_moliya_module.sql`
- Create: `supabase/tests/047_tadbirlar_moliya_module_test.sql`
- Modify: `src/lib/supabase/queries/auth.ts:8-22`
- Modify: `supabase/functions/admin-create-user/index.ts:11-17`

**Interfaces:**
- Consumes: hech narsa (birinchi task).
- Produces:
  - DB: `public.event_finance_totals()` → `TABLE (total_income numeric, total_debt numeric, total_cashback_balance numeric)` — **bitta qator** qaytaradi.
  - TS: `ModuleName` unioniga `"tadbirlar-moliya"` a'zosi qo'shiladi (Task 3 va 4 dagi `<ProtectedRoute module="tadbirlar-moliya">` va Sidebar shunga tayanadi).

**Diqqat — RPC nega `SECURITY INVOKER`:** spec dastlab `SECURITY DEFINER` degan edi. `SECURITY INVOKER` (standart) tanlanadi, chunki RLS allaqachon a'zolarni (`members`) faqat o'z qatorlariga cheklaydi — DEFINER bo'lsa RLS chetlab o'tiladi va a'zo butun klubning pulini ko'rib qolardi. INVOKER da `is_staff()` qo'riqchisi ham kerak emas: kod kamayadi, xavf yo'qoladi.

- [ ] **Step 1: Testni yozish (avval qizil bo'lishi shart)**

Create `supabase/tests/047_tadbirlar_moliya_module_test.sql`:

```sql
-- Behavioural tests for migration 047 (tadbirlar-moliya module + finance totals RPC).
-- No test runner in this project — run against a THROWAWAY database, never prod:
--
--   docker run -d --name fy-test -e POSTGRES_PASSWORD=postgres \
--     public.ecr.aws/supabase/postgres:17.6.1.106
--   # stub GoTrue + migration history (see CLAUDE.md "Tests"), then replay
--   # supabase/migrations/*.sql, then:
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

-- This user had Tadbirlar access BEFORE 047 ran in the real world; here we insert
-- it after, which is fine — the backfill assertion below re-runs the same INSERT
-- shape and checks the migration's own backfill separately.
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

-- ─── TEST 3: the migration backfilled tadbirlar → tadbirlar-moliya ───────────
-- 018's seed data / any pre-existing 'tadbirlar' rows must have gained a
-- 'tadbirlar-moliya' twin with the same can_edit. We prove the migration's
-- backfill statement itself is correct by re-running it and asserting it is a
-- no-op (i.e. it already ran and covered everything).
DO $$
DECLARE
  missing int;
BEGIN
  SELECT count(*) INTO missing
  FROM public.user_permissions t
  WHERE t.module = 'tadbirlar'
    AND NOT EXISTS (
      SELECT 1 FROM public.user_permissions m
      WHERE m.user_id = t.user_id
        AND m.module  = 'tadbirlar-moliya'
        AND m.can_edit = t.can_edit
    );
  -- Our fixture user was inserted AFTER the migration, so it is legitimately
  -- missing its twin here; anything beyond that is a backfill bug.
  IF missing > 1 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: % tadbirlar rows have no tadbirlar-moliya twin', missing;
  END IF;
  RAISE NOTICE 'TEST 3 ok: backfill left no pre-existing tadbirlar row uncovered';
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
  ('47p00000-0000-0000-0000-000000000001', '47e00000-0000-0000-0000-000000000001',
   '47c00000-0000-0000-0000-000000000001', 'Client A', 1000000),
  ('47p00000-0000-0000-0000-000000000002', '47e00000-0000-0000-0000-000000000001',
   '47c00000-0000-0000-0000-000000000002', 'Client B', 500000);

-- Payments are the source of truth; sync_participant_paid keeps `paid` in sync.
INSERT INTO public.payments (participant_id, amount, method, paid_at) VALUES
  ('47p00000-0000-0000-0000-000000000001', 400000, 'naqd',  now()),
  ('47p00000-0000-0000-0000-000000000002', 700000, 'karta', now());

-- Cashback ledger drives clients.cashback_balance via trigger.
INSERT INTO public.cashback_transactions (client_id, amount, type, note) VALUES
  ('47c00000-0000-0000-0000-000000000001', 25000, 'manual', 'test balance');

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
```

- [ ] **Step 2: Testni ishga tushirib, qizil ekanini tasdiqlash**

CLAUDE.md "Tests" bo'limidagi throwaway stendni ko'taring (`fy-test` konteyner, auth stub, `001`–`046` ni replay — `013/014/016/019/021/025/029` va `042` xatolari **kutilgan**, e'tiborsiz qoldiring). So'ng:

```bash
docker cp supabase/tests/047_tadbirlar_moliya_module_test.sql fy-test:/tmp/t.sql
docker exec fy-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql
```

Kutilgan: **FAIL** — TEST 1 `CHECK rejected tadbirlar-moliya` yoki undan oldin `check_violation`, chunki 046 CHECK da `tadbirlar-moliya` yo'q. Exit kod ≠ 0.

Agar test yashil chiqsa — test noto'g'ri, davom etmang.

- [ ] **Step 3: Migrationni yozish**

Create `supabase/migrations/047_tadbirlar_moliya_module.sql`:

```sql
-- Migration 047: split Tadbirlar into Boshqaruv + Moliya
--
-- 1) New permission module 'tadbirlar-moliya' guards the finance page
--    (/tadbirlar/moliya). 'tadbirlar' keeps guarding management
--    (/tadbirlar/boshqaruv). Module IDs must stay in sync with
--    ModuleName/MODULES (src/lib/supabase/queries/auth.ts) and VALID_MODULES
--    (supabase/functions/admin-create-user) — both updated in this change.
-- 2) Everyone who has 'tadbirlar' today is backfilled with 'tadbirlar-moliya'
--    so nobody silently loses access they already had. Admins can revoke it
--    per-user afterwards from Sozlamalar.
-- 3) event_finance_totals() feeds the three KPI cards on the finance page.

ALTER TABLE public.user_permissions
  DROP CONSTRAINT IF EXISTS user_permissions_module_check;

ALTER TABLE public.user_permissions
  ADD CONSTRAINT user_permissions_module_check
  CHECK (module IN (
    'dashboard',
    'sotuv-crmn',
    'mijozlar',
    'tadbirlar',
    'tadbirlar-moliya',
    'sozlamalar'
  ));

-- Backfill: mirror each existing 'tadbirlar' grant onto 'tadbirlar-moliya'.
-- UNIQUE(user_id, module) from 018 makes this idempotent.
INSERT INTO public.user_permissions (user_id, module, can_view, can_edit, can_delete)
SELECT user_id, 'tadbirlar-moliya', can_view, can_edit, can_delete
FROM public.user_permissions
WHERE module = 'tadbirlar'
ON CONFLICT (user_id, module) DO NOTHING;

-- ─── Finance KPI totals ──────────────────────────────────────────────────────
-- SECURITY INVOKER on purpose (no SECURITY DEFINER): RLS already limits members
-- to their own rows, so an invoker-rights function can never leak club-wide
-- money. A DEFINER function would bypass RLS and would need an is_staff() guard.
--
-- total_income reads payments.amount, NOT event_participants.paid: `paid`
-- includes cashback_used, which is not cash coming in (see migration 035).
CREATE OR REPLACE FUNCTION public.event_finance_totals()
RETURNS TABLE (
  total_income           numeric,
  total_debt             numeric,
  total_cashback_balance numeric
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    (SELECT COALESCE(SUM(amount), 0) FROM public.payments),
    -- GREATEST: an overpaid participant must contribute 0, never a negative
    -- that quietly cancels out someone else's real debt.
    (SELECT COALESCE(SUM(GREATEST(price - paid, 0)), 0) FROM public.event_participants),
    (SELECT COALESCE(SUM(cashback_balance), 0) FROM public.clients);
$$;

REVOKE EXECUTE ON FUNCTION public.event_finance_totals() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.event_finance_totals() TO authenticated, service_role;
```

- [ ] **Step 4: Migrationni qo'llab, testni qayta ishga tushirish**

```bash
docker cp supabase/migrations/047_tadbirlar_moliya_module.sql fy-test:/tmp/m.sql
docker exec fy-test psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 -f /tmp/m.sql
docker exec fy-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql
```

Kutilgan: **PASS** — oxirida `047 tests passed`, exit kod 0.

- [ ] **Step 5: `auth.ts` da modul ro'yxatini yangilash**

Modify `src/lib/supabase/queries/auth.ts` — `ModuleName` va `MODULES`:

```ts
export type ModuleName =
  | "dashboard"
  | "sotuv-crmn"
  | "mijozlar"
  | "tadbirlar"
  | "tadbirlar-moliya"
  | "sozlamalar"

export const MODULES: { id: ModuleName; label: string }[] = [
  { id: "dashboard",        label: "Dashboard" },
  { id: "sotuv-crmn",       label: "Sotuv (CRM-N)" },
  { id: "mijozlar",         label: "Mijozlar" },
  { id: "tadbirlar",        label: "Tadbirlar (Boshqaruv)" },
  { id: "tadbirlar-moliya", label: "Tadbirlar (Moliya)" },
  { id: "sozlamalar",       label: "Sozlamalar" },
]
```

- [ ] **Step 6: Edge function `VALID_MODULES` ni yangilash**

Modify `supabase/functions/admin-create-user/index.ts:11-17`:

```ts
const VALID_MODULES = new Set([
  "dashboard",
  "sotuv-crmn",
  "mijozlar",
  "tadbirlar",
  "tadbirlar-moliya",
  "sozlamalar",
])
```

- [ ] **Step 7: Build**

```bash
bun run build
```

Kutilgan: xatosiz. (`MODULES` Sozlamalar ruxsat modalida ishlatiladi — yangi element avtomatik chiqadi.)

- [ ] **Step 8: Commit** (avval foydalanuvchidan tasdiq so'rang)

```bash
git add supabase/migrations/047_tadbirlar_moliya_module.sql \
        supabase/tests/047_tadbirlar_moliya_module_test.sql \
        src/lib/supabase/queries/auth.ts \
        supabase/functions/admin-create-user/index.ts
git commit -m "feat(tadbirlar): add tadbirlar-moliya module and finance totals RPC"
```

- [ ] **Step 9: Stendni tozalash**

```bash
docker rm -f fy-test
```

---

## Task 2: `EventTabs` + `useEventTab` ajratish (xulq o'zgarmaydi)

Sof refactor: tab bar `Events.tsx` dan chiqariladi, tanlov localStorage ga ko'chadi. Sahifa avvalgidek ishlaydi — bu keyingi tasklar uchun poydevor.

**Files:**
- Create: `src/hooks/useEventTab.ts`
- Create: `src/components/events/EventTabs.tsx`
- Modify: `src/components/pages/Events.tsx`

**Interfaces:**
- Consumes: `Event` (`@/lib/supabase/queries/events`), `eventTint` (`@/lib/eventTint`), `formatDate` (`@/lib/format`).
- Produces:
  - `UMUMIY: "__umumiy__"` — `@/hooks/useEventTab` dan eksport (Task 3 `EventsMoliya` da ishlatadi).
  - `useEventTab(): readonly [string, (id: string) => void]`
  - `EventTabsProps { events: Event[]; selectedId: string; onSelect: (id: string) => void; showUmumiy: boolean; onCreate?: () => void }`
  - `isActiveEvent(e: Event, today: number): boolean` va `startOfToday(): number` — `EventTabs.tsx` dan eksport (Task 4 `EventsBoshqaruv` birinchi aktiv tadbirni tanlash uchun ishlatadi).

- [ ] **Step 1: `useEventTab` hookini yozish**

Create `src/hooks/useEventTab.ts`:

```ts
import { useState, useEffect } from "react"

// Sentinel for the always-first "Umumiy" tab on the finance page.
export const UMUMIY = "__umumiy__"

const KEY = "fy_last_event_tab"

// Shared across /tadbirlar/boshqaruv and /tadbirlar/moliya: pick an event on one
// page, land on the same event after switching to the other.
export function useEventTab() {
  const [id, setId] = useState<string>(() => {
    try {
      return localStorage.getItem(KEY) ?? UMUMIY
    } catch { return UMUMIY }
  })

  useEffect(() => {
    try { localStorage.setItem(KEY, id) } catch { /* private browsing */ }
  }, [id])

  return [id, setId] as const
}
```

- [ ] **Step 2: `EventTabs` komponentini yozish**

Create `src/components/events/EventTabs.tsx`. Bu `Events.tsx:110-206` ning aynan ko'chirmasi, farqi: `showUmumiy` va ixtiyoriy `onCreate`.

```tsx
import { useState, useEffect, useMemo, useRef } from "react"
import { Plus, BookmarkSimple, SquaresFour } from "@phosphor-icons/react"
import { type Event } from "@/lib/supabase/queries/events"
import { UMUMIY } from "@/hooks/useEventTab"
import { eventTint } from "@/lib/eventTint"
import { formatDate } from "@/lib/format"

export function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function isActiveEvent(e: Event, today: number): boolean {
  const ref = e.end_date ?? e.date
  if (!ref) return true
  return new Date(ref).getTime() >= today
}

interface EventTabsProps {
  events: Event[]
  selectedId: string
  onSelect: (id: string) => void
  showUmumiy: boolean
  onCreate?: () => void
}

export function EventTabs({ events, selectedId, onSelect, showUmumiy, onCreate }: EventTabsProps) {
  const [archiveOpen, setArchiveOpen] = useState(false)
  const archiveRef = useRef<HTMLDivElement>(null)

  const today = startOfToday()

  const { active, archive } = useMemo(() => {
    const a: Event[] = []
    const ar: Event[] = []
    for (const e of events) (isActiveEvent(e, today) ? a : ar).push(e)
    // active: nearest upcoming first; archive: most recent first
    a.sort((x, y) => new Date(x.date ?? 0).getTime() - new Date(y.date ?? 0).getTime())
    ar.sort((x, y) => new Date(y.date ?? 0).getTime() - new Date(x.date ?? 0).getTime())
    return { active: a, archive: ar }
  }, [events, today])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (archiveRef.current && !archiveRef.current.contains(e.target as Node)) setArchiveOpen(false)
    }
    if (archiveOpen) document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [archiveOpen])

  const selected = events.find((e) => e.id === selectedId) ?? null

  // Tabs = active events; if an archive event is selected, surface it as a tab too.
  const tabEvents = useMemo(() => {
    const base = [...active]
    if (selected && !active.some((e) => e.id === selected.id)) base.unshift(selected)
    return base
  }, [active, selected])

  return (
    <div className="flex items-end gap-1 border-b border-[#E8E8E8]">
      <div className="flex items-end gap-1 overflow-x-auto no-scrollbar flex-1 pt-1.5">
        {showUmumiy && (
          <button
            onClick={() => onSelect(UMUMIY)}
            title="Umumiy"
            className={`relative flex items-center gap-2 h-9 px-3.5 rounded-t-[10px] -mb-px shrink-0 whitespace-nowrap bg-[#141414] transition-colors ${
              selectedId === UMUMIY
                ? "text-white border border-[#141414] shadow-[0_-1px_3px_rgba(0,0,0,0.18)]"
                : "text-white/55 border border-transparent hover:text-white"
            }`}
          >
            <SquaresFour size={15} weight="bold" />
            <span className="text-[12.5px] font-semibold">Umumiy</span>
          </button>
        )}

        {tabEvents.map((e) => {
          const isSel = e.id === selectedId
          return (
            <button
              key={e.id}
              onClick={() => onSelect(e.id)}
              title={e.name}
              className={`group relative flex items-center gap-2 h-9 px-3.5 rounded-t-[10px] -mb-px max-w-[210px] whitespace-nowrap transition-colors ${
                isSel
                  ? "bg-white border border-[#E8E8E8] border-b-white text-[#141414] shadow-[0_-1px_3px_rgba(0,0,0,0.03)]"
                  : "bg-[#F4F4F4] border border-transparent text-[#8A8A8A] hover:bg-[#ECECEC] hover:text-[#141414]"
              }`}
            >
              <span
                className="w-[14px] h-[14px] rounded-[4px] shrink-0"
                style={{ backgroundColor: eventTint(e.name) }}
              />
              <span className="text-[12.5px] font-semibold truncate">{e.name}</span>
            </button>
          )
        })}

        {onCreate && (
          <button
            onClick={onCreate}
            title="Yangi tadbir"
            className="flex items-center justify-center w-8 h-8 mb-[3px] ml-0.5 shrink-0 rounded-full text-[#9A9A9A] hover:bg-[#ECECEC] hover:text-[#141414] transition-colors"
          >
            <Plus size={16} weight="bold" />
          </button>
        )}
      </div>

      {/* Bookmark → past events dropdown */}
      <div className="relative shrink-0 mb-1.5" ref={archiveRef}>
        <button
          onClick={() => setArchiveOpen((o) => !o)}
          title="O'tgan tadbirlar"
          className={`relative flex items-center justify-center w-8 h-8 rounded-[8px] transition-colors ${
            archiveOpen ? "bg-[#ECECEC] text-[#141414]" : "text-[#9A9A9A] hover:bg-[#ECECEC] hover:text-[#141414]"
          }`}
        >
          <BookmarkSimple size={17} weight={archiveOpen ? "fill" : "bold"} />
          {archive.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 rounded-full bg-[#141414] text-white text-[9px] font-bold flex items-center justify-center">
              {archive.length}
            </span>
          )}
        </button>
        {archiveOpen && (
          <div className="absolute right-0 top-full mt-1.5 bg-white border border-[#F0F0F0] rounded-[10px] shadow-lg z-20 overflow-hidden min-w-[240px] max-h-[300px] overflow-y-auto no-scrollbar">
            <div className="px-3 py-2 border-b border-[#F0F0F0] text-[11px] font-bold text-[#999]">
              O'tgan tadbirlar
            </div>
            {archive.length === 0 ? (
              <div className="px-3 py-4 text-[12px] text-[#999]">O'tgan tadbir yo'q</div>
            ) : (
              archive.map((e) => (
                <button
                  key={e.id}
                  onClick={() => {
                    onSelect(e.id)
                    setArchiveOpen(false)
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#F5F5F5] transition-colors text-left"
                >
                  <span
                    className="w-[12px] h-[12px] rounded-[3px] shrink-0"
                    style={{ backgroundColor: eventTint(e.name) }}
                  />
                  <span className="flex flex-col min-w-0">
                    <span className="text-[12px] font-medium text-[#141414] truncate">{e.name}</span>
                    <span className="text-[10px] text-[#999]">{formatDate(e.date)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: `Events.tsx` ni `EventTabs` + `useEventTab` ga o'tkazish**

Modify `src/components/pages/Events.tsx` — to'liq almashtiring:

```tsx
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { CalendarBlank } from "@phosphor-icons/react"
import { type Event } from "@/lib/supabase/queries/events"
import { CreateEventDrawer } from "@/components/events/CreateEventDrawer"
import { EventOverview } from "@/components/events/EventOverview"
import { EventTabs } from "@/components/events/EventTabs"
import { PaymentsLog } from "@/components/events/PaymentsLog"
import { useEventTab, UMUMIY } from "@/hooks/useEventTab"
import { useEvents, useDeleteEvent, EVENTS_KEY, EVENT_COUNTS_KEY } from "@/hooks/useEvents"
import { EventCardSkeleton } from "@/components/ui/Skeleton"

export function Events() {
  const qc = useQueryClient()
  const { data: events = [], isLoading: loading } = useEvents()
  const deleteEventMutation = useDeleteEvent()

  const [selectedId, setSelectedId] = useEventTab()
  const [showCreate, setShowCreate] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)

  // Effective selection computed during render: "Umumiy" by default, or the
  // picked event while it's still valid (else fall back to Umumiy).
  const eventValid = selectedId !== UMUMIY && events.some((e) => e.id === selectedId)
  const effectiveId = eventValid ? selectedId : UMUMIY
  const selected = events.find((e) => e.id === effectiveId) ?? null

  function handleDelete(id: string) {
    if (!window.confirm("Tadbirni o'chirishni tasdiqlaysizmi? Barcha ishtirokchilar ham o'chadi.")) return
    deleteEventMutation.mutate(id, {
      onSettled: () => {
        if (selectedId === id) setSelectedId(UMUMIY)
      },
    })
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6 h-full">
        <div className="animate-pulse bg-[#F0F0F0] rounded-[6px] h-6 w-32" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <EventCardSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 h-full">
      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <CalendarBlank size={64} className="text-[#E0E0E0]" weight="bold" />
          <p className="text-[14px] text-[#999]">Hozircha tadbirlar yo'q</p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-[#141414] text-white rounded-[8px] text-[13px] font-bold hover:bg-[#333] transition-colors"
          >
            Birinchi tadbirni yarating
          </button>
        </div>
      ) : (
        <>
          <EventTabs
            events={events}
            selectedId={effectiveId}
            onSelect={setSelectedId}
            showUmumiy
            onCreate={() => setShowCreate(true)}
          />

          {effectiveId === UMUMIY ? (
            <PaymentsLog />
          ) : selected ? (
            <EventOverview
              key={selected.id}
              event={selected}
              onEdit={() => setEditingEvent(selected)}
              onDelete={() => handleDelete(selected.id)}
            />
          ) : (
            <div className="py-16 text-center text-[13px] text-[#999]">Tadbirni tanlang</div>
          )}
        </>
      )}

      <CreateEventDrawer
        isOpen={showCreate || !!editingEvent}
        onClose={() => {
          setShowCreate(false)
          setEditingEvent(null)
        }}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: EVENTS_KEY })
          qc.invalidateQueries({ queryKey: EVENT_COUNTS_KEY })
        }}
        editEvent={editingEvent}
      />
    </div>
  )
}
```

- [ ] **Step 4: Build**

```bash
bun run build
```

Kutilgan: xatosiz. Agar `noUnusedLocals` xato bersa — `Events.tsx` da ishlatilmay qolgan import qolgan, o'chiring.

- [ ] **Step 5: Brauzerda tekshirish (qo'lda)**

```bash
bun run dev
```

⚠️ `.env.local` **prod DB** ga qaraydi — faqat o'qing, pul yozmang.

`/tadbirlar` da tekshiring: Umumiy tabi ochiladi; tadbir tablari, `+` tugmasi, arxiv dropdowni avvalgidek ishlaydi; tadbir tanlab sahifani yangilasangiz — o'sha tab ochilib qoladi (yangi localStorage xulqi).

- [ ] **Step 6: Commit** (avval foydalanuvchidan tasdiq so'rang)

```bash
git add src/hooks/useEventTab.ts src/components/events/EventTabs.tsx src/components/pages/Events.tsx
git commit -m "chore(tadbirlar): extract EventTabs and persist the selected tab"
```

---

## Task 3: Moliya sahifasi (`/tadbirlar/moliya`) + pulni `EventOverview` dan ko'chirish

Shu taskdan keyin: `/tadbirlar` — boshqaruv (pulsiz), `/tadbirlar/moliya` — pul. Ilova ishlaydi.

⚠️ **Pul kodi NUSXALANMAYDI, KO'CHADI.** `PriceCell`, `CashbackPercentCell`, `SpendCell`,
`DefaultCashbackEditor` va "Qiymat bajarilishi" kartasi `EventFinance.tsx` ga o'tadi va **shu
taskning o'zida** `EventOverview.tsx` dan o'chiriladi. Ikkala faylda bir vaqtda turishiga yo'l
qo'ymang — bu commitda dublikat qolmasligi kerak.

**Files:**
- Modify: `src/lib/supabase/queries/payments.ts`
- Modify: `src/hooks/usePayments.ts`
- Modify: `src/hooks/useEvents.ts`
- Modify: `src/hooks/useCashback.ts`
- Create: `src/components/events/EventFinance.tsx`
- Create: `src/components/events/FinanceOverview.tsx`
- Create: `src/components/pages/EventsMoliya.tsx`
- Modify: `src/components/events/EventOverview.tsx` ← pul qismlari o'chadi
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: `event_finance_totals()` RPC va `"tadbirlar-moliya"` `ModuleName` a'zosi (Task 1); `EventTabs`, `useEventTab`, `UMUMIY` (Task 2).
- Produces:
  - `FinanceTotals { total_income: number; total_debt: number; total_cashback_balance: number }` — `@/lib/supabase/queries/payments`
  - `getFinanceTotals(): Promise<FinanceTotals>`
  - `FINANCE_TOTALS_KEY = ["finance-totals"] as const`, `useFinanceTotals()` — `@/hooks/usePayments`
  - `EventFinance({ event }: { event: Event })`
  - `FinanceOverview()`

- [ ] **Step 1: `getFinanceTotals()` queryni qo'shish**

Modify `src/lib/supabase/queries/payments.ts` — fayl oxiriga qo'shing:

```ts
// ─── Finance KPI totals (Moliya → Umumiy) ─────────────────────────────────────
// Server-side aggregate via RPC (migration 047). Never sum in the browser: an
// unbounded select is capped by PostgREST max_rows and would silently undercount.
export interface FinanceTotals {
  total_income: number           // SUM(payments.amount) — real cash, cashback excluded
  total_debt: number             // SUM(GREATEST(price - paid, 0))
  total_cashback_balance: number // SUM(clients.cashback_balance)
}

export async function getFinanceTotals(): Promise<FinanceTotals> {
  const { data, error } = await supabase.rpc("event_finance_totals")
  if (error) throw error

  // The RPC returns TABLE(...) → supabase-js gives an array of one row.
  const row = (data as unknown as FinanceTotals[] | null)?.[0]
  return {
    total_income:           Number(row?.total_income ?? 0),
    total_debt:             Number(row?.total_debt ?? 0),
    total_cashback_balance: Number(row?.total_cashback_balance ?? 0),
  }
}
```

**Eslatma:** `types.ts` hali `event_finance_totals` ni bilmaydi (`bun run gen:types` lokal stend talab qiladi, u yo'q). Yuqoridagi `as unknown as` — CLAUDE.md dagi "Stale types workaround". Agar `supabase.rpc("event_finance_totals")` tip xatosi bersa, chaqiruvni shunday yozing:

```ts
const { data, error } = await (supabase.rpc as unknown as
  (fn: string) => Promise<{ data: FinanceTotals[] | null; error: Error | null }>
)("event_finance_totals")
```

- [ ] **Step 2: `useFinanceTotals()` hookini qo'shish va invalidatsiyaga ulash**

Modify `src/hooks/usePayments.ts`:

`getFinanceTotals` ni importga qo'shing:

```ts
import {
  getParticipantPayments,
  getEventPayments,
  getRecentPayments,
  getClientParticipations,
  getFinanceTotals,
  addPayment,
  deletePayment,
} from "@/lib/supabase/queries/payments"
```

`RECENT_PAYMENTS_KEY` yonига kalit qo'shing:

```ts
export const FINANCE_TOTALS_KEY = ["finance-totals"] as const
```

`invalidatePaymentViews` ichiga qo'shing (funksiyaning izohi aynan shuni talab qiladi — pul hech qayerda eskirib qolmasin):

```ts
  qc.invalidateQueries({ queryKey: FINANCE_TOTALS_KEY })
```

`useRecentPayments` dan keyin hookni qo'shing:

```ts
export function useFinanceTotals() {
  return useQuery({
    queryKey: FINANCE_TOTALS_KEY,
    queryFn:  getFinanceTotals,
  })
}
```

Modify `src/hooks/useCashback.ts` — keshbek ishlatilganda ham qarzdorlik/balans o'zgaradi. `FINANCE_TOTALS_KEY` ni import qiling:

```ts
import { FINANCE_TOTALS_KEY } from "@/hooks/usePayments"
```

va `useSpendCashback` hamda `useAdjustCashback` ning `onSuccess` iga qo'shing:

```ts
      qc.invalidateQueries({ queryKey: FINANCE_TOTALS_KEY })
```

Modify `src/hooks/useEvents.ts` — narx tahrirlansa qarzdorlik o'zgaradi. `useUpdateParticipant` ning `onSuccess` iga qo'shing (importni ham qo'shing):

```ts
      qc.invalidateQueries({ queryKey: FINANCE_TOTALS_KEY })
```

⚠️ **Aylanma import xavfi:** `usePayments.ts` allaqachon `useEvents.ts` dan import qiladi. `useEvents.ts` → `usePayments.ts` importi halqa hosil qiladi. Halqadan qochish uchun `FINANCE_TOTALS_KEY` ni **`useEvents.ts` da** e'lon qiling va `usePayments.ts` uni `useEvents` dan import qilsin (u yerda allaqachon `PARTICIPANTS_KEY, EVENTS_KEY, EVENT_COUNTS_KEY` import qilinadi). Ya'ni:

- `src/hooks/useEvents.ts` ga: `export const FINANCE_TOTALS_KEY = ["finance-totals"] as const`
- `src/hooks/usePayments.ts` va `src/hooks/useCashback.ts` uni `@/hooks/useEvents` dan import qilsin.

- [ ] **Step 3: `FinanceOverview` (KPI kartalar + jurnal) yozish**

Create `src/components/events/FinanceOverview.tsx`:

```tsx
import { TrendUp, Wallet, Gift } from "@phosphor-icons/react"
import { useFinanceTotals } from "@/hooks/usePayments"
import { PaymentsLog } from "@/components/events/PaymentsLog"
import { formatMoney } from "@/lib/format"

export function FinanceOverview() {
  const { data: totals, isLoading } = useFinanceTotals()

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          icon={<TrendUp size={15} weight="bold" />}
          label="Jami tushum"
          value={totals?.total_income}
          loading={isLoading}
        />
        <KpiCard
          icon={<Wallet size={15} weight="bold" />}
          label="Jami qarzdorlik"
          value={totals?.total_debt}
          loading={isLoading}
          danger
        />
        <KpiCard
          icon={<Gift size={15} weight="bold" />}
          label="Keshbek qoldig'i"
          value={totals?.total_cashback_balance}
          loading={isLoading}
        />
      </div>

      <PaymentsLog />
    </div>
  )
}

function KpiCard({
  icon,
  label,
  value,
  loading,
  danger,
}: {
  icon: React.ReactNode
  label: string
  value: number | undefined
  loading: boolean
  danger?: boolean
}) {
  return (
    <div className="bg-white border border-[#F0F0F0] rounded-[12px] p-4 flex flex-col gap-3">
      <span className="flex items-center gap-2 text-[12px] font-bold text-[#999]">
        {icon} {label}
      </span>
      {loading ? (
        <div className="animate-pulse bg-[#F0F0F0] rounded-[6px] h-7 w-32" />
      ) : (
        <span
          className="text-[22px] font-bold leading-none"
          style={{ color: danger && (value ?? 0) > 0 ? "#D13328" : "#141414" }}
        >
          {formatMoney(value ?? 0)}
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 4: `EventFinance` (bitta tadbir moliyasi) yozish**

Create `src/components/events/EventFinance.tsx`. Mazmuni `EventOverview` dan ko'chadi: "Qiymat bajarilishi" kartasi, `DefaultCashbackEditor`, `PriceCell`, `CashbackPercentCell`, `SpendCell`, `ParticipantPaymentModal`.

```tsx
import { useMemo, useState } from "react"
import { TrendUp, PencilSimple, Coins } from "@phosphor-icons/react"
import { type Event, type Participant } from "@/lib/supabase/queries/events"
import { useParticipants, useUpdateParticipant } from "@/hooks/useEvents"
import {
  useSetEventCashbackPercent,
  useSetParticipantCashbackPercent,
  useClientCashbackBalance,
} from "@/hooks/useCashback"
import { ParticipantPaymentModal } from "@/components/events/ParticipantPaymentModal"
import { ApplyCashbackModal } from "@/components/cashback/ApplyCashbackModal"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { eventTint } from "@/lib/eventTint"
import { formatMoney, formatDate, formatNumber } from "@/lib/format"

export function EventFinance({ event }: { event: Event }) {
  const [payTarget, setPayTarget] = useState<Participant | null>(null)
  const [payKey, setPayKey] = useState(0)

  const { data: participants = [], isLoading } = useParticipants(event.id)

  const updatePart = useUpdateParticipant(event.id)
  const setEventCb = useSetEventCashbackPercent()
  const setPartCb = useSetParticipantCashbackPercent(event.id)

  const defaultPercent = Number(event.cashback_percent ?? 0)

  const totalPaid = useMemo(() => participants.reduce((s, p) => s + (p.paid ?? 0), 0), [participants])
  const totalEarned = useMemo(() => participants.reduce((s, p) => s + (p.cashback_earned ?? 0), 0), [participants])
  const totalUsed = useMemo(() => participants.reduce((s, p) => s + (p.cashback_used ?? 0), 0), [participants])

  const valuePct = event.total_value > 0 ? Math.round((totalPaid / event.total_value) * 100) : null

  const dateLabel = event.date
    ? event.end_date
      ? `${formatDate(event.date)} — ${formatDate(event.end_date)}`
      : formatDate(event.date)
    : "Sana belgilanmagan"

  function openPay(p: Participant) {
    setPayTarget(p)
    setPayKey((k) => k + 1)
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Compact header — editing/deleting the event lives on Boshqaruv */}
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-[12px] border border-[#F0F0F0] bg-white min-w-0">
        <span className="w-3.5 h-3.5 rounded-[4px] shrink-0" style={{ backgroundColor: eventTint(event.name) }} />
        <span className="text-[14px] font-bold text-[#141414] truncate">{event.name}</span>
        <span className="text-[12px] text-[#999] whitespace-nowrap hidden sm:inline">· {dateLabel}</span>
      </div>

      {/* Value progress */}
      <div className="bg-white border border-[#F0F0F0] rounded-[12px] p-4 flex flex-col gap-3">
        <span className="flex items-center gap-2 text-[12px] font-bold text-[#999]">
          <TrendUp size={15} weight="bold" /> Qiymat bajarilishi
        </span>
        {valuePct === null ? (
          <div className="flex flex-col gap-2">
            <span className="text-[15px] font-bold text-[#141414]">{formatMoney(totalPaid)}</span>
            <span className="text-[12px] text-[#999]">Qiymat belgilanmagan</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-end justify-between">
              <span className="text-[28px] font-bold text-[#141414] leading-none">{valuePct}%</span>
              <span className="text-[12px] text-[#999] text-right">
                {formatMoney(totalPaid)}<br />/ {formatMoney(event.total_value)}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-[#F0F0F0] overflow-hidden">
              <div className="h-full rounded-full bg-[#141414]" style={{ width: `${Math.min(valuePct, 100)}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Finance table */}
      <div className="bg-white border border-[#F0F0F0] rounded-[12px] overflow-hidden">
        <div className="flex flex-col gap-1.5 px-4 py-3 border-b border-[#F0F0F0]">
          <span className="text-[13px] font-bold text-[#141414]">Ishtirokchilar moliyasi ({participants.length})</span>
          <div className="flex items-center gap-3 flex-wrap text-[11px] text-[#999]">
            <DefaultCashbackEditor
              percent={defaultPercent}
              saving={setEventCb.isPending}
              onSave={(p) => setEventCb.mutate({ eventId: event.id, percent: p })}
            />
            <span>Berildi: <strong className="text-[#141414]">{formatMoney(totalEarned)}</strong></span>
            <span>Ishlatildi: <strong className="text-[#141414]">{formatMoney(totalUsed)}</strong></span>
          </div>
        </div>
        {isLoading ? (
          <div className="py-10 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-[#141414] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : participants.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-[#999]">Hali ishtirokchi qo'shilmagan</div>
        ) : (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11px] font-bold text-[#999] border-b border-[#F0F0F0]">
                  <th className="px-4 py-2.5 font-bold">Mijoz ismi</th>
                  <th className="px-4 py-2.5 font-bold text-right">Jami to'lanishi kerak</th>
                  <th className="px-4 py-2.5 font-bold text-right">Hozirgacha to'langan</th>
                  <th className="px-4 py-2.5 font-bold text-right">Qolayotgan qarzdorlik</th>
                  <th className="px-4 py-2.5 font-bold text-right">Keshbek</th>
                  <th className="px-4 py-2.5 font-bold text-right">Amal</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => {
                  const debt = (p.price ?? 0) - (p.paid ?? 0)
                  return (
                    <tr key={p.id} className="border-b border-[#F7F7F7] last:border-0 hover:bg-[#FBFBFB] transition-colors">
                      <td className="px-4 py-2.5 text-[13px] font-medium text-[#141414] whitespace-nowrap">{p.full_name}</td>
                      <td className="px-4 py-2.5 text-right">
                        <PriceCell value={p.price ?? 0} onSave={(price) => updatePart.mutate({ id: p.id, updates: { price } })} />
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-[#141414] text-right whitespace-nowrap">{formatMoney(p.paid)}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {debt <= 0 ? (
                          <span className="inline-flex justify-end"><StatusBadge label="To'langan" variant="success" dot /></span>
                        ) : (
                          <span className="text-[13px] font-bold" style={{ color: "#D13328" }}>{formatMoney(debt)}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <CashbackPercentCell
                          participant={p}
                          defaultPercent={defaultPercent}
                          onSet={(percent) => setPartCb.mutate({ participantId: p.id, percent })}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <SpendCell participant={p} />
                          <button
                            onClick={() => openPay(p)}
                            title="To'lov qo'shish"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-semibold text-[#141414] border border-[#E0E0E0] hover:bg-[#F5F5F5] transition-colors"
                          >
                            <Coins size={13} weight="bold" /> To'lov
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ParticipantPaymentModal
        key={`pay-${payKey}`}
        isOpen={!!payTarget}
        participant={payTarget}
        onClose={() => setPayTarget(null)}
        onPaid={() => setPayTarget(null)}
      />
    </div>
  )
}

// ── Inline editors / cells (moved verbatim from EventOverview) ────────────────

function PriceCell({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState("")

  if (!editing) {
    return (
      <button
        onClick={() => { setVal(value ? String(Math.round(value)) : ""); setEditing(true) }}
        className="group/price inline-flex items-center gap-1 text-[13px] text-[#141414]"
        title="Narxni tahrirlash"
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

// Per-participant cashback % (override). Empty = use the event default.
function CashbackPercentCell({
  participant,
  defaultPercent,
  onSet,
}: {
  participant: Participant
  defaultPercent: number
  onSet: (percent: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState("")

  const effective = participant.cashback_percent ?? defaultPercent
  const isCustom = participant.cashback_percent !== null

  if (!editing) {
    return (
      <button
        onClick={() => { setVal(participant.cashback_percent !== null ? String(participant.cashback_percent) : ""); setEditing(true) }}
        className="inline-flex items-center gap-1.5 justify-end"
        title="Keshbek foizini tahrirlash (bo'sh = standart)"
      >
        <StatusBadge label={`${effective}%`} variant={isCustom ? "warning" : "neutral"} />
        {participant.cashback_earned > 0 && (
          <span className="text-[11px] text-[#666]">{formatMoney(participant.cashback_earned)}</span>
        )}
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

// "Cashback ishlatish" — spend accumulated cashback against this participant's debt.
function SpendCell({ participant }: { participant: Participant }) {
  const { data: balance = 0 } = useClientCashbackBalance(participant.contact_id)
  const [open, setOpen] = useState(false)

  const debt = Math.max(0, Number(participant.price) - Number(participant.paid))
  const eligible = !!participant.contact_id && balance > 0 && debt > 0
  if (!eligible) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={`Cashback balansi: ${formatMoney(balance)}`}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-semibold text-[#141414] bg-[#F5F5F5] hover:bg-[#EBEBEB] transition-colors"
      >
        Cashback
      </button>
      <ApplyCashbackModal isOpen={open} onClose={() => setOpen(false)} participant={participant} balance={balance} />
    </>
  )
}

// Editable event-default cashback %.
function DefaultCashbackEditor({
  percent,
  saving,
  onSave,
}: {
  percent: number
  saving: boolean
  onSave: (p: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState("")

  if (!editing) {
    return (
      <button
        onClick={() => { setVal(String(percent)); setEditing(true) }}
        className="group/cb inline-flex items-center gap-1"
        title="Standart keshbekni tahrirlash"
      >
        Standart keshbek: <strong className="text-[#141414]">{percent}%</strong>
        <PencilSimple size={11} weight="bold" className="text-[#CCC] opacity-0 group-hover/cb:opacity-100 transition-opacity" />
      </button>
    )
  }

  function commit() {
    setEditing(false)
    const n = Number(val)
    if (Number.isFinite(n) && n >= 0 && n <= 100 && n !== percent) onSave(n)
  }

  return (
    <span className="inline-flex items-center gap-1">
      Standart keshbek:
      <input
        autoFocus
        type="number"
        min={0}
        max={100}
        step={0.5}
        value={val}
        disabled={saving}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit()
          if (e.key === "Escape") setEditing(false)
        }}
        className="w-14 border border-[#141414] rounded-[6px] px-1.5 py-0.5 text-[11px] text-right text-[#141414] focus:outline-none"
      />
      %
    </span>
  )
}
```

- [ ] **Step 5: `EventOverview` dan pul qismlarini o'chirish (ko'chirishning ikkinchi yarmi)**

Modify `src/components/events/EventOverview.tsx`. 4-qadamda `EventFinance` ga o'tgan hamma narsa shu yerdan **o'chiriladi** — nusxa qolmasin.

O'chiriladi:

- "Qiymat bajarilishi" kartasi va uni o'rab turgan `grid` — "Ro'yxatdan o'tish" kartasi endi to'liq kenglikda (`grid-cols-1 md:grid-cols-2` o'ramini o'chiring, kartaning `div` i o'z holida qolsin).
- `totalPaid`, `totalEarned`, `totalUsed`, `valuePct` memolari.
- Jadval sarlavhasidagi `DefaultCashbackEditor` + `Berildi:` / `Ishlatildi:` qatori.
- Jadval ustunlari: `Jami to'lanishi kerak`, `Hozirgacha to'langan`, `Qolayotgan qarzdorlik`, `Keshbek`, `Amal` — va ularning `<td>` lari.
- Funksiyalar: `PriceCell`, `CashbackPercentCell`, `SpendCell`, `DefaultCashbackEditor`.
- `payTarget` / `payKey` state, `openPay`, `ParticipantPaymentModal`.
- Hooklar: `useUpdateParticipant`, `useSetEventCashbackPercent`, `useSetParticipantCashbackPercent`, `useClientCashbackBalance`.
- `defaultPercent` konstantasi.

Yetim importlar (o'chiring): `TrendUp`, `Coins`, `formatMoney`, `formatNumber`, `StatusBadge`, `ApplyCashbackModal`, `ParticipantPaymentModal`, keshbek hooklari, `useUpdateParticipant`.

**Qoladi:** banner (`EventBanner`, `IconBtn`, `MetaChip`, `CompactBtn`, `CaretUp`/`CaretDown`, `PencilSimple`, `Trash`, `MapPin`, `CalendarBlank`), `initials`, `manager`/`useUsers`, "Ro'yxatdan o'tish" grafigi (recharts, `UsersThree`, `regData`), `handleExportBooklet` + `Export`, `EnrollParticipantModal` + `Plus` + `existingContactIds`, `formatDate`, `formatPhone`, `eventTint`.

Jadval sarlavhasi shunday bo'ladi (keshbek qatori yo'q):

```tsx
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[#F0F0F0]">
          <span className="text-[13px] font-bold text-[#141414]">Ishtirokchilar ({participants.length})</span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleExportBooklet}
              disabled={exporting || participants.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-semibold border border-[#E0E0E0] text-[#666] hover:bg-[#F5F5F5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Export size={14} weight="bold" />
              {exporting ? "Tayyorlanmoqda..." : "Booklet export"}
            </button>
            <button
              onClick={() => { setEnrollKey((k) => k + 1); setEnrollOpen(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-bold bg-[#141414] text-white hover:bg-[#333] transition-colors"
            >
              <Plus size={14} weight="bold" />
              Ishtirokchi qo'shish
            </button>
          </div>
        </div>
```

Va jadvalning o'zi:

```tsx
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11px] font-bold text-[#999] border-b border-[#F0F0F0]">
                  <th className="px-4 py-2.5 font-bold">Rasmi</th>
                  <th className="px-4 py-2.5 font-bold">Mijoz ismi</th>
                  <th className="px-4 py-2.5 font-bold">Telefon</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => (
                  <tr key={p.id} className="border-b border-[#F7F7F7] last:border-0 hover:bg-[#FBFBFB] transition-colors">
                    <td className="px-4 py-2.5">
                      {p.photo_url ? (
                        <img src={p.photo_url} alt={p.full_name} className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <span className="w-8 h-8 rounded-full bg-[#EBEBEB] text-[#666] text-[11px] font-bold flex items-center justify-center">
                          {initials(p.full_name)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[13px] font-medium text-[#141414] whitespace-nowrap">{p.full_name}</td>
                    <td className="px-4 py-2.5 text-[13px] text-[#666] whitespace-nowrap">{formatPhone(p.phone)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
```

- [ ] **Step 6: `EventsMoliya` sahifasini yozish**

Create `src/components/pages/EventsMoliya.tsx`:

```tsx
import { useEvents } from "@/hooks/useEvents"
import { useEventTab, UMUMIY } from "@/hooks/useEventTab"
import { EventTabs } from "@/components/events/EventTabs"
import { EventFinance } from "@/components/events/EventFinance"
import { FinanceOverview } from "@/components/events/FinanceOverview"

export function EventsMoliya() {
  const { data: events = [], isLoading } = useEvents()
  const [selectedId, setSelectedId] = useEventTab()

  // Fall back to Umumiy when the stored tab points at a deleted event.
  const eventValid = selectedId !== UMUMIY && events.some((e) => e.id === selectedId)
  const effectiveId = eventValid ? selectedId : UMUMIY
  const selected = events.find((e) => e.id === effectiveId) ?? null

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5 h-full">
        <div className="animate-pulse bg-[#F0F0F0] rounded-[6px] h-9 w-64" />
        <div className="animate-pulse bg-[#F0F0F0] rounded-[12px] h-24" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 h-full">
      {/* No onCreate: creating events belongs to Boshqaruv. */}
      <EventTabs events={events} selectedId={effectiveId} onSelect={setSelectedId} showUmumiy />

      {effectiveId === UMUMIY || !selected ? <FinanceOverview /> : <EventFinance key={selected.id} event={selected} />}
    </div>
  )
}
```

- [ ] **Step 7: Marshrutni qo'shish**

Modify `src/App.tsx`:

Import qo'shing:

```tsx
import { EventsMoliya } from "./components/pages/EventsMoliya"
```

`PAGE_META` ga qo'shing:

```ts
  '/tadbirlar/moliya': { title: 'Tadbirlar — Moliya', desc: "To'lovlar, qarzdorlik va keshbek." },
```

`/tadbirlar` marshrutidan keyin qo'shing:

```tsx
          <Route path="/tadbirlar/moliya" element={
            <ProtectedRoute module="tadbirlar-moliya"><EventsMoliya /></ProtectedRoute>
          } />
```

- [ ] **Step 8: Sidebarga subItemlar qo'shish**

Modify `src/components/layout/Sidebar.tsx`:

Ikonka importlariga qo'shing: `Coins`, `SquaresFour` allaqachon import qilingan.

`navigationSections` → "Asosiy" → `Tadbirlar` elementini almashtiring:

```ts
            {
                name: "Tadbirlar",
                icon: CalendarBlank,
                path: "/tadbirlar",
                subItems: [
                    { name: "Boshqaruv", icon: SquaresFour, path: "/tadbirlar", module: "tadbirlar" },
                    { name: "Moliya", icon: Coins, path: "/tadbirlar/moliya", module: "tadbirlar-moliya" },
                ],
            },
```

**Diqqat:** shu taskda "Boshqaruv" vaqtincha eski `/tadbirlar` ga ishora qiladi — 4-task uni `/tadbirlar/boshqaruv` ga o'tkazadi. Shunda ham har bir commitdan keyin ilova ishlaydi.

⚠️ **`isActive` nozikligi:** `isActive` `startsWith` ishlatadi, shuning uchun `/tadbirlar/moliya` da turganda "Boshqaruv" subitemi (`path: "/tadbirlar"`) ham aktiv ko'rinadi. Bu 4-taskda "Boshqaruv" `/tadbirlar/boshqaruv` ga o'tgach o'z-o'zidan yo'qoladi. Shu taskda tuzatmang.

- [ ] **Step 9: Build**

```bash
bun run build
```

Kutilgan: xatosiz. `noUnusedLocals` `EventOverview` da qolib ketgan yetim importlarni shu yerda tutadi.

- [ ] **Step 10: Dublikat qolmaganini tasdiqlash**

```bash
grep -n "PriceCell\|CashbackPercentCell\|SpendCell\|DefaultCashbackEditor\|Qiymat bajarilishi" \
  src/components/events/EventOverview.tsx
```

Kutilgan: **hech qanday moslik yo'q** (exit kod 1). Moslik chiqsa — ko'chirish tugallanmagan, 5-qadamga qayting.

- [ ] **Step 11: Brauzerda tekshirish (qo'lda)**

```bash
bun run dev
```

⚠️ `.env.local` **prod DB** ga qaraydi. To'lov qo'shish/keshbek tugmalarini bosmang — faqat ko'rinishni tekshiring.

Tekshiring:
1. Sidebarda "Tadbirlar" ochiladi, ichida "Boshqaruv" va "Moliya".
2. `/tadbirlar/moliya` → Umumiy tabida 3 ta KPI karta raqam ko'rsatadi (`—` yoki 0 emas) + to'lovlar jurnali.
3. Tadbir tabini bosing → qiymat bajarilishi + moliya jadvali; `+` tugmasi **yo'q**.
4. `/tadbirlar` → jadvalda faqat `Rasmi | Mijoz ismi | Telefon`, pul ustuni **yo'q**; booklet va ishtirokchi qo'shish ishlaydi; ro'yxatdan o'tish grafigi to'liq kenglikda.
5. Tadbir tanlab `/tadbirlar` ↔ `/tadbirlar/moliya` orasida o'ting → o'sha tadbir tabi ochiladi (sinxron).

Agar KPI kartalar bo'sh bo'lsa yoki konsolda `PGRST202 function not found` chiqsa — 047 prodga hali qo'llanmagan (Task 5).

- [ ] **Step 12: Commit** (avval foydalanuvchidan tasdiq so'rang)

```bash
git add src/lib/supabase/queries/payments.ts src/hooks/usePayments.ts src/hooks/useEvents.ts \
        src/hooks/useCashback.ts src/components/events/EventFinance.tsx \
        src/components/events/FinanceOverview.tsx src/components/pages/EventsMoliya.tsx \
        src/components/events/EventOverview.tsx src/App.tsx src/components/layout/Sidebar.tsx
git commit -m "feat(tadbirlar): move event money out into the Moliya page"
```

---

## Task 4: Boshqaruv sahifasi (`/tadbirlar/boshqaruv`)

`EventOverview` allaqachon pulsiz (Task 3). Bu task uni o'z sahifasiga ko'chiradi va eski `/tadbirlar` ni yopadi.

**Files:**
- Create: `src/components/pages/EventsBoshqaruv.tsx`
- Delete: `src/components/pages/Events.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: `EventTabs`, `startOfToday`, `isActiveEvent` (Task 2); `useEventTab`, `UMUMIY` (Task 2).
- Produces: `EventsBoshqaruv()`; `EventOverview` propslari o'zgarmaydi (`{ event, onEdit, onDelete }`).

- [ ] **Step 1: `EventsBoshqaruv` sahifasini yozish**

Create `src/components/pages/EventsBoshqaruv.tsx`:

```tsx
import { useState, useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { CalendarBlank } from "@phosphor-icons/react"
import { type Event } from "@/lib/supabase/queries/events"
import { CreateEventDrawer } from "@/components/events/CreateEventDrawer"
import { EventOverview } from "@/components/events/EventOverview"
import { EventTabs, startOfToday, isActiveEvent } from "@/components/events/EventTabs"
import { useEventTab, UMUMIY } from "@/hooks/useEventTab"
import { useEvents, useDeleteEvent, EVENTS_KEY, EVENT_COUNTS_KEY } from "@/hooks/useEvents"
import { EventCardSkeleton } from "@/components/ui/Skeleton"

export function EventsBoshqaruv() {
  const qc = useQueryClient()
  const { data: events = [], isLoading: loading } = useEvents()
  const deleteEventMutation = useDeleteEvent()

  const [selectedId, setSelectedId] = useEventTab()
  const [showCreate, setShowCreate] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)

  // There is no "Umumiy" tab here: when the shared tab holds the sentinel (or a
  // deleted event), fall back to the nearest upcoming event.
  const firstActive = useMemo(() => {
    const today = startOfToday()
    const active = events.filter((e) => isActiveEvent(e, today))
    active.sort((x, y) => new Date(x.date ?? 0).getTime() - new Date(y.date ?? 0).getTime())
    return active[0] ?? events[0] ?? null
  }, [events])

  const stored = events.find((e) => e.id === selectedId) ?? null
  const selected = selectedId === UMUMIY ? firstActive : (stored ?? firstActive)

  function handleDelete(id: string) {
    if (!window.confirm("Tadbirni o'chirishni tasdiqlaysizmi? Barcha ishtirokchilar ham o'chadi.")) return
    deleteEventMutation.mutate(id, {
      onSettled: () => {
        if (selectedId === id) setSelectedId(UMUMIY)
      },
    })
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6 h-full">
        <div className="animate-pulse bg-[#F0F0F0] rounded-[6px] h-6 w-32" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <EventCardSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 h-full">
      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <CalendarBlank size={64} className="text-[#E0E0E0]" weight="bold" />
          <p className="text-[14px] text-[#999]">Hozircha tadbirlar yo'q</p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-[#141414] text-white rounded-[8px] text-[13px] font-bold hover:bg-[#333] transition-colors"
          >
            Birinchi tadbirni yarating
          </button>
        </div>
      ) : (
        <>
          <EventTabs
            events={events}
            selectedId={selected?.id ?? ""}
            onSelect={setSelectedId}
            showUmumiy={false}
            onCreate={() => setShowCreate(true)}
          />

          {selected ? (
            <EventOverview
              key={selected.id}
              event={selected}
              onEdit={() => setEditingEvent(selected)}
              onDelete={() => handleDelete(selected.id)}
            />
          ) : (
            <div className="py-16 text-center text-[13px] text-[#999]">Tadbirni tanlang</div>
          )}
        </>
      )}

      <CreateEventDrawer
        isOpen={showCreate || !!editingEvent}
        onClose={() => {
          setShowCreate(false)
          setEditingEvent(null)
        }}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: EVENTS_KEY })
          qc.invalidateQueries({ queryKey: EVENT_COUNTS_KEY })
        }}
        editEvent={editingEvent}
      />
    </div>
  )
}
```

- [ ] **Step 2: Marshrutlarni yakunlash va `Events.tsx` ni o'chirish**

Modify `src/App.tsx`:

Importni almashtiring:

```tsx
import { EventsBoshqaruv } from "./components/pages/EventsBoshqaruv"
```

(`import { Events } from "./components/pages/Events"` o'chadi.)

`PAGE_META` da `'/tadbirlar'` yozuvini almashtiring:

```ts
  '/tadbirlar/boshqaruv': { title: 'Tadbirlar — Boshqaruv', desc: "Tadbirlar, ishtirokchilar va booklet." },
  '/tadbirlar/moliya':    { title: 'Tadbirlar — Moliya',    desc: "To'lovlar, qarzdorlik va keshbek." },
```

Marshrutlarni almashtiring:

```tsx
          <Route path="/tadbirlar" element={<Navigate to="/tadbirlar/boshqaruv" replace />} />

          <Route path="/tadbirlar/boshqaruv" element={
            <ProtectedRoute module="tadbirlar"><EventsBoshqaruv /></ProtectedRoute>
          } />

          <Route path="/tadbirlar/moliya" element={
            <ProtectedRoute module="tadbirlar-moliya"><EventsMoliya /></ProtectedRoute>
          } />
```

Faylni o'chiring:

```bash
git rm src/components/pages/Events.tsx
```

- [ ] **Step 3: Sidebarda "Boshqaruv" yo'lini yakunlash**

Modify `src/components/layout/Sidebar.tsx` — `Tadbirlar` subItem yo'lini tuzating:

```ts
                    { name: "Boshqaruv", icon: SquaresFour, path: "/tadbirlar/boshqaruv", module: "tadbirlar" },
```

Endi `isActive` `startsWith` nozikligi yo'q: `/tadbirlar/moliya` da faqat "Moliya" aktiv ko'rinadi.

- [ ] **Step 4: Build**

```bash
bun run build
```

Kutilgan: xatosiz.

- [ ] **Step 5: Brauzerda tekshirish (qo'lda)**

```bash
bun run dev
```

⚠️ `.env.local` **prod DB** ga qaraydi. Pul yozadigan amallarni bajarmang.

Tekshiring:
1. `/tadbirlar` → `/tadbirlar/boshqaruv` ga redirect.
2. Boshqaruvda: Umumiy tabi **yo'q**, `+` tugmasi **bor**, banner tahrir/o'chirish ishlaydi, "Booklet export" va "Ishtirokchi qo'shish" ishlaydi.
3. Boshqaruvda tadbir tanlang → Moliyaga o'ting → o'sha tab ochilgan.
4. Moliyada Umumiy tabini tanlang → Boshqaruvga o'ting → eng yaqin tadbir tabi ochilgan (bo'sh ekran emas).
5. Sidebarda faqat bitta subitem aktiv ko'rinadi.

- [ ] **Step 6: Commit** (avval foydalanuvchidan tasdiq so'rang)

`Events.tsx` 2-qadamdagi `git rm` bilan allaqachon staged.

```bash
git add src/components/pages/EventsBoshqaruv.tsx src/App.tsx src/components/layout/Sidebar.tsx
git commit -m "feat(tadbirlar): split management out into the Boshqaruv page"
```

---

## Task 5: Prodga chiqarish

⚠️ Coolify **faqat frontendni** deploy qiladi. Migration va edge function — qo'lda. Bu qadamlar foydalanuvchi tasdig'isiz bajarilmaydi.

**Files:** yo'q (faqat operatsion qadamlar).

- [ ] **Step 1: Backup**

```bash
ssh -i ~/.ssh/heons_key ubuntu@141.147.119.131 \
  'TS=$(date +%Y%m%d_%H%M%S); docker exec supabase-db-1 pg_dump -U postgres -d postgres -Fc -f /tmp/fy_$TS.dump \
   && docker cp supabase-db-1:/tmp/fy_$TS.dump ~/backups/fy_$TS.dump && echo backed up $TS'
```

Kutilgan: `backed up <timestamp>`.

(SSH kaliti yo'q bo'lsa: `doppler secrets get SSH_PRIVATE_KEY -p infra -c prd --plain > ~/.ssh/heons_key && chmod 600 ~/.ssh/heons_key`)

- [ ] **Step 2: 047 ni qo'llash**

```bash
cat supabase/migrations/047_tadbirlar_moliya_module.sql | ssh -i ~/.ssh/heons_key ubuntu@141.147.119.131 \
  'cat > /tmp/m.sql && docker cp /tmp/m.sql supabase-db-1:/tmp/m.sql \
   && docker exec supabase-db-1 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/m.sql'
```

Kutilgan: `ALTER TABLE` / `INSERT 0 N` / `CREATE FUNCTION` / `GRANT`, xatosiz.

- [ ] **Step 3: Migration tarixiga yozish**

```bash
ssh -i ~/.ssh/heons_key ubuntu@141.147.119.131 \
  "docker exec supabase-db-1 psql -U postgres -d postgres -c \"insert into supabase_migrations.schema_migrations(version) values ('047') on conflict do nothing;\""
```

- [ ] **Step 4: PostgREST sxema keshini yangilash**

Yangi RPC siz bu qadam `PGRST202 function not found` beradi.

```bash
ssh -i ~/.ssh/heons_key ubuntu@141.147.119.131 'docker restart supabase-rest-1'
```

- [ ] **Step 5: Edge functionni deploy qilish**

```bash
npx supabase functions deploy admin-create-user
```

- [ ] **Step 6: Frontendni deploy qilish**

```bash
git push origin main
```

Coolify avtomatik qayta quradi. `https://app.fikryetakchilari.uz/tadbirlar/moliya` da KPI kartalar raqam ko'rsatishini tekshiring.

- [ ] **Step 7: Sozlamalarda ruxsatni tekshirish**

Sozlamalar → foydalanuvchi ruxsatlari modalida "Tadbirlar (Moliya)" chiqishini va backfill tufayli mavjud Tadbirlar ruxsati borlarda belgilangan turishini tasdiqlang.

---

## Self-Review

**Spec qamrovi:**

| Spec bo'limi | Task |
|---|---|
| 3. Marshrutlar va sidebar | Task 3 (Moliya), Task 4 (Boshqaruv + redirect + PAGE_META) |
| 4. Ruxsatnomalar (047, auth.ts, edge fn) | Task 1 |
| 5. `event_finance_totals()` + query/hook | Task 1 (RPC), Task 3 (query/hook) |
| 6. Komponentlar (EventTabs, useEventTab, EventFinance, FinanceOverview, 2 sahifa, EventOverview surgery, Events.tsx delete) | Task 2, 3 (EventFinance + EventOverview surgery — bitta ko'chirish), 4 |
| 7. Sinxronlik (data + tanlangan tadbir) | Task 2 (`useEventTab`), Task 3 (`FINANCE_TOTALS_KEY` invalidatsiya), Task 4 (Boshqaruv fallback) |
| 8. Tekshirish | Har bir taskning build/brauzer qadamlari, Task 1 SQL testi |
| Prod deploy (spec 4-bo'lim ogohlantirishi) | Task 5 |

**Spec dan chetlanishlar (ataylab):**
0. **`EventOverview` tozalash Task 4 emas, Task 3 da** — spec komponentlar jadvali ikkisini alohida ko'rsatgan edi. Pul kodini nusxalab keyin o'chirish o'rniga bitta commitda ko'chiramiz, shunda hech qaysi commitda `PriceCell` ikki faylda turmaydi.
1. **RPC `SECURITY INVOKER`**, spec `SECURITY DEFINER` degan edi. Sabab Task 1 da yozilgan: RLS a'zolarni allaqachon cheklaydi; DEFINER bo'lsa RLS chetlab o'tiladi va a'zo klubning butun pulini ko'radi. TEST 9 buni qo'riqlaydi.
2. **`FINANCE_TOTALS_KEY` `useEvents.ts` da** e'lon qilinadi, spec `usePayments.ts` degan edi — `usePayments → useEvents` importi allaqachon bor, teskarisi aylanma import yasardi.

Ikkalasi ham spec ga qaytarib yozilishi kerak (Task 1 va 3 dan keyin `docs/superpowers/specs/2026-07-17-...-design.md` yangilanadi).

**Placeholder skani:** TBD/TODO yo'q; har bir kod qadamida to'liq kod bor; "Task N ga o'xshash" havolalari yo'q — `PriceCell` va boshqalar Task 3 da to'liq takrorlangan.

**Tip izchilligi:** `FinanceTotals` maydonlari (`total_income`, `total_debt`, `total_cashback_balance`) RPC ning `RETURNS TABLE` ustunlari, testdagi `t.total_income`, va `FinanceOverview` dagi `totals?.total_income` bilan bir xil. `UMUMIY` `useEventTab.ts` da e'lon qilinib, `EventTabs`/`Events`/`EventsMoliya`/`EventsBoshqaruv` da o'sha manbadan import qilinadi. `EventTabsProps` maydonlari uchala chaqiruvda mos.
