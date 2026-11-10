-- 089: a missed call → at once, day or night, a private Telegram message to the seller.
-- The seller presses Start in the bot; the bot knows them by the Telegram username in
-- Profilim (sellers and admins only), keeps their private chat id and shows an on/off
-- button. Who hears it: the owner of the caller's bitim if they switched it on, else
-- everyone who did. The 2-hour group alert (087) stays as it is.
-- amo-sync reads missed_calls_dm() and stamps crm_calls.missed_dm_at, once per call.
BEGIN;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telegram_chat_id bigint;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS missed_dm boolean NOT NULL DEFAULT false;
ALTER TABLE public.crm_calls ADD COLUMN IF NOT EXISTS missed_dm_at timestamptz;

-- Calls already logged are history: switching the bot on must not replay them
UPDATE public.crm_calls SET missed_dm_at = now() WHERE direction = 'in' AND talk_time = 0;

-- One row per number with missed calls not yet sent and not returned since (same "returned"
-- as 087). Older than a day = dropped, so an amo-sync outage doesn't end in a burst.
CREATE OR REPLACE FUNCTION public.missed_calls_dm()
RETURNS TABLE (phone text, client_name text, lead_id uuid, owner_id uuid, calls integer, last_missed timestamptz)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  WITH due AS (
    SELECT m.phone, max(cl.full_name) AS client_name,
           (array_agg(m.lead_id ORDER BY m.started_at DESC) FILTER (WHERE m.lead_id IS NOT NULL))[1] AS lead_id,
           count(*)::integer AS calls, max(m.started_at) AS last_missed
    FROM public.crm_calls m LEFT JOIN public.clients cl ON cl.id = m.client_id
    WHERE m.direction = 'in' AND m.talk_time = 0 AND m.phone IS NOT NULL
      AND m.missed_dm_at IS NULL AND m.started_at > now() - interval '1 day'
      AND NOT EXISTS (SELECT 1 FROM public.crm_calls o WHERE o.phone = m.phone AND o.started_at > m.started_at
                        AND (o.direction = 'out' OR o.talk_time > 0))
    GROUP BY m.phone)
  SELECT d.phone, d.client_name, d.lead_id, l.responsible_user_id, d.calls, d.last_missed
  FROM due d LEFT JOIN public.crm_leads l ON l.id = d.lead_id
  ORDER BY d.last_missed;
$$;
REVOKE ALL ON FUNCTION public.missed_calls_dm() FROM PUBLIC, anon, authenticated;

COMMIT;
