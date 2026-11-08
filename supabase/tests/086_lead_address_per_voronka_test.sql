-- Behavioural tests for migration 086 (a lead address per voronka). THROWAWAY DB only (recipe: CLAUDE.md §5).
\set ON_ERROR_STOP on

INSERT INTO public.crm_pipelines (id, name, sort_order) VALUES
  ('a8600000-0000-0000-0000-000000000001', 'Kaizen', -2), ('a8600000-0000-0000-0000-000000000002', 'Nonushta', -1);
INSERT INTO public.crm_stages (id, pipeline_id, name, sort_order, is_won, is_lost) VALUES
  ('b8600000-0000-0000-0000-000000000001', 'a8600000-0000-0000-0000-000000000001', 'Yangi', 0, false, false),
  ('b8600000-0000-0000-0000-000000000002', 'a8600000-0000-0000-0000-000000000002', 'Yangi', 0, false, false);
UPDATE public.crm_lead_sources SET pipeline_id = 'a8600000-0000-0000-0000-000000000001', enabled = true WHERE id = 'sayt';

DO $$
DECLARE t text := (SELECT token FROM public.crm_lead_sources WHERE id = 'sayt'); r jsonb; k uuid; n uuid;
BEGIN
  -- no parameter → the source's voronka (old addresses keep working)
  r := public.intake_lead('sayt', t, 'Vali', '901110022', NULL, '{}', '[]');
  k := (r->>'lead_id')::uuid;
  IF (SELECT pipeline_id FROM public.crm_leads WHERE id = k) <> 'a8600000-0000-0000-0000-000000000001' THEN RAISE EXCEPTION 'TEST 1 FAILED: default voronka'; END IF;

  -- same phone, other voronka's address → a NEW bitim there, first stage, same client
  r := public.intake_lead('sayt', t, 'Vali', '901110022', NULL, '{}', '[]', 'a8600000-0000-0000-0000-000000000002');
  n := (r->>'lead_id')::uuid;
  IF (r->>'duplicate')::boolean OR n = k THEN RAISE EXCEPTION 'TEST 2 FAILED: other voronka reused the bitim: %', r; END IF;
  IF (SELECT stage_id FROM public.crm_leads WHERE id = n) <> 'b8600000-0000-0000-0000-000000000002' THEN RAISE EXCEPTION 'TEST 2 FAILED: stage'; END IF;
  IF (SELECT count(*) FROM public.clients WHERE phone = '+998901110022') <> 1 THEN RAISE EXCEPTION 'TEST 2 FAILED: second client'; END IF;

  -- again to that voronka → "Qayta murojaat" on its bitim
  r := public.intake_lead('sayt', t, 'Vali', '901110022', NULL, '{}', '[]', 'a8600000-0000-0000-0000-000000000002');
  IF NOT (r->>'duplicate')::boolean OR (r->>'lead_id')::uuid <> n THEN RAISE EXCEPTION 'TEST 3 FAILED: repeat in voronka: %', r; END IF;

  -- junk voronka id → falls back to the source's voronka (no error, no lost lead)
  r := public.intake_lead('sayt', t, 'Gani', '901110033', NULL, '{}', '[]', 'nima-bu');
  IF (SELECT pipeline_id FROM public.crm_leads WHERE id = (r->>'lead_id')::uuid) <> 'a8600000-0000-0000-0000-000000000001' THEN RAISE EXCEPTION 'TEST 4 FAILED: junk id'; END IF;
  RAISE NOTICE 'TESTS ok: default voronka, per-voronka bitim, repeat per voronka, junk id falls back';
END $$;
