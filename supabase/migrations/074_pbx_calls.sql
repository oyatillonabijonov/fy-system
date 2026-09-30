-- 074: OnlinePBX calls in Sotuv bo'limi. amo-sync reads the PBX call history every minute
-- and hands each call to log_pbx_call(): the call is tied to the client (by phone), the
-- staff member (by their internal number, profiles.pbx_ext) and the client's open deal,
-- so it shows in the deal's feed. A missed incoming call opens a "Qayta qo'ng'iroq" task;
-- an incoming call from a number with no open deal opens one through the lead source
-- 'call' (Lid manbalari → "Kiruvchi qo'ng'iroq", off until switched on).
-- Browser calling (Verto/WebRTC) needs no table: amo-sync hands each signed-in staff
-- member the credentials of their own internal number only.

BEGIN;

-- Internal number (100, 101…); admin-only like every non-personal profile column (056)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pbx_ext text UNIQUE CHECK (pbx_ext ~ '^\d{2,6}$');

CREATE TABLE IF NOT EXISTS public.crm_calls (
  uuid         text        PRIMARY KEY,                 -- OnlinePBX call uuid
  direction    text        NOT NULL CHECK (direction IN ('in', 'out')),
  phone        text,                                     -- the outside party, +998…
  ext          text,                                     -- our internal number
  staff_id     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  client_id    uuid        REFERENCES public.clients(id) ON DELETE SET NULL,
  lead_id      uuid        REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  started_at   timestamptz NOT NULL,
  duration     integer     NOT NULL DEFAULT 0,           -- seconds, ringing included
  talk_time    integer     NOT NULL DEFAULT 0,           -- seconds actually talked; 0 = not answered
  hangup_cause text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_calls_lead    ON public.crm_calls (lead_id, started_at);
CREATE INDEX IF NOT EXISTS idx_crm_calls_client  ON public.crm_calls (client_id, started_at);
CREATE INDEX IF NOT EXISTS idx_crm_calls_started ON public.crm_calls (started_at);
ALTER TABLE public.crm_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_calls read" ON public.crm_calls FOR SELECT USING (public.has_permission(auth.uid(), 'sotuv-crmn'));
GRANT SELECT ON public.crm_calls TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.crm_calls FROM anon, authenticated;   -- written only by log_pbx_call
ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_calls;

INSERT INTO public.crm_lead_sources (id, label, pipeline_id)
VALUES ('call', 'Kiruvchi qo''ng''iroq', (SELECT id FROM public.crm_pipelines ORDER BY sort_order, created_at LIMIT 1))
ON CONFLICT (id) DO NOTHING;

-- One call from the PBX history. Idempotent (the uuid is the key); internal calls are skipped.
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

COMMIT;
