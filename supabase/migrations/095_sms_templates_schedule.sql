-- 095: SMS made convenient. Templates live in the platform: written here (blanks in braces, {ism} = first
-- name), submitted to Eskiz and kept in sync by amo-sync (src/sms.ts), sendable only once Eskiz approved
-- them; the kind (reklama / eslatma) comes from Eskiz. send_sms_template() builds the texts from an
-- approved template, can be scheduled (send_at; amo-sync still sends only 9:00–21:00, so a late send waits
-- for the morning) and cancelled. A Sotuv bo'limi user may send to ONE client (the bitim page) and read the
-- approved templates and SMS history; bulk sending stays with the 'sms' module.
BEGIN;

ALTER TABLE public.sms_templates
  ADD COLUMN status       text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'moderation', 'approved', 'rejected')),
  ADD COLUMN kind         text        CHECK (kind IN ('promo', 'reminder')),
  ADD COLUMN eskiz_id     integer     UNIQUE,
  ADD COLUMN pattern      text,
  ADD COLUMN hidden       boolean     NOT NULL DEFAULT false,
  ADD COLUMN submitted_at timestamptz,
  ADD COLUMN checked_at   timestamptz;

-- Template state is amo-sync's: the API may only write drafts / ask for moderation; changing the text of a
-- template Eskiz already saw sends it back to moderation
CREATE OR REPLACE FUNCTION public.guard_sms_template()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft', 'moderation') OR NEW.eskiz_id IS NOT NULL OR NEW.kind IS NOT NULL
       OR NEW.pattern IS NOT NULL OR NEW.submitted_at IS NOT NULL OR NEW.checked_at IS NOT NULL THEN
      RAISE EXCEPTION 'Shablon holatini faqat tizim belgilaydi' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.eskiz_id, NEW.kind, NEW.pattern, NEW.submitted_at, NEW.checked_at) IS DISTINCT FROM (OLD.eskiz_id, OLD.kind, OLD.pattern, OLD.submitted_at, OLD.checked_at)
     OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('draft', 'moderation')) THEN
    RAISE EXCEPTION 'Shablon holatini faqat tizim belgilaydi' USING ERRCODE = '42501';
  END IF;
  IF NEW.text IS DISTINCT FROM OLD.text AND OLD.status <> 'draft' THEN
    NEW.status := 'moderation'; NEW.eskiz_id := NULL; NEW.kind := NULL; NEW.pattern := NULL; NEW.submitted_at := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trigger_guard_sms_template BEFORE INSERT OR UPDATE ON public.sms_templates
  FOR EACH ROW EXECUTE FUNCTION public.guard_sms_template();

CREATE POLICY sms_templates_sotuv_read ON public.sms_templates FOR SELECT TO authenticated
  USING (status = 'approved' AND NOT hidden AND public.has_permission(auth.uid(), 'sotuv-crmn'));

ALTER TABLE public.sms_campaigns
  ADD COLUMN send_at      timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN template_id  uuid REFERENCES public.sms_templates(id) ON DELETE SET NULL,
  ADD COLUMN cancelled_at timestamptz;
ALTER TABLE public.sms_messages DROP CONSTRAINT sms_messages_status_check;
ALTER TABLE public.sms_messages ADD CONSTRAINT sms_messages_status_check CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'cancelled'));

CREATE POLICY sms_campaigns_sotuv_read ON public.sms_campaigns FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'sotuv-crmn'));
CREATE POLICY sms_messages_sotuv_read  ON public.sms_messages  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'sotuv-crmn'));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'sms_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_messages;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.send_sms_template(p_template uuid, p_values jsonb, p_client_ids uuid[], p_send_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  t public.sms_templates;
  v_text text;
  v_key text;
  v_campaign uuid;
  v_queued int;
  v_n int := coalesce(array_length(p_client_ids, 1), 0);
BEGIN
  IF NOT (public.has_permission(auth.uid(), 'sms') OR (public.has_permission(auth.uid(), 'sotuv-crmn') AND v_n = 1)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO t FROM public.sms_templates WHERE id = p_template;
  IF t.id IS NULL OR t.status <> 'approved' OR t.hidden OR t.kind IS NULL THEN RAISE EXCEPTION 'not_approved'; END IF;

  -- Every blank except {ism} must have a value
  v_text := t.text;
  FOR v_key IN SELECT DISTINCT m[1] FROM regexp_matches(t.text, '\{([^{}[:space:]]+)\}', 'g') AS m WHERE m[1] <> 'ism' LOOP
    IF btrim(coalesce(p_values->>v_key, '')) = '' THEN RAISE EXCEPTION 'blank_missing: %', v_key; END IF;
    v_text := replace(v_text, '{' || v_key || '}', btrim(p_values->>v_key));
  END LOOP;

  INSERT INTO public.sms_campaigns (kind, text, created_by, send_at, template_id)
  VALUES (t.kind, v_text, auth.uid(), greatest(coalesce(p_send_at, now()), now()), t.id)
  RETURNING id INTO v_campaign;

  INSERT INTO public.sms_messages (campaign_id, client_id, phone, text)
  SELECT DISTINCT ON (c.phone) v_campaign, c.id, c.phone, replace(v_text, '{ism}', split_part(btrim(c.full_name), ' ', 1))
  FROM public.clients c
  WHERE c.id = ANY (p_client_ids) AND c.phone IS NOT NULL AND NOT (t.kind = 'promo' AND c.sms_opt_out)
  ORDER BY c.phone, c.created_at;
  GET DIAGNOSTICS v_queued = ROW_COUNT;
  IF v_queued = 0 THEN RAISE EXCEPTION 'no_recipients'; END IF;

  PERFORM pg_notify('sms_outbox', v_campaign::text);
  RETURN jsonb_build_object('campaign_id', v_campaign, 'queued', v_queued, 'skipped', v_n - v_queued);
END $$;
REVOKE ALL ON FUNCTION public.send_sms_template(uuid, jsonb, uuid[], timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_sms_template(uuid, jsonb, uuid[], timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_sms_campaign(p_campaign uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sms_campaigns WHERE id = p_campaign
                 AND (created_by = auth.uid() OR public.has_permission(auth.uid(), 'sms'))) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.sms_messages SET status = 'cancelled', updated_at = now() WHERE campaign_id = p_campaign AND status = 'queued';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  UPDATE public.sms_campaigns SET cancelled_at = now() WHERE id = p_campaign AND cancelled_at IS NULL;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.cancel_sms_campaign(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_sms_campaign(uuid) TO authenticated;

-- Tarix: + send time, cancelled count, the template's name (new columns at the end)
CREATE OR REPLACE VIEW public.sms_campaign_stats WITH (security_invoker = true) AS
SELECT c.id, c.kind, c.text, c.created_at, c.created_by, p.full_name AS author,
       count(m.id)::int                                         AS total,
       count(m.id) FILTER (WHERE m.status = 'queued')::int      AS queued,
       count(m.id) FILTER (WHERE m.status = 'sent')::int        AS sent,
       count(m.id) FILTER (WHERE m.status = 'delivered')::int   AS delivered,
       count(m.id) FILTER (WHERE m.status = 'failed')::int      AS failed,
       c.send_at,
       count(m.id) FILTER (WHERE m.status = 'cancelled')::int   AS cancelled,
       t.title AS template_title
FROM sms_campaigns c
LEFT JOIN profiles p ON p.id = c.created_by
LEFT JOIN sms_templates t ON t.id = c.template_id
LEFT JOIN sms_messages m ON m.campaign_id = c.id
GROUP BY c.id, p.full_name, t.title;

COMMIT;
