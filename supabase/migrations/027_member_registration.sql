-- ============================================
-- MEMBER REGISTRATION: event price + member RPCs
-- ============================================

-- 1. Events need a price so registration can snapshot it
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS price numeric(12,2) NOT NULL DEFAULT 0;

-- 2. One registration per client per event.
--    NOTE: before pushing to cloud, check for existing duplicates:
--    SELECT event_id, contact_id, count(*) FROM event_participants
--    WHERE contact_id IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_event_participant_contact
  ON event_participants (event_id, contact_id)
  WHERE contact_id IS NOT NULL;

-- 3. register_for_event: member self-registration.
--    SECURITY DEFINER because members have no INSERT right on
--    event_participants — the RPC controls the snapshot and the price.
CREATE OR REPLACE FUNCTION public.register_for_event(p_event_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client public.clients%ROWTYPE;
  v_event public.events%ROWTYPE;
  v_participant_id uuid;
BEGIN
  SELECT * INTO v_client FROM public.clients WHERE auth_user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A''zo profili topilmadi';
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND OR NOT COALESCE(v_event.is_active, false) THEN
    RAISE EXCEPTION 'Tadbir topilmadi yoki faol emas';
  END IF;
  IF v_event.date IS NOT NULL AND v_event.date < now() THEN
    RAISE EXCEPTION 'Tadbir allaqachon bo''lib o''tgan';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.event_participants
    WHERE event_id = p_event_id AND contact_id = v_client.id
  ) THEN
    RAISE EXCEPTION 'Siz allaqachon ro''yxatdan o''tgansiz';
  END IF;

  INSERT INTO public.event_participants (
    event_id, contact_id, full_name, phone, email, company,
    role, industry, revenue, activity, photo_url,
    status, price, paid
  ) VALUES (
    p_event_id, v_client.id, v_client.full_name, v_client.phone, v_client.email, v_client.company,
    v_client.role, v_client.industry, v_client.revenue, v_client.activity, v_client.image,
    'pending', COALESCE(v_event.price, 0), 0
  )
  RETURNING id INTO v_participant_id;

  RETURN v_participant_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Siz allaqachon ro''yxatdan o''tgansiz';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_for_event(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_for_event(uuid) TO authenticated, service_role;

-- 4. member_update_profile: members may edit only safe columns of their
--    own row. cashback_balance / total_spent / status stay staff-owned.
CREATE OR REPLACE FUNCTION public.member_update_profile(
  p_full_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_company text DEFAULT NULL,
  p_activity text DEFAULT NULL,
  p_industry text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.clients SET
    full_name  = COALESCE(NULLIF(trim(p_full_name), ''), full_name),
    phone      = COALESCE(p_phone, phone),
    company    = COALESCE(p_company, company),
    activity   = COALESCE(p_activity, activity),
    industry   = COALESCE(p_industry, industry),
    updated_at = now()
  WHERE auth_user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A''zo profili topilmadi';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.member_update_profile(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_update_profile(text, text, text, text, text) TO authenticated, service_role;
