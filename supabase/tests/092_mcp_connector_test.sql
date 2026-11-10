-- Behavioural tests for migration 092 (Claude connector tables). THROWAWAY DB only (recipe: CLAUDE.md §5).
\set ON_ERROR_STOP on

-- clean leftovers of an earlier run, then: A = admin, S = the staff member who gets deleted
DELETE FROM public.mcp_calls WHERE tool = 'test92';
DELETE FROM public.profiles WHERE id IN ('92000000-0000-0000-0000-00000000000a', '92000000-0000-0000-0000-000000000001');
DELETE FROM auth.users WHERE id IN ('92000000-0000-0000-0000-00000000000a', '92000000-0000-0000-0000-000000000001');
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('92000000-0000-0000-0000-00000000000a', 'a92@fy.uz', '{"full_name":"Admin92","role":"admin"}'::jsonb),
  ('92000000-0000-0000-0000-000000000001', 's92@fy.uz', '{"full_name":"Hodim92","role":"xodim"}'::jsonb);
UPDATE public.profiles SET role = 'admin' WHERE id = '92000000-0000-0000-0000-00000000000a';

-- the owner writes one row in each table for S
INSERT INTO public.mcp_auth_codes (code_hash, user_id, client_id, redirect_uri, code_challenge, expires_at)
  VALUES ('h92code', '92000000-0000-0000-0000-000000000001', 'c', 'https://x.test/cb', 'ch', now() + interval '1 minute');
INSERT INTO public.mcp_connections (user_id, client_id, access_hash, access_expires_at, refresh_hash, refresh_expires_at)
  VALUES ('92000000-0000-0000-0000-000000000001', 'c', 'h92acc', now() + interval '1 hour', 'h92ref', now() + interval '30 days');
INSERT INTO public.mcp_calls (user_id, tool, ok, ms)
  VALUES ('92000000-0000-0000-0000-000000000001', 'test92', true, 5);

-- TEST 2: the migrating role can switch to authenticated
DO $$ BEGIN
  IF NOT pg_has_role('postgres', 'authenticated', 'MEMBER') THEN RAISE EXCEPTION 'TEST 2 FAILED: postgres is not a member of authenticated'; END IF;
END $$;

-- TEST 1: as a signed-in staff member the API sees nothing and can write nothing
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000001', false);
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.mcp_auth_codes;   IF n <> 0 THEN RAISE EXCEPTION 'TEST 1 FAILED: mcp_auth_codes visible (%)', n; END IF;
  SELECT count(*) INTO n FROM public.mcp_connections;  IF n <> 0 THEN RAISE EXCEPTION 'TEST 1 FAILED: mcp_connections visible (%)', n; END IF;
  SELECT count(*) INTO n FROM public.mcp_calls;        IF n <> 0 THEN RAISE EXCEPTION 'TEST 1 FAILED: mcp_calls visible (%)', n; END IF;
  BEGIN
    INSERT INTO public.mcp_connections (user_id, client_id, access_hash, access_expires_at, refresh_hash, refresh_expires_at)
      VALUES ('92000000-0000-0000-0000-000000000001', 'c', 'h92x', now(), 'h92y', now());
    RAISE EXCEPTION 'TEST 1 FAILED: insert into mcp_connections was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

-- TEST 3: an admin deletes S — their codes and connections go, the audit row stays unowned
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-00000000000a', false);
SELECT public.admin_delete_user('92000000-0000-0000-0000-000000000001');
RESET ROLE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.mcp_connections WHERE access_hash = 'h92acc') THEN RAISE EXCEPTION 'TEST 3 FAILED: connection survived the user'; END IF;
  IF EXISTS (SELECT 1 FROM public.mcp_auth_codes WHERE code_hash = 'h92code') THEN RAISE EXCEPTION 'TEST 3 FAILED: auth code survived the user'; END IF;
  IF (SELECT count(*) FROM public.mcp_calls WHERE tool = 'test92' AND user_id IS NULL) <> 1 THEN RAISE EXCEPTION 'TEST 3 FAILED: audit row lost or still owned'; END IF;
END $$;

-- clean up own fixtures
DELETE FROM public.mcp_calls WHERE tool = 'test92';
DELETE FROM public.profiles WHERE id = '92000000-0000-0000-0000-00000000000a';
DELETE FROM auth.users WHERE id = '92000000-0000-0000-0000-00000000000a';

DO $$ BEGIN RAISE NOTICE 'TESTS ok: 092 connector tables (RLS closed to the API, role grant, cascade / set null)'; END $$;
