-- 071: yo'riqnoma (instructions) on a task — a link (video, Drive, docs…) or a file
-- (PDF, image, office doc; up to 10 MB like receipts — the storage gateway caps
-- bodies at 11 MB). Every active staff member adds and sees them; a row is removed
-- by its author or an admin. Files live in the PRIVATE bucket task-files and are
-- never deleted: "Nusxa olish" copies the rows, so copies share the same file.

BEGIN;

CREATE TABLE IF NOT EXISTS public.task_attachments (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title      text        NOT NULL CHECK (btrim(title) <> ''),
  url        text        CHECK (url ~* '^https?://'),
  file_path  text,
  file_size  integer,
  created_by uuid        REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((url IS NULL) <> (file_path IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON public.task_attachments (task_id, created_at);

ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task attachments select staff" ON public.task_attachments FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "task attachments insert staff" ON public.task_attachments FOR INSERT
  WITH CHECK (public.is_staff(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "task attachments delete own or admin" ON public.task_attachments FOR DELETE
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()));
GRANT SELECT, INSERT, DELETE ON public.task_attachments TO authenticated;

DO $$
BEGIN
  -- The throwaway test image has no storage schema; production and the local stack do.
  IF to_regclass('storage.objects') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('task-files', 'task-files', false, 10485760, ARRAY[
      'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'])
    ON CONFLICT (id) DO NOTHING;

    CREATE POLICY "task files read staff" ON storage.objects FOR SELECT
      USING (bucket_id = 'task-files' AND public.is_staff(auth.uid()));
    CREATE POLICY "task files upload staff" ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'task-files' AND public.is_staff(auth.uid()));
  END IF;
END $$;

-- "Nusxa olish" now brings each task's yo'riqnoma along (same links / same files)
CREATE OR REPLACE FUNCTION public.copy_event_tasks(p_from uuid, p_to uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_base int := (SELECT COALESCE(MAX(sort_order), 0) FROM public.tasks WHERE event_id = p_to);
  v_n    int := 0;
  r      record;
  v_new  uuid;
BEGIN
  FOR r IN SELECT * FROM public.tasks WHERE event_id = p_from ORDER BY sort_order LOOP
    INSERT INTO public.tasks (event_id, section, title, assignee_id, assignee_name, sort_order)
    VALUES (p_to, r.section, r.title, r.assignee_id, r.assignee_name, v_base + r.sort_order)
    RETURNING id INTO v_new;
    INSERT INTO public.task_attachments (task_id, title, url, file_path, file_size)
    SELECT v_new, a.title, a.url, a.file_path, a.file_size FROM public.task_attachments a WHERE a.task_id = r.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

COMMIT;
