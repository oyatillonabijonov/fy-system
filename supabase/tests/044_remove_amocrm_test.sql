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
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('11111111-1111-1111-1111-111111111111', 'kpi@fy.uz', '{"full_name":"KPI Test","role":"admin"}'::jsonb);

INSERT INTO public.crm_pipelines (id, name) VALUES ('aaaa0000-0000-0000-0000-000000000001', 'Test');
INSERT INTO public.crm_stages (id, pipeline_id, name)
VALUES ('bbbb0000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000001', 'Yangi');

-- Bu oyda yutilgan 2 ta lid + 1 ta yutilmagan + 1 ta boshqa xodimniki
INSERT INTO public.crm_leads (name, pipeline_id, stage_id, responsible_user_id, price, is_won, updated_at) VALUES
  ('Yutilgan A', 'aaaa0000-0000-0000-0000-000000000001','bbbb0000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111', 10000000, true,  now()),
  ('Yutilgan B', 'aaaa0000-0000-0000-0000-000000000001','bbbb0000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',  5000000, true,  now()),
  ('Ochiq',      'aaaa0000-0000-0000-0000-000000000001','bbbb0000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',  9000000, false, now()),
  ('Egasiz',     'aaaa0000-0000-0000-0000-000000000001','bbbb0000-0000-0000-0000-000000000001', NULL,                                   7000000, true,  now());

DO $$
DECLARE r record; y int; m int;
BEGIN
  y := EXTRACT(YEAR FROM now() AT TIME ZONE 'UTC')::int;
  m := EXTRACT(MONTH FROM now() AT TIME ZONE 'UTC')::int;

  SELECT * INTO r FROM public.calculate_employee_kpi_actual('11111111-1111-1111-1111-111111111111', y, m);

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
  SELECT * INTO r FROM public.calculate_employee_kpi_actual('11111111-1111-1111-1111-111111111111', 2020, 1);
  IF r.revenue_actual <> 0 THEN RAISE EXCEPTION 'KPI FAILED: eski davr % qaytardi', r.revenue_actual; END IF;
  RAISE NOTICE 'KPI PASS: boshqa davr 0 qaytardi';
END $$;

-- ═══ 6. 'sotuv-amocrm' moduli endi rad etilishi kerak ═══
DO $$
BEGIN
  INSERT INTO public.user_permissions (user_id, module)
  VALUES ('11111111-1111-1111-1111-111111111111', 'sotuv-amocrm');
  RAISE EXCEPTION 'CHECK FAILED: sotuv-amocrm moduli hali ham qabul qilinyapti';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'CHECK PASS: sotuv-amocrm rad etildi';
END $$;

-- ═══ 7. Haqiqiy modul hali ishlashi kerak ═══
DO $$
BEGIN
  INSERT INTO public.user_permissions (user_id, module)
  VALUES ('11111111-1111-1111-1111-111111111111', 'sotuv-crmn');
  RAISE NOTICE 'CHECK PASS: sotuv-crmn qabul qilindi (ish oqimi buzilmadi)';
END $$;

SELECT 'BARCHA 044 TESTLARI O''TDI' AS natija;
