-- Behavioural tests for migration 066 (Vazifalar). THROWAWAY DB only (recipe: CLAUDE.md §5).
\set ON_ERROR_STOP on

-- A = admin, S1/S2 = plain staff (no modules at all), X = deactivated staff
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('66000000-0000-0000-0000-000000000001', 'admin66@fy.uz', '{"full_name":"Admin66","role":"admin"}'::jsonb),
  ('66000000-0000-0000-0000-000000000002', 's1_66@fy.uz',   '{"full_name":"Hodim66a","role":"xodim"}'::jsonb),
  ('66000000-0000-0000-0000-000000000003', 's2_66@fy.uz',   '{"full_name":"Hodim66b","role":"xodim"}'::jsonb),
  ('66000000-0000-0000-0000-000000000004', 'x66@fy.uz',     '{"full_name":"Ketgan66","role":"xodim"}'::jsonb);
UPDATE public.profiles SET role = 'admin' WHERE id = '66000000-0000-0000-0000-000000000001';
UPDATE public.profiles SET is_active = false WHERE id = '66000000-0000-0000-0000-000000000004';
INSERT INTO public.events (id, name) VALUES
  ('e6600000-0000-0000-0000-000000000001', 'Tog safari 7.0'),
  ('e6600000-0000-0000-0000-000000000002', 'Tog safari 8.0');
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
SET ROLE authenticated;

-- TEST 1: any staff creates tasks (staff owner, outside owner, general), sees all
SELECT set_config('request.jwt.claim.sub', '66000000-0000-0000-0000-000000000002', false);
DO $$
BEGIN
  INSERT INTO public.tasks (event_id, section, title, assignee_id, due_date, sort_order) VALUES
    ('e6600000-0000-0000-0000-000000000001', 'Resort', 'Resort shortlistini tuzish', '66000000-0000-0000-0000-000000000003', current_date - 1, 1),
    ('e6600000-0000-0000-0000-000000000001', 'Spikerlar', 'Spikerlarni taklif qilish', NULL, current_date, 2);
  UPDATE public.tasks SET assignee_name = 'Hikmat aka' WHERE title = 'Spikerlarni taklif qilish';
  INSERT INTO public.tasks (title) VALUES ('Vakansiyalar');   -- Umumiy
  IF (SELECT created_by FROM public.tasks WHERE title = 'Vakansiyalar') <> '66000000-0000-0000-0000-000000000002' THEN
    RAISE EXCEPTION 'TEST 1 FAILED: created_by not the author'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub', '66000000-0000-0000-0000-000000000003', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.tasks) <> 3 THEN RAISE EXCEPTION 'TEST 1 FAILED: other staff sees % tasks', (SELECT count(*) FROM public.tasks); END IF;
  RAISE NOTICE 'TEST 1 ok: staff creates (staff/outside owner, general) and everyone sees them';
END $$;

-- TEST 2: status → done stamps completed_at, back clears it; comments are signed
DO $$
DECLARE v uuid := (SELECT id FROM public.tasks WHERE title = 'Resort shortlistini tuzish');
BEGIN
  UPDATE public.tasks SET status = 'done' WHERE id = v;
  IF (SELECT completed_at FROM public.tasks WHERE id = v) IS NULL THEN RAISE EXCEPTION 'TEST 2 FAILED: no completed_at'; END IF;
  UPDATE public.tasks SET status = 'in_progress' WHERE id = v;
  IF (SELECT completed_at FROM public.tasks WHERE id = v) IS NOT NULL THEN RAISE EXCEPTION 'TEST 2 FAILED: completed_at kept'; END IF;
  INSERT INTO public.task_comments (task_id, body) VALUES (v, '3 ta resort ko''rib chiqildi');
  BEGIN
    INSERT INTO public.task_comments (task_id, author_id, body) VALUES (v, '66000000-0000-0000-0000-000000000002', 'soxta');
    RAISE EXCEPTION 'TEST 2 FAILED: comment under someone else''s name';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.tasks SET status = 'overdue' WHERE id = v;
    RAISE EXCEPTION 'TEST 2 FAILED: unknown status accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  RAISE NOTICE 'TEST 2 ok: completed_at follows status; comments signed; statuses checked';
END $$;

-- TEST 3: delete only by author or admin
DO $$
DECLARE n int;
BEGIN
  WITH d AS (DELETE FROM public.tasks WHERE title = 'Vakansiyalar' RETURNING 1) SELECT count(*) INTO n FROM d;  -- S2 isn't the author
  IF n <> 0 THEN RAISE EXCEPTION 'TEST 3 FAILED: non-author deleted'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub', '66000000-0000-0000-0000-000000000001', false);
DO $$
DECLARE n int;
BEGIN
  WITH d AS (DELETE FROM public.tasks WHERE title = 'Vakansiyalar' RETURNING 1) SELECT count(*) INTO n FROM d;
  IF n <> 1 THEN RAISE EXCEPTION 'TEST 3 FAILED: admin could not delete'; END IF;
  RAISE NOTICE 'TEST 3 ok: only author or admin deletes';
END $$;

-- TEST 4: copy tasks to the next event — fresh status/dates, owners kept
DO $$
DECLARE n int; r record;
BEGIN
  n := public.copy_event_tasks('e6600000-0000-0000-0000-000000000001', 'e6600000-0000-0000-0000-000000000002');
  SELECT count(*) FILTER (WHERE status = 'todo' AND due_date IS NULL) AS fresh,
         count(*) FILTER (WHERE assignee_name = 'Hikmat aka') AS outside,
         count(*) AS total
  INTO r FROM public.tasks WHERE event_id = 'e6600000-0000-0000-0000-000000000002';
  IF n <> 2 OR r.total <> 2 OR r.fresh <> 2 OR r.outside <> 1 THEN RAISE EXCEPTION 'TEST 4 FAILED: n=% %', n, row_to_json(r); END IF;
  RAISE NOTICE 'TEST 4 ok: 2 tasks copied as fresh, owners kept';
END $$;

-- TEST 5: deactivated staff and anon see nothing; staff edits own telegram only
SELECT set_config('request.jwt.claim.sub', '66000000-0000-0000-0000-000000000004', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.tasks) <> 0 THEN RAISE EXCEPTION 'TEST 5 FAILED: deactivated staff sees tasks'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub', '66000000-0000-0000-0000-000000000002', false);
DO $$ BEGIN
  UPDATE public.profiles SET telegram = '@hodim66' WHERE id = '66000000-0000-0000-0000-000000000002';
  IF (SELECT telegram FROM public.profiles WHERE id = '66000000-0000-0000-0000-000000000002') <> '@hodim66' THEN
    RAISE EXCEPTION 'TEST 5 FAILED: own telegram not saved'; END IF;
  BEGIN
    UPDATE public.profiles SET role = 'admin' WHERE id = '66000000-0000-0000-0000-000000000002';
    RAISE EXCEPTION 'TEST 5 FAILED: self-promotion allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);  -- no JWT: an anonymous caller
SET ROLE anon;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.tasks) <> 0 THEN RAISE EXCEPTION 'TEST 5 FAILED: anon sees tasks'; END IF;
  RAISE NOTICE 'TEST 5 ok: inactive/anon see nothing; telegram self-edit yes, role no';
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT '066 tasks: all tests passed' AS result;
