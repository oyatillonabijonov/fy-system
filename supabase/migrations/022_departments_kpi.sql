-- 1. Department ENUM type
DO $$ BEGIN
  CREATE TYPE department_type AS ENUM (
    'marketing',
    'sotuv',
    'buxgalteriya',
    'operatsion',
    'it',
    'hr'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Update profiles to use ENUM (preserve existing data)
-- First convert existing text to enum
ALTER TABLE profiles
  ALTER COLUMN department TYPE department_type
  USING (
    CASE LOWER(COALESCE(department, ''))
      WHEN 'marketing' THEN 'marketing'::department_type
      WHEN 'sotuv' THEN 'sotuv'::department_type
      WHEN 'buxgalteriya' THEN 'buxgalteriya'::department_type
      WHEN 'operatsion' THEN 'operatsion'::department_type
      WHEN 'it' THEN 'it'::department_type
      WHEN 'hr' THEN 'hr'::department_type
      ELSE NULL
    END
  );

-- 3. Department head (bo'lim boshlig'i) — optional
CREATE TABLE IF NOT EXISTS department_heads (
  department department_type PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz DEFAULT now()
);

ALTER TABLE department_heads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON department_heads
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin manage" ON department_heads
  FOR ALL USING (is_admin(auth.uid()));

-- 4. KPI targets — admin sets these per employee per month
CREATE TABLE IF NOT EXISTS employee_kpi_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  period_year int NOT NULL,
  period_month int NOT NULL,
  revenue_target numeric(14,2) DEFAULT 0,
  leads_target int DEFAULT 0,
  events_target int DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_kpi_targets_user ON employee_kpi_targets(user_id);
CREATE INDEX IF NOT EXISTS idx_kpi_targets_period ON employee_kpi_targets(period_year, period_month);

ALTER TABLE employee_kpi_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own targets" ON employee_kpi_targets
  FOR SELECT USING (user_id = auth.uid() OR is_admin(auth.uid()));

CREATE POLICY "Admin manage targets" ON employee_kpi_targets
  FOR ALL USING (is_admin(auth.uid()));

-- 5. Function to calculate actual KPI for a user in a period
CREATE OR REPLACE FUNCTION calculate_employee_kpi_actual(
  p_user_id uuid,
  p_year int,
  p_month int
)
RETURNS TABLE(
  revenue_actual numeric,
  leads_closed int,
  events_managed int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  amocrm_uid bigint;
  user_email text;
  period_start timestamptz;
  period_end timestamptz;
BEGIN
  period_start := make_timestamptz(p_year, p_month, 1, 0, 0, 0, 'UTC');
  period_end := period_start + INTERVAL '1 month';

  SELECT email INTO user_email FROM profiles WHERE id = p_user_id;

  SELECT id INTO amocrm_uid
  FROM amocrm_users
  WHERE email = user_email
  LIMIT 1;

  SELECT
    COALESCE((
      SELECT SUM(price)
      FROM amocrm_leads
      WHERE responsible_user_id = amocrm_uid
        AND status_id = 142
        AND to_timestamp(updated_at) >= period_start
        AND to_timestamp(updated_at) < period_end
    ), 0) +
    COALESCE((
      SELECT SUM(price)
      FROM crm_leads
      WHERE responsible_user_id = amocrm_uid
        AND is_won = true
        AND updated_at >= period_start
        AND updated_at < period_end
    ), 0),

    COALESCE((
      SELECT COUNT(*)::int
      FROM amocrm_leads
      WHERE responsible_user_id = amocrm_uid
        AND status_id = 142
        AND to_timestamp(updated_at) >= period_start
        AND to_timestamp(updated_at) < period_end
    ), 0) +
    COALESCE((
      SELECT COUNT(*)::int
      FROM crm_leads
      WHERE responsible_user_id = amocrm_uid
        AND is_won = true
        AND updated_at >= period_start
        AND updated_at < period_end
    ), 0),

    -- Events managed: hozircha 0, kelajakda events.responsible_user_id qo'shilsa hisoblanadi
    0
  INTO revenue_actual, leads_closed, events_managed;

  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION calculate_employee_kpi_actual(uuid, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION calculate_employee_kpi_actual(uuid, int, int) TO authenticated, service_role;
