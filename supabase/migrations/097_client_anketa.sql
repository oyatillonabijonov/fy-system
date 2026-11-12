-- 097: a client fills in their own card through a link (the "anketa"): photo, name, company, position,
-- field of work. A personal link per client (30 days) or one universal link (a QR at an event; the client
-- types their phone too). Nothing reaches the card until a Mijozlar user approves it; an approved person is
-- a Mijoz (is_customer), even without a won bitim. The public page calls anketa_open / anketa_submit with
-- the anon key; everything else is staff-only. Design: docs/superpowers/specs/2026-11-12-client-profile-link-design.md
BEGIN;

CREATE TABLE public.client_profile_links (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token       text        NOT NULL UNIQUE,
  client_id   uuid        REFERENCES public.clients(id) ON DELETE CASCADE,   -- NULL = the universal link
  created_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,                                                -- NULL = never (universal)
  closed_at   timestamptz
);
CREATE UNIQUE INDEX client_profile_links_one_open ON public.client_profile_links (client_id) WHERE closed_at IS NULL;
CREATE UNIQUE INDEX client_profile_links_one_universal ON public.client_profile_links ((true)) WHERE closed_at IS NULL AND client_id IS NULL;

CREATE TABLE public.client_profile_submissions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id     uuid        NOT NULL REFERENCES public.client_profile_links(id) ON DELETE CASCADE,
  client_id   uuid        REFERENCES public.clients(id) ON DELETE CASCADE,   -- universal: the phone's client when sent (a hint)
  phone       text,                                                       -- universal link only
  full_name   text        NOT NULL,
  company     text,
  role        text,
  activity    text,
  photo_path  text,                                                       -- client-images: anketa/<token>/…
  ip          text,
  status      text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX client_profile_submissions_status ON public.client_profile_submissions (status, created_at DESC);
CREATE INDEX client_profile_submissions_client ON public.client_profile_submissions (client_id) WHERE status = 'pending';

-- Every accepted submit, for the rate limit (a replaced pending row is deleted, so the table above can't count)
CREATE TABLE public.client_profile_submit_log (
  link_id uuid        NOT NULL REFERENCES public.client_profile_links(id) ON DELETE CASCADE,
  ip      text,
  at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX client_profile_submit_log_link ON public.client_profile_submit_log (link_id, at);

ALTER TABLE public.client_profile_links       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_profile_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_profile_submit_log  ENABLE ROW LEVEL SECURITY;   -- functions only
REVOKE ALL ON public.client_profile_links, public.client_profile_submissions, public.client_profile_submit_log FROM anon;
CREATE POLICY client_profile_links_read ON public.client_profile_links FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'mijozlar') OR public.has_permission(auth.uid(), 'sotuv-crmn'));
CREATE POLICY client_profile_submissions_read ON public.client_profile_submissions FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'mijozlar'));

ALTER TABLE public.clients ADD COLUMN profile_confirmed_at timestamptz;

-- 077 + an approved anketa makes a Mijoz
CREATE OR REPLACE FUNCTION public.is_customer(c public.clients)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT NOT (COALESCE(c.source, '') = 'sotuv' OR EXISTS (SELECT 1 FROM public.crm_lead_sources s WHERE s.id = c.source))
      OR EXISTS (SELECT 1 FROM public.crm_leads l WHERE l.client_id = c.id AND l.is_won)
      OR EXISTS (SELECT 1 FROM public.event_participants p WHERE p.contact_id = c.id)
      OR c.profile_confirmed_at IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.anketa_new_token() RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT replace(gen_random_uuid()::text, '-', '')   -- 32 hex chars, 122 random bits
$$;

