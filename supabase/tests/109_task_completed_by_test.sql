-- Behavioural tests for migration 109 (tasks.completed_by). THROWAWAY DB only.
\set ON_ERROR_STOP on
-- staff logins: the shared helper (112 — the auth trigger no longer trusts metadata)
\ir _helpers.sql
DO $staff$ BEGIN
  PERFORM pg_temp.make_staff('a1090000-0000-0000-0000-000000000001', 'a109@fy.uz', 'Bajaruvchi109', 'xodim');
  PERFORM pg_temp.make_staff('a1090000-0000-0000-0000-000000000002', 'b109@fy.uz', 'Boshqa109', 'xodim');
END $staff$;
INSERT INTO public.tasks (id, title, assignee_id) VALUES ('b1090000-0000-0000-0000-000000000001', 'Test 109', 'a1090000-0000-0000-0000-000000000001');
GRANT USAGE ON SCHEMA public TO authenticated;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1090000-0000-0000-0000-000000000001', false);
DO $$
DECLARE t public.tasks;
BEGIN
  UPDATE public.tasks SET status = 'done' WHERE id = 'b1090000-0000-0000-0000-000000000001' RETURNING * INTO t;
  IF t.completed_by IS DISTINCT FROM 'a1090000-0000-0000-0000-000000000001' OR t.completed_at IS NULL THEN
    RAISE EXCEPTION 'TEST 1 FAILED (done records who and when): % %', t.completed_by, t.completed_at; END IF;

  -- another person edits the done task and tries to sign it as themselves: who did it stays
  PERFORM set_config('request.jwt.claim.sub', 'a1090000-0000-0000-0000-000000000002', false);
  UPDATE public.tasks SET title = 'Test 109 b', completed_by = 'a1090000-0000-0000-0000-000000000002'
    WHERE id = 'b1090000-0000-0000-0000-000000000001' RETURNING * INTO t;
  IF t.completed_by IS DISTINCT FROM 'a1090000-0000-0000-0000-000000000001' THEN
    RAISE EXCEPTION 'TEST 2 FAILED (completed_by rewritten on a done task): %', t.completed_by; END IF;

  UPDATE public.tasks SET status = 'todo' WHERE id = 'b1090000-0000-0000-0000-000000000001' RETURNING * INTO t;
  IF t.completed_by IS NOT NULL OR t.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'TEST 3 FAILED (reopen clears who and when): % %', t.completed_by, t.completed_at; END IF;

  UPDATE public.tasks SET status = 'done' WHERE id = 'b1090000-0000-0000-0000-000000000001' RETURNING * INTO t;
  IF t.completed_by IS DISTINCT FROM 'a1090000-0000-0000-0000-000000000002' THEN
    RAISE EXCEPTION 'TEST 4 FAILED (done again = the new person): %', t.completed_by; END IF;
  RAISE NOTICE '109: 4 tests passed';
END $$;
RESET ROLE;
-- the worker (no signed-in user) marks a task done: no error, nobody recorded
UPDATE public.tasks SET status = 'todo' WHERE id = 'b1090000-0000-0000-0000-000000000001';
SELECT set_config('request.jwt.claim.sub', '', false);
UPDATE public.tasks SET status = 'done' WHERE id = 'b1090000-0000-0000-0000-000000000001';
DO $$ BEGIN
  IF (SELECT completed_by IS NOT NULL OR completed_at IS NULL FROM public.tasks WHERE id = 'b1090000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'TEST 5 FAILED (worker write)'; END IF;
  RAISE NOTICE '109: worker test passed';
END $$;
