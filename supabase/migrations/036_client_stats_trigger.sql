-- Migration 036: Auto-sync clients.total_spent and clients.events_count
-- Fires after any change to event_participants that affects a client's stats.
-- Also backfills existing rows.

-- ─── SYNC FUNCTION ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_client_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_client uuid;
  v_old_client uuid;
BEGIN
  -- Determine which client(s) need updating
  v_new_client := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.contact_id END;
  v_old_client := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.contact_id END;

  -- If contact_id changed on UPDATE, refresh the old client too
  IF v_old_client IS NOT NULL AND (TG_OP = 'DELETE' OR v_old_client IS DISTINCT FROM v_new_client) THEN
    UPDATE public.clients
    SET
      total_spent  = COALESCE((
        SELECT SUM(ep.paid) FROM public.event_participants ep WHERE ep.contact_id = v_old_client
      ), 0),
      events_count = (
        SELECT COUNT(*) FROM public.event_participants ep WHERE ep.contact_id = v_old_client
      )
    WHERE id = v_old_client;
  END IF;

  -- Refresh the current (new) client
  IF v_new_client IS NOT NULL THEN
    UPDATE public.clients
    SET
      total_spent  = COALESCE((
        SELECT SUM(ep.paid) FROM public.event_participants ep WHERE ep.contact_id = v_new_client
      ), 0),
      events_count = (
        SELECT COUNT(*) FROM public.event_participants ep WHERE ep.contact_id = v_new_client
      )
    WHERE id = v_new_client;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_client_stats() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sync_client_stats() TO service_role;

-- ─── TRIGGER ─────────────────────────────────────────────────────────────────
-- Fires AFTER payments trigger (trigger_sync_participant_paid) has already
-- updated event_participants.paid, so total_spent reflects the latest paid value.

DROP TRIGGER IF EXISTS trigger_sync_client_stats ON public.event_participants;

CREATE TRIGGER trigger_sync_client_stats
  AFTER INSERT OR UPDATE OR DELETE ON public.event_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_client_stats();

-- ─── BACKFILL ────────────────────────────────────────────────────────────────

UPDATE public.clients c
SET
  total_spent  = COALESCE((
    SELECT SUM(ep.paid) FROM public.event_participants ep WHERE ep.contact_id = c.id
  ), 0),
  events_count = (
    SELECT COUNT(*) FROM public.event_participants ep WHERE ep.contact_id = c.id
  );
