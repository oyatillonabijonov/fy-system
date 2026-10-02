-- Form answers as the deal's own fields (like AmoCRM's left column), not only feed text.
-- crm_leads.fields = [{k: "Lavozimingiz", v: "Asoschi"}, …] in the form's order.
-- A repeat request updates the answers it carries and keeps the rest.
BEGIN;

ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS fields jsonb NOT NULL DEFAULT '[]'::jsonb;

-- The signature grows, so the old one goes (a defaulted 7th arg would make 6-arg calls ambiguous)
DROP FUNCTION IF EXISTS public.intake_lead(text, text, text, text, text, jsonb);
CREATE FUNCTION public.intake_lead(
  p_source text, p_token text, p_name text, p_phone text, p_details text,
  p_raw jsonb DEFAULT '{}'::jsonb, p_fields jsonb DEFAULT '[]'::jsonb)
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
  v_fields jsonb := COALESCE(p_fields, '[]'::jsonb);
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
    INSERT INTO public.crm_leads (name, pipeline_id, stage_id, client_id, source, responsible_user_id, created_by, fields)
    VALUES (COALESCE(v_name, (SELECT full_name FROM public.clients WHERE id = v_client)), src.pipeline_id, v_stage, v_client, p_source, NULL, NULL, v_fields)
    RETURNING id INTO v_lead;
  ELSIF jsonb_array_length(v_fields) > 0 THEN
    -- Old answers the new request doesn't carry stay first, then the new ones
    UPDATE public.crm_leads l SET fields = (
      SELECT COALESCE(jsonb_agg(e ORDER BY ord), '[]'::jsonb) FROM (
        SELECT e, o AS ord FROM jsonb_array_elements(l.fields) WITH ORDINALITY t(e, o)
        WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_fields) n WHERE n->>'k' = e->>'k')
        UNION ALL
        SELECT e, 100000 + o FROM jsonb_array_elements(v_fields) WITH ORDINALITY t(e, o)) s)
    WHERE l.id = v_lead;
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
-- Called only by the amo-sync service (table owner) and log_pbx_call; never through the API
REVOKE ALL ON FUNCTION public.intake_lead(text, text, text, text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

-- Deals opened before this: their "Savol: javob" lines from the form request(s) in the feed
UPDATE public.crm_leads l SET fields = f.fields
FROM (
  SELECT n.lead_id, jsonb_agg(jsonb_build_object('k', split_part(line, ': ', 1), 'v', substr(line, strpos(line, ': ') + 2)) ORDER BY n.created_at, i) AS fields
  FROM public.crm_notes n,
       unnest((string_to_array(n.text, E'\n'))[2:]) WITH ORDINALITY u(line, i)
  WHERE n.kind = 'lead' AND strpos(line, ': ') > 1
  GROUP BY n.lead_id) f
WHERE l.id = f.lead_id AND l.fields = '[]'::jsonb;

COMMIT;
