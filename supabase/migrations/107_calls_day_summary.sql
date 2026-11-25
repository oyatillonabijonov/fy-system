-- 107: one day's calls in numbers for the Qo'ng'iroqlar page — asked by a seller (2026-11-25): "how many calls
-- today, how many picked up, how many didn't". The Dashboard's call card has no answered / not-answered split for
-- outgoing calls. A day is an Asia/Tashkent calendar day; answered = talk_time > 0; p_staff NULL = everyone.
BEGIN;
CREATE FUNCTION public.calls_day_summary(p_day date, p_staff uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_from timestamptz := (p_day::timestamp AT TIME ZONE 'Asia/Tashkent');
  r jsonb;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'sotuv-crmn') THEN
    RAISE EXCEPTION 'sotuv-crmn permission required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT jsonb_build_object(
    'out',          count(*) FILTER (WHERE direction = 'out'),
    'out_answered', count(*) FILTER (WHERE direction = 'out' AND talk_time > 0),
    'in',           count(*) FILTER (WHERE direction = 'in'),
    'in_answered',  count(*) FILTER (WHERE direction = 'in' AND talk_time > 0),
    'talk_sec',     COALESCE(sum(talk_time), 0),
    'numbers',      count(DISTINCT phone)
  ) INTO r
  FROM public.crm_calls
  WHERE started_at >= v_from AND started_at < v_from + interval '1 day'
    AND (p_staff IS NULL OR staff_id = p_staff);
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.calls_day_summary(date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calls_day_summary(date, uuid) TO authenticated;
COMMIT;
