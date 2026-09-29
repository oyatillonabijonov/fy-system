-- Behavioural test for migration 067 (task due time). THROWAWAY DB only (recipe: CLAUDE.md §5).
\set ON_ERROR_STOP on

DO $$
BEGIN
  INSERT INTO public.tasks (title, due_date, due_time) VALUES ('Jamoa bilan video meet', '2026-09-30', '14:00');
  IF (SELECT due_time FROM public.tasks WHERE title = 'Jamoa bilan video meet') <> '14:00'::time THEN
    RAISE EXCEPTION 'TEST 1 FAILED: time not stored'; END IF;
  BEGIN
    INSERT INTO public.tasks (title, due_time) VALUES ('Soat bor, sana yo''q', '09:00');
    RAISE EXCEPTION 'TEST 1 FAILED: time without a date accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  RAISE NOTICE 'TEST 1 ok: time stored with a date, refused without one';
END $$;

SELECT '067 task due time: all tests passed' AS result;
