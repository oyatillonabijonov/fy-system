# O'z platformamiz bo'yicha Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dashboard (`/`, `dashboard` moduli) AmoCRM o'rniga o'z Sotuv bo'limimiz, sotuvchilar faoliyati, qo'ng'iroqlar va qisqa moliyani C tartibda (chap oqim + o'ng doimiy ustun) ko'rsatadi; AmoCRM sinxronizatsiyasi to'xtaydi.

**Architecture:** Bitta `SECURITY DEFINER` SQL funksiya `sales_dashboard(p_from, p_to, p_pipeline)` butun sahifa uchun JSON qaytaradi (hamma raqam bazada). Moliya bloki mavjud `finance_summary()` (useFinanceSummary) va tadbirlar hook'laridan, faqat `tadbirlar-moliya` ruxsatida. amo-sync'dan AmoCRM qismi olib tashlanadi, keshbek ishlari o'sha siklda qoladi.

**Tech Stack:** Postgres 15 (prod) / 17 (test stand), plpgsql; React 19 + TanStack Query 5 + Tailwind 4 Plexus tokenlari + recharts + Phosphor; Bun (amo-sync).

**Spec:** `docs/superpowers/specs/2026-10-03-own-dashboard-design.md`

## Global Constraints

- Hamma statistik raqam SQL'da hisoblanadi, brauzerda yig'ilmaydi (CLAUDE.md "numbers come from the DB").
- Davr — Asia/Tashkent kunlari; `[p_from 00:00, p_to+1 00:00)`; oldingi davr — shuncha kun oldin.
- Funksiya faqat `has_permission(auth.uid(), 'dashboard')` bo'lsa ishlaydi; aks holda `insufficient_privilege`.
- Moliya bloki faqat `hasAccess("tadbirlar-moliya")` bo'lsa render qilinadi va so'rov yuboriladi.
- UI: Plexus utility'lari (`bg-surface-sunken`, `text-ink-muted`, `border-line`, `rounded-surface`…), soyasiz, tugmalar `rounded-full`, DM Sans ≤600, Phosphor (16px regular, ≤12px bold), jadval `tbl`, hex yo'q (bosqich rangi — ma'lumot rangi, ruxsat).
- Hamma UI matni o'zbekcha.
- Strict TypeScript, `any` yo'q; `import type`; bun.
- Mavjud migratsiya fayllari o'zgartirilmaydi; yangi — `080_sales_dashboard.sql`.
- `window.confirm/prompt` ishlatilmaydi.

## Review Focus

1. **Bo'sh davr / bo'sh baza** (hozir `payments` = 0, bitimlar 15 ta) → hamma raqam 0, konversiya `null` → "—", ro'yxatlarda "Hozircha yo'q", grafik bo'sh kunlar 0 bilan; xato bermasligi kerak. → Task 1 TEST 6 (bo'sh davr), Task 3 `Empty` holatlari.
2. **Voronka tanlanganda** bitimsiz qo'ng'iroqlar sanalmasligi, boshqa voronka bitimlari kirmasligi. → Task 1 TEST 4.
3. **Ruxsatsiz foydalanuvchi** (dashboard yo'q) funksiyani chaqirsa rad etilishi; dashboard bor, `sotuv-crmn` yo'q foydalanuvchi baribir raqamlarni ko'rishi. → Task 1 TEST 1–2.
4. **Qayta qo'ng'iroq** faqat javobsizdan KEYINGI chiquvchi qo'ng'iroq bilan sanalishi (oldingisi emas). → Task 1 TEST 5.
5. **Profil o'chirilgan / nofaol sotuvchi** ro'yxatda chiqmasligi, `responsible_user_id` NULL bitimlar sotuvchilar jadvalini buzmasligi. → Task 1 TEST 3 (NULL mas'ul bitim fixture).

---

## Fayl tuzilishi

| Fayl | Vazifa |
|---|---|
| `supabase/migrations/080_sales_dashboard.sql` | Yangi: `sales_dashboard()` |
| `supabase/tests/080_sales_dashboard_test.sql` | Yangi: xulq testlari |
| `src/lib/supabase/queries/salesDashboard.ts` | Yangi: tiplar, `getSalesDashboard`, `getSellerTasks` |
| `src/hooks/useSalesDashboard.ts` | Yangi: `SALES_DASHBOARD_KEY`, `useSalesDashboard`, `useSellerTasks` |
| `src/components/dashboard/pieces.tsx` | Yangi: Section, Card, Empty, DeltaBadge, KpiCard, CountList, Funnel, DailyChart, `delta()` (Dashboard.tsx'dan ko'chiriladi/moslanadi) |
| `src/components/dashboard/SellersTable.tsx` | Yangi: sotuvchilar jadvali + qator ochilganda vazifalar |
| `src/components/dashboard/CallsCard.tsx` | Yangi: qo'ng'iroqlar bloki |
| `src/components/dashboard/AttentionPanel.tsx` | Yangi: E'tibor talab qiladi |
| `src/components/dashboard/FinancePanel.tsx` | Yangi: qisqa moliya + yaqin tadbirlar |
| `src/components/pages/Dashboard.tsx` | Qayta yoziladi: boshqaruv + C tartib |
| `src/components/layout/LiveSync.tsx` | `TOUCHES` ga `"sales-dashboard"` |
| `src/lib/supabase/queries/amoDashboard.ts`, `src/hooks/useAmoDashboard.ts` | O'chiriladi |
| `amo-sync/src/index.ts` | AmoCRM sinxronizatsiyasi olib tashlanadi |
| `amo-sync/src/intake.ts` | `/hooks/health` dan `amocrm` olib tashlanadi |
| `CLAUDE.md` | Dashboard, amo-sync, env bo'limlari yangilanadi |

---

### Task 1: `sales_dashboard()` funksiyasi + SQL test

**Files:**
- Create: `supabase/tests/080_sales_dashboard_test.sql`
- Create: `supabase/migrations/080_sales_dashboard.sql`

**Interfaces:**
- Produces: `public.sales_dashboard(p_from date, p_to date, p_pipeline uuid DEFAULT NULL) RETURNS jsonb` — JSON kalitlari aynan: `pipelines, kpi, kpi_prev, funnel, by_source, by_pipeline, daily, sellers, calls, attention{overdue_tasks, stale_leads, missed_unanswered}` (shakli Task 2 tiplarida).

- [ ] **Step 1: Testni yozish**

`supabase/tests/080_sales_dashboard_test.sql`:

```sql
-- Behavioural tests for migration 080 (sales_dashboard). THROWAWAY DB only (recipe: CLAUDE.md §5).
\set ON_ERROR_STOP on

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('78000000-0000-0000-0000-000000000001', 's78@fy.uz', '{"full_name":"Sotuvchi78","role":"xodim"}'::jsonb),
  ('78000000-0000-0000-0000-000000000002', 'x78@fy.uz', '{"full_name":"Begona78","role":"xodim"}'::jsonb);
-- Dashboard bor, sotuv-crmn YO'Q: funksiya baribir ishlashi kerak (DEFINER)
INSERT INTO public.user_permissions (user_id, module, can_view) VALUES ('78000000-0000-0000-0000-000000000001', 'dashboard', true);

INSERT INTO public.crm_pipelines (id, name, sort_order) VALUES ('a7800000-0000-0000-0000-000000000002', 'P2-78', 50);
INSERT INTO public.crm_stages (id, pipeline_id, name, color, sort_order) VALUES
  ('b7800000-0000-0000-0000-000000000009', 'a7800000-0000-0000-0000-000000000002', 'Ochiq78', '#378ADD', 0);

-- Fixtures with explicit times: triggers off so created_at/closed_at/done_at stay as written
SET session_replication_role = replica;
WITH u AS (SELECT id FROM public.crm_pipelines WHERE name = 'Umumiy'),
     st AS (SELECT name, id FROM public.crm_stages WHERE pipeline_id = (SELECT id FROM u))
INSERT INTO public.crm_leads (id, name, pipeline_id, stage_id, price, responsible_user_id, is_won, is_lost, created_at, closed_at, stage_changed_at, source)
SELECT v.id, v.name, (SELECT id FROM u), (SELECT id FROM st WHERE st.name = v.stage), v.price, v.resp, v.won, v.lost, v.created, v.closed, v.changed, v.src
FROM (VALUES
  ('d7800000-0000-0000-0000-000000000000'::uuid, 'L0-prev', 'Yutildi', 500,  '78000000-0000-0000-0000-000000000001'::uuid, true,  false, '2026-01-08 10:00+05'::timestamptz, '2026-01-08 12:00+05'::timestamptz, '2026-01-08 12:00+05'::timestamptz, 'call'),
  ('d7800000-0000-0000-0000-000000000001'::uuid, 'L1-won',  'Yutildi', 1000, '78000000-0000-0000-0000-000000000001'::uuid, true,  false, '2026-01-10 10:00+05', '2026-01-11 10:00+05', '2026-01-11 10:00+05', 'call'),
  ('d7800000-0000-0000-0000-000000000002'::uuid, 'L2-lost', 'Yutqazildi', 0, '78000000-0000-0000-0000-000000000001'::uuid, false, true,  '2026-01-11 10:00+05', '2026-01-12 10:00+05', '2026-01-12 10:00+05', 'sayt'),
  ('d7800000-0000-0000-0000-000000000003'::uuid, 'L3-stale','Yangi',   0,    '78000000-0000-0000-0000-000000000001'::uuid, false, false, '2026-01-12 10:00+05', NULL, now() - interval '20 days', 'sayt'),
  ('d7800000-0000-0000-0000-000000000004'::uuid, 'L4-nores','Yangi',   0,    NULL,                                          false, false, '2026-01-12 11:00+05', NULL, now(), NULL)
) AS v(id, name, stage, price, resp, won, lost, created, closed, changed, src);
INSERT INTO public.crm_leads (id, name, pipeline_id, stage_id, price, is_won, is_lost, created_at, stage_changed_at)
VALUES ('d7800000-0000-0000-0000-000000000005', 'L5-p2', 'a7800000-0000-0000-0000-000000000002', 'b7800000-0000-0000-0000-000000000009', 0, false, false, '2026-01-11 09:00+05', now());

INSERT INTO public.crm_tasks (id, lead_id, text, kind, due_date, is_done, done_at, assignee_id) VALUES
  ('e7800000-0000-0000-0000-000000000001', 'd7800000-0000-0000-0000-000000000001', 'vaqtida', 'call', '2026-01-11 12:00+05', true,  '2026-01-11 10:00+05', '78000000-0000-0000-0000-000000000001'),
  ('e7800000-0000-0000-0000-000000000002', 'd7800000-0000-0000-0000-000000000001', 'kech',    'call', '2026-01-10 12:00+05', true,  '2026-01-11 11:00+05', '78000000-0000-0000-0000-000000000001'),
  ('e7800000-0000-0000-0000-000000000003', 'd7800000-0000-0000-0000-000000000003', 'ochiq',   'call', now() - interval '1 day', false, NULL,           '78000000-0000-0000-0000-000000000001');

INSERT INTO public.crm_calls (uuid, direction, phone, staff_id, lead_id, started_at, duration, talk_time) VALUES
  ('c78-1', 'in',  '+998900000781', '78000000-0000-0000-0000-000000000001', 'd7800000-0000-0000-0000-000000000001', '2026-01-10 09:00+05', 20, 0),
  ('c78-2', 'out', '+998900000781', '78000000-0000-0000-0000-000000000001', 'd7800000-0000-0000-0000-000000000001', '2026-01-10 10:00+05', 70, 60),
  ('c78-0', 'out', '+998900000782', '78000000-0000-0000-0000-000000000001', 'd7800000-0000-0000-0000-000000000002', '2026-01-11 08:00+05', 10, 0),
  ('c78-3', 'in',  '+998900000782', '78000000-0000-0000-0000-000000000001', 'd7800000-0000-0000-0000-000000000002', '2026-01-11 09:00+05', 15, 0),
  ('c78-4', 'in',  '+998900000783', NULL, NULL, '2026-01-11 10:00+05', 30, 25),
  ('c78-5', 'in',  '+998900000784', NULL, NULL, now() - interval '1 hour', 10, 0);
SET session_replication_role = origin;

GRANT USAGE ON SCHEMA public TO authenticated;
SET ROLE authenticated;

-- TEST 1: no dashboard permission → refused
SELECT set_config('request.jwt.claim.sub', '78000000-0000-0000-0000-000000000002', false);
DO $$ BEGIN
  BEGIN
    PERFORM public.sales_dashboard('2026-01-10', '2026-01-12');
    RAISE EXCEPTION 'TEST 1 FAILED: outsider read the dashboard';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'TEST 1 ok: guarded';
END $$;

SELECT set_config('request.jwt.claim.sub', '78000000-0000-0000-0000-000000000001', false);

-- TEST 2: KPIs, previous period, daily (dashboard user WITHOUT sotuv-crmn still sees numbers)
DO $$ DECLARE d jsonb := public.sales_dashboard('2026-01-10', '2026-01-12'); BEGIN
  IF (d->'kpi'->>'new')::int <> 5 THEN RAISE EXCEPTION 'TEST 2 FAILED: new = % (want 5)', d->'kpi'->>'new'; END IF;
  IF (d->'kpi'->>'won')::int <> 1 OR (d->'kpi'->>'lost')::int <> 1 THEN RAISE EXCEPTION 'TEST 2 FAILED: won/lost %', d->'kpi'; END IF;
  IF (d->'kpi'->>'conversion')::numeric <> 50.0 THEN RAISE EXCEPTION 'TEST 2 FAILED: conversion %', d->'kpi'->>'conversion'; END IF;
  IF (d->'kpi'->>'won_sum')::numeric <> 1000 THEN RAISE EXCEPTION 'TEST 2 FAILED: won_sum %', d->'kpi'->>'won_sum'; END IF;
  IF (d->'kpi_prev'->>'new')::int <> 1 OR (d->'kpi_prev'->>'won')::int <> 1 THEN RAISE EXCEPTION 'TEST 2 FAILED: prev %', d->'kpi_prev'; END IF;
  IF jsonb_array_length(d->'daily') <> 3 THEN RAISE EXCEPTION 'TEST 2 FAILED: daily length %', jsonb_array_length(d->'daily'); END IF;
  IF (d->'daily'->0->>'day') <> '2026-01-10' OR (d->'daily'->0->>'new')::int <> 1 THEN RAISE EXCEPTION 'TEST 2 FAILED: daily[0] %', d->'daily'->0; END IF;
  IF (d->'daily'->1->>'won')::int <> 1 THEN RAISE EXCEPTION 'TEST 2 FAILED: daily[1] %', d->'daily'->1; END IF;
  RAISE NOTICE 'TEST 2 ok: kpi';
END $$;

-- TEST 3: seller row — tasks on time / late / overdue, calls; a NULL-owner bitim doesn't add a row
DO $$ DECLARE d jsonb := public.sales_dashboard('2026-01-10', '2026-01-12'); s jsonb; BEGIN
  IF jsonb_array_length(d->'sellers') <> 1 THEN RAISE EXCEPTION 'TEST 3 FAILED: sellers %', d->'sellers'; END IF;
  s := d->'sellers'->0;
  IF s->>'full_name' <> 'Sotuvchi78' THEN RAISE EXCEPTION 'TEST 3 FAILED: name %', s->>'full_name'; END IF;
  IF (s->>'tasks_done')::int <> 2 OR (s->>'tasks_on_time')::int <> 1 OR (s->>'tasks_overdue_open')::int <> 1 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: tasks %', s; END IF;
  IF (s->>'won')::int <> 1 OR (s->>'lost')::int <> 1 OR (s->>'conversion')::numeric <> 50.0 OR (s->>'open')::int <> 1 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: deals %', s; END IF;
  IF (s->>'calls_in')::int <> 2 OR (s->>'calls_out')::int <> 2 OR (s->>'calls_missed')::int <> 2 OR (s->>'talk_sec')::int <> 60 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: calls %', s; END IF;
  RAISE NOTICE 'TEST 3 ok: seller';
END $$;

-- TEST 4: pipeline filter — only Umumiy bitimlar; calls without a bitim drop out
DO $$ DECLARE d jsonb := public.sales_dashboard('2026-01-10', '2026-01-12', (SELECT id FROM public.crm_pipelines WHERE name = 'Umumiy')); BEGIN
  IF (d->'kpi'->>'new')::int <> 4 THEN RAISE EXCEPTION 'TEST 4 FAILED: new %', d->'kpi'->>'new'; END IF;
  IF (d->'calls'->>'in')::int <> 2 THEN RAISE EXCEPTION 'TEST 4 FAILED: calls.in % (bitimsiz kirdi)', d->'calls'->>'in'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(d->'funnel') f WHERE f->>'pipeline' = 'P2-78') THEN RAISE EXCEPTION 'TEST 4 FAILED: P2 in funnel'; END IF;
  RAISE NOTICE 'TEST 4 ok: pipeline filter';
END $$;

-- TEST 5: calls — called back only by a LATER outgoing call; attention lists
DO $$ DECLARE d jsonb := public.sales_dashboard('2026-01-10', '2026-01-12'); BEGIN
  IF (d->'calls'->>'in')::int <> 3 OR (d->'calls'->>'out')::int <> 2 OR (d->'calls'->>'missed')::int <> 2 THEN RAISE EXCEPTION 'TEST 5 FAILED: calls %', d->'calls'; END IF;
  IF (d->'calls'->>'missed_total')::int <> 2 OR (d->'calls'->>'missed_called_back')::int <> 1 THEN RAISE EXCEPTION 'TEST 5 FAILED: callback %', d->'calls'; END IF;
  IF (d->'calls'->>'avg_talk_sec')::int <> 43 THEN RAISE EXCEPTION 'TEST 5 FAILED: avg %', d->'calls'->>'avg_talk_sec'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d->'attention'->'overdue_tasks') t WHERE t->>'text' = 'ochiq') THEN RAISE EXCEPTION 'TEST 5 FAILED: overdue'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d->'attention'->'stale_leads') t WHERE t->>'name' = 'L3-stale') THEN RAISE EXCEPTION 'TEST 5 FAILED: stale'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(d->'attention'->'stale_leads') t WHERE t->>'name' = 'L4-nores') THEN RAISE EXCEPTION 'TEST 5 FAILED: fresh lead stale'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(d->'attention'->'missed_unanswered')) <> 1
     OR d->'attention'->'missed_unanswered'->0->>'phone' <> '+998900000784' THEN RAISE EXCEPTION 'TEST 5 FAILED: missed %', d->'attention'->'missed_unanswered'; END IF;
  RAISE NOTICE 'TEST 5 ok: calls + attention';
END $$;

-- TEST 6: empty period → zeros, null conversion, no error
DO $$ DECLARE d jsonb := public.sales_dashboard('2025-03-01', '2025-03-02'); BEGIN
  IF (d->'kpi'->>'new')::int <> 0 OR d->'kpi'->'conversion' <> 'null'::jsonb THEN RAISE EXCEPTION 'TEST 6 FAILED: %', d->'kpi'; END IF;
  IF jsonb_array_length(d->'daily') <> 2 OR (d->'calls'->>'in')::int <> 0 THEN RAISE EXCEPTION 'TEST 6 FAILED: daily/calls'; END IF;
  RAISE NOTICE 'TEST 6 ok: empty period';
END $$;
RESET ROLE;
```

Hisob (fixture'dan): davrda yaratilgan L1–L5 = 5 (Hammasi), Umumiy'da 4; yutilgan L1 (1000), yutqazilgan L2 → konversiya 50.0; oldingi davr (01-07…09) L0 yangi 1, yutilgan 1. Vazifalar: e1 (done ≤ due) vaqtida, e2 kech, e3 ochiq va muddati o'tgan. Qo'ng'iroqlar davrda: c78-1/c78-3/c78-4 kiruvchi = 3, c78-2/c78-0 chiquvchi = 2, javobsiz c78-1, c78-3 = 2; c78-1 dan KEYIN c78-2 bor → qaytarilgan 1; c78-3 dan oldin c78-0 bor, keyin yo'q → qaytarilmagan. O'rtacha (talk>0): (60+25)/2 = 42.5 → round = 43. Sotuvchi: kiruvchi c78-1,c78-3 = 2, chiquvchi 2, javobsiz 2, gaplashgan 60. `missed_unanswered` (oxirgi 14 kun): faqat c78-5.

- [ ] **Step 2: Stand'da testni migratsiyasiz ishga tushirish — qizil bo'lishi kerak**

```bash
docker rm -f fy-test >/dev/null 2>&1; docker run -d --name fy-test -e POSTGRES_PASSWORD=postgres public.ecr.aws/supabase/postgres:17.6.1.106
for i in $(seq 1 60); do docker logs fy-test 2>&1 | grep -q "init process complete" && break; sleep 2; done; sleep 3
docker exec -i fy-test psql -U postgres -d postgres -q <<'SQL'
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY);
SQL
for f in supabase/migrations/*.sql; do [ "$(basename $f)" = 080_sales_dashboard.sql ] && continue; docker cp "$f" fy-test:/tmp/m.sql; docker exec fy-test psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 -f /tmp/m.sql >/dev/null 2>&1 || echo "fail $(basename $f)"; done
docker cp supabase/tests/080_sales_dashboard_test.sql fy-test:/tmp/t.sql
docker exec fy-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql 2>&1 | grep -E "TEST|ERROR"
```

Expected: odatdagi storage migratsiyalari (013/014/016/019/021/025/029/042/048) "fail"; test `ERROR: function public.sales_dashboard(unknown, unknown) does not exist`.

- [ ] **Step 3: Migratsiyani yozish**

`supabase/migrations/080_sales_dashboard.sql`:

```sql
-- 078: the Dashboard reads our own Sotuv bo'limi instead of AmoCRM (amo_* stays as an archive).
-- One call returns the whole page: KPIs (+ the previous equal period), open funnel, sources,
-- voronkalar, daily, sellers (deals, tasks on time / overdue, calls), calls and the
-- "E'tibor talab qiladi" lists. Days are Asia/Tashkent. SECURITY DEFINER behind the dashboard
-- module: a Dashboard viewer without the Sotuv module still sees the numbers (aggregates only).

CREATE OR REPLACE FUNCTION public.sales_dashboard(p_from date, p_to date, p_pipeline uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  t0 timestamptz; t1 timestamptz; p0 timestamptz; r jsonb;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'dashboard') THEN
    RAISE EXCEPTION 'Dashboard''ga ruxsat yo''q' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'Davr noto''g''ri' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  t0 := p_from::timestamp AT TIME ZONE 'Asia/Tashkent';
  t1 := (p_to + 1)::timestamp AT TIME ZONE 'Asia/Tashkent';
  p0 := (p_from - (p_to - p_from + 1))::timestamp AT TIME ZONE 'Asia/Tashkent';

  WITH l AS (
    SELECT * FROM public.crm_leads WHERE p_pipeline IS NULL OR pipeline_id = p_pipeline
  ), tk AS (
    SELECT t.* FROM public.crm_tasks t JOIN l ON l.id = t.lead_id
  ), c AS (
    SELECT * FROM public.crm_calls
    WHERE started_at >= t0 AND started_at < t1 AND (p_pipeline IS NULL OR lead_id IN (SELECT id FROM l))
  ), missed AS (
    SELECT m.*, EXISTS (SELECT 1 FROM public.crm_calls o
                        WHERE o.direction = 'out' AND o.phone = m.phone AND o.started_at > m.started_at) AS called_back
    FROM c m WHERE m.direction = 'in' AND m.talk_time = 0
  ), k AS (
    SELECT
      count(*) FILTER (WHERE created_at >= t0 AND created_at < t1) AS new,
      count(*) FILTER (WHERE is_won AND closed_at >= t0 AND closed_at < t1) AS won,
      count(*) FILTER (WHERE is_lost AND closed_at >= t0 AND closed_at < t1) AS lost,
      COALESCE(sum(price) FILTER (WHERE is_won AND closed_at >= t0 AND closed_at < t1), 0) AS won_sum,
      count(*) FILTER (WHERE created_at >= p0 AND created_at < t0) AS p_new,
      count(*) FILTER (WHERE is_won AND closed_at >= p0 AND closed_at < t0) AS p_won,
      count(*) FILTER (WHERE is_lost AND closed_at >= p0 AND closed_at < t0) AS p_lost,
      COALESCE(sum(price) FILTER (WHERE is_won AND closed_at >= p0 AND closed_at < t0), 0) AS p_won_sum
    FROM l
  ), seller_ids AS (
    SELECT responsible_user_id AS id FROM l
    WHERE responsible_user_id IS NOT NULL
      AND ((NOT is_won AND NOT is_lost) OR (created_at >= t0 AND created_at < t1) OR (closed_at >= t0 AND closed_at < t1))
    UNION SELECT assignee_id FROM tk
    WHERE assignee_id IS NOT NULL AND ((done_at >= t0 AND done_at < t1) OR (NOT is_done AND due_date < now()))
    UNION SELECT staff_id FROM c WHERE staff_id IS NOT NULL
  )
  SELECT jsonb_build_object(
    'pipelines', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name) ORDER BY sort_order, name), '[]'::jsonb)
                  FROM public.crm_pipelines),
    'kpi', (SELECT jsonb_build_object('new', new, 'won', won, 'lost', lost, 'won_sum', won_sum,
              'conversion', CASE WHEN won + lost > 0 THEN round(won * 100.0 / (won + lost), 1) END) FROM k),
    'kpi_prev', (SELECT jsonb_build_object('new', p_new, 'won', p_won, 'lost', p_lost, 'won_sum', p_won_sum,
              'conversion', CASE WHEN p_won + p_lost > 0 THEN round(p_won * 100.0 / (p_won + p_lost), 1) END) FROM k),
    'funnel', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                  'pipeline', p.name, 'stage_id', s.id, 'name', s.name, 'color', s.color,
                  'open', (SELECT count(*) FROM l WHERE l.stage_id = s.id AND NOT l.is_won AND NOT l.is_lost),
                  'open_sum', (SELECT COALESCE(sum(price), 0) FROM l WHERE l.stage_id = s.id AND NOT l.is_won AND NOT l.is_lost))
                ORDER BY p.sort_order, p.name, s.sort_order), '[]'::jsonb)
               FROM public.crm_stages s JOIN public.crm_pipelines p ON p.id = s.pipeline_id
               WHERE NOT s.is_won AND NOT s.is_lost AND (p_pipeline IS NULL OR s.pipeline_id = p_pipeline)),
    'by_source', (SELECT COALESCE(jsonb_agg(jsonb_build_object('source', source, 'new', n, 'won', w) ORDER BY n DESC, w DESC), '[]'::jsonb)
                  FROM (SELECT source,
                               count(*) FILTER (WHERE created_at >= t0 AND created_at < t1) AS n,
                               count(*) FILTER (WHERE is_won AND closed_at >= t0 AND closed_at < t1) AS w
                        FROM l GROUP BY source) x WHERE n + w > 0),
    'by_pipeline', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'new', x.n, 'won', x.w) ORDER BY x.n DESC), '[]'::jsonb)
                    FROM (SELECT pipeline_id,
                                 count(*) FILTER (WHERE created_at >= t0 AND created_at < t1) AS n,
                                 count(*) FILTER (WHERE is_won AND closed_at >= t0 AND closed_at < t1) AS w
                          FROM l GROUP BY pipeline_id) x JOIN public.crm_pipelines p ON p.id = x.pipeline_id WHERE x.n + x.w > 0),
    'daily', (SELECT jsonb_agg(jsonb_build_object(
                'day', d::date,
                'new', (SELECT count(*) FROM l WHERE (l.created_at AT TIME ZONE 'Asia/Tashkent')::date = d::date),
                'won', (SELECT count(*) FROM l WHERE l.is_won AND (l.closed_at AT TIME ZONE 'Asia/Tashkent')::date = d::date)
              ) ORDER BY d)
              FROM generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d),
    'sellers', (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.won DESC, s.tasks_done DESC, s.full_name), '[]'::jsonb)
                FROM (SELECT x.*, CASE WHEN x.won + x.lost > 0 THEN round(x.won * 100.0 / (x.won + x.lost), 1) END AS conversion
                      FROM (SELECT pr.id, pr.full_name, pr.avatar_url,
                              (SELECT count(*) FROM l WHERE l.responsible_user_id = pr.id AND NOT l.is_won AND NOT l.is_lost) AS open,
                              (SELECT count(*) FROM l WHERE l.responsible_user_id = pr.id AND l.created_at >= t0 AND l.created_at < t1) AS new,
                              (SELECT count(*) FROM l WHERE l.responsible_user_id = pr.id AND l.is_won AND l.closed_at >= t0 AND l.closed_at < t1) AS won,
                              (SELECT count(*) FROM l WHERE l.responsible_user_id = pr.id AND l.is_lost AND l.closed_at >= t0 AND l.closed_at < t1) AS lost,
                              (SELECT COALESCE(sum(price), 0) FROM l WHERE l.responsible_user_id = pr.id AND l.is_won AND l.closed_at >= t0 AND l.closed_at < t1) AS won_sum,
                              (SELECT count(*) FROM tk WHERE tk.assignee_id = pr.id AND tk.done_at >= t0 AND tk.done_at < t1) AS tasks_done,
                              (SELECT count(*) FROM tk WHERE tk.assignee_id = pr.id AND tk.done_at >= t0 AND tk.done_at < t1 AND tk.done_at <= tk.due_date) AS tasks_on_time,
                              (SELECT count(*) FROM tk WHERE tk.assignee_id = pr.id AND NOT tk.is_done AND tk.due_date < now()) AS tasks_overdue_open,
                              (SELECT count(*) FROM c WHERE c.staff_id = pr.id AND c.direction = 'in') AS calls_in,
                              (SELECT count(*) FROM c WHERE c.staff_id = pr.id AND c.direction = 'out') AS calls_out,
                              (SELECT count(*) FROM c WHERE c.staff_id = pr.id AND c.direction = 'in' AND c.talk_time = 0) AS calls_missed,
                              (SELECT COALESCE(sum(talk_time), 0) FROM c WHERE c.staff_id = pr.id) AS talk_sec
                            FROM public.profiles pr
                            WHERE pr.id IN (SELECT id FROM seller_ids) AND pr.is_active) x) s),
    'calls', (SELECT jsonb_build_object(
                'in', count(*) FILTER (WHERE direction = 'in'),
                'out', count(*) FILTER (WHERE direction = 'out'),
                'missed', count(*) FILTER (WHERE direction = 'in' AND talk_time = 0),
                'talk_sec', COALESCE(sum(talk_time), 0),
                'avg_talk_sec', COALESCE(round(avg(talk_time) FILTER (WHERE talk_time > 0)), 0),
                'missed_total', (SELECT count(*) FROM missed),
                'missed_called_back', (SELECT count(*) FROM missed WHERE called_back)) FROM c),
    'attention', jsonb_build_object(
      'overdue_tasks', (SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.due_date), '[]'::jsonb) FROM (
          SELECT tk.id, tk.lead_id, l.name AS lead_name, tk.text, tk.kind, tk.due_date, pr.full_name AS assignee
          FROM tk JOIN l ON l.id = tk.lead_id LEFT JOIN public.profiles pr ON pr.id = tk.assignee_id
          WHERE NOT tk.is_done AND tk.due_date < now() ORDER BY tk.due_date LIMIT 10) x),
      'stale_leads', (SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.days DESC), '[]'::jsonb) FROM (
          SELECT l.id, l.name, s.name AS stage, floor(extract(epoch FROM now() - l.stage_changed_at) / 86400)::int AS days,
                 pr.full_name AS responsible
          FROM l JOIN public.crm_stages s ON s.id = l.stage_id LEFT JOIN public.profiles pr ON pr.id = l.responsible_user_id
          WHERE NOT l.is_won AND NOT l.is_lost AND l.stage_changed_at < now() - interval '14 days'
            AND NOT EXISTS (SELECT 1 FROM public.crm_notes n WHERE n.lead_id = l.id AND n.created_at > now() - interval '14 days')
            AND NOT EXISTS (SELECT 1 FROM public.crm_calls cc WHERE cc.lead_id = l.id AND cc.started_at > now() - interval '14 days')
          ORDER BY l.stage_changed_at LIMIT 10) x),
      'missed_unanswered', (SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.last_missed_at DESC), '[]'::jsonb) FROM (
          SELECT m.phone, max(cl.full_name) AS client_name, (array_agg(m.lead_id ORDER BY m.started_at DESC))[1] AS lead_id,
                 max(m.started_at) AS last_missed_at, count(*) AS count
          FROM public.crm_calls m LEFT JOIN public.clients cl ON cl.id = m.client_id
          WHERE m.direction = 'in' AND m.talk_time = 0 AND m.started_at > now() - interval '14 days'
            AND (p_pipeline IS NULL OR m.lead_id IN (SELECT id FROM l))
            AND NOT EXISTS (SELECT 1 FROM public.crm_calls o WHERE o.direction = 'out' AND o.phone = m.phone AND o.started_at > m.started_at)
          GROUP BY m.phone ORDER BY max(m.started_at) DESC LIMIT 10) x)
    )
  ) INTO r;
  RETURN r;
END $$;

REVOKE ALL ON FUNCTION public.sales_dashboard(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_dashboard(date, date, uuid) TO authenticated;
```

- [ ] **Step 4: Migratsiyani qo'llab, testni qayta ishga tushirish — yashil**

```bash
docker cp supabase/migrations/080_sales_dashboard.sql fy-test:/tmp/m.sql
docker exec fy-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/m.sql
docker exec fy-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql 2>&1 | grep -E "TEST|ERROR"
docker rm -f fy-test
```

Expected: `TEST 1 ok` … `TEST 6 ok`, `ERROR` yo'q. Biror test yiqilsa — funksiyani tuzat (testni emas, agar hisob spec'ga mos bo'lsa).

- [ ] **Step 5: Commit** (foydalanuvchi tasdig'idan keyin, oxirida bitta PR — §Task 6)

---

### Task 2: So'rov va hook'lar

**Files:**
- Create: `src/lib/supabase/queries/salesDashboard.ts`
- Create: `src/hooks/useSalesDashboard.ts`
- Modify: `src/components/layout/LiveSync.tsx` (TOUCHES)

**Interfaces:**
- Consumes: `sales_dashboard` (Task 1).
- Produces: `type SalesDashboard`, `type SalesSeller`, `getSalesDashboard(from: string, to: string, pipelineId: string | null): Promise<SalesDashboard>`, `getSellerTasks(sellerId: string, from: string, to: string): Promise<SellerTask[]>`, `SALES_DASHBOARD_KEY = ["sales-dashboard"]`, `useSalesDashboard(from, to, pipelineId)`, `useSellerTasks(sellerId | null, from, to)`.

- [ ] **Step 1: `salesDashboard.ts` yozish**

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase } from "../client"
import { dayEnd, dayStart } from "@/lib/period"
import type { TaskKind } from "./sotuv"

// ponytail: untyped client until `bun run gen:types` picks up migration 078
const db = supabase as unknown as SupabaseClient

export interface SalesKpi { new: number; won: number; lost: number; conversion: number | null; won_sum: number }
export interface SalesSeller {
  id: string; full_name: string; avatar_url: string | null
  open: number; new: number; won: number; lost: number; conversion: number | null; won_sum: number
  tasks_done: number; tasks_on_time: number; tasks_overdue_open: number
  calls_in: number; calls_out: number; calls_missed: number; talk_sec: number
}
export interface SalesDashboard {
  pipelines: { id: string; name: string }[]
  kpi: SalesKpi
  kpi_prev: SalesKpi
  funnel: { pipeline: string; stage_id: string; name: string; color: string; open: number; open_sum: number }[]
  by_source: { source: string | null; new: number; won: number }[]
  by_pipeline: { id: string; name: string; new: number; won: number }[]
  daily: { day: string; new: number; won: number }[]
  sellers: SalesSeller[]
  calls: { in: number; out: number; missed: number; talk_sec: number; avg_talk_sec: number; missed_total: number; missed_called_back: number }
  attention: {
    overdue_tasks: { id: string; lead_id: string; lead_name: string; text: string | null; kind: TaskKind; due_date: string; assignee: string | null }[]
    stale_leads: { id: string; name: string; stage: string; days: number; responsible: string | null }[]
    missed_unanswered: { phone: string; client_name: string | null; lead_id: string | null; last_missed_at: string; count: number }[]
  }
}

/** The whole Dashboard in one call (080). `from`/`to` are Tashkent days, YYYY-MM-DD. */
export async function getSalesDashboard(from: string, to: string, pipelineId: string | null): Promise<SalesDashboard> {
  const { data, error } = await db.rpc("sales_dashboard", { p_from: from, p_to: to, p_pipeline: pipelineId })
  if (error) throw error
  return data as SalesDashboard
}

export interface SellerTask { id: string; lead_id: string; text: string | null; kind: TaskKind; due_date: string; done_at: string | null; is_done: boolean; lead: { name: string } | null }

/** A seller's tasks done in the period plus the ones still overdue (RLS: sotuv-crmn) */
export async function getSellerTasks(sellerId: string, from: string, to: string): Promise<SellerTask[]> {
  const { data, error } = await db.from("crm_tasks")
    .select("id, lead_id, text, kind, due_date, done_at, is_done, lead:lead_id(name)")
    .eq("assignee_id", sellerId)
    .or(`and(done_at.gte.${dayStart(from)},done_at.lte.${dayEnd(to)}),and(is_done.eq.false,due_date.lt.${new Date().toISOString()})`)
    .order("due_date")
  if (error) throw error
  return data as unknown as SellerTask[]
}
```

- [ ] **Step 2: `useSalesDashboard.ts` yozish**

```ts
import { useQuery, keepPreviousData } from "@tanstack/react-query"
import { getSalesDashboard, getSellerTasks } from "@/lib/supabase/queries/salesDashboard"

export const SALES_DASHBOARD_KEY = ["sales-dashboard"] as const

export function useSalesDashboard(from: string, to: string, pipelineId: string | null) {
  return useQuery({
    queryKey: [...SALES_DASHBOARD_KEY, from, to, pipelineId],
    queryFn: () => getSalesDashboard(from, to, pipelineId),
    placeholderData: keepPreviousData, // switching period/voronka keeps the old numbers visible
  })
}

export function useSellerTasks(sellerId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: [...SALES_DASHBOARD_KEY, "seller-tasks", sellerId, from, to],
    queryFn: () => getSellerTasks(sellerId!, from, to),
    enabled: !!sellerId,
  })
}
```

- [ ] **Step 3: LiveSync — Dashboard jonli yangilansin**

`src/components/layout/LiveSync.tsx`, `TOUCHES` ichida shu qatorlarni almashtir:

```ts
  crm_leads: ["sotuv", "sales-dashboard"], crm_stages: ["sotuv", "sales-dashboard"], crm_calls: ["sotuv", "sales-dashboard"],
  crm_tasks: ["sotuv", "sales-dashboard"], crm_notes: ["sotuv", "sales-dashboard"],
```

va `payments` hamda `expenses` ro'yxatlariga `"finance"` allaqachon bor (Moliya bloki `finance` kalitini ishlatadi) — o'zgartirish shart emas.

- [ ] **Step 4: Tip tekshiruvi**

Run: `bun run build 2>&1 | grep -E "error|built in"`
Expected: `✓ built in …` (yangi fayllar hali ishlatilmagan, lekin `noUnusedLocals` faqat lokal o'zgaruvchilarga — eksportlar xato bermaydi).

---

### Task 3: Dashboard bo'laklari (`components/dashboard/`)

**Files:**
- Create: `src/components/dashboard/pieces.tsx`
- Create: `src/components/dashboard/SellersTable.tsx`
- Create: `src/components/dashboard/CallsCard.tsx`
- Create: `src/components/dashboard/AttentionPanel.tsx`
- Create: `src/components/dashboard/FinancePanel.tsx`

**Interfaces:**
- Consumes: Task 2 tiplari va hook'lari; `useFinanceSummary(f: FinanceFilters)` (`src/hooks/useFinance.ts`), `useEvents()`, `useParticipantCounts(ids)` (`src/hooks/useEvents.ts`), `sourceLabel` (`queries/sotuv.ts`), `secs` (`components/sotuv/ui.tsx`), `PersonDot` (`components/vazifalar/pickers.tsx`), `tbl`, `formatNumber`, `formatMoney`, `formatPhone`.
- Produces: `Section, Card, Empty, KpiCard, CountList, Funnel, DailyChart, delta` (pieces.tsx); `SellersTable({ rows, from, to })`; `CallsCard({ calls })`; `AttentionPanel({ a })`; `FinancePanel({ from, to })`.

- [ ] **Step 1: `pieces.tsx`** — `Section`, `Card`, `Empty`, `DeltaBadge`, `KpiCard`, `CountList` funksiyalarini hozirgi `src/components/pages/Dashboard.tsx` (≈286–375 qatorlar) dan **o'zgarishsiz** ko'chir va `export` qil; `delta()` ni ham ko'chir. Quyidagi ikki komponentni yangi ma'lumot shakli uchun yoz:

```tsx
/** Open bitimlar by stage (the voronka's current state); "Hammasi" groups stages under their voronka */
export function Funnel({ rows }: { rows: SalesDashboard["funnel"] }) {
  if (rows.length === 0) return <Empty text="Bosqich yo'q" />
  const max = Math.max(1, ...rows.map((r) => r.open))
  const groups = [...new Set(rows.map((r) => r.pipeline))]
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g} className="flex flex-col gap-2">
          {groups.length > 1 && <span className="text-sm font-medium text-ink-muted">{g}</span>}
          {rows.filter((r) => r.pipeline === g).map((r) => (
            <div key={r.stage_id} className="grid grid-cols-[minmax(0,160px)_1fr_auto] items-center gap-3">
              <span className="text-base text-ink truncate flex items-center gap-2">
                <span className="size-2 rounded-full shrink-0" style={{ background: r.color }} />{r.name}
              </span>
              <div className="h-6 rounded-item bg-surface overflow-hidden">
                <div className="h-full rounded-item bg-accent opacity-85" style={{ width: `${r.open ? Math.max(2, (r.open / max) * 100) : 0}%` }} />
              </div>
              <span className="text-base font-medium tabular-nums text-ink w-28 text-right">
                {formatNumber(r.open)}{r.open_sum > 0 && <span className="text-sm font-normal text-ink-muted"> · {formatNumber(r.open_sum)}</span>}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
```

`DailyChart` — hozirgi kodni ko'chir, faqat ma'lumot kalitlari: `rows: SalesDashboard["daily"]`, `<Bar dataKey="new" name="Yangi bitimlar" …/>`, `<Bar dataKey="won" name="Yutilgan" …/>`, legend matnlari "Yangi bitimlar" / "Yutilgan". Importlar: `ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip` (recharts), `ArrowUp, ArrowDown` (phosphor), `formatNumber`, `type SalesDashboard`.

- [ ] **Step 2: `SellersTable.tsx`**

```tsx
import { useState } from "react"
import { Link } from "react-router-dom"
import { CaretDown, CaretRight, CheckCircle, WarningCircle } from "@phosphor-icons/react"
import type { SalesSeller } from "@/lib/supabase/queries/salesDashboard"
import { useSellerTasks } from "@/hooks/useSalesDashboard"
import { kindLabel } from "@/lib/supabase/queries/sotuv"
import { tbl } from "@/components/ui/table"
import { PersonDot } from "@/components/vazifalar/pickers"
import { formatNumber } from "@/lib/format"
import { Empty } from "./pieces"

const pct = (v: number | null) => (v === null ? "—" : `${v}%`)
const when = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" })

/** One row per seller; a click opens the seller's tasks in the period */
export function SellersTable({ rows, from, to }: { rows: SalesSeller[]; from: string; to: string }) {
  const [openId, setOpenId] = useState<string | null>(null)
  if (rows.length === 0) return <Empty text="Davrda sotuvchi faoliyati yo'q" />
  return (
    <div className={tbl.scroll}>
      <table className={tbl.table}>
        <thead>
          <tr>
            <th className={tbl.th}>Sotuvchi</th>
            <th className={`${tbl.th} text-right`}>Ochiq</th><th className={`${tbl.th} text-right`}>Yangi</th>
            <th className={`${tbl.th} text-right`}>Yutildi</th><th className={`${tbl.th} text-right`}>Konversiya</th>
            <th className={`${tbl.th} text-right`}>Yakunlangan vazifa</th><th className={`${tbl.th} text-right`}>O'z vaqtida</th>
            <th className={`${tbl.th} text-right`}>Kechikkan</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const open = openId === s.id
            const onTime = s.tasks_done ? Math.round((s.tasks_on_time / s.tasks_done) * 100) : null
            return [
              <tr key={s.id} className={`${tbl.tr} cursor-pointer`} onClick={() => setOpenId(open ? null : s.id)} aria-expanded={open}>
                <td className={tbl.td}>
                  <span className="inline-flex items-center gap-2 whitespace-nowrap">
                    {open ? <CaretDown size={12} weight="bold" /> : <CaretRight size={12} weight="bold" />}
                    <PersonDot name={s.full_name} url={s.avatar_url} />{s.full_name}
                  </span>
                </td>
                <td className={`${tbl.td} text-right tabular-nums`}>{formatNumber(s.open)}</td>
                <td className={`${tbl.td} text-right tabular-nums`}>{formatNumber(s.new)}</td>
                <td className={`${tbl.td} text-right tabular-nums`}>{formatNumber(s.won)}</td>
                <td className={`${tbl.td} text-right tabular-nums`}>{pct(s.conversion)}</td>
                <td className={`${tbl.td} text-right tabular-nums`}>{formatNumber(s.tasks_done)}</td>
                <td className={`${tbl.td} text-right tabular-nums`}>{pct(onTime)}</td>
                <td className={`${tbl.td} text-right tabular-nums ${s.tasks_overdue_open ? "text-danger-text font-medium" : ""}`}>{formatNumber(s.tasks_overdue_open)}</td>
              </tr>,
              open && <tr key={`${s.id}-tasks`}><td colSpan={8} className="p-0"><SellerTasks id={s.id} from={from} to={to} /></td></tr>,
            ]
          })}
        </tbody>
      </table>
    </div>
  )
}

function SellerTasks({ id, from, to }: { id: string; from: string; to: string }) {
  const { data = [], isLoading } = useSellerTasks(id, from, to)
  if (isLoading) return <p className="px-4 py-3 text-sm text-ink-muted">Yuklanmoqda…</p>
  if (data.length === 0) return <p className="px-4 py-3 text-sm text-ink-muted">Davrda yakunlangan yoki kechikkan vazifa yo'q</p>
  return (
    <ul className="flex flex-col bg-surface-sunken rounded-surface mx-2 my-2">
      {data.map((t) => {
        const late = t.is_done ? t.done_at! > t.due_date : true
        return (
          <li key={t.id} className="flex items-center gap-3 px-4 py-2 border-b border-line last:border-0 text-sm">
            {late ? <WarningCircle size={16} className="text-danger-text shrink-0" /> : <CheckCircle size={16} className="text-success-text shrink-0" />}
            <Link to={`/sotuv/bitim/${t.lead_id}`} className="flex-1 min-w-0 truncate text-ink hover:underline">{t.text || kindLabel(t.kind)} · {t.lead?.name}</Link>
            <span className="text-ink-muted tabular-nums whitespace-nowrap">muddat {when(t.due_date)}</span>
            <span className={`tabular-nums whitespace-nowrap ${late ? "text-danger-text" : "text-success-text"}`}>
              {t.is_done ? `bajarildi ${when(t.done_at!)}` : "bajarilmagan"}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
```

(O'z vaqtida % — ikki tayyor sonning nisbati, yig'indi emas; qoida buzilmaydi.)

- [ ] **Step 3: `CallsCard.tsx`**

```tsx
import { PhoneIncoming, PhoneOutgoing, PhoneX, Clock, ArrowBendUpLeft } from "@phosphor-icons/react"
import type { SalesDashboard } from "@/lib/supabase/queries/salesDashboard"
import { secs } from "@/components/sotuv/ui"
import { formatNumber } from "@/lib/format"

export function CallsCard({ calls: c }: { calls: SalesDashboard["calls"] }) {
  const back = c.missed_total ? `${Math.round((c.missed_called_back / c.missed_total) * 100)}%` : "—"
  const tiles = [
    { label: "Kiruvchi", icon: <PhoneIncoming size={16} />, value: formatNumber(c.in) },
    { label: "Chiquvchi", icon: <PhoneOutgoing size={16} />, value: formatNumber(c.out) },
    { label: "Javobsiz", icon: <PhoneX size={16} />, value: formatNumber(c.missed), danger: c.missed > 0 },
    { label: "Qayta qo'ng'iroq", icon: <ArrowBendUpLeft size={16} />, value: back, hint: `${c.missed_called_back} / ${c.missed_total}` },
    { label: "Gaplashilgan", icon: <Clock size={16} />, value: secs(c.talk_sec), hint: `o'rtacha ${secs(c.avg_talk_sec)}` },
  ]
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {tiles.map((t) => (
        <div key={t.label} className="bg-surface rounded-surface px-4 py-3 flex flex-col gap-1 min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-medium text-ink-muted">{t.icon}{t.label}</span>
          <span className={`text-lg font-semibold tabular-nums ${t.danger ? "text-danger-text" : "text-ink"}`}>{t.value}</span>
          {t.hint && <span className="text-xs text-ink-faint">{t.hint}</span>}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: `AttentionPanel.tsx`**

```tsx
import { Link } from "react-router-dom"
import type { SalesDashboard } from "@/lib/supabase/queries/salesDashboard"
import { kindLabel } from "@/lib/supabase/queries/sotuv"
import { formatPhone } from "@/lib/format"
import { Card } from "./pieces"

const ago = (iso: string) => {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
  return h < 24 ? `${h} soat oldin` : `${Math.floor(h / 24)} kun oldin`
}

function List({ title, empty, items }: { title: string; empty: string; items: { key: string; to: string | null; main: string; sub: string }[] }) {
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-sm font-semibold text-ink px-1">{title} <span className="text-ink-faint tabular-nums">{items.length || ""}</span></h4>
      {items.length === 0 ? <p className="text-sm text-ink-muted px-1 py-1">{empty}</p> : items.map((i) => {
        const body = <><span className="block text-base text-ink truncate">{i.main}</span><span className="block text-sm text-ink-muted truncate">{i.sub}</span></>
        return i.to
          ? <Link key={i.key} to={i.to} className="px-2 py-1.5 rounded-item hover:bg-mute-ghost-hover transition-colors">{body}</Link>
          : <div key={i.key} className="px-2 py-1.5">{body}</div>
      })}
    </div>
  )
}

export function AttentionPanel({ a }: { a: SalesDashboard["attention"] }) {
  return (
    <Card title="E'tibor talab qiladi">
      <List title="Muddati o'tgan vazifalar" empty="Hozircha yo'q"
        items={a.overdue_tasks.map((t) => ({ key: t.id, to: `/sotuv/bitim/${t.lead_id}`, main: `${t.text || kindLabel(t.kind)} · ${t.lead_name}`, sub: `${t.assignee ?? "Belgilanmagan"} · ${ago(t.due_date)}` }))} />
      <List title="Harakatsiz bitimlar" empty="Hozircha yo'q"
        items={a.stale_leads.map((l) => ({ key: l.id, to: `/sotuv/bitim/${l.id}`, main: l.name, sub: `${l.stage} · ${l.days} kun · ${l.responsible ?? "Mas'ulsiz"}` }))} />
      <List title="Qayta qo'ng'iroq qilinmagan" empty="Hozircha yo'q"
        items={a.missed_unanswered.map((m) => ({ key: m.phone, to: m.lead_id ? `/sotuv/bitim/${m.lead_id}` : null, main: m.client_name ?? formatPhone(m.phone), sub: `${m.count} marta · ${ago(m.last_missed_at)}` }))} />
    </Card>
  )
}
```

- [ ] **Step 5: `FinancePanel.tsx`**

```tsx
import { useMemo } from "react"
import { useFinanceSummary } from "@/hooks/useFinance"
import { useEvents, useParticipantCounts } from "@/hooks/useEvents"
import { tashkentToday } from "@/lib/period"
import { formatMoney, formatDate } from "@/lib/format"
import { Card } from "./pieces"

/** Moliya at a glance — rendered only with the tadbirlar-moliya module (finance_summary guards it too) */
export function FinancePanel({ from, to }: { from: string; to: string }) {
  const period = useFinanceSummary({ from, to, eventId: null, seller: null, method: null })
  const allTime = useFinanceSummary({ from: null, to: null, eventId: null, seller: null, method: null })
  const { data: events = [] } = useEvents()
  const today = tashkentToday()
  const upcoming = useMemo(() => events.filter((e) => e.date && e.date >= today).sort((a, b) => a.date!.localeCompare(b.date!)).slice(0, 3), [events, today])
  const { data: counts = {} } = useParticipantCounts(upcoming.map((e) => e.id))
  const row = (label: string, value: string, tone = "text-ink") => (
    <div className="flex items-center justify-between gap-3 text-base"><span className="text-ink-muted">{label}</span><span className={`font-medium tabular-nums ${tone}`}>{value}</span></div>
  )
  return (
    <Card title="Moliya">
      <div className="flex flex-col gap-2">
        {row("Kirim", formatMoney(period.data?.income), "text-success-text")}
        {row("Xarajat", formatMoney(period.data?.expense))}
        {row("Qarzdorlik (jami)", formatMoney(allTime.data?.debt), allTime.data?.debt ? "text-danger-text" : "text-ink")}
      </div>
      <div className="flex flex-col gap-1 pt-1 border-t border-line">
        <span className="text-sm font-semibold text-ink pt-2">Yaqin tadbirlar</span>
        {upcoming.length === 0 ? <p className="text-sm text-ink-muted">Hozircha yo'q</p> : upcoming.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-ink">{e.name}</span>
            <span className="text-ink-muted tabular-nums whitespace-nowrap">{formatDate(e.date)} · {counts[e.id] ?? 0} kishi</span>
          </div>
        ))}
      </div>
    </Card>
  )
}
```

Tekshir: `useFinanceSummary` ning argument tipi `FinanceFilters` (`{ from, to, eventId, seller, method }`) — shu kalitlar bilan to'g'ri keladi; `formatDate(e.date)` imzosi `src/lib/format.ts:6` da — mos kelmasa, o'sha fayldagi imzoga moslab chaqir.

- [ ] **Step 6: Build**

Run: `bun run build 2>&1 | grep -E "error|built in"` → `✓ built in …`

---

### Task 4: `Dashboard.tsx` — C tartib

**Files:**
- Modify (to'liq qayta yoziladi): `src/components/pages/Dashboard.tsx`
- Delete: `src/lib/supabase/queries/amoDashboard.ts`, `src/hooks/useAmoDashboard.ts`

**Interfaces:**
- Consumes: Task 2 va Task 3 eksportlari; `useAuth().hasAccess`; `periodRange`, `tashkentToday` (`lib/period.ts`); `sourceLabel`.

- [ ] **Step 1: Faylni yozish**

```tsx
import { useMemo, useState } from "react"
import { UserPlus, Handshake, XCircle, Percent, Coins } from "@phosphor-icons/react"
import { useAuth } from "@/context/AuthContext"
import { useSalesDashboard } from "@/hooks/useSalesDashboard"
import { periodRange, tashkentToday } from "@/lib/period"
import { sourceLabel } from "@/lib/supabase/queries/sotuv"
import { Skeleton } from "@/components/ui/Skeleton"
import { formatNumber } from "@/lib/format"
import { Section, Card, KpiCard, CountList, Funnel, DailyChart, delta } from "@/components/dashboard/pieces"
import { SellersTable } from "@/components/dashboard/SellersTable"
import { CallsCard } from "@/components/dashboard/CallsCard"
import { AttentionPanel } from "@/components/dashboard/AttentionPanel"
import { FinancePanel } from "@/components/dashboard/FinancePanel"

const PERIODS = [
  { id: "today", label: "Bugun" },
  { id: "7d", label: "7 kun" },
  { id: "30d", label: "30 kun" },
  { id: "month", label: "Bu oy" },
  { id: "prev-month", label: "O'tgan oy" },
] as const
type PeriodId = (typeof PERIODS)[number]["id"]

/** Tashkent days, inclusive (YYYY-MM-DD) */
function range(id: PeriodId): { from: string; to: string } {
  const today = tashkentToday()
  const back = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10)
  switch (id) {
    case "today": return { from: today, to: today }
    case "7d": return { from: back(6), to: today }
    case "30d": return { from: back(29), to: today }
    case "month": return { from: `${today.slice(0, 8)}01`, to: today }
    case "prev-month": { const r = periodRange("last", null, null, today); return { from: r.from!, to: r.to! } }
  }
}

/** Sotuv bo'limi analytics (080): main flow on the left, what needs attention + Moliya on the right */
export function Dashboard() {
  const { hasAccess } = useAuth()
  const [period, setPeriod] = useState<PeriodId>("30d")
  const [pipelineId, setPipelineId] = useState<string | null>(null)
  const { from, to } = useMemo(() => range(period), [period])
  const { data: d, isLoading, error, refetch } = useSalesDashboard(from, to, pipelineId)

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {PERIODS.map((p) => (
            <button key={p.id} type="button" onClick={() => setPeriod(p.id)} aria-pressed={period === p.id}
              className={`px-3.5 h-control-md rounded-full text-base font-medium transition-colors ${period === p.id ? "bg-mute-soft text-ink" : "text-ink-muted hover:bg-mute-ghost-hover hover:text-ink"}`}>
              {p.label}
            </button>
          ))}
        </div>
        <select value={pipelineId ?? ""} onChange={(e) => setPipelineId(e.target.value || null)} aria-label="Voronka"
          className="h-control-md pl-3 pr-8 rounded-control bg-surface-sunken text-base text-ink border border-transparent outline-none focus:border-line-focus">
          <option value="">Barcha voronkalar</option>
          {d?.pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-surface bg-danger-soft text-danger-dark text-base">
          <span>Ma'lumot yuklanmadi: {error.message}</span>
          <button type="button" onClick={() => void refetch()} className="h-control-sm px-3 rounded-full bg-surface text-ink text-sm font-medium">Qayta urinish</button>
        </div>
      )}

      {isLoading || !d ? <Skeleton className="h-[420px] rounded-surface" /> : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
          <div className="flex flex-col gap-8 min-w-0">
            <Section title="Sotuv natijasi" desc="Tanlangan davr, oldingi shuncha davrga nisbatan">
              <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
                <KpiCard label="Yangi bitimlar" icon={<UserPlus size={16} />} value={formatNumber(d.kpi.new)} sub="davrda ochilgan" delta={delta(d.kpi.new, d.kpi_prev.new)} />
                <KpiCard label="Yutilgan" icon={<Handshake size={16} />} value={formatNumber(d.kpi.won)} sub="davrda yopilgan" delta={delta(d.kpi.won, d.kpi_prev.won)} />
                <KpiCard label="Yutqazilgan" icon={<XCircle size={16} />} value={formatNumber(d.kpi.lost)} sub="davrda yopilgan" delta={delta(d.kpi.lost, d.kpi_prev.lost)} />
                <KpiCard label="Konversiya" icon={<Percent size={16} />} value={d.kpi.conversion === null ? "—" : `${d.kpi.conversion}%`} sub="yutilgan ÷ yopilgan" delta={null} />
                <KpiCard label="Yutilgan summa" icon={<Coins size={16} />} value={formatNumber(d.kpi.won_sum)} unit="so'm" sub="bitim narxi bo'yicha" delta={delta(d.kpi.won_sum, d.kpi_prev.won_sum)} />
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                <Card title="Voronka" aside="ochiq bitimlar, hozir" className="xl:col-span-2"><Funnel rows={d.funnel} /></Card>
                <div className="flex flex-col gap-3">
                  <Card title="Manbalar"><CountList rows={d.by_source.map((r) => ({ key: r.source ?? "none", label: sourceLabel(r.source), leads: r.new, won: r.won }))} /></Card>
                  {!pipelineId && <Card title="Voronkalar"><CountList rows={d.by_pipeline.map((r) => ({ key: r.id, label: r.name, leads: r.new, won: r.won }))} /></Card>}
                </div>
              </div>
              <Card title="Kunlik dinamika"><DailyChart rows={d.daily} /></Card>
            </Section>
            <Section title="Sotuvchilar" desc="Bitimlar va vazifalar; qatorni bosing — vazifalar ro'yxati">
              <SellersTable rows={d.sellers} from={from} to={to} />
            </Section>
            <Section title="Qo'ng'iroqlar" desc="Tanlangan davr">
              <CallsCard calls={d.calls} />
            </Section>
          </div>
          <aside className="flex flex-col gap-4 lg:sticky lg:top-0">
            <AttentionPanel a={d.attention} />
            {hasAccess("tadbirlar-moliya") && <FinancePanel from={from} to={to} />}
          </aside>
        </div>
      )}
    </div>
  )
}
```

`CountList` "lid / sotuv" matnlarini ishlatadi — pieces.tsx'da ko'chirishda `"{n} lid"` → `"{n} bitim"`, `"{n} sotuv"` → `"{n} yutildi"` ga o'zgartir.

- [ ] **Step 2: AmoCRM fayllarini o'chirish va qoldiqni tekshirish**

```bash
git rm -q src/lib/supabase/queries/amoDashboard.ts src/hooks/useAmoDashboard.ts
grep -rn "amoDashboard\|useAmoDashboard\|AmoDashboard" src || echo "clean"
```

Expected: `clean`.

- [ ] **Step 3: Build + lint**

Run: `bun run build 2>&1 | grep -E "error|built in" && bunx eslint src/components/pages/Dashboard.tsx src/components/dashboard src/hooks/useSalesDashboard.ts src/lib/supabase/queries/salesDashboard.ts`
Expected: `✓ built in …`, lint chiqishi bo'sh.

- [ ] **Step 4: Lokal ko'rinishni tekshirish (harness, keyin o'chiriladi)**

`harness.html` + `src/__harness.tsx` (commit qilinmaydi) — `SellersTable`, `CallsCard`, `AttentionPanel`, `Funnel`, `DailyChart` ni Task 1 test fixture'iga o'xshash qo'lda yozilgan `SalesDashboard` obyekti bilan render qil (QueryClientProvider ichida); `preview_start fy-web-prod` → `http://localhost:5001/harness.html`; skrinshot; bo'sh holat (`sellers: []`, `attention` bo'sh ro'yxatlar) ham. So'ng `rm harness.html src/__harness.tsx`.

---

### Task 5: amo-sync — AmoCRM sinxronizatsiyasini to'xtatish

**Files:**
- Modify: `amo-sync/src/index.ts`
- Modify: `amo-sync/src/intake.ts:84-101` (health)
- Test: `amo-sync/src/intake.test.ts` (agar `amocrm` tekshiruvini kutsa — moslash)

- [ ] **Step 1: `index.ts`** — quyidagilarni o'chir: `BASE`, `TOKEN`, `EVENTS_FROM`, `FULL_EVERY_H`, `OVERLAP_S` konstantalari; "AmoCRM client" bo'limi (`amo`, `pages`, `ts`), hamma `Amo*` interfeyslari, `TAG_SOURCES`, `leadSource`, `getState`, `setState`, `syncPipelines`, `syncUsers`, `syncLeads`, `syncStatusChanges`, `syncTasks`. `runOnce` ni shunday qoldir:

```ts
async function runOnce(): Promise<void> {
  await expireCashback()
}
```

Fayl boshidagi izohni almashtir:

```ts
// amo-sync — the system's only scheduled worker (CLAUDE.md). The AmoCRM sync stopped on 2026-10-03
// (the Dashboard reads our own Sotuv bo'limi, 078); its amo_* tables stay as an archive.
//
// Every SYNC_INTERVAL_MIN: settle_event_cashback() and expire_cashback().
// Alongside: Telegram payment receipts (src/telegram.ts); the Vazifalar morning report and
// deadline reminders (src/tasks.ts); tasks from the team chat (src/taskbot.ts, Gemini); form
// webhooks that open bitimlar (src/intake.ts, :8787 behind /hooks/); OnlinePBX call history and
// the browser phone's endpoints (src/pbx.ts, /hooks/pbx/).
//
// Env: DATABASE_URL, SYNC_INTERVAL_MIN (10). `bun run src/index.ts --once` runs one pass and exits.
```

`sleep` va `INTERVAL_MIN` qoladi (asosiy sikl ishlatadi).

- [ ] **Step 2: `intake.ts` health** — `'last_success_at'` ni so'rovdan va `checks.amocrm` qatorini olib tashla; izohni yangila:

```ts
/** Uptime check (GitHub Actions, daily): DB reachable, call history ≤ 5 min old (when the PBX is
 *  configured), a backup in the last 26 h. 503 if anything is off. */
async function health(sql: Sql): Promise<Response> {
  const checks: Record<string, boolean | string> = {}
  try {
    const rows = await sql<{ key: string; age: number }[]>`
      select key, extract(epoch from now() - coalesce(value::timestamptz, updated_at))::int as age
      from amo_sync_state where key = 'backup_last_ok'`
    checks.db = true
    checks.backup = (rows[0]?.age ?? Infinity) < 26 * 3600
  } catch (e) {
    checks.db = `${e instanceof Error ? e.message : e}`.slice(0, 120)
  }
  if (process.env.ONLINEPBX_KEY) checks.calls = Date.now() - pbxSyncedAt < 5 * 60_000
  const ok = Object.values(checks).every((v) => v === true)
  return Response.json({ ok, checks }, { status: ok ? 200 : 503 })
}
```

- [ ] **Step 3: Testlar va tip**

Run: `cd amo-sync && bun test 2>&1 | tail -3 && bunx tsc --noEmit -p . 2>&1 | tail -3`
Expected: hamma test o'tadi (avval 20 ta); tsc xatosiz. `intake.test.ts` `amocrm` ni kutsa — o'sha assertion'ni olib tashla.

---

### Task 6: Production, hujjatlar, tekshiruv

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: CLAUDE.md** — (a) §2 jadval va §3 papkada migratsiyalar `001`–`080`; (b) §7 "**Dashboard = AmoCRM analytics** …" bandini almashtir:

```markdown
- **Dashboard = our own Sotuv bo'limi (migration `080`, decided 2026-10-03; AmoCRM analytics dropped, history NOT imported — numbers start 2026-09-30):** `sales_dashboard(p_from, p_to, p_pipeline)` (SECURITY DEFINER behind the `dashboard` module, so a viewer without `sotuv-crmn` still sees aggregates) returns the whole page: KPIs + the previous equal period, open funnel, sources, voronkalar, daily, sellers (deals; tasks done / on time = `done_at <= due_date` / overdue open; calls by `staff_id`), calls (called back = a LATER outgoing call to the same phone) and "E'tibor talab qiladi" (overdue tasks, 14+ day stale bitimlar, missed numbers not called back in 14 days). UI `components/pages/Dashboard.tsx` + `components/dashboard/` — layout C: main flow left, a sticky right column (E'tibor + Moliya, the latter only with `tadbirlar-moliya`, from `finance_summary`). Live via `LiveSync` (`"sales-dashboard"` key). The `amo_*` tables and `amo_dashboard()` remain as an archive; nothing writes them any more.
```

(c) §4 amo-sync env: `AMO_SUBDOMAIN`, `AMO_TOKEN`, `EVENTS_FROM` qatorlarini olib tashla, `SYNC_INTERVAL_MIN` izohini "cashback pass" deb yoz; (d) §5 `/hooks/health` qatoridan `amocrm (pass ≤30 min)` ni olib tashla; (e) "amo-sync (AmoCRM → amo_*) runs…" sarlavhasini "amo-sync (scheduled worker: cashback, Telegram, tasks bot, lead intake, OnlinePBX) runs…" ga.

- [ ] **Step 2: Foydalanuvchidan commit/push/merge tasdig'ini olish** (qoida: tasdiqsiz commit yo'q). Tasdiqdan keyin:

```bash
git checkout -b claude/own-dashboard origin/main   # (agar hali shu branchda bo'lmasa)
git add supabase/migrations/080_sales_dashboard.sql supabase/tests/080_sales_dashboard_test.sql \
  src/lib/supabase/queries/salesDashboard.ts src/hooks/useSalesDashboard.ts src/components/dashboard \
  src/components/pages/Dashboard.tsx src/components/layout/LiveSync.tsx amo-sync/src CLAUDE.md \
  docs/superpowers/specs/2026-10-03-own-dashboard-design.md docs/superpowers/plans/2026-10-03-own-dashboard.md
git commit -m "feat: Dashboard reads our own Sotuv bo'limi (080); AmoCRM sync stopped"
```

- [ ] **Step 3: Production DB — merge'dan OLDIN** (yangi frontend funksiyasiz 404 bermasligi uchun)

```bash
ssh -i ~/.ssh/heons_key ubuntu@141.147.119.131 'TS=$(date +%Y%m%d_%H%M%S); docker exec supabase-db-1 pg_dump -U postgres -d postgres -Fc --exclude-schema=_realtime -f /tmp/fy_$TS.dump && docker cp supabase-db-1:/tmp/fy_$TS.dump ~/backups/fy_$TS.dump && ls -l ~/backups/fy_$TS.dump'
cat supabase/migrations/080_sales_dashboard.sql | ssh -i ~/.ssh/heons_key ubuntu@141.147.119.131 'cat > /tmp/m.sql && docker cp /tmp/m.sql supabase-db-1:/tmp/m.sql && docker exec supabase-db-1 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/m.sql && docker exec supabase-db-1 psql -U postgres -d postgres -c "insert into supabase_migrations.schema_migrations(version) values ('"'"'078'"'"') on conflict do nothing;" && docker restart supabase-rest-1'
```

Expected: dump fayli > 0 bayt (0 bo'lsa — TO'XTA, sababini top); `CREATE FUNCTION`, `REVOKE`, `GRANT`, `INSERT 0 1`.

- [ ] **Step 4: amo-sync redeploy + health**

```bash
tar czf - --exclude node_modules amo-sync | ssh -i ~/.ssh/heons_key ubuntu@141.147.119.131 \
  'tar xzf - -C ~ && cd ~/amo-sync && docker build -q -t fy-amo-sync:latest . \
   && docker rm -f fy-amo-sync && docker run -d --name fy-amo-sync --restart unless-stopped \
      --network supabase_supabase-net --env-file ~/amo-sync/.env fy-amo-sync:latest'
sleep 20; curl -s https://api.fikryetakchilari.uz/hooks/health
ssh -i ~/.ssh/heons_key ubuntu@141.147.119.131 'docker logs --tail 20 fy-amo-sync'
```

Expected: `{"ok":true,"checks":{"db":true,"backup":true,"calls":true}}`; loglarda `[amo-sync] … leads` qatorlari yo'q, xato yo'q.

- [ ] **Step 5: PR, merge, sync, deploy kutish**

```bash
git push -u origin claude/own-dashboard
gh pr create --repo oyatillonabijonov/fy-system --base main --head claude/own-dashboard --title "feat: Dashboard on our own data (080), AmoCRM sync stopped" --body "…🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh pr merge --repo oyatillonabijonov/fy-system --squash --delete-branch claude/own-dashboard
git -C ~/Desktop/fy-system pull --ff-only
```

Yangi bundle'ni kut: `index-*.js` nomi o'zgarguncha va unda `"Sotuvchilar"` + `sales_dashboard` bo'lguncha.

- [ ] **Step 6: Brauzerda tekshirish (foydalanuvchi Chrome'i, yangi tab)**

`https://app.fikryetakchilari.uz/` → (a) sahifa yuklandi, xato banneri yo'q; (b) davr tugmalarini almashtir — raqamlar o'zgaradi; (c) voronka select'i — Umumiy tanlanganda "Voronkalar" kartasi yo'qoladi; (d) sotuvchi qatorini bos — vazifalar ro'yxati ochiladi; (e) E'tibor ro'yxatidan bitta bitimni bos — bitim sahifasi ochiladi; (f) o'ng ustun aylantirganda joyida qoladi. Har biri uchun JS bilan DOM tekshiruvi (rAF ishlatma — yashirin tabda osilib qoladi) + skrinshot; skrinshotni foydalanuvchiga yubor.

---

## Self-review (yozuvchi tomonidan bajarildi)

- Spec qamrovi: §3 (C tartib, 7 blok) → Task 3–4; §4 (funksiya, qoidalar) → Task 1; §5 → Task 2–4; §6 → Task 5; §7 xatolar → Task 4 (banner, Empty), Task 1 TEST 6; §8 → Task 1, 6. Spec'dagi JSON'ga `pipelines` qo'shildi (Dashboard ruxsati bor, `sotuv-crmn` yo'q foydalanuvchi ham voronka ro'yxatini ko'rishi uchun) — spec §4 shu bilan yangilanadi.
- `missed_unanswered` davri: spec'da aniq emas edi — "oxirgi 14 kun" qilib belgilandi (harakatsiz bitim bilan bir xil).
- Tiplar: `SalesDashboard` kalitlari Task 1 JSON bilan bir xil (`new`, `won`, `lost`, `conversion`, `won_sum`, `open_sum`, `tasks_on_time` …).
