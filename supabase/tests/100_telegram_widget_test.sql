-- Behavioural tests for migration 100 (Telegram widget). THROWAWAY DB only.
\set ON_ERROR_STOP on

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a1000000-0000-0000-0000-000000000001', 's100@fy.uz', '{"full_name":"Sotuvchi100","role":"xodim"}'::jsonb),
  ('a1000000-0000-0000-0000-000000000002', 'a100@fy.uz', '{"full_name":"Admin100","role":"admin"}'::jsonb),
  ('a1000000-0000-0000-0000-000000000003', 't100@fy.uz', '{"full_name":"Xodim100","role":"xodim"}'::jsonb);
INSERT INTO public.user_permissions (user_id, module, can_view) VALUES ('a1000000-0000-0000-0000-000000000001', 'sotuv-crmn', true);
UPDATE public.profiles SET telegram = '@Staff_Ali' WHERE id = 'a1000000-0000-0000-0000-000000000003';

INSERT INTO public.clients (id, full_name, phone, source) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'Ali Valiyev', '+998901000001', 'sayt'),
  ('c1000000-0000-0000-0000-000000000002', 'Bek',         '+998901000002', 'sayt');

-- Accounts: S = shared (oldest), P = the seller's own
INSERT INTO public.telegram_accounts (id, profile_id, title, status, created_at) VALUES
  ('e1000000-0000-0000-0000-00000000000a', NULL, 'Umumiy', 'active', now() - interval '2 days'),
  ('e1000000-0000-0000-0000-00000000000b', NULL, 'Eski',   'logged_out', now() - interval '3 days');

DO $$
DECLARE p uuid := (SELECT id FROM public.crm_pipelines WHERE name = 'Umumiy');
        st uuid := (SELECT id FROM public.crm_stages WHERE pipeline_id = (SELECT id FROM public.crm_pipelines WHERE name = 'Umumiy') AND NOT is_won AND NOT is_lost ORDER BY sort_order LIMIT 1);
BEGIN
  INSERT INTO public.crm_leads (id, name, pipeline_id, stage_id, client_id, responsible_user_id) VALUES
    ('d1000000-0000-0000-0000-000000000001', 'Ali bitim', p, st, 'c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001'),
    ('d1000000-0000-0000-0000-000000000002', 'Bek bitim', p, st, 'c1000000-0000-0000-0000-000000000002', NULL);
  IF (SELECT enabled FROM public.crm_lead_sources WHERE id = 'telegram') IS NOT TRUE THEN RAISE EXCEPTION 'SETUP FAILED: telegram source not on'; END IF;
END $$;

-- TEST 1: a stranger whose phone is a client's → linked to that client and their open bitim, no new client
DO $$
DECLARE c uuid; n int := (SELECT count(*) FROM public.clients);
BEGIN
  c := public.tg_link_chat('e1000000-0000-0000-0000-00000000000a', 5001, 'h1', 'ali_v', 'Ali', '998901000001');
  IF c IS NULL THEN RAISE EXCEPTION 'TEST 1 FAILED: no chat'; END IF;
  IF (SELECT client_id FROM public.tg_chats WHERE id = c) <> 'c1000000-0000-0000-0000-000000000001'
     OR (SELECT lead_id FROM public.tg_chats WHERE id = c) <> 'd1000000-0000-0000-0000-000000000001' THEN RAISE EXCEPTION 'TEST 1 FAILED: wrong link'; END IF;
  IF (SELECT count(*) FROM public.clients) <> n THEN RAISE EXCEPTION 'TEST 1 FAILED: new client made'; END IF;
  RAISE NOTICE 'TEST 1 ok';
END $$;

