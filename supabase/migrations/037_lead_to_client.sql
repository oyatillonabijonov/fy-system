-- Migration 037: Lead → Client automation
-- Adds client_id to crm_contacts and an atomic RPC for closing a lead as won.

-- ─── SCHEMA ──────────────────────────────────────────────────────────────────

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';

ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_client ON public.crm_contacts(client_id);

-- ─── RPC: close_crm_lead_won ──────────────────────────────────────────────────
-- Atomically marks lead won, finds or creates a client by phone, links contact.
-- Returns: { client_id, created: bool }

CREATE OR REPLACE FUNCTION public.close_crm_lead_won(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contact_id  uuid;
  v_phone       text;
  v_name        text;
  v_client_id   uuid;
  v_created     bool := false;
BEGIN
  -- Fetch lead's contact info (lead must exist)
  SELECT l.contact_id, c.phone, c.name
  INTO   v_contact_id, v_phone, v_name
  FROM   public.crm_leads l
  LEFT JOIN public.crm_contacts c ON c.id = l.contact_id
  WHERE  l.id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead topilmadi: %', p_lead_id;
  END IF;

  -- Mark lead won
  UPDATE public.crm_leads
  SET    is_won = true, is_lost = false, updated_at = now()
  WHERE  id = p_lead_id;

  -- Link client only when a contact exists
  IF v_contact_id IS NOT NULL THEN
    v_phone := public.normalize_phone(v_phone);

    -- 1) Try to find existing client by normalized phone
    IF v_phone IS NOT NULL THEN
      SELECT id INTO v_client_id
      FROM   public.clients
      WHERE  phone = v_phone
      LIMIT  1;
    END IF;

    -- 2) If no match → create
    IF v_client_id IS NULL THEN
      INSERT INTO public.clients (full_name, phone, source, status)
      VALUES (v_name, v_phone, 'crm', 'Faol')
      RETURNING id INTO v_client_id;
      v_created := true;
    END IF;

    -- 3) Link contact → client
    UPDATE public.crm_contacts
    SET    client_id = v_client_id, updated_at = now()
    WHERE  id = v_contact_id;
  END IF;

  RETURN jsonb_build_object('client_id', v_client_id, 'created', v_created);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.close_crm_lead_won(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.close_crm_lead_won(uuid) TO authenticated;

-- ─── BACKFILL ─────────────────────────────────────────────────────────────────
-- For existing won leads whose contact has no client_id yet.

DO $$
DECLARE
  r           record;
  v_phone     text;
  v_client_id uuid;
  v_matched   int := 0;
  v_created   int := 0;
BEGIN
  FOR r IN
    SELECT c.id AS contact_id, c.phone, c.name
    FROM   public.crm_leads l
    JOIN   public.crm_contacts c ON c.id = l.contact_id
    WHERE  l.is_won = true
      AND  c.client_id IS NULL
  LOOP
    v_phone     := public.normalize_phone(r.phone);
    v_client_id := NULL;

    IF v_phone IS NOT NULL THEN
      SELECT id INTO v_client_id FROM public.clients WHERE phone = v_phone LIMIT 1;
    END IF;

    IF v_client_id IS NOT NULL THEN
      v_matched := v_matched + 1;
    ELSE
      INSERT INTO public.clients (full_name, phone, source, status)
      VALUES (r.name, v_phone, 'crm', 'Faol')
      RETURNING id INTO v_client_id;
      v_created := v_created + 1;
    END IF;

    UPDATE public.crm_contacts SET client_id = v_client_id WHERE id = r.contact_id;
  END LOOP;

  RAISE NOTICE 'Backfill natijasi: matched=%, created=%', v_matched, v_created;
END;
$$;
