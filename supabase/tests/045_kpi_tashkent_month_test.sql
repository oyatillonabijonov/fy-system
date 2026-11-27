-- Behavioural tests for migrations 045 + 113: a staff member's KPI counts a won bitim in the Tashkent month
-- it was WON (closed_at, 113), not the month it was last edited (updated_at).
-- Throwaway database only — supabase/tests/run.sh.
--
-- 045 verified: the boundary cases fail on the pre-045 (UTC) function — a 1-July 02:00 Tashkent deal landed in
-- June, the 31-July evening deal was dropped, a 1-January Tashkent deal was booked to December.
-- 113 verified: on the 045 function (updated_at) every case below fails — the stage trigger (072) stamps
-- updated_at = now() on insert and on every edit, so every bitim lands in the current month.
\set ON_ERROR_STOP on

-- Fixture: one staff member, a voronka with an open and a won stage
\ir _helpers.sql
DO $staff$ BEGIN
  PERFORM pg_temp.make_staff('45000000-0000-0000-0000-000000000001', 'tz@fy.uz', 'TZ Test', 'admin');
END $staff$;
INSERT INTO public.crm_pipelines (id, name) VALUES ('a4500000-0000-0000-0000-000000000001', 'Test');
INSERT INTO public.crm_stages (id, pipeline_id, name, sort_order, is_won) VALUES
  ('b4500000-0000-0000-0000-000000000001', 'a4500000-0000-0000-0000-000000000001', 'Yangi', 0, false),
  ('b4500000-0000-0000-0000-000000000002', 'a4500000-0000-0000-0000-000000000001', 'Yutildi', 9, true);

-- A bitim won at a given moment. The stage trigger writes closed_at = now() when a bitim enters a won stage
-- and never lets it be changed while it stays there, so the past moment is set with the trigger paused.
CREATE FUNCTION pg_temp.won_at(p_name text, p_price numeric, p_at timestamptz) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  INSERT INTO public.crm_leads (name, pipeline_id, stage_id, responsible_user_id, price)
  VALUES (p_name, 'a4500000-0000-0000-0000-000000000001', 'b4500000-0000-0000-0000-000000000002',
          '45000000-0000-0000-0000-000000000001', p_price)
  RETURNING id INTO v;
  ALTER TABLE public.crm_leads DISABLE TRIGGER trigger_crm_lead_stage_rules;
  UPDATE public.crm_leads SET closed_at = p_at WHERE id = v;
  ALTER TABLE public.crm_leads ENABLE TRIGGER trigger_crm_lead_stage_rules;
  RETURN v;
END $$;
CREATE FUNCTION pg_temp.kpi(p_year int, p_month int) RETURNS numeric LANGUAGE sql AS $$
  SELECT revenue_actual FROM public.calculate_employee_kpi_actual('45000000-0000-0000-0000-000000000001', p_year, p_month) $$;

-- Exactly on the boundary: 1 July 02:00 Tashkent = 30 June 21:00 UTC. UTC logic put it in June; it is July.
SELECT pg_temp.won_at('Chegara bitimi', 10000000, '2026-07-01 02:00:00+05');
DO $$ BEGIN
  IF pg_temp.kpi(2026, 7) <> 10000000 THEN RAISE EXCEPTION 'FAILED: 1-iyul 02:00 (Toshkent) bitimi iyulga tushmadi — iyul=%', pg_temp.kpi(2026, 7); END IF;
  IF pg_temp.kpi(2026, 6) <> 0 THEN RAISE EXCEPTION 'FAILED: bitim iyunga ham yozildi — iyun=%', pg_temp.kpi(2026, 6); END IF;
  RAISE NOTICE 'PASS: 1-iyul 02:00 Toshkent → iyul';
END $$;

-- Late on the month's last day: 31 July 23:30 Tashkent = 31 July 18:30 UTC → stays in July
SELECT pg_temp.won_at('Oxirgi kun', 5000000, '2026-07-31 23:30:00+05');
DO $$ BEGIN
  IF pg_temp.kpi(2026, 7) <> 15000000 THEN RAISE EXCEPTION 'FAILED: iyul=% (kutilgan 15000000)', pg_temp.kpi(2026, 7); END IF;
  IF pg_temp.kpi(2026, 8) <> 0 THEN RAISE EXCEPTION 'FAILED: 31-iyul kechqurungi bitim avgustga oqib ketdi — avgust=%', pg_temp.kpi(2026, 8); END IF;
  RAISE NOTICE 'PASS: 31-iyul 23:30 Toshkent iyulda qoldi';
END $$;

-- Year change: 31 December 23:30 Tashkent stays in December, 1 January 02:00 goes to January
SELECT pg_temp.won_at('Dekabr oxiri', 3000000, '2026-12-31 23:30:00+05');
SELECT pg_temp.won_at('Yanvar boshi', 4000000, '2027-01-01 02:00:00+05');
DO $$ BEGIN
  IF pg_temp.kpi(2026, 12) <> 3000000 THEN RAISE EXCEPTION 'FAILED: dekabr=% (kutilgan 3000000)', pg_temp.kpi(2026, 12); END IF;
  IF pg_temp.kpi(2027, 1) <> 4000000 THEN RAISE EXCEPTION 'FAILED: yanvar=% (kutilgan 4000000) — yil almashuvi buzuq', pg_temp.kpi(2027, 1); END IF;
  RAISE NOTICE 'PASS: yil almashuvi to''g''ri';
END $$;

-- 113: a won bitim edited later (updated_at = now()) stays in the month it was won
UPDATE public.crm_leads SET name = 'Chegara bitimi (keyin tahrirlandi)', price = 10000000 WHERE name = 'Chegara bitimi';
DO $$ BEGIN
  IF pg_temp.kpi(2026, 7) <> 15000000 THEN RAISE EXCEPTION 'FAILED: keyingi tahrir bitimni iyuldan olib ketdi — iyul=%', pg_temp.kpi(2026, 7); END IF;
  IF pg_temp.kpi(EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Tashkent')::int, EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Tashkent')::int) <> 0 THEN
    RAISE EXCEPTION 'FAILED: tahrirlangan bitim joriy oyga ko''chdi'; END IF;
  RAISE NOTICE 'PASS: keyingi tahrir yutilgan oyni o''zgartirmadi';
END $$;

-- An open bitim (not won) never counts
INSERT INTO public.crm_leads (name, pipeline_id, stage_id, responsible_user_id, price)
VALUES ('Ochiq', 'a4500000-0000-0000-0000-000000000001', 'b4500000-0000-0000-0000-000000000001', '45000000-0000-0000-0000-000000000001', 9000000);
DO $$ BEGIN
  IF pg_temp.kpi(EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Tashkent')::int, EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Tashkent')::int) <> 0 THEN
    RAISE EXCEPTION 'FAILED: ochiq bitim KPI''ga tushdi'; END IF;
  RAISE NOTICE 'PASS: ochiq bitim hisoblanmadi';
END $$;

SELECT 'KPI TOSHKENT TESTLARI O''TDI' AS natija;
