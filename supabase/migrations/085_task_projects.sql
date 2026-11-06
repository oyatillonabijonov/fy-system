-- 085: Vazifalar beyond events — standing projects (Podcast, …).
-- A task lives in an event, a project, or "Umumiy" (both NULL), never in two places.
-- Any active staff member opens/renames a project; deleting is for admins, and the
-- project's tasks fall back to Umumiy. A Telegram group may point at a project: the
-- task bot files that group's tasks there, and the morning report / deadline reminders
-- sent to it cover only that project (amo-sync/src/taskbot.ts, tasks.ts).

BEGIN;

CREATE TABLE public.task_projects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE CHECK (btrim(name) <> ''),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.task_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task projects select staff" ON public.task_projects FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "task projects insert staff" ON public.task_projects FOR INSERT WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "task projects update staff" ON public.task_projects FOR UPDATE
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "task projects delete admin" ON public.task_projects FOR DELETE USING (public.is_admin(auth.uid()));

ALTER TABLE public.tasks ADD COLUMN project_id uuid REFERENCES public.task_projects(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_one_home CHECK (event_id IS NULL OR project_id IS NULL);
CREATE INDEX tasks_project_idx ON public.tasks (project_id, section, sort_order) WHERE project_id IS NOT NULL;

ALTER TABLE public.telegram_groups ADD COLUMN project_id uuid REFERENCES public.task_projects(id) ON DELETE SET NULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.task_projects;

COMMIT;
