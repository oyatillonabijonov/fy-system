-- 083: SMS to clients through Eskiz (notify.eskiz.uz).
-- Staff with the new 'sms' module write a text (with {ism}), pick clients and send:
--   send_sms(kind, text, client_ids) → one sms_campaigns row + one sms_messages row per phone
--   (deduped, no phone = skipped, promo skips clients with sms_opt_out), pg_notify('sms_outbox').
-- amo-sync (src/sms.ts) drains the queue into Eskiz and records Eskiz's delivery callback.
-- Sending only 9:00–21:00 Tashkent. Rows are never edited or deleted from the API.

BEGIN;

-- New module id (also in auth.ts ModuleName/MODULES and admin-create-user VALID_MODULES)
ALTER TABLE public.user_permissions DROP CONSTRAINT IF EXISTS user_permissions_module_check;
ALTER TABLE public.user_permissions
  ADD CONSTRAINT user_permissions_module_check
  CHECK (module IN ('dashboard', 'sotuv-crmn', 'mijozlar', 'tadbirlar', 'tadbirlar-moliya', 'sozlamalar', 'integratsiyalar', 'sms'));

-- "Reklama SMS'i yubormang" — reminders still go
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS sms_opt_out boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.sms_templates (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text        NOT NULL CHECK (btrim(title) <> ''),
  text       text        NOT NULL CHECK (btrim(text) <> ''),
  created_by uuid        REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sms_campaigns (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       text        NOT NULL CHECK (kind IN ('promo', 'reminder')),
  text       text        NOT NULL,
  created_by uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sms_messages (
  id          bigserial   PRIMARY KEY,
  campaign_id uuid        NOT NULL REFERENCES public.sms_campaigns(id) ON DELETE CASCADE,
  client_id   uuid        REFERENCES public.clients(id) ON DELETE SET NULL,
  phone       text        NOT NULL,
  text        text        NOT NULL,           -- {ism} already filled in
  -- queued → sent (Eskiz took it) → delivered / failed; failed also after 3 send errors
  status      text        NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'failed')),
  eskiz_id    text,
  error       text,
  attempts    int         NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sms_messages_campaign_idx ON public.sms_messages (campaign_id);
CREATE INDEX IF NOT EXISTS sms_messages_client_idx ON public.sms_messages (client_id);
CREATE INDEX IF NOT EXISTS sms_messages_queued_idx ON public.sms_messages (id) WHERE status = 'queued';

ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_messages  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sms_templates_manage ON public.sms_templates;
CREATE POLICY sms_templates_manage ON public.sms_templates FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'sms'))
  WITH CHECK (public.has_permission(auth.uid(), 'sms'));
-- Campaigns and messages: read only; written by send_sms / amo-sync
DROP POLICY IF EXISTS sms_campaigns_read ON public.sms_campaigns;
CREATE POLICY sms_campaigns_read ON public.sms_campaigns FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'sms'));
DROP POLICY IF EXISTS sms_messages_read ON public.sms_messages;
CREATE POLICY sms_messages_read ON public.sms_messages FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'sms'));

CREATE OR REPLACE FUNCTION public.send_sms(p_kind text, p_text text, p_client_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_campaign uuid;
  v_hour int := extract(hour FROM now() AT TIME ZONE 'Asia/Tashkent');
  v_queued int;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'sms') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_kind NOT IN ('promo', 'reminder') THEN RAISE EXCEPTION 'bad_kind'; END IF;
  IF btrim(coalesce(p_text, '')) = '' THEN RAISE EXCEPTION 'empty_text'; END IF;
  IF v_hour < 9 OR v_hour >= 21 THEN RAISE EXCEPTION 'quiet_hours'; END IF;

  INSERT INTO sms_campaigns (kind, text, created_by) VALUES (p_kind, p_text, auth.uid())
  RETURNING id INTO v_campaign;

  -- One SMS per phone; the first word of the name fills {ism}
  INSERT INTO sms_messages (campaign_id, client_id, phone, text)
  SELECT DISTINCT ON (c.phone) v_campaign, c.id, c.phone,
         replace(p_text, '{ism}', split_part(btrim(c.full_name), ' ', 1))
  FROM clients c
  WHERE c.id = ANY (p_client_ids) AND c.phone IS NOT NULL
    AND NOT (p_kind = 'promo' AND c.sms_opt_out)
  ORDER BY c.phone, c.created_at;
  GET DIAGNOSTICS v_queued = ROW_COUNT;

  IF v_queued = 0 THEN RAISE EXCEPTION 'no_recipients'; END IF;
  PERFORM pg_notify('sms_outbox', v_campaign::text);
  RETURN jsonb_build_object('campaign_id', v_campaign, 'queued', v_queued,
                            'skipped', coalesce(array_length(p_client_ids, 1), 0) - v_queued);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_sms(text, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_sms(text, text, uuid[]) TO authenticated;

-- Campaign list with its counts in one read (Tarix tab)
CREATE OR REPLACE VIEW public.sms_campaign_stats WITH (security_invoker = true) AS
SELECT c.id, c.kind, c.text, c.created_at, c.created_by, p.full_name AS author,
       count(m.id)::int                                         AS total,
       count(m.id) FILTER (WHERE m.status = 'queued')::int      AS queued,
       count(m.id) FILTER (WHERE m.status = 'sent')::int        AS sent,
       count(m.id) FILTER (WHERE m.status = 'delivered')::int   AS delivered,
       count(m.id) FILTER (WHERE m.status = 'failed')::int      AS failed
FROM sms_campaigns c
LEFT JOIN profiles p ON p.id = c.created_by
LEFT JOIN sms_messages m ON m.campaign_id = c.id
GROUP BY c.id, p.full_name;

GRANT SELECT ON public.sms_campaign_stats TO authenticated;

COMMIT;
