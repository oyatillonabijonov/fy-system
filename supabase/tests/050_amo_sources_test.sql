-- Behavioural test for migration 050 (amo_dashboard → by_source).
-- Throwaway DB only (see CLAUDE.md "Tests"). Fixtures: pipeline 990002, year 2031.
\set ON_ERROR_STOP on

INSERT INTO public.amo_pipelines (id, name, sort) VALUES (990002, 'Test manba', 1);
INSERT INTO public.amo_statuses (pipeline_id, id, name, sort, kind) VALUES
  (990002, 1, 'Yangi', 10, 'open'), (990002, 142, 'Yutildi', 100, 'won');
INSERT INTO public.amo_leads (id, pipeline_id, status_id, created_at, updated_at, closed_at, source) VALUES
  (990601, 990002, 142, '2031-01-02 10:00+05', '2031-01-05 10:00+05', '2031-01-05 10:00+05', 'Facebook'),
  (990602, 990002, 1,   '2031-01-03 10:00+05', '2031-01-03 10:00+05', NULL, 'Facebook'),
  (990603, 990002, 1,   '2031-01-04 10:00+05', '2031-01-04 10:00+05', NULL, NULL),
  (990604, 990002, 1,   '2030-06-01 10:00+05', '2030-06-01 10:00+05', NULL, 'Tilda');  -- outside the period

DO $$
DECLARE s jsonb := public.amo_dashboard('2031-01-01 00:00+05', '2031-02-01 00:00+05', 990002)->'by_source';
BEGIN
  IF jsonb_array_length(s) IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'TEST FAILED: by_source = % (want Facebook + Noma''lum)', s; END IF;
  IF (s->0->>'source', (s->0->>'new_leads')::int, (s->0->>'won')::int) IS DISTINCT FROM ('Facebook', 2, 1) THEN
    RAISE EXCEPTION 'TEST FAILED: Facebook row = %', s->0; END IF;
  IF (s->1->>'source', (s->1->>'new_leads')::int) IS DISTINCT FROM ('Noma''lum', 1) THEN
    RAISE EXCEPTION 'TEST FAILED: unknown row = %', s->1; END IF;
  RAISE NOTICE 'TEST ok: by_source';
END $$;

SELECT '050 amo sources: all tests passed' AS result;
