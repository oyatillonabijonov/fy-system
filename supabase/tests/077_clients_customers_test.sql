-- 077: lead-origin clients are hidden from Mijozlar until a bitim is won (or they join an event)
DO $$
DECLARE
  v_pipe uuid; v_open uuid; v_won uuid;
  v_manual uuid; v_lead uuid; v_call uuid; v_null uuid;
BEGIN
  INSERT INTO public.crm_pipelines (name, sort_order) VALUES ('T077', 99) RETURNING id INTO v_pipe;
  INSERT INTO public.crm_stages (pipeline_id, name, sort_order) VALUES (v_pipe, 'Ochiq', 0) RETURNING id INTO v_open;
  INSERT INTO public.crm_stages (pipeline_id, name, sort_order, is_won) VALUES (v_pipe, 'Yutildi', 1, true) RETURNING id INTO v_won;
  INSERT INTO public.clients (full_name, source) VALUES ('T077 manual', 'manual') RETURNING id INTO v_manual;
  INSERT INTO public.clients (full_name, source) VALUES ('T077 sotuv', 'sotuv') RETURNING id INTO v_lead;
  INSERT INTO public.clients (full_name, source) VALUES ('T077 call', 'call') RETURNING id INTO v_call;
  INSERT INTO public.clients (full_name, source) VALUES ('T077 null', NULL) RETURNING id INTO v_null;

  IF NOT (SELECT public.is_customer(c) FROM public.clients c WHERE id = v_manual) THEN RAISE EXCEPTION 'TEST FAIL: manual client hidden'; END IF;
  IF NOT (SELECT public.is_customer(c) FROM public.clients c WHERE id = v_null) THEN RAISE EXCEPTION 'TEST FAIL: client without source hidden'; END IF;
  IF (SELECT public.is_customer(c) FROM public.clients c WHERE id = v_lead) THEN RAISE EXCEPTION 'TEST FAIL: sotuv lead shown'; END IF;
  IF (SELECT public.is_customer(c) FROM public.clients c WHERE id = v_call) THEN RAISE EXCEPTION 'TEST FAIL: call lead shown'; END IF;

  -- An open bitim keeps the lead hidden; a manual client with an open bitim stays a customer
  INSERT INTO public.crm_leads (name, pipeline_id, stage_id, client_id) VALUES ('T077 a', v_pipe, v_open, v_lead);
  INSERT INTO public.crm_leads (name, pipeline_id, stage_id, client_id) VALUES ('T077 b', v_pipe, v_open, v_manual);
  IF (SELECT public.is_customer(c) FROM public.clients c WHERE id = v_lead) THEN RAISE EXCEPTION 'TEST FAIL: open bitim made a customer'; END IF;
  IF NOT (SELECT public.is_customer(c) FROM public.clients c WHERE id = v_manual) THEN RAISE EXCEPTION 'TEST FAIL: manual client hidden by an open bitim'; END IF;

  -- Won → customer
  UPDATE public.crm_leads SET stage_id = v_won WHERE client_id = v_lead;
  IF NOT (SELECT public.is_customer(c) FROM public.clients c WHERE id = v_lead) THEN RAISE EXCEPTION 'TEST FAIL: won lead still hidden'; END IF;

  RAISE NOTICE 'TEST PASS: 077 is_customer';
  RAISE EXCEPTION 'rollback' USING ERRCODE = 'P0099';
EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL;
END $$;
