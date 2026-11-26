-- A task's id in an outside system (2026-11-26, for the Claude connector's create_task), e.g.
-- "todoist:6j58mQfW3468v4gx". Unique, so the same outside task is never created twice:
-- create_task inserts with ON CONFLICT (external_id) DO NOTHING and returns the task that is there.
ALTER TABLE public.tasks ADD COLUMN external_id text UNIQUE CHECK (btrim(external_id) <> '');