-- TEST 2: a stranger with no phone → one client (no phone) + bitim; the same user again → same chat
DO $$
DECLARE c1 uuid; c2 uuid; n int := (SELECT count(*) FROM public.clients);
BEGIN
  c1 := public.tg_link_chat('e1000000-0000-0000-0000-00000000000a', 5002, 'h2', NULL, 'Noma''lum Odam', NULL);
  c2 := public.tg_link_chat('e1000000-0000-0000-0000-00000000000a', 5002, 'h2', 'odam', 'Noma''lum Odam', NULL);
  IF c1 IS NULL OR c1 <> c2 THEN RAISE EXCEPTION 'TEST 2 FAILED: % / %', c1, c2; END IF;
  IF (SELECT count(*) FROM public.clients) <> n + 1 THEN RAISE EXCEPTION 'TEST 2 FAILED: clients % → %', n, (SELECT count(*) FROM public.clients); END IF;
  IF (SELECT lead_id FROM public.tg_chats WHERE id = c1) IS NULL THEN RAISE EXCEPTION 'TEST 2 FAILED: no bitim'; END IF;
  IF (SELECT username FROM public.tg_chats WHERE id = c1) <> 'odam' THEN RAISE EXCEPTION 'TEST 2 FAILED: username not filled'; END IF;
  RAISE NOTICE 'TEST 2 ok';
END $$;

-- TEST 3: staff username → ignored; source off + no match → ignored, nothing stored
DO $$
DECLARE n int := (SELECT count(*) FROM public.tg_chats);
BEGIN
  IF public.tg_link_chat('e1000000-0000-0000-0000-00000000000a', 5003, 'h3', 'staff_ali', 'Ali xodim', NULL) IS NOT NULL THEN RAISE EXCEPTION 'TEST 3 FAILED: staff linked'; END IF;
  UPDATE public.crm_lead_sources SET enabled = false WHERE id = 'telegram';
  IF public.tg_link_chat('e1000000-0000-0000-0000-00000000000a', 5004, 'h4', NULL, 'Begona', NULL) IS NOT NULL THEN RAISE EXCEPTION 'TEST 3 FAILED: stranger linked with source off'; END IF;
  -- a known client still links with the source off
  IF public.tg_link_chat('e1000000-0000-0000-0000-00000000000a', 5005, 'h5', NULL, 'Bek', '+998901000002') IS NULL THEN RAISE EXCEPTION 'TEST 3 FAILED: client not linked with source off'; END IF;
  UPDATE public.crm_lead_sources SET enabled = true WHERE id = 'telegram';
  IF (SELECT count(*) FROM public.tg_chats) <> n + 1 THEN RAISE EXCEPTION 'TEST 3 FAILED: chats %', (SELECT count(*) FROM public.tg_chats) - n; END IF;
  RAISE NOTICE 'TEST 3 ok';
END $$;

-- TEST 4: tg_log_message is idempotent; in bumps unread, out (typed in the phone app) doesn't
DO $$
DECLARE c uuid := (SELECT id FROM public.tg_chats WHERE tg_user_id = 5001);
BEGIN
  PERFORM public.tg_log_message(c, 10, 'in', 'Salom', '[]', NULL, NULL, now());
  PERFORM public.tg_log_message(c, 10, 'in', 'Salom', '[]', NULL, NULL, now());
  PERFORM public.tg_log_message(c, 11, 'out', 'Va alaykum', '[]', NULL, NULL, now());
  IF (SELECT count(*) FROM public.tg_messages WHERE chat_id = c) <> 2 THEN RAISE EXCEPTION 'TEST 4 FAILED: rows'; END IF;
  IF (SELECT unread FROM public.tg_chats WHERE id = c) <> 1 THEN RAISE EXCEPTION 'TEST 4 FAILED: unread %', (SELECT unread FROM public.tg_chats WHERE id = c); END IF;
  PERFORM public.tg_read('d1000000-0000-0000-0000-000000000001');
  IF (SELECT unread FROM public.tg_chats WHERE id = c) <> 0 THEN RAISE EXCEPTION 'TEST 4 FAILED: read'; END IF;
  PERFORM public.tg_read_outbox(c, 11, now());
  IF (SELECT read_at FROM public.tg_messages WHERE chat_id = c AND tg_msg_id = 11) IS NULL THEN RAISE EXCEPTION 'TEST 4 FAILED: read_at'; END IF;
  RAISE NOTICE 'TEST 4 ok';
END $$;

