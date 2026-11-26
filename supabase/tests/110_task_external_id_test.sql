-- Behavioural tests for migration 110 (tasks.external_id). THROWAWAY DB only.
\set ON_ERROR_STOP on
INSERT INTO public.tasks (title) VALUES ('110 a'), ('110 b');                       -- many tasks without an outside id
INSERT INTO public.tasks (title, external_id) VALUES ('110 c', 'todoist:110');
DO $$
DECLARE n int;
BEGIN
  BEGIN
    INSERT INTO public.tasks (title, external_id) VALUES ('110 d', 'todoist:110');
    RAISE EXCEPTION 'TEST 1 FAILED (the same external_id twice)';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  INSERT INTO public.tasks (title, external_id) VALUES ('110 e', 'todoist:110') ON CONFLICT (external_id) DO NOTHING;
  SELECT count(*) INTO n FROM public.tasks WHERE external_id = 'todoist:110';
  IF n <> 1 THEN RAISE EXCEPTION 'TEST 2 FAILED (on conflict made %)', n; END IF;
  BEGIN
    INSERT INTO public.tasks (title, external_id) VALUES ('110 f', '  ');
    RAISE EXCEPTION 'TEST 3 FAILED (blank external_id)';
  EXCEPTION WHEN check_violation THEN NULL; END;
  RAISE NOTICE '110: 3 tests passed';
END $$;
