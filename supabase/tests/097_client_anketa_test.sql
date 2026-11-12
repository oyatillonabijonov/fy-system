-- Behavioural tests for migration 097 (client anketa links + approval). THROWAWAY DB only.
\set ON_ERROR_STOP on

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('97000000-0000-0000-0000-000000000001', 'm97@fy.uz', '{"full_name":"Mijozchi97","role":"xodim"}'::jsonb),
  ('97000000-0000-0000-0000-000000000002', 's97@fy.uz', '{"full_name":"Sotuvchi97","role":"xodim"}'::jsonb),
  ('97000000-0000-0000-0000-000000000003', 'a97@fy.uz', '{"full_name":"Admin97","role":"admin"}'::jsonb);
INSERT INTO public.user_permissions (user_id, module, can_view) VALUES
  ('97000000-0000-0000-0000-000000000001', 'mijozlar', true),
  ('97000000-0000-0000-0000-000000000002', 'sotuv-crmn', true);
INSERT INTO public.clients (id, full_name, phone, source) VALUES
  ('c9700000-0000-0000-0000-000000000001', 'Ali',   '+998901970001', 'sayt'),
  ('c9700000-0000-0000-0000-000000000005', 'Cecil', '+998901970005', 'sayt');

DO $$ BEGIN
  IF public.is_customer((SELECT c FROM public.clients c WHERE id = 'c9700000-0000-0000-0000-000000000001')) THEN
    RAISE EXCEPTION 'SETUP FAILED: a lead-source client already counts as a customer'; END IF;
END $$;

GRANT USAGE ON SCHEMA public TO authenticated, anon;
SELECT set_config('request.headers', '{"cf-connecting-ip":"1.2.3.4"}', false);

-- TEST 1: a seller gets A's personal link (same token twice); anon opens it
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '97000000-0000-0000-0000-000000000002', false);
DO $$
DECLARE t text; r jsonb;
BEGIN
  t := public.client_profile_link('c9700000-0000-0000-0000-000000000001');
  IF t IS NULL OR length(t) < 22 THEN RAISE EXCEPTION 'TEST 1 FAILED: token %', t; END IF;
  IF public.client_profile_link('c9700000-0000-0000-0000-000000000001') <> t THEN RAISE EXCEPTION 'TEST 1 FAILED: second call made a new token'; END IF;
  PERFORM set_config('test.ta', t, false);
  PERFORM set_config('test.tc', public.client_profile_link('c9700000-0000-0000-0000-000000000005'), false);
END $$;
RESET ROLE;
SET ROLE anon;
DO $$
DECLARE r jsonb;
BEGIN
  r := public.anketa_open(current_setting('test.ta'));
  IF r->>'kind' <> 'personal' OR r->>'full_name' <> 'Ali' OR r->>'phone_masked' <> '+998 90 *** 00 01' THEN RAISE EXCEPTION 'TEST 1 FAILED: %', r; END IF;
  RAISE NOTICE 'TEST 1 ok';
END $$;

-- TEST 2: validation refuses and stores nothing
DO $$
DECLARE t text := current_setting('test.ta');
BEGIN
  BEGIN PERFORM public.anketa_submit(t, '{"full_name":" a "}'); RAISE EXCEPTION 'TEST 2 FAILED: short name';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'anketa_name' THEN RAISE; END IF; END;
  BEGIN PERFORM public.anketa_submit(t, jsonb_build_object('full_name', repeat('x', 300))); RAISE EXCEPTION 'TEST 2 FAILED: long name';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'anketa_name' THEN RAISE; END IF; END;
  BEGIN PERFORM public.anketa_submit(t, jsonb_build_object('full_name', 'Ali V', 'company', repeat('x', 151))); RAISE EXCEPTION 'TEST 2 FAILED: long company';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'anketa_too_long' THEN RAISE; END IF; END;
  BEGIN PERFORM public.anketa_submit(t, '{"full_name":"Ali V","photo_path":"anketa/OTHER/x.jpg"}'); RAISE EXCEPTION 'TEST 2 FAILED: foreign photo';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'anketa_photo' THEN RAISE; END IF; END;
  BEGIN PERFORM public.anketa_submit('nope', '{"full_name":"Ali V"}'); RAISE EXCEPTION 'TEST 2 FAILED: unknown token';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'anketa_invalid' THEN RAISE; END IF; END;
  RAISE NOTICE 'TEST 2 ok';
