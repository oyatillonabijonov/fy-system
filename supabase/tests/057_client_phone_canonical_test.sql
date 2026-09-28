-- Behavioural test for migration 057 (canonical client phones). Throwaway DB only.
\set ON_ERROR_STOP on

INSERT INTO public.clients (full_name, phone) VALUES ('Dup Test A', '998 90 111-22-33');

-- TEST 1: the same number typed another way is rejected
DO $$
BEGIN
  BEGIN
    INSERT INTO public.clients (full_name, phone) VALUES ('Dup Test B', '+998901112233');
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'TEST 1 ok: same number in another format is a duplicate';
    RETURN;
  END;
  RAISE EXCEPTION 'TEST 1 FAILED: duplicate client saved with a differently formatted phone';
END $$;

-- TEST 2: stored in canonical form; junk becomes NULL (and doesn't collide)
DO $$
BEGIN
  IF (SELECT phone FROM public.clients WHERE full_name = 'Dup Test A') <> '+998901112233' THEN
    RAISE EXCEPTION 'TEST 2 FAILED: phone not normalized: %', (SELECT phone FROM public.clients WHERE full_name = 'Dup Test A'); END IF;
  INSERT INTO public.clients (full_name, phone) VALUES ('Dup Test C', '+998'), ('Dup Test D', '');
  IF (SELECT count(*) FROM public.clients WHERE full_name IN ('Dup Test C', 'Dup Test D') AND phone IS NULL) <> 2 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: prefix-only / empty phones were not cleared'; END IF;
  RAISE NOTICE 'TEST 2 ok: canonical form, junk cleared';
END $$;

DELETE FROM public.clients WHERE full_name LIKE 'Dup Test %';
SELECT '057 client phone canonical: all tests passed' AS result;
