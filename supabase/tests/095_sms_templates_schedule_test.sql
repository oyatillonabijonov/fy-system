-- Behavioural tests for migration 095 (SMS templates + scheduled / one-client sends). THROWAWAY DB only.
\set ON_ERROR_STOP on

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('95000000-0000-0000-0000-000000000001', 'sms95@fy.uz', '{"full_name":"SmsUser95","role":"xodim"}'::jsonb),
  ('95000000-0000-0000-0000-000000000002', 'sot95@fy.uz', '{"full_name":"Sotuvchi95","role":"xodim"}'::jsonb),
  ('95000000-0000-0000-0000-000000000003', 'x95@fy.uz',   '{"full_name":"Hodim95","role":"xodim"}'::jsonb);
INSERT INTO public.user_permissions (user_id, module, can_view) VALUES
  ('95000000-0000-0000-0000-000000000001', 'sms', true),
  ('95000000-0000-0000-0000-000000000002', 'sotuv-crmn', true);
INSERT INTO public.clients (id, full_name, phone, sms_opt_out) VALUES
  ('c9500000-0000-0000-0000-000000000001', 'Ali Valiyev', '+998901950001', false),
  ('c9500000-0000-0000-0000-000000000002', 'Vali', '+998901950002', false),
  ('c9500000-0000-0000-0000-000000000003', 'Rad etgan', '+998901950003', true);
-- as the owner (amo-sync): states the API can't set
INSERT INTO public.sms_templates (id, title, text, status, kind, eskiz_id) VALUES
  ('a9500000-0000-0000-0000-000000000001', 'Eslatma', 'Salom {ism}! {sana} kuni kutamiz', 'approved', 'reminder', 9501),
  ('a9500000-0000-0000-0000-000000000002', 'Kutilmoqda', 'Hali tekshirilmoqda', 'moderation', NULL, NULL),
  ('a9500000-0000-0000-0000-000000000003', 'Yashirin', 'Eski matn', 'approved', 'reminder', 9503),
  ('a9500000-0000-0000-0000-000000000004', 'Reklama', 'Chegirma bor!', 'approved', 'promo', 9504);
UPDATE public.sms_templates SET hidden = true WHERE id = 'a9500000-0000-0000-0000-000000000003';

GRANT USAGE ON SCHEMA public TO authenticated;
SET ROLE authenticated;

