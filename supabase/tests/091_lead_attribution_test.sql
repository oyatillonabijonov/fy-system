-- Behavioural tests for migration 091 (a lead remembers the ad / UTM). THROWAWAY DB only (recipe: CLAUDE.md §5).
\set ON_ERROR_STOP on

INSERT INTO public.crm_pipelines (id, name, sort_order) VALUES ('a9100000-0000-0000-0000-000000000001', 'Reklama91', -2);
INSERT INTO public.crm_stages (id, pipeline_id, name, sort_order, is_won, is_lost) VALUES
  ('b9100000-0000-0000-0000-000000000001', 'a9100000-0000-0000-0000-000000000001', 'Yangi', 0, false, false);
UPDATE public.crm_lead_sources SET pipeline_id = 'a9100000-0000-0000-0000-000000000001', enabled = true WHERE id IN ('sayt', 'call');

DO $$
DECLARE t text := (SELECT token FROM public.crm_lead_sources WHERE id = 'sayt'); r jsonb; k uuid; n uuid;
BEGIN
  -- 1: a new lead keeps its attribution
  r := public.intake_lead('sayt', t, 'Ali', '901230001', NULL, '{}', '[]', NULL,
         '{"campaign_id":"c1","ad_id":"a1","utm_source":"instagram"}');
  k := (r->>'lead_id')::uuid;
  IF (SELECT attribution->>'campaign_id' FROM public.crm_leads WHERE id = k) IS DISTINCT FROM 'c1'
     OR (SELECT attribution->>'utm_source' FROM public.crm_leads WHERE id = k) IS DISTINCT FROM 'instagram' THEN
    RAISE EXCEPTION 'TEST 1 FAILED: attribution not stored: %', (SELECT attribution FROM public.crm_leads WHERE id = k); END IF;

  -- 2: a repeat request does not overwrite it; the feed row carries the new one
  r := public.intake_lead('sayt', t, 'Ali', '901230001', NULL, '{}', '[]', NULL, '{"campaign_id":"c2"}');
  IF NOT (r->>'duplicate')::boolean OR (r->>'lead_id')::uuid <> k THEN RAISE EXCEPTION 'TEST 2 FAILED: not a repeat: %', r; END IF;
  IF (SELECT attribution->>'campaign_id' FROM public.crm_leads WHERE id = k) IS DISTINCT FROM 'c1' THEN
    RAISE EXCEPTION 'TEST 2 FAILED: attribution overwritten'; END IF;
  IF (SELECT meta->'attribution'->>'campaign_id' FROM public.crm_notes
      WHERE lead_id = k AND kind = 'lead' ORDER BY created_at DESC, id DESC LIMIT 1) IS DISTINCT FROM 'c2' THEN
    RAISE EXCEPTION 'TEST 2 FAILED: feed row lacks the new attribution'; END IF;

  -- 3: the old 8-argument call still works and stores nothing
  r := public.intake_lead('sayt', t, 'Vali', '901230002', NULL, '{}', '[]', NULL);
  n := (r->>'lead_id')::uuid;
  IF (SELECT attribution FROM public.crm_leads WHERE id = n) <> '{}'::jsonb THEN RAISE EXCEPTION 'TEST 3 FAILED: attribution not empty'; END IF;
  IF (SELECT meta ? 'attribution' FROM public.crm_notes WHERE lead_id = n AND kind = 'lead' LIMIT 1) THEN
    RAISE EXCEPTION 'TEST 3 FAILED: note carries an attribution key'; END IF;

  -- 4: NULL attribution is treated as empty
  r := public.intake_lead('sayt', t, 'Gani', '901230003', NULL, '{}', '[]', NULL, NULL);
  IF (SELECT attribution FROM public.crm_leads WHERE id = (r->>'lead_id')::uuid) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'TEST 4 FAILED: NULL attribution'; END IF;

  -- 4b: a non-object attribution (array / scalar) is treated as empty
  FOR r IN SELECT public.intake_lead('sayt', t, 'Arr', '901230004', NULL, '{}', '[]', NULL, '["x"]'::jsonb)
           UNION ALL SELECT public.intake_lead('sayt', t, 'Str', '901230005', NULL, '{}', '[]', NULL, '"x"'::jsonb) LOOP
    IF (SELECT attribution FROM public.crm_leads WHERE id = (r->>'lead_id')::uuid) <> '{}'::jsonb THEN
      RAISE EXCEPTION 'TEST 4b FAILED: non-object attribution stored: %', (SELECT attribution FROM public.crm_leads WHERE id = (r->>'lead_id')::uuid); END IF;
    IF (SELECT meta ? 'attribution' FROM public.crm_notes WHERE lead_id = (r->>'lead_id')::uuid AND kind = 'lead' LIMIT 1) THEN
      RAISE EXCEPTION 'TEST 4b FAILED: note carries an attribution key'; END IF;
  END LOOP;

  -- 5: still service-only
  IF has_function_privilege('authenticated', 'public.intake_lead(text,text,text,text,text,jsonb,jsonb,text,jsonb)', 'execute')
     OR has_function_privilege('anon', 'public.intake_lead(text,text,text,text,text,jsonb,jsonb,text,jsonb)', 'execute') THEN
    RAISE EXCEPTION 'TEST 5 FAILED: API role can execute intake_lead'; END IF;

  -- 6: an incoming call from an unknown number still opens a bitim through log_pbx_call
  IF public.log_pbx_call('u91', 'inbound', '935550091', '100', 1790764000, 40, 30, 'NORMAL_CLEARING') <> 'logged' THEN
    RAISE EXCEPTION 'TEST 6 FAILED: call not logged'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_calls c JOIN public.crm_leads l ON l.id = c.lead_id
                 WHERE c.uuid = 'u91' AND l.source = 'call' AND l.pipeline_id = 'a9100000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'TEST 6 FAILED: no bitim for the unknown caller'; END IF;

  RAISE NOTICE 'TESTS ok: attribution stored, repeat keeps first + feed carries new, 8-arg call, NULL, service-only, call source';
END $$;
