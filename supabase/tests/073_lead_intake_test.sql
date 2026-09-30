-- Behavioural tests for migration 073 (lead intake). THROWAWAY DB only (recipe: CLAUDE.md §5).
-- Needs 072's fixtures-free schema; runs as the table owner like amo-sync does.
\set ON_ERROR_STOP on

INSERT INTO public.crm_pipelines (id, name, sort_order) VALUES ('a7300000-0000-0000-0000-000000000001', 'Kirish', -1);
INSERT INTO public.crm_stages (id, pipeline_id, name, sort_order, is_won, is_lost) VALUES
  ('b7300000-0000-0000-0000-000000000001', 'a7300000-0000-0000-0000-000000000001', 'Yangi lid', 0, false, false),
  ('b7300000-0000-0000-0000-000000000002', 'a7300000-0000-0000-0000-000000000001', 'Yutildi', 1, true, false);
UPDATE public.crm_lead_sources SET pipeline_id = 'a7300000-0000-0000-0000-000000000001', enabled = true WHERE id = 'tilda';

-- TEST 1: wrong token refused; a disabled source only logs
DO $$
DECLARE r jsonb;
BEGIN
  BEGIN
    PERFORM public.intake_lead('tilda', 'yomon', 'Ali', '901234567', NULL);
    RAISE EXCEPTION 'TEST 1 FAILED: wrong token accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  r := public.intake_lead('framer', (SELECT token FROM public.crm_lead_sources WHERE id = 'framer'), 'Ali', '901234567', NULL);
  IF NOT (r->>'skipped')::boolean OR EXISTS (SELECT 1 FROM public.clients WHERE phone = '+998901234567') THEN
    RAISE EXCEPTION 'TEST 1 FAILED: disabled source created data: %', r; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.webhook_logs WHERE source = 'framer') THEN RAISE EXCEPTION 'TEST 1 FAILED: not logged'; END IF;
  RAISE NOTICE 'TEST 1 ok: token checked, disabled source only logs';
END $$;

-- TEST 2: a new phone → client + deal in the first stage + feed row with the details
DO $$
DECLARE r jsonb; l uuid;
BEGIN
  r := public.intake_lead('tilda', (SELECT token FROM public.crm_lead_sources WHERE id = 'tilda'), 'Aziz', '+998 90 123 45 67', E'Soha: IT\nIzoh: qo''ng''iroq qiling', '{"a":1}');
  l := (r->>'lead_id')::uuid;
  IF (r->>'duplicate')::boolean THEN RAISE EXCEPTION 'TEST 2 FAILED: marked duplicate'; END IF;
  IF (SELECT stage_id FROM public.crm_leads WHERE id = l) <> 'b7300000-0000-0000-0000-000000000001' THEN RAISE EXCEPTION 'TEST 2 FAILED: wrong stage'; END IF;
  IF (SELECT c.phone FROM public.crm_leads d JOIN public.clients c ON c.id = d.client_id WHERE d.id = l) <> '+998901234567' THEN RAISE EXCEPTION 'TEST 2 FAILED: client phone'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_notes WHERE lead_id = l AND kind = 'lead' AND text LIKE 'Murojaat · Tilda%Soha: IT%') THEN RAISE EXCEPTION 'TEST 2 FAILED: no feed row'; END IF;
  IF (SELECT leads_count FROM public.crm_lead_sources WHERE id = 'tilda') <> 1 THEN RAISE EXCEPTION 'TEST 2 FAILED: counter'; END IF;
  RAISE NOTICE 'TEST 2 ok: new lead with client and feed row';
END $$;

-- TEST 3: same phone again → no second open deal, "Qayta murojaat" in the feed; after the deal is won, a new one opens
DO $$
DECLARE r jsonb; l uuid := (SELECT id FROM public.crm_leads WHERE pipeline_id = 'a7300000-0000-0000-0000-000000000001');
BEGIN
  r := public.intake_lead('tilda', (SELECT token FROM public.crm_lead_sources WHERE id = 'tilda'), 'Aziz K', '901234567', NULL);
  IF NOT (r->>'duplicate')::boolean OR (r->>'lead_id')::uuid <> l THEN RAISE EXCEPTION 'TEST 3 FAILED: second deal opened: %', r; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_notes WHERE lead_id = l AND text LIKE 'Qayta murojaat%') THEN RAISE EXCEPTION 'TEST 3 FAILED: no repeat row'; END IF;
  UPDATE public.crm_leads SET stage_id = 'b7300000-0000-0000-0000-000000000002' WHERE id = l;
  r := public.intake_lead('tilda', (SELECT token FROM public.crm_lead_sources WHERE id = 'tilda'), 'Aziz', '901234567', NULL);
  IF (r->>'duplicate')::boolean THEN RAISE EXCEPTION 'TEST 3 FAILED: closed deal reused'; END IF;
  IF (SELECT count(*) FROM public.clients WHERE phone = '+998901234567') <> 1 THEN RAISE EXCEPTION 'TEST 3 FAILED: duplicate client'; END IF;
  RAISE NOTICE 'TEST 3 ok: repeat requests join the open deal';
END $$;

-- TEST 4: the API roles can't call it or read the tokens
GRANT USAGE ON SCHEMA public TO authenticated;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('73000000-0000-0000-0000-000000000002', 's73@fy.uz', '{"full_name":"S73","role":"xodim"}'::jsonb);
INSERT INTO public.user_permissions (user_id, module, can_view) VALUES ('73000000-0000-0000-0000-000000000002', 'sotuv-crmn', true);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '73000000-0000-0000-0000-000000000002', false);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.crm_lead_sources) THEN RAISE EXCEPTION 'TEST 4 FAILED: tokens visible to staff'; END IF;
  -- (checked by privilege, not by a call: a denied call segfaults the PG17 test image; prod PG15 just errors)
  IF has_function_privilege('authenticated', 'public.intake_lead(text,text,text,text,text,jsonb)', 'execute')
     OR has_function_privilege('anon', 'public.intake_lead(text,text,text,text,text,jsonb)', 'execute') THEN
    RAISE EXCEPTION 'TEST 4 FAILED: API role can call intake_lead'; END IF;
  RAISE NOTICE 'TEST 4 ok: intake is service-only';
END $$;
