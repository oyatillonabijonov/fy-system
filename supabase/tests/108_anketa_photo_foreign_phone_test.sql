-- Behavioural tests for migration 108 (anketa: photo required, phones of other countries). THROWAWAY DB only.
\set ON_ERROR_STOP on
-- staff logins: the shared helper (112 — the auth trigger no longer trusts metadata)
\ir _helpers.sql
DO $staff$ BEGIN
  PERFORM pg_temp.make_staff('a1080000-0000-0000-0000-000000000001', 'm108@fy.uz', 'Mijozchi108', 'admin');
END $staff$;
INSERT INTO public.clients (id, full_name, phone, source, image) VALUES
  ('c1080000-0000-0000-0000-000000000001', 'Rasmsiz', '+998901080001', 'sayt', NULL),
  ('c1080000-0000-0000-0000-000000000002', 'Rasmli',  '+79991080002',  'sayt', 'https://x/y.jpg');
GRANT USAGE ON SCHEMA public TO authenticated, anon;
SELECT set_config('request.headers', '{"cf-connecting-ip":"5.6.7.8"}', false);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1080000-0000-0000-0000-000000000001', false);
DO $$
BEGIN
  PERFORM set_config('test.t1', public.client_profile_link('c1080000-0000-0000-0000-000000000001'), false);
  PERFORM set_config('test.t2', public.client_profile_link('c1080000-0000-0000-0000-000000000002'), false);
  PERFORM set_config('test.tu', public.universal_profile_link(false), false);
END $$;
RESET ROLE;
SET ROLE anon;

-- TEST 1: a personal link — the photo is required unless the card already has one
DO $$
DECLARE t1 text := current_setting('test.t1'); t2 text := current_setting('test.t2'); l1 text;
BEGIN
  BEGIN PERFORM public.anketa_submit(t1, '{"full_name":"Rasmsiz Odam"}'); RAISE EXCEPTION 'TEST 1 FAILED: sent without a photo';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'anketa_photo_required' THEN RAISE; END IF; END;
  l1 := public.anketa_open(t1)->>'link_id';
  PERFORM public.anketa_submit(t1, jsonb_build_object('full_name', 'Rasmsiz Odam', 'photo_path', 'anketa/' || l1 || '/a1.jpg'));
  -- a resend that carries the photo already sent is fine
  PERFORM public.anketa_submit(t1, jsonb_build_object('full_name', 'Rasmsiz Odam 2', 'photo_path', 'anketa/' || l1 || '/a1.jpg'));
  PERFORM public.anketa_submit(t2, '{"full_name":"Rasmli Odam"}');   -- the card has a photo: nothing new is needed
  RAISE NOTICE 'TEST 1 ok';
END $$;

-- TEST 2: the universal link — always a photo; phones of other countries are accepted with their code
DO $$
DECLARE tu text := current_setting('test.tu'); lu text; p text;
BEGIN
  lu := public.anketa_open(tu)->>'link_id';
  p := 'anketa/' || lu || '/b1.jpg';
  BEGIN PERFORM public.anketa_submit(tu, '{"full_name":"Yangi Odam","phone":"+998901080010"}'); RAISE EXCEPTION 'TEST 2 FAILED: universal without a photo';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'anketa_photo_required' THEN RAISE; END IF; END;
  PERFORM public.anketa_submit(tu, jsonb_build_object('full_name', 'Yangi Odam', 'phone', '90 108 00 10', 'photo_path', p));
  PERFORM public.anketa_submit(tu, jsonb_build_object('full_name', 'Chet Ellik', 'phone', '+7 (999) 108-00-11', 'photo_path', p));
  PERFORM public.anketa_submit(tu, jsonb_build_object('full_name', 'Amerikalik', 'phone', '+12125550123', 'photo_path', p));
  BEGIN PERFORM public.anketa_submit(tu, jsonb_build_object('full_name', 'Kodsiz', 'phone', '79991080012', 'photo_path', p)); RAISE EXCEPTION 'TEST 2 FAILED: no country code accepted';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'anketa_phone' THEN RAISE; END IF; END;
  BEGIN PERFORM public.anketa_submit(tu, jsonb_build_object('full_name', 'Chala', 'phone', '+99890108001', 'photo_path', p)); RAISE EXCEPTION 'TEST 2 FAILED: short Uzbek number accepted';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'anketa_phone' THEN RAISE; END IF; END;
  BEGIN PERFORM public.anketa_submit(tu, jsonb_build_object('full_name', 'Qisqa', 'phone', '+7999', 'photo_path', p)); RAISE EXCEPTION 'TEST 2 FAILED: junk accepted';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'anketa_phone' THEN RAISE; END IF; END;
  RAISE NOTICE 'TEST 2 ok';
END $$;

-- TEST 3: the masked phone on a personal link, also for another country's number
DO $$
BEGIN
  IF public.anketa_open(current_setting('test.t1'))->>'phone_masked' <> '+998 90 *** 00 01' THEN RAISE EXCEPTION 'TEST 3 FAILED: uz %', public.anketa_open(current_setting('test.t1'))->>'phone_masked'; END IF;
  IF public.anketa_open(current_setting('test.t2'))->>'phone_masked' <> '+799 *** 02' THEN RAISE EXCEPTION 'TEST 3 FAILED: foreign %', public.anketa_open(current_setting('test.t2'))->>'phone_masked'; END IF;
  RAISE NOTICE 'TEST 3 ok';
END $$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.client_profile_submissions WHERE phone IN ('+998901080010', '+79991080011', '+12125550123')) <> 3 THEN
    RAISE EXCEPTION 'TEST 4 FAILED: stored phones %', (SELECT string_agg(phone, ',') FROM public.client_profile_submissions); END IF;
  RAISE NOTICE 'TEST 4 ok';
END $$;