-- TEST 5: the chat's bitim is won → a reply moves to the client's other open bitim; none open → stays
DO $$
DECLARE c uuid := (SELECT id FROM public.tg_chats WHERE tg_user_id = 5001);
        p uuid := (SELECT id FROM public.crm_pipelines WHERE name = 'Umumiy');
        won uuid := (SELECT id FROM public.crm_stages WHERE pipeline_id = (SELECT id FROM public.crm_pipelines WHERE name = 'Umumiy') AND is_won LIMIT 1);
        st uuid := (SELECT id FROM public.crm_stages WHERE pipeline_id = (SELECT id FROM public.crm_pipelines WHERE name = 'Umumiy') AND NOT is_won AND NOT is_lost ORDER BY sort_order LIMIT 1);
BEGIN
  UPDATE public.crm_leads SET stage_id = won WHERE id = 'd1000000-0000-0000-0000-000000000001';
  PERFORM public.tg_log_message(c, 12, 'in', 'Yana savol', '[]', NULL, NULL, now());
  IF (SELECT lead_id FROM public.tg_chats WHERE id = c) <> 'd1000000-0000-0000-0000-000000000001' THEN RAISE EXCEPTION 'TEST 5 FAILED: moved with nothing open'; END IF;
  INSERT INTO public.crm_leads (id, name, pipeline_id, stage_id, client_id) VALUES ('d1000000-0000-0000-0000-000000000003', 'Ali ikkinchi', p, st, 'c1000000-0000-0000-0000-000000000001');
  PERFORM public.tg_log_message(c, 13, 'in', 'Yana', '[]', NULL, NULL, now());
  IF (SELECT lead_id FROM public.tg_chats WHERE id = c) <> 'd1000000-0000-0000-0000-000000000003' THEN RAISE EXCEPTION 'TEST 5 FAILED: not moved to the open bitim'; END IF;
  RAISE NOTICE 'TEST 5 ok';
END $$;

-- TEST 6: account rule — existing chat's account; else owner's own; else oldest active shared; none → tg_no_account
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.tg_send_target('d1000000-0000-0000-0000-000000000003');   -- Ali has chat on A
  IF r.account_id <> 'e1000000-0000-0000-0000-00000000000a' OR r.chat_id IS NULL OR r.tg_user_id <> 5001 THEN RAISE EXCEPTION 'TEST 6 FAILED: existing chat %', r; END IF;
  INSERT INTO public.telegram_accounts (id, profile_id, title, status) VALUES ('e1000000-0000-0000-0000-00000000000c', 'a1000000-0000-0000-0000-000000000001', 'Sotuvchi', 'active');
  SELECT * INTO r FROM public.tg_send_target('d1000000-0000-0000-0000-000000000003');
  IF r.account_id <> 'e1000000-0000-0000-0000-00000000000a' THEN RAISE EXCEPTION 'TEST 6 FAILED: existing chat lost to owner account'; END IF;
  UPDATE public.crm_leads SET responsible_user_id = 'a1000000-0000-0000-0000-000000000001' WHERE id = 'd1000000-0000-0000-0000-000000000002';
  DELETE FROM public.tg_chats WHERE tg_user_id = 5005;   -- Bek: no chat yet
  SELECT * INTO r FROM public.tg_send_target('d1000000-0000-0000-0000-000000000002');
  IF r.account_id <> 'e1000000-0000-0000-0000-00000000000c' OR r.chat_id IS NOT NULL OR r.phone <> '+998901000002' THEN RAISE EXCEPTION 'TEST 6 FAILED: owner account %', r; END IF;
  UPDATE public.crm_leads SET responsible_user_id = NULL WHERE id = 'd1000000-0000-0000-0000-000000000002';
  SELECT * INTO r FROM public.tg_send_target('d1000000-0000-0000-0000-000000000002');
  IF r.account_id <> 'e1000000-0000-0000-0000-00000000000a' THEN RAISE EXCEPTION 'TEST 6 FAILED: shared %', r; END IF;
  UPDATE public.telegram_accounts SET status = 'logged_out';
  BEGIN PERFORM public.tg_send_target('d1000000-0000-0000-0000-000000000002'); RAISE EXCEPTION 'TEST 6 FAILED: no account accepted';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'tg_no_account' THEN RAISE; END IF; END;
  UPDATE public.telegram_accounts SET status = 'active' WHERE id IN ('e1000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-00000000000c');
  RAISE NOTICE 'TEST 6 ok';
