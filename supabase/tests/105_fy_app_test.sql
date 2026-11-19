-- Behavioural tests for migration 105 (FY app outbox). THROWAWAY DB only (recipe: CLAUDE.md §5).
\set ON_ERROR_STOP on

INSERT INTO public.events (id, name, date) VALUES
  ('e1050000-0000-0000-0000-000000000001', 'Ilovadagi', '2026-12-01'),
  ('e1050000-0000-0000-0000-000000000002', 'Ichki', '2026-12-02');
INSERT INTO public.event_participants (id, event_id, full_name, phone, price, paid) VALUES
  ('f1050000-0000-0000-0000-000000000001', 'e1050000-0000-0000-0000-000000000001', 'Toladi', '+998901050001', 0, 0),
  ('f1050000-0000-0000-0000-000000000002', 'e1050000-0000-0000-0000-000000000001', 'Qarzdor', '+998901050002', 1000, 0),
  ('f1050000-0000-0000-0000-000000000003', 'e1050000-0000-0000-0000-000000000001', 'Raqamsiz', NULL, 0, 0);

CREATE OR REPLACE FUNCTION pg_temp.n(p_kind text, p_event text, p_phone text DEFAULT NULL) RETURNS integer
LANGUAGE sql AS $$ SELECT count(*)::int FROM public.fy_app_outbox
  WHERE kind = p_kind AND event_id::text = p_event AND phone IS NOT DISTINCT FROM p_phone AND status = 'pending' $$;

