-- Behavioural tests for migration 111 (a call lands on a closed bitim). THROWAWAY DB only.
-- Runs as the table owner, like amo-sync.
\set ON_ERROR_STOP on
INSERT INTO public.crm_pipelines (id, name, sort_order) VALUES ('a1110000-0000-0000-0000-000000000001', 'Voronka111', -3);
INSERT INTO public.crm_stages (id, pipeline_id, name, sort_order, is_lost) VALUES
  ('b1110000-0000-0000-0000-000000000001', 'a1110000-0000-0000-0000-000000000001', 'Yangi', 0, false),
  ('b1110000-0000-0000-0000-000000000002', 'a1110000-0000-0000-0000-000000000001', 'Yopildi', 1, true);
INSERT INTO public.clients (id, full_name, phone) VALUES
  ('c1110000-0000-0000-0000-000000000001', 'Yopiq111', '+998901110111'),
  ('c1110000-0000-0000-0000-000000000002', 'Ochiq111', '+998901110112');
-- client 1: one lost bitim; client 2: a lost bitim (touched later) and an open one
INSERT INTO public.crm_leads (id, name, pipeline_id, stage_id, client_id, loss_reason) VALUES
  ('d1110000-0000-0000-0000-000000000001', 'Yopiq111', 'a1110000-0000-0000-0000-000000000001', 'b1110000-0000-0000-0000-000000000002', 'c1110000-0000-0000-0000-000000000001', 'Narx'),
  ('d1110000-0000-0000-0000-000000000002', 'Ochiq111', 'a1110000-0000-0000-0000-000000000001', 'b1110000-0000-0000-0000-000000000001', 'c1110000-0000-0000-0000-000000000002', NULL),
  ('d1110000-0000-0000-0000-000000000003', 'Ochiq111 eski', 'a1110000-0000-0000-0000-000000000001', 'b1110000-0000-0000-0000-000000000002', 'c1110000-0000-0000-0000-000000000002', 'Narx');
UPDATE public.crm_leads SET updated_at = now() + interval '1 hour' WHERE id = 'd1110000-0000-0000-0000-000000000003';
UPDATE public.crm_lead_sources SET enabled = true, pipeline_id = 'a1110000-0000-0000-0000-000000000001' WHERE id = 'call';

DO $$
DECLARE v uuid;
BEGIN
  IF NOT (SELECT is_lost FROM public.crm_leads WHERE id = 'd1110000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'fixture: bitim 1 is not closed'; END IF;

  PERFORM public.log_pbx_call('u111-1', 'outbound', '100', '901110111', 1790763508, 60, 40, 'NORMAL_CLEARING');
  SELECT lead_id INTO v FROM public.crm_calls WHERE uuid = 'u111-1';
  IF v IS DISTINCT FROM 'd1110000-0000-0000-0000-000000000001' THEN RAISE EXCEPTION 'TEST 1 FAILED (outgoing call to a closed bitim''s client is not on it): %', v; END IF;

  PERFORM public.log_pbx_call('u111-2', 'outbound', '100', '901110112', 1790763508, 60, 40, 'NORMAL_CLEARING');
  SELECT lead_id INTO v FROM public.crm_calls WHERE uuid = 'u111-2';
  IF v IS DISTINCT FROM 'd1110000-0000-0000-0000-000000000002' THEN RAISE EXCEPTION 'TEST 2 FAILED (an open bitim must win over a closed one): %', v; END IF;

  -- an incoming call from the closed client still opens a new bitim (the "call" source), not the closed one
  PERFORM public.log_pbx_call('u111-3', 'inbound', '901110111', '100', 1790763600, 60, 40, 'NORMAL_CLEARING');
  SELECT lead_id INTO v FROM public.crm_calls WHERE uuid = 'u111-3';
  IF v IS NULL OR v = 'd1110000-0000-0000-0000-000000000001' OR (SELECT is_lost FROM public.crm_leads WHERE id = v) THEN
    RAISE EXCEPTION 'TEST 3 FAILED (incoming call must open a new bitim): %', v; END IF;

  -- a number with no client at all: logged, on no bitim
  PERFORM public.log_pbx_call('u111-4', 'outbound', '100', '901119999', 1790763508, 60, 0, 'NO_ANSWER');
  IF (SELECT lead_id IS NOT NULL OR client_id IS NOT NULL FROM public.crm_calls WHERE uuid = 'u111-4') THEN RAISE EXCEPTION 'TEST 4 FAILED (unknown number got a bitim)'; END IF;
  RAISE NOTICE '111: 4 tests passed';
END $$;
