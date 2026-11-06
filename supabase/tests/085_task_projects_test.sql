-- Behavioural tests for migration 085 (task projects: Podcast etc.). THROWAWAY DB only (recipe: CLAUDE.md §5).
\set ON_ERROR_STOP on

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('83000000-0000-0000-0000-000000000001', 's83@fy.uz', '{"full_name":"Hodim83","role":"xodim"}'::jsonb),
  ('83000000-0000-0000-0000-000000000002', 'a83@fy.uz', '{"full_name":"Admin83","role":"admin"}'::jsonb);
UPDATE public.profiles SET role = 'admin' WHERE id = '83000000-0000-0000-0000-000000000002';
INSERT INTO public.events (id, name, date) VALUES ('e8300000-0000-0000-0000-000000000001', 'T83 tadbir', '2026-12-01');
GRANT USAGE ON SCHEMA public TO authenticated;
SET ROLE authenticated;

-- TEST 1: any staff member opens a project and puts a task in it; a task can't sit in an event AND a project
SELECT set_config('request.jwt.claim.sub', '83000000-0000-0000-0000-000000000001', false);
DO $$ DECLARE p uuid; BEGIN
  INSERT INTO public.task_projects (name) VALUES ('Podcast') RETURNING id INTO p;
  PERFORM set_config('t83.p', p::text, false);
  INSERT INTO public.tasks (title, project_id) VALUES ('Mehmon chaqirish', p);
  BEGIN
    INSERT INTO public.tasks (title, project_id, event_id) VALUES ('Ikki uy', p, 'e8300000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'TEST 1 FAILED: task in an event and a project';
  EXCEPTION WHEN check_violation THEN NULL; END;
  RAISE NOTICE 'TEST 1 ok: project + task';
END $$;

-- TEST 2: a non-admin can't delete a project (RLS: 0 rows)
DO $$ BEGIN
  DELETE FROM public.task_projects WHERE id = current_setting('t83.p')::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.task_projects WHERE id = current_setting('t83.p')::uuid) THEN RAISE EXCEPTION 'TEST 2 FAILED: staff deleted a project'; END IF;
  RAISE NOTICE 'TEST 2 ok: delete is admin-only';
END $$;

-- TEST 3: an admin deletes it; its tasks fall back to Umumiy (no event, no project)
SELECT set_config('request.jwt.claim.sub', '83000000-0000-0000-0000-000000000002', false);
DO $$ BEGIN
  DELETE FROM public.task_projects WHERE id = current_setting('t83.p')::uuid;
  IF EXISTS (SELECT 1 FROM public.task_projects WHERE id = current_setting('t83.p')::uuid) THEN RAISE EXCEPTION 'TEST 3 FAILED: admin could not delete'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tasks WHERE title = 'Mehmon chaqirish' AND project_id IS NULL AND event_id IS NULL) THEN RAISE EXCEPTION 'TEST 3 FAILED: task not moved to Umumiy'; END IF;
  RAISE NOTICE 'TEST 3 ok: deleted, tasks → Umumiy';
END $$;
RESET ROLE;

-- TEST 4: a Telegram group can point at a project (the bot files that group's tasks there)
DO $$ DECLARE p uuid; BEGIN
  INSERT INTO public.task_projects (name) VALUES ('Podcast 2') RETURNING id INTO p;
  INSERT INTO public.telegram_groups (chat_id, title, project_id) VALUES (-8383, 'Podcast guruhi', p);
  DELETE FROM public.task_projects WHERE id = p;
  IF (SELECT project_id FROM public.telegram_groups WHERE chat_id = -8383) IS NOT NULL THEN RAISE EXCEPTION 'TEST 4 FAILED: group kept a deleted project'; END IF;
  RAISE NOTICE 'TEST 4 ok: group → project';
END $$;

-- TEST 5: projects are live (realtime publication)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'task_projects') THEN RAISE EXCEPTION 'TEST 5 FAILED: not published'; END IF;
  RAISE NOTICE 'TEST 5 ok: realtime';
END $$;
