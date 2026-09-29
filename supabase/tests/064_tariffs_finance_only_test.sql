-- Behavioural tests for migration 064 (tariffs written only by finance editors).
-- THROWAWAY DB only (recipe: CLAUDE.md §5 "Tests").
\set ON_ERROR_STOP on

-- F = finance editor, S = staff with Tadbirlar only
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('64000000-0000-0000-0000-000000000001', 'fin64@fy.uz',   '{"full_name":"Moliyachi64","role":"xodim"}'::jsonb),
  ('64000000-0000-0000-0000-000000000002', 'staff64@fy.uz', '{"full_name":"Hodim64","role":"xodim"}'::jsonb);
INSERT INTO public.user_permissions (user_id, module, can_view, can_edit, can_delete) VALUES
  ('64000000-0000-0000-0000-000000000001', 'tadbirlar-moliya', true, true, false),
  ('64000000-0000-0000-0000-000000000002', 'tadbirlar', true, true, false);
INSERT INTO public.events (id, name) VALUES ('e6400000-0000-0000-0000-000000000001', 'Tarif tadbiri');
INSERT INTO public.event_tariffs (id, event_id, name, price) VALUES
  ('7c640000-0000-0000-0000-000000000001', 'e6400000-0000-0000-0000-000000000001', 'Standart', 5000000);
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_tariffs TO authenticated;
SET ROLE authenticated;

-- TEST 1: staff reads tariffs but can't add, reprice or delete them
SELECT set_config('request.jwt.claim.sub', '64000000-0000-0000-0000-000000000002', false);
DO $$
DECLARE refused int := 0;
BEGIN
  IF (SELECT count(*) FROM public.event_tariffs WHERE event_id = 'e6400000-0000-0000-0000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: staff cannot read tariffs'; END IF;
  BEGIN INSERT INTO public.event_tariffs (event_id, name, price) VALUES ('e6400000-0000-0000-0000-000000000001', 'Tekin', 0);
  EXCEPTION WHEN raise_exception THEN refused := refused + 1; END;
  BEGIN UPDATE public.event_tariffs SET price = 0 WHERE id = '7c640000-0000-0000-0000-000000000001';
  EXCEPTION WHEN raise_exception THEN refused := refused + 1; END;
  BEGIN DELETE FROM public.event_tariffs WHERE id = '7c640000-0000-0000-0000-000000000001';
  EXCEPTION WHEN raise_exception THEN refused := refused + 1; END;
  IF refused <> 3 THEN RAISE EXCEPTION 'TEST 1 FAILED: % of 3 refused', refused; END IF;
  RAISE NOTICE 'TEST 1 ok: staff reads, 3 writes refused';
END $$;

-- TEST 2: finance editor manages tariffs
SELECT set_config('request.jwt.claim.sub', '64000000-0000-0000-0000-000000000001', false);
DO $$
BEGIN
  INSERT INTO public.event_tariffs (event_id, name, price) VALUES ('e6400000-0000-0000-0000-000000000001', 'VIP', 9000000);
  UPDATE public.event_tariffs SET price = 5500000 WHERE id = '7c640000-0000-0000-0000-000000000001';
  DELETE FROM public.event_tariffs WHERE name = 'VIP' AND event_id = 'e6400000-0000-0000-0000-000000000001';
  IF (SELECT price FROM public.event_tariffs WHERE id = '7c640000-0000-0000-0000-000000000001') <> 5500000 THEN
    RAISE EXCEPTION 'TEST 2 FAILED'; END IF;
  RAISE NOTICE 'TEST 2 ok: finance editor adds, reprices, deletes';
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT '064 tariffs finance only: all tests passed' AS result;
