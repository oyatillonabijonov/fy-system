-- Behavioural tests for migration 088 (lead auto-assign). THROWAWAY DB only (recipe: CLAUDE.md §5).
\set ON_ERROR_STOP on

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('88000000-0000-0000-0000-000000000001', 's1@t88.uz', '{"full_name":"Sotuvchi1","role":"xodim"}'::jsonb),
  ('88000000-0000-0000-0000-000000000002', 's2@t88.uz', '{"full_name":"Sotuvchi2","role":"xodim"}'::jsonb),
  ('88000000-0000-0000-0000-000000000003', 's3@t88.uz', '{"full_name":"Sotuvchi3","role":"xodim"}'::jsonb);
INSERT INTO public.crm_pipelines (id, name, sort_order, auto_assign) VALUES
  ('a8800000-0000-0000-0000-000000000001', 'T88 A', -2, true),
  ('a8800000-0000-0000-0000-000000000002', 'T88 B', -1, true),
  ('a8800000-0000-0000-0000-000000000003', 'T88 off', 0, false);
INSERT INTO public.crm_stages (id, pipeline_id, name, sort_order, is_won, is_lost) VALUES
  ('b8800000-0000-0000-0000-000000000001', 'a8800000-0000-0000-0000-000000000001', 'Yangi', 0, false, false),
  ('b8800000-0000-0000-0000-000000000002', 'a8800000-0000-0000-0000-000000000002', 'Yangi', 0, false, false),
  ('b8800000-0000-0000-0000-000000000003', 'a8800000-0000-0000-0000-000000000003', 'Yangi', 0, false, false);
INSERT INTO public.crm_pipeline_sellers (pipeline_id, user_id, created_at) VALUES
  ('a8800000-0000-0000-0000-000000000001', '88000000-0000-0000-0000-000000000001', now() - interval '2 min'),
  ('a8800000-0000-0000-0000-000000000001', '88000000-0000-0000-0000-000000000002', now() - interval '1 min'),
  ('a8800000-0000-0000-0000-000000000003', '88000000-0000-0000-0000-000000000001', now());
UPDATE public.crm_lead_sources SET pipeline_id = 'a8800000-0000-0000-0000-000000000001', enabled = true WHERE id = 'sayt';

-- A form lead through the real door; returns its owner's number (1, 2, 3) or 0
CREATE OR REPLACE FUNCTION pg_temp.lead(p_phone text, p_pipe text DEFAULT NULL) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE r jsonb; o text;
BEGIN
  r := public.intake_lead('sayt', (SELECT token FROM public.crm_lead_sources WHERE id = 'sayt'), 'T', p_phone, NULL, '{}', '[]', p_pipe);
  IF r->>'lead_id' IS NULL THEN RAISE EXCEPTION 'no bitim opened: %', r; END IF;
  SELECT right(responsible_user_id::text, 1) INTO o FROM public.crm_leads WHERE id = (r->>'lead_id')::uuid;
  RETURN COALESCE(o::integer, 0);
END $$;

