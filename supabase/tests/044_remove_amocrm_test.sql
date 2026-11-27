-- Behavioural tests for migration 044 (AmoCRM removal).
-- Run against a THROWAWAY database, never prod — see supabase/tests/043_money_guards_test.sql
-- for the container recipe, then:
--   docker exec fy-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/044_remove_amocrm_test.sql
--
-- Covers: tables dropped, responsible_user_id re-pointed to profiles, the module
-- CHECK, and that KPI actually computes (it returned 0 for everyone before 044,
-- because the amocrm_users.email hop it relied on was never populated).

\pset border 2
-- ═══ 1. amocrm_* jadvallari yo'qolganmi ═══
SELECT COALESCE(string_agg(table_name, ', '), '(bitta ham qolmadi ✓)') AS amocrm_jadvallari
FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'amocrm%';

-- ═══ 2. crm_leads.responsible_user_id endi qanday ═══
SELECT c.data_type AS tip,
       (SELECT confrelid::regclass::text FROM pg_constraint
        WHERE conrelid='public.crm_leads'::regclass AND contype='f'
          AND conkey = ARRAY[c.ordinal_position::smallint]) AS fk_qayerga
FROM information_schema.columns c
WHERE c.table_schema='public' AND c.table_name='crm_leads' AND c.column_name='responsible_user_id';

-- ═══ 3. user_permissions CHECK ═══
SELECT pg_get_constraintdef(oid) AS modul_check FROM pg_constraint
WHERE conrelid='public.user_permissions'::regclass AND contype='c';

-- ═══ 4. KPI funksiyasi jonli ishlayaptimi ═══
-- staff logins: the shared helper (112 — the auth trigger no longer trusts metadata)
\ir _helpers.sql
DO $staff$ BEGIN
  PERFORM pg_temp.make_staff('44000000-0000-0000-0000-000000000001', 'kpi@fy.uz', 'KPI Test', 'admin');
END $staff$;

INSERT INTO public.crm_pipelines (id, name) VALUES ('a4400000-0000-0000-0000-000000000001', 'Test');
-- 072: is_won follows the stage (a won flag on an open stage is reset), so the won bitimlar sit in a won stage
INSERT INTO public.crm_stages (id, pipeline_id, name, sort_order, is_won) VALUES
  ('b4400000-0000-0000-0000-000000000001', 'a4400000-0000-0000-0000-000000000001', 'Yangi', 0, false),
  ('b4400000-0000-0000-0000-000000000002', 'a4400000-0000-0000-0000-000000000001', 'Yutildi', 9, true);

-- Bu oyda yutilgan 2 ta lid + 1 ta yutilmagan + 1 ta boshqa xodimniki
INSERT INTO public.crm_leads (name, pipeline_id, stage_id, responsible_user_id, price, is_won, updated_at) VALUES
  ('Yutilgan A', 'a4400000-0000-0000-0000-000000000001','b4400000-0000-0000-0000-000000000002','44000000-0000-0000-0000-000000000001', 10000000, true,  now()),
  ('Yutilgan B', 'a4400000-0000-0000-0000-000000000001','b4400000-0000-0000-0000-000000000002','44000000-0000-0000-0000-000000000001',  5000000, true,  now()),
  ('Ochiq',      'a4400000-0000-0000-0000-000000000001','b4400000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000001',  9000000, false, now()),
  ('Egasiz',     'a4400000-0000-0000-0000-000000000001','b4400000-0000-0000-0000-000000000002', NULL,                                   7000000, true,  now());

DO $$
DECLARE r record; y int; m int;
BEGIN
  y := EXTRACT(YEAR FROM now() AT TIME ZONE 'UTC')::int;
  m := EXTRACT(MONTH FROM now() AT TIME ZONE 'UTC')::int;

  SELECT * INTO r FROM public.calculate_employee_kpi_actual('44000000-0000-0000-0000-000000000001', y, m);

  -- Kutilgan: faqat o'ziniki + yutilgan = 10 000 000 + 5 000 000 = 15 000 000, 2 ta lid
  IF r.revenue_actual <> 15000000 THEN
    RAISE EXCEPTION 'KPI FAILED: revenue_actual=% (kutilgan 15000000)', r.revenue_actual;
  END IF;
  IF r.leads_closed <> 2 THEN
    RAISE EXCEPTION 'KPI FAILED: leads_closed=% (kutilgan 2)', r.leads_closed;
  END IF;
  RAISE NOTICE 'KPI PASS: daromad=% so''m, yopilgan=% ta (ochiq va egasiz lidlar hisobga olinmadi)', r.revenue_actual, r.leads_closed;
END $$;

-- ═══ 5. Boshqa oy bo'sh qaytarishi kerak ═══
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.calculate_employee_kpi_actual('44000000-0000-0000-0000-000000000001', 2020, 1);
  IF r.revenue_actual <> 0 THEN RAISE EXCEPTION 'KPI FAILED: eski davr % qaytardi', r.revenue_actual; END IF;
  RAISE NOTICE 'KPI PASS: boshqa davr 0 qaytardi';
END $$;

-- ═══ 6. 'sotuv-amocrm' moduli endi rad etilishi kerak ═══
DO $$
BEGIN
  INSERT INTO public.user_permissions (user_id, module)
  VALUES ('44000000-0000-0000-0000-000000000001', 'sotuv-amocrm');
  RAISE EXCEPTION 'CHECK FAILED: sotuv-amocrm moduli hali ham qabul qilinyapti';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'CHECK PASS: sotuv-amocrm rad etildi';
END $$;

-- ═══ 7. Haqiqiy modul hali ishlashi kerak ═══
DO $$
BEGIN
  INSERT INTO public.user_permissions (user_id, module)
  VALUES ('44000000-0000-0000-0000-000000000001', 'sotuv-crmn');
  RAISE NOTICE 'CHECK PASS: sotuv-crmn qabul qilindi (ish oqimi buzilmadi)';
END $$;

SELECT 'BARCHA 044 TESTLARI O''TDI' AS natija;
