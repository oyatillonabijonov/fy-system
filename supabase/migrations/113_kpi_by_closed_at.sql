-- 113: a staff member's KPI counts a won bitim in the month it was WON (closed_at), not the month it was
-- last touched (updated_at). crm_lead_stage_rules (072) sets updated_at = now() on every edit, so a bitim won
-- in November and renamed in December moved its sum to December's KPI and out of November's. closed_at is
-- written once, when the bitim enters a won/lost stage, and kept while it stays there.
-- The month is the Tashkent calendar month, as in 045. Signature, grants and the events placeholder are unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION public.calculate_employee_kpi_actual(p_user_id uuid, p_year integer, p_month integer)
RETURNS TABLE(revenue_actual numeric, leads_closed integer, events_managed integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  period_start timestamptz;
  period_end   timestamptz;
BEGIN
  -- Midnight on the 1st in Tashkent, and the next month added on the Tashkent calendar (045)
  period_start := make_timestamptz(p_year, p_month, 1, 0, 0, 0, 'Asia/Tashkent');
  period_end   := ((period_start AT TIME ZONE 'Asia/Tashkent') + INTERVAL '1 month') AT TIME ZONE 'Asia/Tashkent';

  SELECT
    COALESCE(SUM(price), 0),
    COUNT(*)::int,
    0   -- events managed: still a placeholder (the web counts the month's events itself)
  INTO revenue_actual, leads_closed, events_managed
  FROM public.crm_leads
  WHERE responsible_user_id = p_user_id
    AND is_won
    AND closed_at >= period_start AND closed_at < period_end;

  RETURN NEXT;
END;
$$;

COMMIT;
