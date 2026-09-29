-- Behavioural tests for migration 071 (yo'riqnoma on tasks). THROWAWAY DB only (recipe: CLAUDE.md §5).
\set ON_ERROR_STOP on

-- A = admin, S1 / S2 = plain staff
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('71000000-0000-0000-0000-000000000001', 'admin71@fy.uz', '{"full_name":"Admin71","role":"admin"}'::jsonb),
  ('71000000-0000-0000-0000-000000000002', 's1_71@fy.uz',   '{"full_name":"Hodim71a","role":"xodim"}'::jsonb),
  ('71000000-0000-0000-0000-000000000003', 's2_71@fy.uz',   '{"full_name":"Hodim71b","role":"xodim"}'::jsonb);
UPDATE public.profiles SET role = 'admin' WHERE id = '71000000-0000-0000-0000-000000000001';
INSERT INTO public.events (id, name) VALUES
  ('e7100000-0000-0000-0000-000000000001', 'Safar 7.0'),
  ('e7100000-0000-0000-0000-000000000002', 'Safar 8.0');
INSERT INTO public.tasks (id, event_id, section, title, sort_order)
  VALUES ('c7100000-0000-0000-0000-000000000001', 'e7100000-0000-0000-0000-000000000001', 'Resort', 'Resort bron qilish', 1);
GRANT USAGE ON SCHEMA public TO authenticated;
SET ROLE authenticated;

-- TEST 1: any staff adds a link and a file row, signed as themselves; bad input refused
SELECT set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000002', false);
DO $$ BEGIN
  INSERT INTO public.task_attachments (task_id, title, url) VALUES ('c7100000-0000-0000-0000-000000000001', 'Qo''llanma video', 'https://youtu.be/abc');
  INSERT INTO public.task_attachments (task_id, title, file_path, file_size) VALUES ('c7100000-0000-0000-0000-000000000001', 'shartnoma.pdf', 'c71/x.pdf', 1200);
  IF (SELECT count(*) FROM public.task_attachments WHERE created_by = '71000000-0000-0000-0000-000000000002') <> 2 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: rows not signed by the author'; END IF;
  BEGIN
    INSERT INTO public.task_attachments (task_id, title, url, created_by) VALUES ('c7100000-0000-0000-0000-000000000001', 'soxta', 'https://x.uz', '71000000-0000-0000-0000-000000000003');
    RAISE EXCEPTION 'TEST 1 FAILED: added under someone else''s name';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.task_attachments (task_id, title, url) VALUES ('c7100000-0000-0000-0000-000000000001', 'js', 'javascript:alert(1)');
    RAISE EXCEPTION 'TEST 1 FAILED: a non-http link accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  RAISE NOTICE 'TEST 1 ok: staff add links/files as themselves; only http(s) links';
END $$;

-- TEST 2: another staff member sees but can't delete them; the admin can
SELECT set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000003', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.task_attachments) <> 2 THEN RAISE EXCEPTION 'TEST 2 FAILED: colleague sees %', (SELECT count(*) FROM public.task_attachments); END IF;
  DELETE FROM public.task_attachments;
  IF (SELECT count(*) FROM public.task_attachments) <> 2 THEN RAISE EXCEPTION 'TEST 2 FAILED: colleague deleted someone else''s yo''riqnoma'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', false);
DO $$ BEGIN
  DELETE FROM public.task_attachments WHERE title = 'shartnoma.pdf';
  IF (SELECT count(*) FROM public.task_attachments) <> 1 THEN RAISE EXCEPTION 'TEST 2 FAILED: admin could not delete'; END IF;
  RAISE NOTICE 'TEST 2 ok: everyone sees; author or admin deletes';
END $$;

-- TEST 3: "Nusxa olish" brings the yo'riqnoma to the new event's task
SELECT set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000003', false);
DO $$
DECLARE n int;
BEGIN
  n := public.copy_event_tasks('e7100000-0000-0000-0000-000000000001', 'e7100000-0000-0000-0000-000000000002');
  IF n <> 1 THEN RAISE EXCEPTION 'TEST 3 FAILED: copied % tasks', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.task_attachments a JOIN public.tasks t ON t.id = a.task_id
                 WHERE t.event_id = 'e7100000-0000-0000-0000-000000000002' AND a.url = 'https://youtu.be/abc') THEN
    RAISE EXCEPTION 'TEST 3 FAILED: yo''riqnoma not copied'; END IF;
  RAISE NOTICE 'TEST 3 ok: copy carries the yo''riqnoma';
END $$;
