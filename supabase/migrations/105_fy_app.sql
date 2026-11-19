-- 105: events in the FY members' app (https://com.fikryetakchilari.uz, its own backend and DB).
-- An event marked show_in_app is pushed to the app's /admin API by amo-sync (src/fyApp.ts):
--   kind 'event'    PUT /admin/events/<id> with the event's state at send time, or DELETE when it is
--                   hidden, inactive or deleted. Any change to the event or its tariffs queues one row.
--   kind 'confirm'  POST /admin/events/<id>/registrations/<phone>/confirm when a participant's debt
--                   reaches 0 (paid in full, or a free seat) — the app then marks the member registered.
-- The queue keeps one pending row per (kind, event, phone): a burst of edits sends once, with the latest state.
-- Paid applications come back the other way as leads, through the existing /hooks/lead/sayt webhook.
BEGIN;

ALTER TABLE public.events
  ADD COLUMN show_in_app     boolean NOT NULL DEFAULT false,
  ADD COLUMN start_time      time,      -- Tashkent wall clock; `date` keeps the day as before
  ADD COLUMN app_category    text,      -- the app's own list: Nonushta | Master-klass | Safari | Networking
  ADD COLUMN app_capacity    integer CHECK (app_capacity > 0),
  ADD COLUMN app_pipeline_id uuid REFERENCES public.crm_pipelines(id) ON DELETE SET NULL;  -- where the app's paid applications land

CREATE TABLE public.fy_app_outbox (
  id          bigserial   PRIMARY KEY,
  kind        text        NOT NULL CHECK (kind IN ('event', 'confirm')),
  event_id    uuid        NOT NULL,   -- no FK: a deleted event still needs its DELETE
  phone       text,
  status      text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts    integer     NOT NULL DEFAULT 0,
  next_try_at timestamptz NOT NULL DEFAULT now(),
  response    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz
);
CREATE UNIQUE INDEX fy_app_outbox_one_pending ON public.fy_app_outbox (kind, event_id, (COALESCE(phone, ''))) WHERE status = 'pending';
CREATE INDEX fy_app_outbox_due ON public.fy_app_outbox (next_try_at) WHERE status = 'pending';
CREATE INDEX fy_app_outbox_event ON public.fy_app_outbox (event_id, id DESC);
ALTER TABLE public.fy_app_outbox ENABLE ROW LEVEL SECURITY;
-- The event page shows whether the app got the last change
CREATE POLICY "fy app outbox read" ON public.fy_app_outbox FOR SELECT USING (public.has_permission(auth.uid(), 'tadbirlar'));
GRANT SELECT ON public.fy_app_outbox TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.fy_app_outbox FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.fy_app_queue(p_kind text, p_event uuid, p_phone text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.fy_app_outbox (kind, event_id, phone) VALUES (p_kind, p_event, p_phone)
  ON CONFLICT (kind, event_id, (COALESCE(phone, ''))) WHERE status = 'pending'
  DO UPDATE SET next_try_at = now();   -- waiting out a retry: the new state goes now
END $$;
REVOKE ALL ON FUNCTION public.fy_app_queue(text, uuid, text) FROM PUBLIC, anon, authenticated;

-- Participants already paid up when the event is first shown get their confirm too
CREATE OR REPLACE FUNCTION public.fy_app_queue_paid(p_event uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.fy_app_queue('confirm', p_event, ep.phone) FROM public.event_participants ep
  WHERE ep.event_id = p_event AND ep.phone IS NOT NULL AND ep.no_show_at IS NULL AND ep.price - ep.paid <= 0;
$$;
REVOKE ALL ON FUNCTION public.fy_app_queue_paid(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fy_app_on_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.show_in_app THEN PERFORM public.fy_app_queue('event', OLD.id); END IF;
    RETURN NULL;
  END IF;
  IF NEW.show_in_app OR (TG_OP = 'UPDATE' AND OLD.show_in_app) THEN
    PERFORM public.fy_app_queue('event', NEW.id);
  END IF;
  IF NEW.show_in_app AND (TG_OP = 'INSERT' OR NOT OLD.show_in_app) THEN
    PERFORM public.fy_app_queue_paid(NEW.id);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trigger_fy_app_on_event AFTER INSERT OR UPDATE OR DELETE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.fy_app_on_event();

-- The app shows the cheapest tariff as the price
CREATE OR REPLACE FUNCTION public.fy_app_on_tariff()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_event uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.event_id ELSE NEW.event_id END;
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE id = v_event AND show_in_app) THEN
    PERFORM public.fy_app_queue('event', v_event);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trigger_fy_app_on_tariff AFTER INSERT OR UPDATE OR DELETE ON public.event_tariffs
  FOR EACH ROW EXECUTE FUNCTION public.fy_app_on_tariff();

-- Debt reaching 0 (a payment, a price cut, a free seat) confirms the seat in the app
CREATE OR REPLACE FUNCTION public.fy_app_on_participant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.phone IS NULL OR NEW.no_show_at IS NOT NULL OR NEW.price - NEW.paid > 0 THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND OLD.price - OLD.paid <= 0 AND OLD.phone IS NOT DISTINCT FROM NEW.phone THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.events WHERE id = NEW.event_id AND show_in_app) THEN
    PERFORM public.fy_app_queue('confirm', NEW.event_id, NEW.phone);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trigger_fy_app_on_participant AFTER INSERT OR UPDATE OF paid, price, phone ON public.event_participants
  FOR EACH ROW EXECUTE FUNCTION public.fy_app_on_participant();

COMMIT;
