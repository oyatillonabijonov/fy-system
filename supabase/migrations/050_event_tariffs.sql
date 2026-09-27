-- 050: event tariffs + participant seller; enrolment goes through one RPC.
-- Spec: docs/superpowers/specs/2026-09-27-tadbirlar-moliya-design.md §5.1

BEGIN;

-- ─── event_tariffs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_tariffs (
  id         uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid          NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name       text          NOT NULL CHECK (btrim(name) <> ''),
  price      numeric(12,2) NOT NULL CHECK (price >= 0),
  sort_order int           NOT NULL DEFAULT 0,
  created_at timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_tariffs_event ON public.event_tariffs (event_id, sort_order);

ALTER TABLE public.event_tariffs ENABLE ROW LEVEL SECURITY;
-- Same level as the events table itself (028): staff read and write.
CREATE POLICY "event_tariffs select staff" ON public.event_tariffs
  FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "event_tariffs insert staff" ON public.event_tariffs
  FOR INSERT WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "event_tariffs update staff" ON public.event_tariffs
  FOR UPDATE USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "event_tariffs delete staff" ON public.event_tariffs
  FOR DELETE USING (public.is_staff(auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_tariffs TO authenticated;

-- ─── event_participants: tariff + seller ─────────────────────────────────────
-- NO ACTION (not RESTRICT): checked at statement end, so deleting an event that
-- cascades to both tariffs and participants works whatever order Postgres runs
-- the cascades in (RESTRICT would depend on that order); a lone tariff with
-- participants still can't be deleted.
ALTER TABLE public.event_participants
  ADD COLUMN IF NOT EXISTS tariff_id uuid REFERENCES public.event_tariffs(id),
  ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_event_participants_tariff ON public.event_participants (tariff_id);
CREATE INDEX IF NOT EXISTS idx_event_participants_seller ON public.event_participants (seller_id);

-- ─── enroll_participant ──────────────────────────────────────────────────────
-- Existing client (p_client_id) OR new client (p_full_name + p_phone). The price
-- is copied from the tariff at enrolment — later tariff edits don't reprice.
CREATE OR REPLACE FUNCTION public.enroll_participant(
  p_event_id  uuid,
  p_tariff_id uuid,
  p_seller_id uuid,
  p_client_id uuid DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_phone     text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_price       numeric(12,2);
  v_client      public.clients%ROWTYPE;
  v_phone       text;
  v_participant uuid;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: staff_only';
  END IF;

  SELECT price INTO v_price
  FROM public.event_tariffs
  WHERE id = p_tariff_id AND event_id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tariff_mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_seller_id AND department = 'sotuv' AND COALESCE(is_active, true)
  ) THEN
    RAISE EXCEPTION 'seller_invalid';
  END IF;

  IF p_client_id IS NOT NULL THEN
    SELECT * INTO v_client FROM public.clients WHERE id = p_client_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'client_not_found';
    END IF;
  ELSE
    -- normalize_phone is best-effort (043 note): demand real digits, or junk
    -- like '-' would glue unrelated people onto one client.
    v_phone := public.normalize_phone(COALESCE(p_phone, ''));
    IF btrim(COALESCE(p_full_name, '')) = '' OR v_phone !~ '^\+?\d{9,15}$' THEN
      RAISE EXCEPTION 'client_required';
    END IF;

    SELECT * INTO v_client FROM public.clients WHERE phone = v_phone;
    IF FOUND THEN
      RAISE EXCEPTION 'client_exists:%:%', v_client.id, v_client.full_name;
    END IF;

    INSERT INTO public.clients (full_name, phone, status)
    VALUES (btrim(p_full_name), v_phone, 'Faol')
    RETURNING * INTO v_client;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.event_participants
    WHERE event_id = p_event_id AND contact_id = v_client.id
  ) THEN
    RAISE EXCEPTION 'already_enrolled';
  END IF;

  INSERT INTO public.event_participants (
    event_id, contact_id, full_name, phone, email, company, role, photo_url,
    price, paid, attended, tariff_id, seller_id
  ) VALUES (
    p_event_id, v_client.id, v_client.full_name, v_client.phone, v_client.email,
    v_client.company, v_client.role, v_client.image,
    v_price, 0, false, p_tariff_id, p_seller_id
  )
  RETURNING id INTO v_participant;

  RETURN v_participant;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enroll_participant(uuid, uuid, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.enroll_participant(uuid, uuid, uuid, uuid, text, text) TO authenticated, service_role;

COMMIT;
