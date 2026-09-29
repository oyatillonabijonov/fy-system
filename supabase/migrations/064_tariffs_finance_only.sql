-- 064: tariffs are money settings — only finance editors write them.
--
-- A tariff's price becomes the participant's agreed price on enrolment
-- (enroll_participant), so with 063 limiting the individual price to finance
-- editors, anyone with the Tadbirlar module could still get around it by adding
-- a "0 so'm" tariff (or lowering one) and enrolling by it. RLS keeps letting
-- staff read tariffs; INSERT / UPDATE / DELETE from the API now need
-- can_edit_finance. SECURITY INVOKER, same idea as 062: current_user is
-- 'authenticated'/'anon' only for a direct API write. The event drawer shows
-- tariffs read-only to everyone else and doesn't save them.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_event_tariffs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND NOT public.can_edit_finance(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: tariffs_finance_only';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trigger_guard_event_tariffs ON public.event_tariffs;
CREATE TRIGGER trigger_guard_event_tariffs
  BEFORE INSERT OR UPDATE OR DELETE ON public.event_tariffs
  FOR EACH ROW EXECUTE FUNCTION public.guard_event_tariffs();

COMMIT;
