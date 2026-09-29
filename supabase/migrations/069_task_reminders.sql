-- 069: which Telegram task reminders went out (amo-sync/src/tasks.ts).
-- A task with a due date AND time gets: "soon" (1 h before), "due" (at the time)
-- and "late" (once a day at that time while it stays open). The key holds the due
-- moment (soon/due) or the day (late), so moving the deadline re-arms the reminders
-- and a restart never repeats one. Written only by amo-sync (table owner) — RLS on,
-- no policies, so the API can't read or write it.

CREATE TABLE IF NOT EXISTS public.task_reminders (
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  kind    text NOT NULL CHECK (kind IN ('soon', 'due', 'late')),
  key     text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, kind, key)
);

ALTER TABLE public.task_reminders ENABLE ROW LEVEL SECURITY;
