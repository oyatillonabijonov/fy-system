-- 092: tables for the Claude connector (MCP server inside amo-sync, its own small OAuth sign-in).
-- mcp_auth_codes: one-time authorization codes (stored hashed, short-lived).
-- mcp_connections: a signed-in connector — hashed access/refresh tokens; the previous
--   refresh hash is kept so a replayed old refresh token can be told from an unknown one.
-- mcp_calls: audit log of tool calls (who, which tool, ok, how long).
-- Read and written only by amo-sync (table owner) — RLS on, no policies, so the API
-- can't touch them. Deleting a staff member removes their codes and connections;
-- their audit rows stay with user_id emptied.
BEGIN;

CREATE TABLE public.mcp_auth_codes (
  code_hash      text PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id      text NOT NULL,
  redirect_uri   text NOT NULL,
  code_challenge text NOT NULL,
  expires_at     timestamptz NOT NULL
);

CREATE TABLE public.mcp_connections (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id          text NOT NULL,
  access_hash        text NOT NULL UNIQUE,
  access_expires_at  timestamptz NOT NULL,
  refresh_hash       text NOT NULL UNIQUE,
  prev_refresh_hash  text,
  refresh_expires_at timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  last_used_at       timestamptz
);

CREATE TABLE public.mcp_calls (
  id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  tool    text NOT NULL,
  args    jsonb NOT NULL DEFAULT '{}',
  ok      boolean NOT NULL,
  error   text,
  ms      integer NOT NULL,
  at      timestamptz NOT NULL DEFAULT now()
);

-- deliberately no policies: only the table owner (amo-sync) gets in
ALTER TABLE public.mcp_auth_codes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_calls       ENABLE ROW LEVEL SECURITY;

-- the worker acts as a signed-in user with SET ROLE authenticated, so the role it
-- connects as must be allowed to switch to it (no-op on a superuser)
DO $$
BEGIN
  IF NOT pg_has_role(current_user, 'authenticated', 'MEMBER') THEN
    EXECUTE format('GRANT authenticated TO %I', current_user);
  END IF;
END $$;

COMMIT;