END $$;
RESET ROLE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.client_profile_submissions) THEN RAISE EXCEPTION 'TEST 2 FAILED: something stored'; END IF;
END $$;

-- TEST 3: submitting twice keeps one pending row with the latest values
SET ROLE anon;
DO $$
DECLARE t text := current_setting('test.ta');
BEGIN
  PERFORM public.anketa_submit(t, '{"full_name":"Ali Valiyev","company":"Savdo"}');
  PERFORM public.anketa_submit(t, jsonb_build_object('full_name', 'Ali Valiyevich', 'company', 'Savdo', 'photo_path', 'anketa/' || t || '/p.jpg'));
  IF public.anketa_open(t)->>'full_name' <> 'Ali Valiyevich' THEN RAISE EXCEPTION 'TEST 3 FAILED: open shows %', public.anketa_open(t); END IF;
  IF public.anketa_open(t)->>'photo_path' <> 'anketa/' || t || '/p.jpg' THEN RAISE EXCEPTION 'TEST 3 FAILED: photo %', public.anketa_open(t); END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.client_profile_submissions WHERE client_id = 'c9700000-0000-0000-0000-000000000001') <> 1 THEN RAISE EXCEPTION 'TEST 3 FAILED: % rows', (SELECT count(*) FROM public.client_profile_submissions); END IF;
  RAISE NOTICE 'TEST 3 ok';
END $$;

-- TEST 4: the universal link matches a phone typed in any format
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '97000000-0000-0000-0000-000000000002', false);
DO $$ BEGIN PERFORM set_config('test.tu', public.universal_profile_link(), false); END $$;
RESET ROLE;
SET ROLE anon;
DO $$
DECLARE t text := current_setting('test.tu');
BEGIN
  IF public.anketa_open(t)->>'kind' <> 'universal' OR coalesce(public.anketa_open(t)->>'full_name', '') <> '' THEN RAISE EXCEPTION 'TEST 4 FAILED: open %', public.anketa_open(t); END IF;
  PERFORM public.anketa_submit(t, '{"full_name":"Ali U","phone":"90 197 00 01"}');
  PERFORM public.anketa_submit(t, '{"full_name":"Ali U2","phone":"998901970001"}');
  BEGIN PERFORM public.anketa_submit(t, '{"full_name":"Bad","phone":"12345"}'); RAISE EXCEPTION 'TEST 4 FAILED: bad phone';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'anketa_phone' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.client_profile_submissions WHERE phone = '+998901970001' AND status = 'pending') <> 1 THEN RAISE EXCEPTION 'TEST 4 FAILED: pending rows for the phone'; END IF;
  IF (SELECT client_id FROM public.client_profile_submissions WHERE phone = '+998901970001') <> 'c9700000-0000-0000-0000-000000000001' THEN RAISE EXCEPTION 'TEST 4 FAILED: not matched to A'; END IF;
  RAISE NOTICE 'TEST 4 ok';
END $$;

-- TEST 5: approving A's personal submission (with a staff fix and the photo)
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '97000000-0000-0000-0000-000000000001', false);
DO $$
DECLARE t text := current_setting('test.ta'); v_id uuid; v_url text;
BEGIN
  SELECT id INTO v_id FROM public.client_profile_submissions WHERE client_id = 'c9700000-0000-0000-0000-000000000001' AND phone IS NULL;
  BEGIN PERFORM public.approve_profile_submission(v_id, '{"image":"https://x/storage/v1/object/public/client-images/other.jpg"}'); RAISE EXCEPTION 'TEST 5 FAILED: foreign image';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'anketa_photo' THEN RAISE; END IF; END;
  v_url := 'https://x/storage/v1/object/public/client-images/anketa/' || t || '/p.jpg';
  IF public.approve_profile_submission(v_id, jsonb_build_object('role', 'Direktor', 'image', v_url)) <> 'c9700000-0000-0000-0000-000000000001' THEN RAISE EXCEPTION 'TEST 5 FAILED: wrong client'; END IF;
  BEGIN PERFORM public.approve_profile_submission(v_id, '{}'); RAISE EXCEPTION 'TEST 5 FAILED: approved twice';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'anketa_reviewed' THEN RAISE; END IF; END;
  PERFORM set_config('test.url', v_url, false);