CREATE OR REPLACE FUNCTION public.anketa_require_link_right() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT (public.has_permission(auth.uid(), 'mijozlar') OR public.has_permission(auth.uid(), 'sotuv-crmn')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;
END $$;

-- The client's open personal link (a new one when there is none or it expired)
CREATE OR REPLACE FUNCTION public.client_profile_link(p_client uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v text;
BEGIN
  PERFORM public.anketa_require_link_right();
  UPDATE public.client_profile_links SET closed_at = now()
   WHERE client_id = p_client AND closed_at IS NULL AND expires_at <= now();
  SELECT token INTO v FROM public.client_profile_links WHERE client_id = p_client AND closed_at IS NULL;
  IF v IS NULL THEN
    INSERT INTO public.client_profile_links (token, client_id, created_by, expires_at)
    VALUES (public.anketa_new_token(), p_client, auth.uid(), now() + interval '30 days') RETURNING token INTO v;
  END IF;
  RETURN v;
END $$;

-- The universal link; p_regenerate (admins) closes it and makes a new one
CREATE OR REPLACE FUNCTION public.universal_profile_link(p_regenerate boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v text;
BEGIN
  PERFORM public.anketa_require_link_right();
  IF p_regenerate THEN
    IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege'; END IF;
    UPDATE public.client_profile_links SET closed_at = now() WHERE client_id IS NULL AND closed_at IS NULL;
  END IF;
  SELECT token INTO v FROM public.client_profile_links WHERE client_id IS NULL AND closed_at IS NULL;
  IF v IS NULL THEN
    INSERT INTO public.client_profile_links (token, created_by) VALUES (public.anketa_new_token(), auth.uid()) RETURNING token INTO v;
  END IF;
  RETURN v;
END $$;

-- A usable link or one error that says nothing about why
CREATE OR REPLACE FUNCTION public.anketa_link(p_token text)
RETURNS public.client_profile_links LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE l public.client_profile_links;
BEGIN
  SELECT * INTO l FROM public.client_profile_links
   WHERE token = p_token AND closed_at IS NULL AND (expires_at IS NULL OR expires_at > now());
  IF l.id IS NULL THEN RAISE EXCEPTION 'anketa_invalid'; END IF;
  RETURN l;
END $$;

-- Public page: what to pre-fill (only these fields, the phone masked)
CREATE OR REPLACE FUNCTION public.anketa_open(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE l public.client_profile_links; c public.clients; s public.client_profile_submissions;
BEGIN
  l := public.anketa_link(p_token);
  IF l.client_id IS NULL THEN
    RETURN jsonb_build_object('kind', 'universal', 'full_name', '', 'company', '', 'role', '', 'activity', '',
                              'image', NULL, 'photo_path', NULL, 'phone_masked', NULL);
  END IF;
  SELECT * INTO c FROM public.clients WHERE id = l.client_id;
  SELECT * INTO s FROM public.client_profile_submissions WHERE link_id = l.id AND status = 'pending';
  RETURN jsonb_build_object(
    'kind', 'personal',
    'full_name', COALESCE(s.full_name, c.full_name, ''),
    'company', COALESCE(s.company, c.company, ''),
    'role', COALESCE(s.role, c.role, ''),
    'activity', COALESCE(s.activity, c.activity, ''),
    'image', c.image,
    'photo_path', s.photo_path,
    'phone_masked', CASE WHEN c.phone ~ '^\+998\d{9}$'
      THEN '+998 ' || substr(c.phone, 5, 2) || ' *** ' || substr(c.phone, 10, 2) || ' ' || substr(c.phone, 12, 2) END);
END $$;

CREATE OR REPLACE FUNCTION public.anketa_text(p jsonb, k text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v text := NULLIF(btrim(p->>k), '');
BEGIN
  IF length(v) > 150 THEN RAISE EXCEPTION 'anketa_too_long'; END IF;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.anketa_name(v text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  v := btrim(v);
  IF v IS NULL OR length(v) < 2 OR length(v) > 100 THEN RAISE EXCEPTION 'anketa_name'; END IF;
  RETURN v;
END $$;

-- Public page: send (replaces this link's — universal: this phone's — pending submission)
CREATE OR REPLACE FUNCTION public.anketa_submit(p_token text, p_data jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  l public.client_profile_links;
  v_ip text := NULLIF(current_setting('request.headers', true), '')::json->>'cf-connecting-ip';
  v_name text; v_company text; v_role text; v_activity text; v_photo text; v_phone text; v_client uuid;
BEGIN
  l := public.anketa_link(p_token);
  v_name := public.anketa_name(p_data->>'full_name');
  v_company := public.anketa_text(p_data, 'company');
  v_role := public.anketa_text(p_data, 'role');
  v_activity := public.anketa_text(p_data, 'activity');
  v_photo := NULLIF(btrim(p_data->>'photo_path'), '');
  IF v_photo IS NOT NULL AND v_photo !~ ('^anketa/' || l.token || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$') THEN
    RAISE EXCEPTION 'anketa_photo';
  END IF;
  IF l.client_id IS NULL THEN
    v_phone := public.clean_client_phone(p_data->>'phone');
    IF v_phone IS NULL OR v_phone !~ '^\+998\d{9}$' THEN RAISE EXCEPTION 'anketa_phone'; END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('anketa:' || l.id::text));
  IF l.client_id IS NOT NULL THEN
    IF (SELECT count(*) FROM public.client_profile_submit_log WHERE link_id = l.id AND at > now() - interval '1 hour') >= 20 THEN
      RAISE EXCEPTION 'anketa_rate_limited'; END IF;
  ELSIF (SELECT count(*) FROM public.client_profile_submit_log WHERE link_id = l.id AND at > now() - interval '1 hour') >= 1000
     OR (v_ip IS NOT NULL AND (SELECT count(*) FROM public.client_profile_submit_log
                                WHERE link_id = l.id AND ip = v_ip AND at > now() - interval '1 hour') >= 10) THEN
    RAISE EXCEPTION 'anketa_rate_limited';
  END IF;
  INSERT INTO public.client_profile_submit_log (link_id, ip) VALUES (l.id, v_ip);

  IF l.client_id IS NOT NULL THEN
    v_client := l.client_id;
    DELETE FROM public.client_profile_submissions WHERE link_id = l.id AND status = 'pending';
  ELSE
    SELECT id INTO v_client FROM public.clients WHERE phone = v_phone;
    DELETE FROM public.client_profile_submissions WHERE link_id = l.id AND phone = v_phone AND status = 'pending';
  END IF;
  INSERT INTO public.client_profile_submissions (link_id, client_id, phone, full_name, company, role, activity, photo_path, ip)
  VALUES (l.id, v_client, v_phone, v_name, v_company, v_role, v_activity, v_photo, v_ip);
END $$;

-- Staff: write a pending submission to the card (staff may correct the text first); returns the client
CREATE OR REPLACE FUNCTION public.approve_profile_submission(p_id uuid, p_overrides jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.client_profile_submissions;
  v_name text; v_company text; v_role text; v_activity text; v_image text; v_client uuid; v_phone text;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'mijozlar') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT * INTO s FROM public.client_profile_submissions WHERE id = p_id FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'anketa_invalid'; END IF;
  IF s.status <> 'pending' THEN RAISE EXCEPTION 'anketa_reviewed'; END IF;

  v_name := public.anketa_name(COALESCE(NULLIF(btrim(p_overrides->>'full_name'), ''), s.full_name));
  v_company := CASE WHEN p_overrides ? 'company' THEN public.anketa_text(p_overrides, 'company') ELSE s.company END;
  v_role := CASE WHEN p_overrides ? 'role' THEN public.anketa_text(p_overrides, 'role') ELSE s.role END;
  v_activity := CASE WHEN p_overrides ? 'activity' THEN public.anketa_text(p_overrides, 'activity') ELSE s.activity END;
  -- SQL doesn't know the public storage origin: the web passes the photo's public URL, checked against the path
  v_image := NULLIF(btrim(p_overrides->>'image'), '');
  IF v_image IS NOT NULL AND (s.photo_path IS NULL OR v_image !~ '^https?://'
     OR right(v_image, length('/storage/v1/object/public/client-images/' || s.photo_path)) <> '/storage/v1/object/public/client-images/' || s.photo_path) THEN
    RAISE EXCEPTION 'anketa_photo';
  END IF;

  IF s.phone IS NULL THEN
    v_client := s.client_id;
  ELSE
    -- matched again now: a client created since the submit is attached to, never duplicated (057)
    SELECT id INTO v_client FROM public.clients WHERE phone = s.phone;
    IF v_client IS NULL THEN
      INSERT INTO public.clients (full_name, phone, source) VALUES (v_name, s.phone, 'anketa') RETURNING id INTO v_client;
    END IF;
  END IF;

  UPDATE public.clients SET
    full_name = v_name,
    company = COALESCE(v_company, company),
    role = COALESCE(v_role, role),
    activity = COALESCE(v_activity, activity),
    image = COALESCE(v_image, image),
    profile_confirmed_at = now()
  WHERE id = v_client
  RETURNING phone INTO v_phone;

  UPDATE public.client_profile_submissions
     SET status = 'approved', client_id = v_client, reviewed_by = auth.uid(), reviewed_at = now()
   WHERE id = p_id;
  UPDATE public.client_profile_links SET closed_at = now() WHERE id = s.link_id AND client_id IS NOT NULL;
  -- the person's other pending anketa (personal + universal) is settled by this one
  UPDATE public.client_profile_submissions
     SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
   WHERE status = 'pending' AND id <> p_id AND (client_id = v_client OR (v_phone IS NOT NULL AND phone = v_phone));
  RETURN v_client;
END $$;

CREATE OR REPLACE FUNCTION public.reject_profile_submission(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'mijozlar') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege'; END IF;
  UPDATE public.client_profile_submissions SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
   WHERE id = p_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'anketa_reviewed'; END IF;
END $$;

REVOKE ALL ON FUNCTION public.anketa_new_token(), public.anketa_require_link_right(), public.anketa_link(text),
  public.anketa_text(jsonb, text), public.anketa_name(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.client_profile_link(uuid), public.universal_profile_link(boolean),
  public.approve_profile_submission(uuid, jsonb), public.reject_profile_submission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_profile_link(uuid), public.universal_profile_link(boolean),
  public.approve_profile_submission(uuid, jsonb), public.reject_profile_submission(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.anketa_open(text), public.anketa_submit(text, jsonb) TO anon, authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.client_profile_submissions;

COMMIT;