END $$;

-- TEST 7: daily cap — 30 new chats per account per Tashkent day; an existing chat never counts
DO $$
DECLARE i int; c uuid;
BEGIN
  DELETE FROM public.tg_chats WHERE account_id = 'e1000000-0000-0000-0000-00000000000a' AND first_out_at IS NOT NULL;
  FOR i IN 1..29 LOOP
    INSERT INTO public.tg_chats (account_id, tg_user_id, access_hash, title, first_out_at) VALUES ('e1000000-0000-0000-0000-00000000000a', 9000 + i, 'x', 'f', now());
  END LOOP;
  PERFORM public.tg_send_target('d1000000-0000-0000-0000-000000000002');   -- 29 used: ok
  c := public.tg_create_chat('e1000000-0000-0000-0000-00000000000a', 'd1000000-0000-0000-0000-000000000002', 6001, 'h', 'bek', 'Bek');
  IF (SELECT first_out_at FROM public.tg_chats WHERE id = c) IS NULL OR (SELECT lead_id FROM public.tg_chats WHERE id = c) <> 'd1000000-0000-0000-0000-000000000002' THEN RAISE EXCEPTION 'TEST 7 FAILED: 30th'; END IF;
  IF public.tg_create_chat('e1000000-0000-0000-0000-00000000000a', 'd1000000-0000-0000-0000-000000000002', 6001, 'h', 'bek', 'Bek') <> c THEN RAISE EXCEPTION 'TEST 7 FAILED: existing chat'; END IF;
  BEGIN PERFORM public.tg_create_chat('e1000000-0000-0000-0000-00000000000a', 'd1000000-0000-0000-0000-000000000002', 6002, 'h', NULL, 'X'); RAISE EXCEPTION 'TEST 7 FAILED: 31st accepted';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'tg_cap' THEN RAISE; END IF; END;
  UPDATE public.tg_chats SET client_id = NULL WHERE id = c;   -- Bek has no chat again, 30 still used
  BEGIN PERFORM public.tg_send_target('d1000000-0000-0000-0000-000000000002'); RAISE EXCEPTION 'TEST 7 FAILED: send_target over cap';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'tg_cap' THEN RAISE; END IF; END;
  -- yesterday's chats don't count
  UPDATE public.tg_chats SET first_out_at = now() - interval '2 days' WHERE first_out_at IS NOT NULL;
  PERFORM public.tg_send_target('d1000000-0000-0000-0000-000000000002');
  RAISE NOTICE 'TEST 7 ok';
END $$;

-- TEST 8: no phone and no chat → tg_not_found
DO $$
DECLARE p uuid := (SELECT id FROM public.crm_pipelines WHERE name = 'Umumiy');
        st uuid := (SELECT id FROM public.crm_stages WHERE pipeline_id = (SELECT id FROM public.crm_pipelines WHERE name = 'Umumiy') AND NOT is_won AND NOT is_lost ORDER BY sort_order LIMIT 1);
BEGIN
  INSERT INTO public.clients (id, full_name, source) VALUES ('c1000000-0000-0000-0000-000000000009', 'Raqamsiz', 'sotuv');
  INSERT INTO public.crm_leads (id, name, pipeline_id, stage_id, client_id) VALUES ('d1000000-0000-0000-0000-000000000009', 'R', p, st, 'c1000000-0000-0000-0000-000000000009');
  BEGIN PERFORM public.tg_send_target('d1000000-0000-0000-0000-000000000009'); RAISE EXCEPTION 'TEST 8 FAILED: accepted';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'tg_not_found' THEN RAISE; END IF; END;
  RAISE NOTICE 'TEST 8 ok';
END $$;

