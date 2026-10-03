-- Behavioural tests for migration 081 (voronka → tadbir, form answers fill the client card). THROWAWAY DB only.
\set ON_ERROR_STOP on

-- TEST 1: a voronka points at one event; deleting the event only clears the link
DO $$ DECLARE e uuid; p uuid; BEGIN
  INSERT INTO public.events (name, date) VALUES ('T81 safar', '2026-11-01') RETURNING id INTO e;
  INSERT INTO public.crm_pipelines (name, sort_order, event_id) VALUES ('T81 voronka', 81, e) RETURNING id INTO p;
  DELETE FROM public.events WHERE id = e;
  IF NOT EXISTS (SELECT 1 FROM public.crm_pipelines WHERE id = p AND event_id IS NULL) THEN RAISE EXCEPTION 'TEST 1 FAILED: link not cleared'; END IF;
  RAISE NOTICE 'TEST 1 ok: pipeline.event_id';
END $$;

-- TEST 2: form answers fill EMPTY client fields (lavozim → role, soha → activity, kompaniya → company); filled ones stay
DO $$ DECLARE c1 uuid; c2 uuid; p uuid; s uuid; BEGIN
  SELECT id INTO p FROM public.crm_pipelines WHERE name = 'Umumiy';
  SELECT id INTO s FROM public.crm_stages WHERE pipeline_id = p ORDER BY sort_order LIMIT 1;
  INSERT INTO public.clients (full_name, phone) VALUES ('T81 bo''sh', '+998900008101') RETURNING id INTO c1;
  INSERT INTO public.clients (full_name, phone, role, activity) VALUES ('T81 to''la', '+998900008102', 'Asoschi', 'Restoranlar') RETURNING id INTO c2;
  INSERT INTO public.crm_leads (name, pipeline_id, stage_id, client_id, fields) VALUES
    ('a', p, s, c1, '[{"k":"Sohangiz","v":"IT"},{"k":"Lavozimingiz","v":"Bosh direktor"},{"k":"Kompaniya nomi","v":"Acme"}]'),
    ('b', p, s, c2, '[{"k":"Sohangiz","v":"IT"},{"k":"Lavozimingiz","v":"Top-menejer"}]');
  IF (SELECT row(role, activity, company)::text FROM public.clients WHERE id = c1) <> '("Bosh direktor",IT,Acme)' THEN
    RAISE EXCEPTION 'TEST 2 FAILED: empty card not filled: %', (SELECT row(role, activity, company)::text FROM public.clients WHERE id = c1); END IF;
  IF (SELECT row(role, activity)::text FROM public.clients WHERE id = c2) <> '(Asoschi,Restoranlar)' THEN
    RAISE EXCEPTION 'TEST 2 FAILED: filled card overwritten'; END IF;
  -- A repeat request with new answers (079 updates fields) fills what is still empty
  UPDATE public.crm_leads SET fields = '[{"k":"Kompaniya","v":"Beta"}]' WHERE client_id = c2;
  IF (SELECT company FROM public.clients WHERE id = c2) IS DISTINCT FROM 'Beta' THEN RAISE EXCEPTION 'TEST 2 FAILED: update not applied'; END IF;
  RAISE NOTICE 'TEST 2 ok: form fills the card';
END $$;

-- TEST 3: a lead-origin client who joins an event (every payment goes through enrolment) is a customer
DO $$ DECLARE c uuid; e uuid; BEGIN
  INSERT INTO public.clients (full_name, phone, source) VALUES ('T81 lid', '+998900008103', 'sayt') RETURNING id INTO c;
  IF (SELECT public.is_customer(x) FROM public.clients x WHERE id = c) THEN RAISE EXCEPTION 'TEST 3 FAILED: lead shown before paying'; END IF;
  INSERT INTO public.events (name, date) VALUES ('T81 tadbir', '2026-11-02') RETURNING id INTO e;
  INSERT INTO public.event_participants (event_id, contact_id, full_name, price) VALUES (e, c, 'T81 lid', 100);
  IF NOT (SELECT public.is_customer(x) FROM public.clients x WHERE id = c) THEN RAISE EXCEPTION 'TEST 3 FAILED: participant not a customer'; END IF;
  RAISE NOTICE 'TEST 3 ok: paying participant is a customer';
END $$;