END $$;
RESET ROLE;
DO $$
DECLARE c public.clients;
BEGIN
  SELECT * INTO c FROM public.clients WHERE id = 'c9700000-0000-0000-0000-000000000001';
  IF c.full_name <> 'Ali Valiyevich' OR c.role <> 'Direktor' OR c.company <> 'Savdo' OR c.image <> current_setting('test.url') OR c.profile_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'TEST 5 FAILED: card %', row_to_json(c); END IF;
  IF NOT public.is_customer(c) THEN RAISE EXCEPTION 'TEST 5 FAILED: not a customer'; END IF;
  IF (SELECT closed_at FROM public.client_profile_links WHERE token = current_setting('test.ta')) IS NULL THEN RAISE EXCEPTION 'TEST 5 FAILED: link open'; END IF;
  IF (SELECT status FROM public.client_profile_submissions WHERE phone = '+998901970001') <> 'rejected' THEN RAISE EXCEPTION 'TEST 5 FAILED: the other pending one not rejected'; END IF;
  BEGIN PERFORM public.anketa_open(current_setting('test.ta')); RAISE EXCEPTION 'TEST 5 FAILED: closed link opens';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'anketa_invalid' THEN RAISE; END IF; END;
  RAISE NOTICE 'TEST 5 ok';
END $$;

-- TEST 6: a client created between submit and approval is attached to, not duplicated
SET ROLE anon;
DO $$ BEGIN PERFORM public.anketa_submit(current_setting('test.tu'), '{"full_name":"Bobur","phone":"+998901970002"}'); END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT client_id FROM public.client_profile_submissions WHERE phone = '+998901970002') IS NOT NULL THEN RAISE EXCEPTION 'TEST 6 FAILED: matched nobody yet'; END IF;
END $$;
INSERT INTO public.clients (id, full_name, phone) VALUES ('c9700000-0000-0000-0000-000000000002', 'B', '+998901970002');
SET ROLE authenticated;
DO $$
DECLARE v uuid;
BEGIN
  v := public.approve_profile_submission((SELECT id FROM public.client_profile_submissions WHERE phone = '+998901970002'), '{}');
  IF v <> 'c9700000-0000-0000-0000-000000000002' THEN RAISE EXCEPTION 'TEST 6 FAILED: attached to %', v; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.clients WHERE phone = '+998901970002') <> 1 OR (SELECT full_name FROM public.clients WHERE phone = '+998901970002') <> 'Bobur' THEN RAISE EXCEPTION 'TEST 6 FAILED'; END IF;
  RAISE NOTICE 'TEST 6 ok';
END $$;

-- TEST 7: no match at all → a new client from the anketa, a customer
SET ROLE anon;
DO $$ BEGIN PERFORM public.anketa_submit(current_setting('test.tu'), '{"full_name":"Dilnoza","phone":"+998901970003","activity":"Ta''lim"}'); END $$;
RESET ROLE;
SET ROLE authenticated;
DO $$ BEGIN PERFORM public.approve_profile_submission((SELECT id FROM public.client_profile_submissions WHERE phone = '+998901970003'), '{}'); END $$;
RESET ROLE;
DO $$
DECLARE c public.clients;
BEGIN
  SELECT * INTO c FROM public.clients WHERE phone = '+998901970003';
  IF c.id IS NULL OR c.source <> 'anketa' OR c.full_name <> 'Dilnoza' OR c.activity <> 'Ta''lim' OR NOT public.is_customer(c) THEN RAISE EXCEPTION 'TEST 7 FAILED: %', row_to_json(c); END IF;
  RAISE NOTICE 'TEST 7 ok';
