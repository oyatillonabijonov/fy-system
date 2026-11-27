-- A call to a client whose bitimlar are all closed lands on the latest of them (2026-11-27, a seller:
-- "yopilganlarga tel qilsam zapisi bitimga tushmayapti"). 074 tied a call only to an OPEN bitim, so a
-- seller calling through closed bitimlar found the call and its recording in Qo'ng'iroqlar only, never
-- in the bitim's feed. The rest of the function is 074's, unchanged.
CREATE OR REPLACE FUNCTION public.log_pbx_call(
  p_uuid text, p_accountcode text, p_caller text, p_dest text,
  p_started bigint, p_duration integer, p_talk integer, p_hangup text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_dir    text;
  v_ext    text;
  v_phone  text;
  v_staff  uuid;
  v_client uuid;
  v_lead   uuid;
  v_resp   uuid;
  src      public.crm_lead_sources;
BEGIN
  IF EXISTS (SELECT 1 FROM public.crm_calls WHERE uuid = p_uuid) THEN RETURN 'known'; END IF;

  -- inbound/missed: outside → us; outbound: us → outside; local = ext to ext
  IF p_accountcode IN ('inbound', 'missed') THEN
    v_dir := 'in';  v_phone := p_caller;
    v_ext := CASE WHEN p_dest ~ '^\d{2,6}$' THEN p_dest END;
  ELSIF p_accountcode = 'outbound' THEN
    v_dir := 'out'; v_phone := p_dest;
    v_ext := CASE WHEN p_caller ~ '^\d{2,6}$' THEN p_caller END;
  ELSE
    RETURN 'skipped';
  END IF;
  v_phone := public.clean_client_phone(v_phone);

  SELECT id INTO v_staff FROM public.profiles WHERE pbx_ext = v_ext;
  IF v_phone IS NOT NULL THEN
    SELECT id INTO v_client FROM public.clients WHERE phone = v_phone;
  END IF;
  IF v_client IS NOT NULL THEN
    SELECT id, responsible_user_id INTO v_lead, v_resp FROM public.crm_leads
    WHERE client_id = v_client AND NOT is_won AND NOT is_lost ORDER BY updated_at DESC LIMIT 1;
  END IF;

  -- An incoming call with no open deal → a new deal via the 'call' lead source (if it's on)
  IF v_dir = 'in' AND v_lead IS NULL AND v_phone IS NOT NULL THEN
    SELECT * INTO src FROM public.crm_lead_sources WHERE id = 'call';
    IF src.enabled AND src.pipeline_id IS NOT NULL THEN
      v_lead := (public.intake_lead('call', src.token, NULL, v_phone,
                   CASE WHEN p_talk > 0 THEN 'Kiruvchi qo''ng''iroq' ELSE 'Javobsiz kiruvchi qo''ng''iroq' END,
                   jsonb_build_object('uuid', p_uuid)) ->> 'lead_id')::uuid;
      SELECT client_id, responsible_user_id INTO v_client, v_resp FROM public.crm_leads WHERE id = v_lead;
    END IF;
  END IF;

  -- Still no bitim: the client's latest one, closed as it is, so the call shows in its feed
  IF v_lead IS NULL AND v_client IS NOT NULL THEN
    SELECT id, responsible_user_id INTO v_lead, v_resp FROM public.crm_leads
    WHERE client_id = v_client ORDER BY updated_at DESC LIMIT 1;
  END IF;

  INSERT INTO public.crm_calls (uuid, direction, phone, ext, staff_id, client_id, lead_id, started_at, duration, talk_time, hangup_cause)
  VALUES (p_uuid, v_dir, v_phone, v_ext, v_staff, v_client, v_lead, to_timestamp(p_started),
          GREATEST(COALESCE(p_duration, 0), 0), GREATEST(COALESCE(p_talk, 0), 0), p_hangup);

  -- Missed incoming call on a deal → call back (once: not while such a task is still open)
  IF v_dir = 'in' AND COALESCE(p_talk, 0) = 0 AND v_lead IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.crm_tasks WHERE lead_id = v_lead AND kind = 'call' AND NOT is_done AND text = 'Javobsiz qo''ng''iroq — qayta qo''ng''iroq qiling') THEN
    INSERT INTO public.crm_tasks (lead_id, kind, text, due_date, assignee_id, created_by)
    VALUES (v_lead, 'call', 'Javobsiz qo''ng''iroq — qayta qo''ng''iroq qiling', now() + interval '15 minutes', COALESCE(v_resp, v_staff), NULL);
  END IF;
  RETURN 'logged';
END $$;
REVOKE ALL ON FUNCTION public.log_pbx_call(text, text, text, text, bigint, integer, integer, text) FROM PUBLIC, anon, authenticated;

-- Calls logged before this that found no bitim: the client's latest bitim that already existed at the time of the call
UPDATE public.crm_calls c SET lead_id = (
  SELECT l.id FROM public.crm_leads l WHERE l.client_id = c.client_id AND l.created_at <= c.started_at
  ORDER BY l.updated_at DESC LIMIT 1)
WHERE c.lead_id IS NULL
  AND EXISTS (SELECT 1 FROM public.crm_leads l WHERE l.client_id = c.client_id AND l.created_at <= c.started_at);