DO $$
DECLARE a text;
BEGIN
  -- turns: 1, 2, 1, 2 — equal
  a := pg_temp.lead('+998900008801')::text || pg_temp.lead('+998900008802')::text || pg_temp.lead('+998900008803')::text || pg_temp.lead('+998900008804')::text;
  IF a IS DISTINCT FROM '1212' THEN RAISE EXCEPTION 'TEST 1 FAILED: turns %', a; END IF;

  -- a repeat request stays on its bitim and takes no turn
  IF pg_temp.lead('+998900008801') <> 1 OR pg_temp.lead('+998900008805') <> 1 THEN RAISE EXCEPTION 'TEST 2 FAILED: repeat took a turn'; END IF;

  -- feed: "created" first, then the assignment line
  IF (SELECT string_agg(n2.text, '|' ORDER BY n2.created_at) FROM public.crm_notes n2 JOIN public.crm_leads l ON l.id = n2.lead_id JOIN public.clients c ON c.id = l.client_id
      WHERE c.phone = '+998900008802' AND n2.kind = 'created') NOT LIKE '%yaratildi|Avtomatik taqsimlandi: Sotuvchi2' THEN
    RAISE EXCEPTION 'TEST 3 FAILED: feed order'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_notes n2 JOIN public.crm_leads l ON l.id = n2.lead_id JOIN public.clients c ON c.id = l.client_id WHERE c.phone = '+998900008802' AND n2.text LIKE 'Avtomatik%') THEN
    RAISE EXCEPTION 'TEST 3 FAILED: feed'; END IF;

  -- same client in another voronka with the same seller ticked → same seller, not the queue's next
  INSERT INTO public.crm_pipeline_sellers (pipeline_id, user_id, last_assigned_at) VALUES
    ('a8800000-0000-0000-0000-000000000002', '88000000-0000-0000-0000-000000000001', now()),
    ('a8800000-0000-0000-0000-000000000002', '88000000-0000-0000-0000-000000000002', now() - interval '1 day');
  IF pg_temp.lead('+998900008801', 'a8800000-0000-0000-0000-000000000002') <> 1 THEN RAISE EXCEPTION 'TEST 4 FAILED: client moved to another seller'; END IF;
  -- ...and that counted as seller 1's turn; a new client takes seller 2
  IF pg_temp.lead('+998900008806', 'a8800000-0000-0000-0000-000000000002') <> 2 THEN RAISE EXCEPTION 'TEST 4 FAILED: queue'; END IF;

  -- unticked seller: the client's next bitim goes to the queue
  DELETE FROM public.crm_pipeline_sellers WHERE pipeline_id = 'a8800000-0000-0000-0000-000000000002' AND user_id = '88000000-0000-0000-0000-000000000002';
  IF pg_temp.lead('+998900008804', 'a8800000-0000-0000-0000-000000000002') <> 1 THEN RAISE EXCEPTION 'TEST 5 FAILED: unticked seller kept'; END IF;

  -- a deactivated seller is skipped; a newly ticked one gets the very next lead
  UPDATE public.profiles SET is_active = false WHERE id = '88000000-0000-0000-0000-000000000002';
  IF pg_temp.lead('+998900008807') <> 1 THEN RAISE EXCEPTION 'TEST 6 FAILED: inactive seller'; END IF;
  UPDATE public.profiles SET is_active = true WHERE id = '88000000-0000-0000-0000-000000000002';
  INSERT INTO public.crm_pipeline_sellers (pipeline_id, user_id) VALUES ('a8800000-0000-0000-0000-000000000001', '88000000-0000-0000-0000-000000000003');
  IF pg_temp.lead('+998900008808') <> 3 THEN RAISE EXCEPTION 'TEST 7 FAILED: new seller'; END IF;

  -- switch off → no owner; nobody ticked → no owner
  IF pg_temp.lead('+998900008809', 'a8800000-0000-0000-0000-000000000003') <> 0 THEN RAISE EXCEPTION 'TEST 8 FAILED: switch off'; END IF;
  UPDATE public.crm_pipelines SET auto_assign = true WHERE id = 'a8800000-0000-0000-0000-000000000003';
  DELETE FROM public.crm_pipeline_sellers WHERE pipeline_id = 'a8800000-0000-0000-0000-000000000003';
  IF pg_temp.lead('+998900008810', 'a8800000-0000-0000-0000-000000000003') <> 0 THEN RAISE EXCEPTION 'TEST 8 FAILED: empty list'; END IF;

  -- opened by hand: owner kept even when empty; a chosen owner never replaced
  INSERT INTO public.crm_leads (name, pipeline_id, stage_id, created_by, responsible_user_id) VALUES
    ('qo''lda bo''sh', 'a8800000-0000-0000-0000-000000000001', 'b8800000-0000-0000-0000-000000000001', '88000000-0000-0000-0000-000000000003', NULL),
    ('qo''lda egasi', 'a8800000-0000-0000-0000-000000000001', 'b8800000-0000-0000-0000-000000000001', NULL, '88000000-0000-0000-0000-000000000003');
  IF (SELECT responsible_user_id FROM public.crm_leads WHERE name = 'qo''lda bo''sh') IS NOT NULL
     OR (SELECT right(responsible_user_id::text, 1) FROM public.crm_leads WHERE name = 'qo''lda egasi') IS DISTINCT FROM '3' THEN RAISE EXCEPTION 'TEST 9 FAILED: hand-made bitim touched'; END IF;

  -- a voronka move keeps the owner
  UPDATE public.crm_leads SET pipeline_id = 'a8800000-0000-0000-0000-000000000003', stage_id = 'b8800000-0000-0000-0000-000000000003' WHERE name = 'qo''lda egasi';
  IF (SELECT right(responsible_user_id::text, 1) FROM public.crm_leads WHERE name = 'qo''lda egasi') IS DISTINCT FROM '3' THEN RAISE EXCEPTION 'TEST 10 FAILED: move changed owner'; END IF;

  -- deleting a seller's login isn't refused by the list
  DELETE FROM public.profiles WHERE id = '88000000-0000-0000-0000-000000000003';
  IF EXISTS (SELECT 1 FROM public.crm_pipeline_sellers WHERE user_id = '88000000-0000-0000-0000-000000000003') THEN RAISE EXCEPTION 'TEST 11 FAILED: list row left'; END IF;

  RAISE NOTICE 'TESTS ok: equal turns, repeat, feed, same client, unticked, inactive, new seller, off/empty, by hand, move, delete';
END $$;