-- TESTS 1-5 as the SMS user
SELECT set_config('request.jwt.claim.sub', '95000000-0000-0000-0000-000000000001', false);
DO $$
DECLARE r jsonb; v_c uuid;
BEGIN
  r := public.send_sms_template('a9500000-0000-0000-0000-000000000001', '{"sana":"28-noyabr"}', ARRAY['c9500000-0000-0000-0000-000000000001','c9500000-0000-0000-0000-000000000002']::uuid[], NULL);
  IF (r->>'queued')::int <> 2 THEN RAISE EXCEPTION 'TEST 1 FAILED: %', r; END IF;
  IF (SELECT text FROM public.sms_messages WHERE client_id = 'c9500000-0000-0000-0000-000000000001' ORDER BY id DESC LIMIT 1) <> 'Salom Ali! 28-noyabr kuni kutamiz' THEN
    RAISE EXCEPTION 'TEST 1 FAILED: text %', (SELECT text FROM public.sms_messages WHERE client_id = 'c9500000-0000-0000-0000-000000000001' ORDER BY id DESC LIMIT 1); END IF;
  IF (SELECT kind FROM public.sms_campaigns WHERE id = (r->>'campaign_id')::uuid) <> 'reminder' THEN RAISE EXCEPTION 'TEST 1 FAILED: kind not from the template'; END IF;

  BEGIN PERFORM public.send_sms_template('a9500000-0000-0000-0000-000000000001', '{"sana":"  "}', ARRAY['c9500000-0000-0000-0000-000000000001']::uuid[], NULL);
    RAISE EXCEPTION 'TEST 2 FAILED: empty blank sent'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%blank_missing%' THEN RAISE; END IF; END;
  BEGIN PERFORM public.send_sms_template('a9500000-0000-0000-0000-000000000002', '{}', ARRAY['c9500000-0000-0000-0000-000000000001']::uuid[], NULL);
    RAISE EXCEPTION 'TEST 2 FAILED: unapproved sent'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%not_approved%' THEN RAISE; END IF; END;
  BEGIN PERFORM public.send_sms_template('a9500000-0000-0000-0000-000000000003', '{}', ARRAY['c9500000-0000-0000-0000-000000000001']::uuid[], NULL);
    RAISE EXCEPTION 'TEST 2 FAILED: hidden sent'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%not_approved%' THEN RAISE; END IF; END;

  -- 3: promo skips the opt-out; a late or past send time
  r := public.send_sms_template('a9500000-0000-0000-0000-000000000004', '{}', ARRAY['c9500000-0000-0000-0000-000000000002','c9500000-0000-0000-0000-000000000003']::uuid[], now() + interval '1 day');
  IF (r->>'queued')::int <> 1 OR (r->>'skipped')::int <> 1 THEN RAISE EXCEPTION 'TEST 3 FAILED: opt-out %', r; END IF;
  IF (SELECT send_at FROM public.sms_campaigns WHERE id = (r->>'campaign_id')::uuid) < now() + interval '23 hours' THEN RAISE EXCEPTION 'TEST 3 FAILED: send time lost'; END IF;
  v_c := (r->>'campaign_id')::uuid;
  r := public.send_sms_template('a9500000-0000-0000-0000-000000000004', '{}', ARRAY['c9500000-0000-0000-0000-000000000002']::uuid[], now() - interval '3 days');
  IF (SELECT send_at FROM public.sms_campaigns WHERE id = (r->>'campaign_id')::uuid) < now() - interval '1 minute' THEN RAISE EXCEPTION 'TEST 3 FAILED: past time kept'; END IF;

  -- 4: cancel a scheduled send
  PERFORM public.cancel_sms_campaign(v_c);
  IF EXISTS (SELECT 1 FROM public.sms_messages WHERE campaign_id = v_c AND status <> 'cancelled') THEN RAISE EXCEPTION 'TEST 4 FAILED: not cancelled'; END IF;

  -- 5: template state belongs to amo-sync; editing an approved text sends it back to moderation
  BEGIN UPDATE public.sms_templates SET status = 'approved' WHERE id = 'a9500000-0000-0000-0000-000000000002';
    RAISE EXCEPTION 'TEST 5 FAILED: API approved a template'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.sms_templates (title, text, eskiz_id) VALUES ('x', 'y', 1);
    RAISE EXCEPTION 'TEST 5 FAILED: API set eskiz_id'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  INSERT INTO public.sms_templates (title, text, status) VALUES ('Yangi', 'Yangi matn {ism}', 'moderation');
  UPDATE public.sms_templates SET text = 'Salom {ism}! {sana} kuni kutib qolamiz' WHERE id = 'a9500000-0000-0000-0000-000000000001';
  IF (SELECT status || coalesce(eskiz_id::text, '-') || coalesce(kind, '-') FROM public.sms_templates WHERE id = 'a9500000-0000-0000-0000-000000000001') <> 'moderation--' THEN
    RAISE EXCEPTION 'TEST 5 FAILED: edited approved text stayed approved'; END IF;
  RAISE NOTICE 'TESTS 1-5 ok';
END $$;

-- TEST 6: a seller — one client yes, two no; sees approved templates only; can't cancel another's send
SELECT set_config('request.jwt.claim.sub', '95000000-0000-0000-0000-000000000002', false);
DO $$
DECLARE r jsonb;
BEGIN
  r := public.send_sms_template('a9500000-0000-0000-0000-000000000004', '{}', ARRAY['c9500000-0000-0000-0000-000000000002']::uuid[], NULL);
  IF (r->>'queued')::int <> 1 THEN RAISE EXCEPTION 'TEST 6 FAILED: seller one client'; END IF;
  BEGIN PERFORM public.send_sms_template('a9500000-0000-0000-0000-000000000004', '{}', ARRAY['c9500000-0000-0000-0000-000000000001','c9500000-0000-0000-0000-000000000002']::uuid[], NULL);
    RAISE EXCEPTION 'TEST 6 FAILED: seller bulk'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (SELECT count(*) FROM public.sms_templates) <> 1 THEN RAISE EXCEPTION 'TEST 6 FAILED: seller sees % templates', (SELECT count(*) FROM public.sms_templates); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sms_messages WHERE client_id = 'c9500000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'TEST 6 FAILED: seller cannot read the client''s SMS'; END IF;
  BEGIN PERFORM public.cancel_sms_campaign((SELECT id FROM public.sms_campaigns WHERE created_by = '95000000-0000-0000-0000-000000000001' LIMIT 1));
    RAISE EXCEPTION 'TEST 6 FAILED: seller cancelled another''s send'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'TEST 6 ok';
END $$;

-- TEST 7: no module → nothing
SELECT set_config('request.jwt.claim.sub', '95000000-0000-0000-0000-000000000003', false);
DO $$ BEGIN
  BEGIN PERFORM public.send_sms_template('a9500000-0000-0000-0000-000000000004', '{}', ARRAY['c9500000-0000-0000-0000-000000000002']::uuid[], NULL);
    RAISE EXCEPTION 'TEST 7 FAILED'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF EXISTS (SELECT 1 FROM public.sms_templates) THEN RAISE EXCEPTION 'TEST 7 FAILED: outsider sees templates'; END IF;
  RAISE NOTICE 'TEST 7 ok';
END $$;
RESET ROLE;