DO $$ BEGIN
  -- Not shown in the app: nothing queued, whatever changes
  IF (SELECT count(*) FROM public.fy_app_outbox) <> 0 THEN RAISE EXCEPTION 'hidden events must not queue'; END IF;
  UPDATE public.events SET name = 'Ichki 2' WHERE id = 'e1050000-0000-0000-0000-000000000002';
  INSERT INTO public.event_tariffs (event_id, name, price) VALUES ('e1050000-0000-0000-0000-000000000002', 'Std', 100);
  IF (SELECT count(*) FROM public.fy_app_outbox) <> 0 THEN RAISE EXCEPTION 'hidden event edits queued'; END IF;

  -- Shown: one event row + confirms for the paid-up participants with a phone (not the debtor, not the phoneless)
  UPDATE public.events SET show_in_app = true WHERE id = 'e1050000-0000-0000-0000-000000000001';
  IF pg_temp.n('event', 'e1050000-0000-0000-0000-000000000001') <> 1 THEN RAISE EXCEPTION 'show must queue the event'; END IF;
  IF pg_temp.n('confirm', 'e1050000-0000-0000-0000-000000000001', '+998901050001') <> 1 THEN RAISE EXCEPTION 'paid-up participant must be confirmed on show'; END IF;
  IF pg_temp.n('confirm', 'e1050000-0000-0000-0000-000000000001', '+998901050002') <> 0 THEN RAISE EXCEPTION 'debtor confirmed'; END IF;
  IF (SELECT count(*) FROM public.fy_app_outbox WHERE kind = 'confirm') <> 1 THEN RAISE EXCEPTION 'phoneless participant queued'; END IF;

  -- A burst of edits stays one pending row, and a row waiting out a retry is pulled forward
  UPDATE public.fy_app_outbox SET next_try_at = now() + interval '1 hour' WHERE kind = 'event';
  UPDATE public.events SET location = 'Hilton' WHERE id = 'e1050000-0000-0000-0000-000000000001';
  INSERT INTO public.event_tariffs (event_id, name, price) VALUES ('e1050000-0000-0000-0000-000000000001', 'VIP', 5000);
  IF pg_temp.n('event', 'e1050000-0000-0000-0000-000000000001') <> 1 THEN RAISE EXCEPTION 'edits must collapse into one row'; END IF;
  IF (SELECT next_try_at FROM public.fy_app_outbox WHERE kind = 'event' AND status = 'pending') > now() THEN RAISE EXCEPTION 'new edit must not wait for the retry'; END IF;

  -- Once sent, the next change queues a fresh row
  UPDATE public.fy_app_outbox SET status = 'sent' WHERE kind = 'event';
  DELETE FROM public.event_tariffs WHERE name = 'VIP';
  IF pg_temp.n('event', 'e1050000-0000-0000-0000-000000000001') <> 1 THEN RAISE EXCEPTION 'tariff delete must queue'; END IF;

  -- The debtor pays in full (paid set as sync_participant_paid does it) → confirm; paying again → nothing new
  UPDATE public.event_participants SET paid = 1000 WHERE id = 'f1050000-0000-0000-0000-000000000002';
  IF pg_temp.n('confirm', 'e1050000-0000-0000-0000-000000000001', '+998901050002') <> 1 THEN RAISE EXCEPTION 'full payment must confirm'; END IF;
  UPDATE public.fy_app_outbox SET status = 'sent' WHERE kind = 'confirm';
  UPDATE public.event_participants SET paid = 1000, notes = 'x' WHERE id = 'f1050000-0000-0000-0000-000000000002';
  IF pg_temp.n('confirm', 'e1050000-0000-0000-0000-000000000001', '+998901050002') <> 0 THEN RAISE EXCEPTION 'already paid must not confirm again'; END IF;

  -- A no-show is never confirmed; a new free seat is
  INSERT INTO public.event_participants (event_id, full_name, phone, price, paid, no_show_at) VALUES
    ('e1050000-0000-0000-0000-000000000001', 'Kelmadi', '+998901050004', 0, 0, now());
  IF pg_temp.n('confirm', 'e1050000-0000-0000-0000-000000000001', '+998901050004') <> 0 THEN RAISE EXCEPTION 'no-show confirmed'; END IF;
  INSERT INTO public.event_participants (event_id, full_name, phone, price, paid) VALUES
    ('e1050000-0000-0000-0000-000000000001', 'Bepul', '+998901050005', 0, 0);
  IF pg_temp.n('confirm', 'e1050000-0000-0000-0000-000000000001', '+998901050005') <> 1 THEN RAISE EXCEPTION 'free seat must confirm'; END IF;

  -- Hidden again → queued (the worker sends DELETE); deleted while shown → queued
  UPDATE public.fy_app_outbox SET status = 'sent';
  UPDATE public.events SET show_in_app = false WHERE id = 'e1050000-0000-0000-0000-000000000001';
  IF pg_temp.n('event', 'e1050000-0000-0000-0000-000000000001') <> 1 THEN RAISE EXCEPTION 'hide must queue'; END IF;
  UPDATE public.fy_app_outbox SET status = 'sent';
  UPDATE public.events SET name = 'still hidden' WHERE id = 'e1050000-0000-0000-0000-000000000001';
  IF pg_temp.n('event', 'e1050000-0000-0000-0000-000000000001') <> 0 THEN RAISE EXCEPTION 'hidden edit queued'; END IF;
  UPDATE public.events SET show_in_app = true WHERE id = 'e1050000-0000-0000-0000-000000000002';
  UPDATE public.fy_app_outbox SET status = 'sent';
  DELETE FROM public.events WHERE id = 'e1050000-0000-0000-0000-000000000002';
  IF pg_temp.n('event', 'e1050000-0000-0000-0000-000000000002') <> 1 THEN RAISE EXCEPTION 'delete of a shown event must queue'; END IF;

  -- API roles can't write the queue or call the queue functions
  IF has_function_privilege('authenticated', 'public.fy_app_queue(text, uuid, text)', 'EXECUTE') THEN RAISE EXCEPTION 'fy_app_queue open to authenticated'; END IF;
  IF has_table_privilege('authenticated', 'public.fy_app_outbox', 'INSERT') THEN RAISE EXCEPTION 'outbox insert open to authenticated'; END IF;

  RAISE NOTICE '105 ok';
END $$;
