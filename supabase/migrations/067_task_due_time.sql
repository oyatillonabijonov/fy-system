-- 067: optional time of day on a task's deadline ("ertaga soat 14:00").
-- Tashkent wall-clock time, meaningful only with a due_date. A task due today
-- whose time has passed shows as overdue (UI); the morning report prints it.

BEGIN;

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS due_time time;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_due_time_needs_date CHECK (due_time IS NULL OR due_date IS NOT NULL);

COMMIT;