-- TEST 10: writing from another bitim of the same client moves the chat there (its feed shows the message)
DO $$
DECLARE p uuid := (SELECT id FROM public.crm_pipelines WHERE name = 'Umumiy');
        st uuid := (SELECT id FROM public.crm_stages WHERE pipeline_id = (SELECT id FROM public.crm_pipelines WHERE name = 'Umumiy') AND NOT is_won AND NOT is_lost ORDER BY sort_order LIMIT 1);
        r record; c uuid;
BEGIN
  INSERT INTO public.crm_leads (id, name, pipeline_id, stage_id, client_id) VALUES ('d1000000-0000-0000-0000-000000000004', 'Ali uchinchi', p, st, 'c1000000-0000-0000-0000-000000000001');
  SELECT * INTO r FROM public.tg_send_target('d1000000-0000-0000-0000-000000000004');
  IF r.chat_id IS NULL OR (SELECT lead_id FROM public.tg_chats WHERE id = r.chat_id) <> 'd1000000-0000-0000-0000-000000000004' THEN
    RAISE EXCEPTION 'TEST 10 FAILED: chat stays on %', (SELECT lead_id FROM public.tg_chats WHERE id = r.chat_id); END IF;
  -- an existing (account, user) chat found by tg_create_chat follows the bitim it is written from too
  c := public.tg_create_chat('e1000000-0000-0000-0000-00000000000a', 'd1000000-0000-0000-0000-000000000002', 5002, 'h2', NULL, 'X');
  IF (SELECT lead_id FROM public.tg_chats WHERE id = c) <> 'd1000000-0000-0000-0000-000000000002'
     OR (SELECT client_id FROM public.tg_chats WHERE id = c) <> 'c1000000-0000-0000-0000-000000000002' THEN RAISE EXCEPTION 'TEST 10 FAILED: create_chat kept the old link'; END IF;
  RAISE NOTICE 'TEST 10 ok';
END $$;

-- TEST 9: worker functions are closed to API roles; RLS on chats/templates
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['tg_link_chat(uuid,bigint,text,text,text,text)', 'tg_log_message(uuid,bigint,text,text,jsonb,uuid,uuid,timestamptz)',
                           'tg_send_target(uuid)', 'tg_create_chat(uuid,uuid,bigint,text,text,text)', 'tg_read(uuid)', 'tg_read_outbox(uuid,bigint,timestamptz)'] LOOP
    IF has_function_privilege('authenticated', 'public.' || f, 'execute') OR has_function_privilege('anon', 'public.' || f, 'execute') THEN
      RAISE EXCEPTION 'TEST 9 FAILED: % executable by API roles', f; END IF;
  END LOOP;
END $$;
INSERT INTO public.tg_templates (title, body) VALUES ('Nonushta', 'Salom {ism}');
GRANT USAGE ON SCHEMA public TO authenticated;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', false);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.tg_templates) <> 1 THEN RAISE EXCEPTION 'TEST 9 FAILED: seller cannot read templates'; END IF;
  IF (SELECT count(*) FROM public.tg_chats) = 0 OR (SELECT count(*) FROM public.tg_messages) = 0 THEN RAISE EXCEPTION 'TEST 9 FAILED: seller cannot read chats'; END IF;
  IF (SELECT count(*) FROM public.telegram_accounts) <> 0 THEN RAISE EXCEPTION 'TEST 9 FAILED: seller reads accounts'; END IF;
  BEGIN INSERT INTO public.tg_templates (title, body) VALUES ('x', 'y'); RAISE EXCEPTION 'TEST 9 FAILED: seller wrote a template';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.tg_chats SET unread = 99; IF FOUND THEN RAISE EXCEPTION 'TEST 9 FAILED: seller updated a chat'; END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000002', false);
DO $$
BEGIN
  INSERT INTO public.tg_templates (title, body) VALUES ('Admin', 'z');
  IF (SELECT count(*) FROM public.telegram_accounts) = 0 THEN RAISE EXCEPTION 'TEST 9 FAILED: admin cannot read accounts'; END IF;
  RAISE NOTICE 'TEST 9 ok';
END $$;
RESET ROLE;
