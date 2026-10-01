-- Behavioural tests for migration 075 (Umumiy voronka, bitim merge). THROWAWAY DB only (recipe: CLAUDE.md §5).
\set ON_ERROR_STOP on

-- TEST 1: Umumiy is first and an unknown caller's bitim lands in its first stage
DO $$ BEGIN
  IF (SELECT name FROM public.crm_pipelines ORDER BY sort_order, created_at LIMIT 1) <> 'Umumiy' THEN RAISE EXCEPTION 'TEST 1 FAILED: Umumiy not first'; END IF;
  PERFORM public.log_pbx_call('u75', 'inbound', '935557575', '100', 1790763900, 40, 0, 'NO_ANSWER');
  IF NOT EXISTS (SELECT 1 FROM public.crm_calls c JOIN public.crm_leads l ON l.id = c.lead_id JOIN public.crm_pipelines p ON p.id = l.pipeline_id
                 JOIN public.crm_stages s ON s.id = l.stage_id
                 WHERE c.uuid = 'u75' AND p.name = 'Umumiy' AND s.name = 'Yangi' AND l.name = '+998935557575') THEN
    RAISE EXCEPTION 'TEST 1 FAILED: caller not in Umumiy › Yangi'; END IF;
  RAISE NOTICE 'TEST 1 ok: incoming call → Umumiy';
END $$;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('75000000-0000-0000-0000-000000000001', 'm75@fy.uz', '{"full_name":"Sotuvchi75","role":"xodim"}'::jsonb),
  ('75000000-0000-0000-0000-000000000002', 'x75@fy.uz', '{"full_name":"Hodim75","role":"xodim"}'::jsonb);
INSERT INTO public.user_permissions (user_id, module, can_view) VALUES ('75000000-0000-0000-0000-000000000001', 'sotuv-crmn', true);
INSERT INTO public.clients (id, full_name, phone) VALUES
  ('c7500000-0000-0000-0000-000000000001', 'Aziz75', '+998901117575'), ('c7500000-0000-0000-0000-000000000002', 'Boshqa75', '+998901117576');
INSERT INTO public.crm_leads (id, name, pipeline_id, stage_id, client_id, price)
SELECT v.id, v.name, p.id, (SELECT id FROM public.crm_stages WHERE pipeline_id = p.id ORDER BY sort_order LIMIT 1), v.client, v.price
FROM (SELECT id FROM public.crm_pipelines WHERE name = 'Umumiy') p,
     (VALUES ('d7500000-0000-0000-0000-000000000001'::uuid, 'Birinchi', 'c7500000-0000-0000-0000-000000000001'::uuid, 0),
             ('d7500000-0000-0000-0000-000000000002'::uuid, 'Ikkinchi', 'c7500000-0000-0000-0000-000000000001'::uuid, 900000),
             ('d7500000-0000-0000-0000-000000000003'::uuid, 'Begona', 'c7500000-0000-0000-0000-000000000002'::uuid, 0)) AS v(id, name, client, price);
INSERT INTO public.crm_tasks (lead_id, text, due_date) VALUES ('d7500000-0000-0000-0000-000000000002', 'Qo''ng''iroq', now());
GRANT USAGE ON SCHEMA public TO authenticated;
SET ROLE authenticated;

-- TEST 2: no module → refused; another client's bitim → refused
SELECT set_config('request.jwt.claim.sub', '75000000-0000-0000-0000-000000000002', false);
DO $$ BEGIN
  BEGIN
    PERFORM public.merge_crm_leads('d7500000-0000-0000-0000-000000000001', 'd7500000-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'TEST 2 FAILED: outsider merged';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub', '75000000-0000-0000-0000-000000000001', false);
DO $$ BEGIN
  BEGIN
    PERFORM public.merge_crm_leads('d7500000-0000-0000-0000-000000000001', 'd7500000-0000-0000-0000-000000000003');
    RAISE EXCEPTION 'TEST 2 FAILED: two clients merged';
  EXCEPTION WHEN check_violation THEN NULL; END;
  RAISE NOTICE 'TEST 2 ok: guarded';
END $$;

-- TEST 3: merge moves feed and tasks, fills the empty price, deletes the other, leaves a feed row
DO $$ BEGIN
  PERFORM public.merge_crm_leads('d7500000-0000-0000-0000-000000000001', 'd7500000-0000-0000-0000-000000000002');
  IF EXISTS (SELECT 1 FROM public.crm_leads WHERE id = 'd7500000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'TEST 3 FAILED: dropped bitim remains'; END IF;
  IF (SELECT price FROM public.crm_leads WHERE id = 'd7500000-0000-0000-0000-000000000001') <> 900000 THEN RAISE EXCEPTION 'TEST 3 FAILED: price not taken over'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_tasks WHERE lead_id = 'd7500000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'TEST 3 FAILED: task lost'; END IF;
  IF (SELECT count(*) FROM public.crm_notes WHERE lead_id = 'd7500000-0000-0000-0000-000000000001' AND kind = 'created') <> 2 THEN RAISE EXCEPTION 'TEST 3 FAILED: feed not moved'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_notes WHERE lead_id = 'd7500000-0000-0000-0000-000000000001' AND kind = 'merged' AND text = 'Birlashtirildi: Ikkinchi') THEN
    RAISE EXCEPTION 'TEST 3 FAILED: no merge row'; END IF;
  RAISE NOTICE 'TEST 3 ok: merged';
END $$;
