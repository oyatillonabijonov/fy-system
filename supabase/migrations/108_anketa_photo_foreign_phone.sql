-- 108: the client anketa (097) — the photo is required, and phones of other countries are accepted.
--   * anketa_submit: no photo → 'anketa_photo_required', unless it is a personal link whose card already has a
--     photo; on the universal link a phone may be another country's (+ and 8–15 digits) besides +998XXXXXXXXX.
--   * anketa_open: the masked phone is shown for another country's number too.
-- Both functions are the 097 bodies with only these rules changed.
BEGIN;

-- Public page: what to pre-fill (only these fields, the phone masked)
CREATE OR REPLACE FUNCTION public.anketa_open(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE l public.client_profile_links; c public.clients; s public.client_profile_submissions;
BEGIN
  l := public.anketa_link(p_token);
  IF l.client_id IS NULL THEN
    RETURN jsonb_build_object('kind', 'universal', 'link_id', l.id, 'full_name', '', 'company', '', 'role', '', 'activity', '',
                              'image', NULL, 'photo_path', NULL, 'phone_masked', NULL);
  END IF;
  SELECT * INTO c FROM public.clients WHERE id = l.client_id;
  SELECT * INTO s FROM public.client_profile_submissions WHERE link_id = l.id AND status = 'pending';
  RETURN jsonb_build_object(
    'kind', 'personal',
    'link_id', l.id,
    'full_name', COALESCE(s.full_name, c.full_name, ''),
    'company', COALESCE(s.company, c.company, ''),
    'role', COALESCE(s.role, c.role, ''),
    'activity', COALESCE(s.activity, c.activity, ''),
    'image', c.image,
    'photo_path', s.photo_path,
    'phone_masked', CASE
      WHEN c.phone ~ '^\+998\d{9}$' THEN '+998 ' || substr(c.phone, 5, 2) || ' *** ' || substr(c.phone, 10, 2) || ' ' || substr(c.phone, 12, 2)
      WHEN c.phone ~ '^\+\d{8,15}$' THEN left(c.phone, 4) || ' *** ' || right(c.phone, 2)   -- another country's number
    END);
END $$;

-- Public page: send (replaces this link's — universal: this phone's, or `replace_id`'s when the person fixed
-- the phone — pending submission). Returns the row id, so a resend can say which row it replaces.
CREATE OR REPLACE FUNCTION public.anketa_submit(p_token text, p_data jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  l public.client_profile_links;
  v_ip text := NULLIF(current_setting('request.headers', true), '')::json->>'cf-connecting-ip';
  v_name text; v_company text; v_role text; v_activity text; v_photo text; v_phone text; v_client uuid; v_id uuid;
  v_replace text := NULLIF(p_data->>'replace_id', '');
BEGIN
  l := public.anketa_link(p_token);
  v_name := public.anketa_name(p_data->>'full_name');
  v_company := public.anketa_text(p_data, 'company');
  v_role := public.anketa_text(p_data, 'role');
  v_activity := public.anketa_text(p_data, 'activity');
  v_photo := NULLIF(btrim(p_data->>'photo_path'), '');
  IF v_photo IS NOT NULL AND v_photo !~ ('^anketa/' || l.id::text || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$') THEN
    RAISE EXCEPTION 'anketa_photo';
  END IF;
  IF l.client_id IS NULL THEN
    v_phone := public.clean_client_phone(p_data->>'phone');
    -- Uzbek: +998 and nine digits; another country: its code and 8–15 digits in all, with the +
    IF v_phone IS NULL OR NOT (v_phone ~ '^\+998\d{9}$' OR (v_phone ~ '^\+\d{8,15}$' AND v_phone !~ '^\+998')) THEN
      RAISE EXCEPTION 'anketa_phone';
    END IF;
  END IF;
  -- The photo is the point of the anketa: required, unless the card already has one
  IF v_photo IS NULL AND (l.client_id IS NULL
      OR NULLIF(btrim((SELECT image FROM public.clients WHERE id = l.client_id)), '') IS NULL) THEN
    RAISE EXCEPTION 'anketa_photo_required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('anketa:' || l.id::text));
  IF l.client_id IS NOT NULL THEN
    IF (SELECT count(*) FROM public.client_profile_submit_log WHERE link_id = l.id AND at > now() - interval '1 hour') >= 20 THEN
      RAISE EXCEPTION 'anketa_rate_limited'; END IF;
  ELSIF (SELECT count(*) FROM public.client_profile_submit_log WHERE link_id = l.id AND at > now() - interval '1 hour') >= 1000
     OR (v_ip IS NOT NULL AND (SELECT count(*) FROM public.client_profile_submit_log
                                WHERE link_id = l.id AND ip = v_ip AND at > now() - interval '1 hour') >= 60) THEN   -- an event hall shares one IP
    RAISE EXCEPTION 'anketa_rate_limited';
  END IF;
  INSERT INTO public.client_profile_submit_log (link_id, ip) VALUES (l.id, v_ip);

  IF l.client_id IS NOT NULL THEN
    v_client := l.client_id;
    DELETE FROM public.client_profile_submissions WHERE link_id = l.id AND status = 'pending';
  ELSE
    SELECT id INTO v_client FROM public.clients WHERE phone = v_phone;
    DELETE FROM public.client_profile_submissions WHERE link_id = l.id AND status = 'pending'
       AND (phone = v_phone OR (v_replace ~ '^[0-9a-f-]{36}$' AND id = v_replace::uuid));
  END IF;
  INSERT INTO public.client_profile_submissions (link_id, client_id, phone, full_name, company, role, activity, photo_path, ip)
  VALUES (l.id, v_client, v_phone, v_name, v_company, v_role, v_activity, v_photo, v_ip) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

COMMIT;
