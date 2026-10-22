-- Behavioural tests for migration 084 (client card → event participations). THROWAWAY DB only.
\set ON_ERROR_STOP on

INSERT INTO public.events (id, name) VALUES ('e8400000-0000-0000-0000-000000000001', 'T084');
INSERT INTO public.clients (id, full_name, phone) VALUES ('c8400000-0000-0000-0000-000000000001', 'Ali Valiyev', '+998901234084');
INSERT INTO public.event_participants (id, event_id, contact_id, full_name, phone, price, company)
VALUES ('a8400000-0000-0000-0000-000000000001', 'e8400000-0000-0000-0000-000000000001', 'c8400000-0000-0000-0000-000000000001',
        'Ali Valiyev', '+998901234084', 1000000, 'Own company');

DO $$
DECLARE r record;
BEGIN
  -- T1: a photo added on the client card reaches the participation
  UPDATE public.clients SET image = 'https://x/ali.jpg' WHERE id = 'c8400000-0000-0000-0000-000000000001';
  SELECT * INTO r FROM public.event_participants WHERE id = 'a8400000-0000-0000-0000-000000000001';
  IF r.photo_url IS DISTINCT FROM 'https://x/ali.jpg' THEN RAISE EXCEPTION 'T1 FAILED: photo %', r.photo_url; END IF;
  -- … and an unrelated edit left the participation's own company alone
  IF r.company IS DISTINCT FROM 'Own company' THEN RAISE EXCEPTION 'T1 FAILED: company overwritten'; END IF;

  -- T2: name and role edits follow
  UPDATE public.clients SET full_name = 'Ali Valiyev Akmal o''g''li', role = 'Direktor' WHERE id = 'c8400000-0000-0000-0000-000000000001';
  SELECT * INTO r FROM public.event_participants WHERE id = 'a8400000-0000-0000-0000-000000000001';
  IF r.full_name <> 'Ali Valiyev Akmal o''g''li' OR r.role IS DISTINCT FROM 'Direktor' THEN RAISE EXCEPTION 'T2 FAILED: %, %', r.full_name, r.role; END IF;

  -- T3: money columns untouched
  IF r.price <> 1000000 THEN RAISE EXCEPTION 'T3 FAILED: price changed'; END IF;
  RAISE NOTICE '084 ok';
END $$;

SELECT '084: hamma testlar o''tdi ✓' AS natija;
