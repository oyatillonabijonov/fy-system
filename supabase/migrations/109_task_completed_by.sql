-- Who completed a task (2026-11-26, for the Claude connector's complete_task / reopen_task).
-- tasks.completed_by follows the status like completed_at does: the signed-in person who moved the
-- task to "done" — on the web, the phone or through the connector — and NULL again once it is reopened.
-- A worker write (the Telegram bot's "bajarildi") has no auth.uid() and keeps what its statement set.
ALTER TABLE public.tasks ADD COLUMN completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.tasks_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'done' AND (TG_OP = 'INSERT' OR OLD.status <> 'done') THEN
    NEW.completed_at := now();
    NEW.completed_by := COALESCE(auth.uid(), NEW.completed_by);
  ELSIF NEW.status <> 'done' THEN
    NEW.completed_at := NULL;
    NEW.completed_by := NULL;
  ELSE
    NEW.completed_by := OLD.completed_by;   -- stays done: nobody rewrites who did it
  END IF;
  RETURN NEW;
END;
$$;
