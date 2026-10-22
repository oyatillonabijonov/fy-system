-- 084: a client's card and their event participations stay in sync.
-- event_participants keeps its own copy of the contact (name, phone, email, company, role, photo)
-- taken at enrolment; editing the client in Mijozlar never reached it, so a photo added later
-- didn't show in Tadbirlar, the booklet or the stickers until the person was removed and enrolled
-- again. Now every change to those client fields is copied to all of their participations.
-- Only the fields that actually changed are copied, so a participation's own value is never
-- overwritten by an unrelated edit.

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_participants_from_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE event_participants ep SET
    full_name = CASE WHEN NEW.full_name IS DISTINCT FROM OLD.full_name THEN NEW.full_name ELSE ep.full_name END,
    phone     = CASE WHEN NEW.phone     IS DISTINCT FROM OLD.phone     THEN NEW.phone     ELSE ep.phone     END,
    email     = CASE WHEN NEW.email     IS DISTINCT FROM OLD.email     THEN NEW.email     ELSE ep.email     END,
    company   = CASE WHEN NEW.company   IS DISTINCT FROM OLD.company   THEN NEW.company   ELSE ep.company   END,
    role      = CASE WHEN NEW.role      IS DISTINCT FROM OLD.role      THEN NEW.role      ELSE ep.role      END,
    photo_url = CASE WHEN NEW.image     IS DISTINCT FROM OLD.image     THEN NEW.image     ELSE ep.photo_url END
  WHERE ep.contact_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_participants_from_client ON public.clients;
CREATE TRIGGER trigger_sync_participants_from_client
  AFTER UPDATE OF full_name, phone, email, company, role, image ON public.clients
  FOR EACH ROW
  WHEN (NEW.full_name IS DISTINCT FROM OLD.full_name OR NEW.phone IS DISTINCT FROM OLD.phone
        OR NEW.email IS DISTINCT FROM OLD.email OR NEW.company IS DISTINCT FROM OLD.company
        OR NEW.role IS DISTINCT FROM OLD.role OR NEW.image IS DISTINCT FROM OLD.image)
  EXECUTE FUNCTION public.sync_participants_from_client();

-- Backfill: the client card is the source of truth wherever it has a value
UPDATE public.event_participants ep SET
  full_name = c.full_name,
  phone     = COALESCE(c.phone, ep.phone),
  email     = COALESCE(c.email, ep.email),
  company   = COALESCE(c.company, ep.company),
  role      = COALESCE(c.role, ep.role),
  photo_url = COALESCE(c.image, ep.photo_url)
FROM public.clients c
WHERE c.id = ep.contact_id
  AND (ep.full_name IS DISTINCT FROM c.full_name
       OR (c.phone IS NOT NULL AND ep.phone IS DISTINCT FROM c.phone)
       OR (c.email IS NOT NULL AND ep.email IS DISTINCT FROM c.email)
       OR (c.company IS NOT NULL AND ep.company IS DISTINCT FROM c.company)
       OR (c.role IS NOT NULL AND ep.role IS DISTINCT FROM c.role)
       OR (c.image IS NOT NULL AND ep.photo_url IS DISTINCT FROM c.image));

COMMIT;
