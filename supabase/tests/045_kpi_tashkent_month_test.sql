-- Behavioural tests for migration 045 (KPI months in Asia/Tashkent).
-- Throwaway database only — see supabase/tests/043_money_guards_test.sql for the recipe.
--
-- Verified: all three fail on the pre-045 (UTC) function — a 1-July 02:00 Tashkent
-- deal landed in June, the 31-July evening deal was dropped, and a 1-January
-- Tashkent deal was booked to December.

\pset border 2
-- Fixture: bitta xodim, bitta voronka
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('11111111-1111-1111-1111-111111111111', 'tz@fy.uz', '{"full_name":"TZ Test","role":"admin"}'::jsonb);
INSERT INTO public.crm_pipelines (id, name) VALUES ('aaaa0000-0000-0000-0000-000000000001', 'Test');
INSERT INTO public.crm_stages (id, pipeline_id, name)
VALUES ('bbbb0000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000001', 'Yangi');

-- Aynan chegara ustidagi bitim: 1-iyul 02:00 Toshkent vaqti = 30-iyun 21:00 UTC.
-- Eski (UTC) mantiq buni IYUNGA yozardi; to'g'risi — IYUL.
INSERT INTO public.crm_leads (name, pipeline_id, stage_id, responsible_user_id, price, is_won, updated_at)
VALUES ('Chegara bitimi', 'aaaa0000-0000-0000-0000-000000000001','bbbb0000-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 10000000, true,
        '2026-07-01 02:00:00+05');   -- Toshkent

DO $$
DECLARE iyul record; iyun record;
BEGIN
  SELECT * INTO iyul FROM public.calculate_employee_kpi_actual('11111111-1111-1111-1111-111111111111', 2026, 7);
  SELECT * INTO iyun FROM public.calculate_employee_kpi_actual('11111111-1111-1111-1111-111111111111', 2026, 6);

  IF iyul.revenue_actual <> 10000000 THEN
    RAISE EXCEPTION 'FAILED: 1-iyul 02:00 (Toshkent) bitimi iyulga tushmadi — iyul=%', iyul.revenue_actual;
  END IF;
  IF iyun.revenue_actual <> 0 THEN
    RAISE EXCEPTION 'FAILED: bitim iyunga ham yozildi — iyun=% (ikki marta hisoblanmoqda)', iyun.revenue_actual;
  END IF;
  RAISE NOTICE 'PASS: 1-iyul 02:00 Toshkent → iyul=% so''m, iyun=% so''m', iyul.revenue_actual, iyun.revenue_actual;
END $$;

-- Oyning oxirgi kuni kech: 31-iyul 23:30 Toshkent = 31-iyul 18:30 UTC → iyulda qolishi kerak
INSERT INTO public.crm_leads (name, pipeline_id, stage_id, responsible_user_id, price, is_won, updated_at)
VALUES ('Oxirgi kun', 'aaaa0000-0000-0000-0000-000000000001','bbbb0000-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 5000000, true, '2026-07-31 23:30:00+05');

DO $$
DECLARE iyul record; avg_ record;
BEGIN
  SELECT * INTO iyul FROM public.calculate_employee_kpi_actual('11111111-1111-1111-1111-111111111111', 2026, 7);
  SELECT * INTO avg_ FROM public.calculate_employee_kpi_actual('11111111-1111-1111-1111-111111111111', 2026, 8);

  IF iyul.revenue_actual <> 15000000 THEN
    RAISE EXCEPTION 'FAILED: iyul=% (kutilgan 15000000)', iyul.revenue_actual;
  END IF;
  IF avg_.revenue_actual <> 0 THEN
    RAISE EXCEPTION 'FAILED: 31-iyul kechqurungi bitim avgustga oqib ketdi — avgust=%', avg_.revenue_actual;
  END IF;
  RAISE NOTICE 'PASS: 31-iyul 23:30 Toshkent iyulda qoldi (iyul=%, avgust=%)', iyul.revenue_actual, avg_.revenue_actual;
END $$;

-- Yil almashuvi: 31-dekabr 23:30 Toshkent dekabrda qolishi, 1-yanvar 02:00 yanvarga o'tishi kerak
INSERT INTO public.crm_leads (name, pipeline_id, stage_id, responsible_user_id, price, is_won, updated_at) VALUES
  ('Dekabr oxiri', 'aaaa0000-0000-0000-0000-000000000001','bbbb0000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 3000000, true, '2026-12-31 23:30:00+05'),
  ('Yanvar boshi', 'aaaa0000-0000-0000-0000-000000000001','bbbb0000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 4000000, true, '2027-01-01 02:00:00+05');

DO $$
DECLARE dek record; yan record;
BEGIN
  SELECT * INTO dek FROM public.calculate_employee_kpi_actual('11111111-1111-1111-1111-111111111111', 2026, 12);
  SELECT * INTO yan FROM public.calculate_employee_kpi_actual('11111111-1111-1111-1111-111111111111', 2027, 1);

  IF dek.revenue_actual <> 3000000 THEN
    RAISE EXCEPTION 'FAILED: dekabr=% (kutilgan 3000000)', dek.revenue_actual;
  END IF;
  IF yan.revenue_actual <> 4000000 THEN
    RAISE EXCEPTION 'FAILED: yanvar=% (kutilgan 4000000) — yil almashuvi buzuq', yan.revenue_actual;
  END IF;
  RAISE NOTICE 'PASS: yil almashuvi to''g''ri (dekabr=%, yanvar=%)', dek.revenue_actual, yan.revenue_actual;
END $$;

SELECT 'KPI TOSHKENT TESTLARI O''TDI' AS natija;
