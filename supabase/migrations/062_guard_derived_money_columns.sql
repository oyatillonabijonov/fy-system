-- 062: derived money columns can't be written from the API.
--
-- RLS lets any staff member UPDATE/INSERT event_participants and clients (for names,
-- seller, attendance…), and 053's guard only covered price / next_due_date. So a
-- staff login with NO Moliya right could PATCH through PostgREST:
--   event_participants.paid           → a debt shows as paid
--   event_participants.cashback_earned / no_show_at → settle_event_cashback re-awards
--   event_participants.cashback_used  → cash (and so cashback) inflated
--   clients.cashback_balance          → any balance, then spent by a finance editor
-- These columns are maintained only by triggers / SECURITY DEFINER functions
-- (sync_participant_paid, spend_cashback, settle_event_cashback, settle_no_show,
-- recalc_client_cashback_balance), which run as the function owner. The guard is
-- SECURITY INVOKER on purpose: current_user is then 'authenticated'/'anon' only
-- for a direct API write, and the owner inside those functions.
-- cashback_percent (per participant) now needs the Moliya edit right, like price.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_participant_derived_money()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.paid, 0) <> 0 OR COALESCE(NEW.cashback_used, 0) <> 0
       OR COALESCE(NEW.cashback_earned, 0) <> 0 OR NEW.no_show_at IS NOT NULL THEN
      RAISE EXCEPTION 'forbidden: derived_money_fields';
    END IF;
  ELSE
    IF NEW.paid IS DISTINCT FROM OLD.paid
       OR NEW.cashback_used IS DISTINCT FROM OLD.cashback_used
       OR NEW.cashback_earned IS DISTINCT FROM OLD.cashback_earned
       OR NEW.no_show_at IS DISTINCT FROM OLD.no_show_at
       OR NEW.skip_cashback_award IS DISTINCT FROM OLD.skip_cashback_award THEN
      RAISE EXCEPTION 'forbidden: derived_money_fields';
    END IF;
    IF NEW.cashback_percent IS DISTINCT FROM OLD.cashback_percent
       AND NOT public.can_edit_finance(auth.uid()) THEN
      RAISE EXCEPTION 'forbidden: finance_fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_guard_participant_derived_money ON public.event_participants;
CREATE TRIGGER trigger_guard_participant_derived_money
  BEFORE INSERT OR UPDATE ON public.event_participants
  FOR EACH ROW EXECUTE FUNCTION public.guard_participant_derived_money();

CREATE OR REPLACE FUNCTION public.guard_client_cashback_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND ((TG_OP = 'INSERT' AND COALESCE(NEW.cashback_balance, 0) <> 0)
          OR (TG_OP = 'UPDATE' AND NEW.cashback_balance IS DISTINCT FROM OLD.cashback_balance)) THEN
    RAISE EXCEPTION 'forbidden: derived_money_fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_guard_client_cashback_balance ON public.clients;
CREATE TRIGGER trigger_guard_client_cashback_balance
  BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.guard_client_cashback_balance();

COMMIT;
