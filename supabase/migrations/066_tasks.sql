-- 066: Vazifalar (task management), replacing the team's per-event Excel sheets.
--
-- tasks: one row per task. event_id NULL = "Umumiy" (not tied to an event);
-- section = the sheet's "bo'lim" (Resort, Spikerlar, Marketing…), free text.
-- The owner is a staff member (assignee_id) or, for outside people like
-- "Hikmat aka", just a name (assignee_name). Status: todo / in_progress / done /
-- failed; "overdue" is not stored — the UI derives it from due_date.
-- task_comments: the "Izoh" column as a dated log.
-- Every active staff member sees, creates and edits every task (decided
-- 2026-09-29); deleting is for the author or an admin. The daily Telegram
-- reminder is sent by the amo-sync worker (amo-sync/src/tasks.ts).
-- Also: staff may set their own profiles.telegram (used for @mentions).

BEGIN;

CREATE TABLE public.tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid REFERENCES public.events(id) ON DELETE CASCADE,
  section       text,
  title         text NOT NULL CHECK (btrim(title) <> ''),
  status        text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done', 'failed')),
  assignee_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assignee_name text,
  due_date      date,
  sort_order    integer NOT NULL DEFAULT 0,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);
CREATE INDEX tasks_event_idx    ON public.tasks (event_id, section, sort_order);
CREATE INDEX tasks_assignee_idx ON public.tasks (assignee_id) WHERE status IN ('todo', 'in_progress');
CREATE INDEX tasks_due_idx      ON public.tasks (due_date)    WHERE status IN ('todo', 'in_progress');

CREATE TABLE public.task_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  body       text NOT NULL CHECK (btrim(body) <> ''),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_comments_task_idx ON public.task_comments (task_id, created_at);

-- updated_at, and completed_at follows the status
CREATE OR REPLACE FUNCTION public.tasks_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'done' AND (TG_OP = 'INSERT' OR OLD.status <> 'done') THEN
    NEW.completed_at := now();
  ELSIF NEW.status <> 'done' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER tasks_touch BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_touch();

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks select staff" ON public.tasks FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "tasks insert staff" ON public.tasks FOR INSERT WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "tasks update staff" ON public.tasks FOR UPDATE
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "tasks delete author or admin" ON public.tasks FOR DELETE
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "task comments select staff" ON public.task_comments FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "task comments insert own" ON public.task_comments FOR INSERT
  WITH CHECK (public.is_staff(auth.uid()) AND author_id = auth.uid());
CREATE POLICY "task comments delete own or admin" ON public.task_comments FOR DELETE
  USING (author_id = auth.uid() OR public.is_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks, public.task_comments TO authenticated;

-- "Oldingi tadbirdan nusxa": the source event's tasks, fresh (no status, no dates,
-- no comments), appended after what the target already has. Returns the count.
CREATE OR REPLACE FUNCTION public.copy_event_tasks(p_from uuid, p_to uuid)
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH base AS (SELECT COALESCE(MAX(sort_order), 0) AS m FROM public.tasks WHERE event_id = p_to),
  ins AS (
    INSERT INTO public.tasks (event_id, section, title, assignee_id, assignee_name, sort_order)
    SELECT p_to, t.section, t.title, t.assignee_id, t.assignee_name, base.m + t.sort_order
    FROM public.tasks t, base
    WHERE t.event_id = p_from
    RETURNING 1
  )
  SELECT count(*)::int FROM ins;
$$;
REVOKE EXECUTE ON FUNCTION public.copy_event_tasks(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.copy_event_tasks(uuid, uuid) TO authenticated;

-- Staff set their own Telegram username (for reminder @mentions); body as in 056
CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- columns a non-admin may change on their own row
  v_free text[] := ARRAY['full_name', 'phone', 'avatar_url', 'telegram', 'updated_at', 'must_change_password'];
BEGIN
  -- service role / direct SQL (no JWT) and admins are not limited
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - v_free) IS DISTINCT FROM (to_jsonb(OLD) - v_free) THEN
    RAISE EXCEPTION 'Bu maydonlarni faqat administrator o''zgartira oladi'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.must_change_password AND NOT OLD.must_change_password THEN
    RAISE EXCEPTION 'Bu maydonlarni faqat administrator o''zgartira oladi'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
