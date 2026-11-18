-- Behavioural tests for migration 102. THROWAWAY DB only.
\set ON_ERROR_STOP on
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a1020000-0000-0000-0000-000000000001', 's102@fy.uz', '{"full_name":"S102","role":"xodim"}'::jsonb),
  ('a1020000-0000-0000-0000-000000000002', 'a102@fy.uz', '{"full_name":"A102","role":"admin"}'::jsonb);
INSERT INTO public.user_permissions (user_id, module, can_view) VALUES ('a1020000-0000-0000-0000-000000000001', 'sotuv-crmn', true);
DO $$
DECLARE p uuid; t uuid; s uuid;
BEGIN
  INSERT INTO public.crm_pipelines (name) VALUES ('T102') RETURNING id INTO p;
  INSERT INTO public.tg_templates (title, body) VALUES ('Eslatma', 'Ertaga!') RETURNING id INTO t;
  INSERT INTO public.tg_schedules (pipeline_id, template_id, created_by) VALUES (p, t, 'a1020000-0000-0000-0000-000000000002') RETURNING id INTO s;
  BEGIN INSERT INTO public.tg_schedules (pipeline_id, template_id, days_before) VALUES (p, t, 61); RAISE EXCEPTION 'TEST 1 FAILED: 61 days accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
  PERFORM set_config('test.t', t::text, false);
  RAISE NOTICE 'TEST 1 ok';
END $$;
GRANT USAGE ON SCHEMA public TO authenticated;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1020000-0000-0000-0000-000000000001', false);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.tg_schedules) = 0 THEN RAISE EXCEPTION 'TEST 2 FAILED: seller cannot read'; END IF;
  BEGIN INSERT INTO public.tg_schedules (pipeline_id, template_id) SELECT pipeline_id, template_id FROM public.tg_schedules LIMIT 1; RAISE EXCEPTION 'TEST 2 FAILED: seller wrote';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.tg_schedule_runs (schedule_id, lead_id, status) SELECT id, id, 'sent' FROM public.tg_schedules LIMIT 1; RAISE EXCEPTION 'TEST 2 FAILED: seller wrote a run';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'TEST 2 ok';
END $$;
RESET ROLE;
DO $$
BEGIN
  DELETE FROM public.tg_templates WHERE id = current_setting('test.t')::uuid;
  IF EXISTS (SELECT 1 FROM public.tg_schedules s JOIN public.crm_pipelines p ON p.id = s.pipeline_id WHERE p.name = 'T102') THEN RAISE EXCEPTION 'TEST 3 FAILED: template delete kept the schedule'; END IF;
  RAISE NOTICE 'TEST 3 ok';
END $$;
