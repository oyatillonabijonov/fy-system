-- 087: a missed call nobody returned in 2 hours → a Telegram alert to the groups with the
-- new switch telegram_groups.missed_calls (Sozlamalar → Integratsiyalar). amo-sync reads
-- missed_calls_due() every minute and stamps crm_calls.missed_alerted_at, so each missed
-- call is announced once. "Returned" means what the Dashboard means (082): a later outgoing
-- call to that number, or the number called again and someone answered.
BEGIN;

ALTER TABLE public.telegram_groups ADD COLUMN IF NOT EXISTS missed_calls boolean NOT NULL DEFAULT false;
ALTER TABLE public.crm_calls ADD COLUMN IF NOT EXISTS missed_alerted_at timestamptz;

-- Older calls are history: the first run must not flood the group with them
UPDATE public.crm_calls SET missed_alerted_at = now()
WHERE direction = 'in' AND talk_time = 0 AND started_at < now() - interval '2 hours';

-- One row per number: the clock runs from its oldest unreturned missed call.
-- Older than a day = dropped (an amo-sync outage doesn't end in a burst of stale alerts).
CREATE OR REPLACE FUNCTION public.missed_calls_due(p_after interval DEFAULT interval '2 hours')
RETURNS TABLE (phone text, client_name text, lead_id uuid, owner text, telegram text, calls integer, last_missed timestamptz)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  WITH due AS (
    SELECT m.phone, max(cl.full_name) AS client_name,
           (array_agg(m.lead_id ORDER BY m.started_at DESC) FILTER (WHERE m.lead_id IS NOT NULL))[1] AS lead_id,
           count(*)::integer AS calls, max(m.started_at) AS last_missed
    FROM public.crm_calls m LEFT JOIN public.clients cl ON cl.id = m.client_id
    WHERE m.direction = 'in' AND m.talk_time = 0 AND m.phone IS NOT NULL
      AND m.missed_alerted_at IS NULL AND m.started_at > now() - interval '1 day'
      AND NOT EXISTS (SELECT 1 FROM public.crm_calls o WHERE o.phone = m.phone AND o.started_at > m.started_at
                        AND (o.direction = 'out' OR o.talk_time > 0))
    GROUP BY m.phone
    HAVING min(m.started_at) <= now() - p_after)
  SELECT d.phone, d.client_name, d.lead_id, p.full_name, p.telegram, d.calls, d.last_missed
  FROM due d
  LEFT JOIN public.crm_leads l ON l.id = d.lead_id
  LEFT JOIN public.profiles p ON p.id = l.responsible_user_id
  ORDER BY d.last_missed;
$$;
REVOKE ALL ON FUNCTION public.missed_calls_due(interval) FROM PUBLIC, anon, authenticated;

COMMIT;
