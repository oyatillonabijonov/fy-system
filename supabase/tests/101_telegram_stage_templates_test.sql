-- Behavioural tests for migration 101. THROWAWAY DB only.
\set ON_ERROR_STOP on
DO $$
DECLARE p uuid; s uuid; t uuid;
BEGIN
  INSERT INTO public.crm_pipelines (name) VALUES ('T101') RETURNING id INTO p;
  INSERT INTO public.crm_stages (pipeline_id, name, sort_order) VALUES (p, 'Ma''lumot berildi', 1) RETURNING id INTO s;
  INSERT INTO public.tg_templates (title, body, pipeline_id) VALUES ('Nonushta haqida', 'Salom {ism}', p) RETURNING id INTO t;
  UPDATE public.crm_stages SET tg_template_id = t WHERE id = s;
  IF (SELECT tg_template_id FROM public.crm_stages WHERE id = s) <> t THEN RAISE EXCEPTION 'TEST 1 FAILED: link'; END IF;
  DELETE FROM public.tg_templates WHERE id = t;
  IF (SELECT tg_template_id FROM public.crm_stages WHERE id = s) IS NOT NULL THEN RAISE EXCEPTION 'TEST 2 FAILED: template delete kept the link'; END IF;
  INSERT INTO public.tg_templates (title, body, pipeline_id) VALUES ('X', 'y', p) RETURNING id INTO t;
  DELETE FROM public.crm_stages WHERE pipeline_id = p; DELETE FROM public.crm_pipelines WHERE id = p;
  IF (SELECT pipeline_id FROM public.tg_templates WHERE id = t) IS NOT NULL THEN RAISE EXCEPTION 'TEST 3 FAILED: voronka delete kept the template''s voronka'; END IF;
  DELETE FROM public.tg_templates WHERE id = t;
  RAISE NOTICE 'TEST 101 ok';
END $$;
