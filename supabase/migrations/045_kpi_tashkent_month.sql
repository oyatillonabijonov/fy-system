-- Migration 045: KPI months follow Asia/Tashkent, not UTC
--
-- calculate_employee_kpi_actual built its period with make_timestamptz(..., 'UTC'),
-- but the business runs in Tashkent (UTC+5). A deal closed on the 1st of a month
-- between 00:00 and 04:59 local time fell into the PREVIOUS month's KPI, and the
-- last day's evening deals landed in the next one.
--
-- Safe to apply now: every crm_leads.responsible_user_id is NULL after 044, so no
-- employee's recorded revenue moves. Doing this later, with live data, would
-- silently restate past months.
--
-- Still deliberately unchanged: the period filters on updated_at, so editing a won
-- lead re-dates its revenue. Fixing that needs a real closed_at column and a
-- backfill — a separate change with its own data decisions.

CREATE OR REPLACE FUNCTION public.calculate_employee_kpi_actual(
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
  period_start timestamptz;
  period_end   timestamptz;
BEGIN
  -- Midnight on the 1st in Tashkent, as an absolute instant.
  period_start := make_timestamptz(p_year, p_month, 1, 0, 0, 0, 'Asia/Tashkent');

  -- The month must be added on the Tashkent CALENDAR. `period_start + INTERVAL
  -- '1 month'` would do that arithmetic in the session timezone (UTC), and since
  -- period_start is the previous day 19:00 UTC, that lands on the 30th/31st —
  -- cutting the last local day out of the period. Round-tripping through the
  -- local wall clock keeps the month whole (and rolls the year over for December).
  period_end := ((period_start AT TIME ZONE 'Asia/Tashkent') + INTERVAL '1 month')
                AT TIME ZONE 'Asia/Tashkent';

  SELECT
    COALESCE((
      SELECT SUM(price)
      FROM crm_leads
      WHERE responsible_user_id = p_user_id
        AND is_won = true
        AND updated_at >= period_start
        AND updated_at < period_end
    ), 0),

    COALESCE((
      SELECT COUNT(*)::int
      FROM crm_leads
      WHERE responsible_user_id = p_user_id
        AND is_won = true
        AND updated_at >= period_start
        AND updated_at < period_end
    ), 0),

    -- Events managed: still a placeholder (events has no responsible_user_id)
    0
  INTO revenue_actual, leads_closed, events_managed;

  RETURN NEXT;
END;
$$;
