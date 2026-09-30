-- 073: leads flow into Sotuv bo'limi on their own. Each form source (Tilda, Framer, our
-- site, Meta lead ads) posts to amo-sync's /hooks/lead/<source>?token=…, which calls
-- intake_lead(). The source row (Sozlamalar → Integratsiyalar, admin only — it holds the
-- secret) says which voronka the lead lands in and whether the source is on.
-- One client per phone: a phone that already has an OPEN deal in that voronka doesn't
-- open a second one — the new request goes into that deal's feed ("Qayta murojaat").

BEGIN;

CREATE TABLE IF NOT EXISTS public.crm_lead_sources (
  id           text        PRIMARY KEY,                       -- the URL slug
  label        text        NOT NULL,
  token        text        NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  pipeline_id  uuid        REFERENCES public.crm_pipelines(id) ON DELETE SET NULL,
  enabled      boolean     NOT NULL DEFAULT false,
  leads_count  integer     NOT NULL DEFAULT 0,
  last_lead_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_lead_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_lead_sources admin" ON public.crm_lead_sources FOR ALL
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
GRANT SELECT, UPDATE ON public.crm_lead_sources TO authenticated;

INSERT INTO public.crm_lead_sources (id, label, pipeline_id)
SELECT s.id, s.label, (SELECT id FROM public.crm_pipelines ORDER BY sort_order, created_at LIMIT 1)
FROM (VALUES ('tilda', 'Tilda'), ('framer', 'Framer'), ('sayt', 'Boshqa sayt / forma'), ('meta', 'Facebook / Instagram')) AS s(id, label)
ON CONFLICT (id) DO NOTHING;

-- Feed rows for incoming requests
ALTER TABLE public.crm_notes DROP CONSTRAINT IF EXISTS crm_notes_kind_check;
ALTER TABLE public.crm_notes ADD CONSTRAINT crm_notes_kind_check CHECK (kind IN ('note', 'created', 'stage', 'lead'));

CREATE OR REPLACE FUNCTION public.intake_lead(
  p_source text, p_token text, p_name text, p_phone text, p_details text, p_raw jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  src     public.crm_lead_sources;
  v_log   uuid;
  v_phone text := public.clean_client_phone(p_phone);
  v_name  text := NULLIF(btrim(COALESCE(p_name, '')), '');
  v_client uuid;
  v_lead  uuid;
  v_dup   boolean := false;
  v_stage uuid;
BEGIN
  SELECT * INTO src FROM public.crm_lead_sources WHERE id = p_source;
  IF src.id IS NULL OR src.token IS DISTINCT FROM p_token THEN
    RAISE EXCEPTION 'unknown source or token' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Every request is kept raw, even when the source is off
  INSERT INTO public.webhook_logs (source, raw_body) VALUES (p_source, COALESCE(p_raw, '{}'::jsonb)) RETURNING id INTO v_log;
  IF NOT src.enabled OR src.pipeline_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true);
  END IF;

  IF v_phone IS NOT NULL THEN
    SELECT id INTO v_client FROM public.clients WHERE phone = v_phone;
  END IF;
  IF v_client IS NULL THEN
    INSERT INTO public.clients (full_name, phone, source)
    VALUES (COALESCE(v_name, v_phone, 'Noma''lum'), v_phone, p_source) RETURNING id INTO v_client;
  END IF;

  SELECT id INTO v_lead FROM public.crm_leads
  WHERE client_id = v_client AND pipeline_id = src.pipeline_id AND NOT is_won AND NOT is_lost
  ORDER BY created_at DESC LIMIT 1;
  v_dup := v_lead IS NOT NULL;

  IF NOT v_dup THEN
    SELECT id INTO v_stage FROM public.crm_stages
    WHERE pipeline_id = src.pipeline_id AND NOT is_won AND NOT is_lost ORDER BY sort_order LIMIT 1;
    INSERT INTO public.crm_leads (name, pipeline_id, stage_id, client_id, source, responsible_user_id, created_by)
    VALUES (COALESCE(v_name, (SELECT full_name FROM public.clients WHERE id = v_client)), src.pipeline_id, v_stage, v_client, p_source, NULL, NULL)
    RETURNING id INTO v_lead;
  END IF;

  INSERT INTO public.crm_notes (lead_id, kind, text, meta)
  VALUES (v_lead, 'lead',
          CASE WHEN v_dup THEN 'Qayta murojaat · ' ELSE 'Murojaat · ' END || src.label
            || COALESCE(E'\n' || NULLIF(btrim(p_details), ''), ''),
          jsonb_build_object('source', p_source, 'log_id', v_log));

  UPDATE public.crm_lead_sources SET leads_count = leads_count + 1, last_lead_at = now() WHERE id = p_source;
  UPDATE public.webhook_logs SET processed = true, lead_id = v_lead WHERE id = v_log;
  RETURN jsonb_build_object('ok', true, 'lead_id', v_lead, 'duplicate', v_dup);
END $$;
-- Called only by the amo-sync service (table owner); never through the API
REVOKE ALL ON FUNCTION public.intake_lead(text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

COMMIT;