END $$;

-- TEST 8: no reading or approving without the right
SET ROLE anon;
DO $$
DECLARE n int;
BEGIN
  BEGIN SELECT count(*) INTO n FROM public.client_profile_submissions; EXCEPTION WHEN insufficient_privilege THEN n := 0; END;
  IF n <> 0 THEN RAISE EXCEPTION 'TEST 8 FAILED: anon reads % submissions', n; END IF;
  BEGIN SELECT count(*) INTO n FROM public.client_profile_links; EXCEPTION WHEN insufficient_privilege THEN n := 0; END;
  IF n <> 0 THEN RAISE EXCEPTION 'TEST 8 FAILED: anon reads % links', n; END IF;
END $$;
RESET ROLE;
-- calling a function without EXECUTE crashes this test image's backend (segfault, any function), so the grant is checked instead
DO $$ BEGIN
  IF has_function_privilege('anon', 'public.approve_profile_submission(uuid, jsonb)', 'execute')
     OR has_function_privilege('anon', 'public.reject_profile_submission(uuid)', 'execute')
     OR has_function_privilege('anon', 'public.client_profile_link(uuid)', 'execute')
     OR has_function_privilege('anon', 'public.universal_profile_link(boolean)', 'execute')
     OR has_function_privilege('authenticated', 'public.anketa_link(text)', 'execute') THEN
    RAISE EXCEPTION 'TEST 8 FAILED: anon can execute a staff function'; END IF;
  IF NOT has_function_privilege('anon', 'public.anketa_submit(text, jsonb)', 'execute') THEN RAISE EXCEPTION 'TEST 8 FAILED: anon cannot submit'; END IF;
END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '97000000-0000-0000-0000-000000000002', false);
DO $$ BEGIN
  BEGIN PERFORM public.reject_profile_submission(gen_random_uuid()); RAISE EXCEPTION 'TEST 8 FAILED: seller rejects';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.universal_profile_link(true); RAISE EXCEPTION 'TEST 8 FAILED: seller regenerates';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF EXISTS (SELECT 1 FROM public.client_profile_submissions) THEN RAISE EXCEPTION 'TEST 8 FAILED: seller reads submissions'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub', '97000000-0000-0000-0000-000000000003', false);
DO $$ BEGIN
  IF public.universal_profile_link(true) = current_setting('test.tu') THEN RAISE EXCEPTION 'TEST 8 FAILED: admin regenerate kept the token'; END IF;
  RAISE NOTICE 'TEST 8 ok';
END $$;
RESET ROLE;

-- TEST 9: an expired link is invalid; 21st submit in an hour is refused; reject keeps the link open
UPDATE public.client_profile_links SET expires_at = now() - interval '1 minute' WHERE token = current_setting('test.tu');
SET ROLE anon;
DO $$
DECLARE t text := current_setting('test.tc');
BEGIN
  BEGIN PERFORM public.anketa_open(current_setting('test.tu')); RAISE EXCEPTION 'TEST 9 FAILED: old universal opens';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'anketa_invalid' THEN RAISE; END IF; END;
  FOR i IN 1..20 LOOP PERFORM public.anketa_submit(t, jsonb_build_object('full_name', 'Cecil ' || i)); END LOOP;
  BEGIN PERFORM public.anketa_submit(t, '{"full_name":"Cecil 21"}'); RAISE EXCEPTION 'TEST 9 FAILED: 21st accepted';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'anketa_rate_limited' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '97000000-0000-0000-0000-000000000001', false);
DO $$ BEGIN PERFORM public.reject_profile_submission((SELECT id FROM public.client_profile_submissions WHERE client_id = 'c9700000-0000-0000-0000-000000000005')); END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
  IF public.anketa_open(current_setting('test.tc'))->>'full_name' <> 'Cecil' THEN RAISE EXCEPTION 'TEST 9 FAILED: after reject the card is not shown'; END IF;
  RAISE NOTICE 'TEST 9 ok';
END $$;
RESET ROLE;
