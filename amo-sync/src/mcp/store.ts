// The only code that touches the mcp_* tables (092) — through the worker's owner connection. Only SHA-256 hex is stored.
import type { Sql } from "postgres"
import { randomToken, sha256hex } from "./crypto"

export interface Tokens { access_token: string; refresh_token: string; expires_in: number }

const ACCESS_SEC = 3600
const REFRESH_DAYS = 60
const CODE_SEC = 60
const ACTIVE = (sql: Sql, col: string) => sql`exists (select 1 from public.profiles p where p.id = mcp_connections.${sql(col)} and p.is_active is distinct from false)`

export async function saveCode(sql: Sql, c: { code: string; userId: string; clientId: string; redirectUri: string; challenge: string }): Promise<void> {
  await sql`insert into public.mcp_auth_codes (code_hash, user_id, client_id, redirect_uri, code_challenge, expires_at)
    values (${await sha256hex(c.code)}, ${c.userId}, ${c.clientId}, ${c.redirectUri}, ${c.challenge}, now() + make_interval(secs => ${CODE_SEC}))`
}

/** One use only: the row is deleted whether or not it was still fresh. */
export async function takeCode(sql: Sql, code: string): Promise<{ userId: string; clientId: string; redirectUri: string; challenge: string } | null> {
  const [r] = await sql<{ user_id: string; client_id: string; redirect_uri: string; code_challenge: string; live: boolean }[]>`
    delete from public.mcp_auth_codes where code_hash = ${await sha256hex(code)}
    returning user_id, client_id, redirect_uri, code_challenge, expires_at > now() as live`
  return r?.live ? { userId: r.user_id, clientId: r.client_id, redirectUri: r.redirect_uri, challenge: r.code_challenge } : null
}

export async function activeStaff(sql: Sql, userId: string): Promise<boolean> {
  const [r] = await sql<{ ok: boolean }[]>`select exists (select 1 from public.profiles where id = ${userId} and is_active is distinct from false) as ok`
  return r?.ok === true
}

export async function openConnection(sql: Sql, userId: string, clientId: string): Promise<Tokens> {
  const access = randomToken("fya_"), refresh = randomToken("fyr_")
  await sql`insert into public.mcp_connections (user_id, client_id, access_hash, access_expires_at, refresh_hash, refresh_expires_at)
    values (${userId}, ${clientId}, ${await sha256hex(access)}, now() + make_interval(secs => ${ACCESS_SEC}), ${await sha256hex(refresh)}, now() + make_interval(days => ${REFRESH_DAYS}))`
  return { access_token: access, refresh_token: refresh, expires_in: ACCESS_SEC }
}

/** Rotates the pair. The previous refresh token replayed = theft: the whole connection is deleted. */
export async function refreshConnection(sql: Sql, refreshToken: string): Promise<Tokens | null> {
  const old = await sha256hex(refreshToken)
  const access = randomToken("fya_"), refresh = randomToken("fyr_")
  const rows = await sql`update public.mcp_connections set prev_refresh_hash = refresh_hash, refresh_hash = ${await sha256hex(refresh)},
      access_hash = ${await sha256hex(access)}, access_expires_at = now() + make_interval(secs => ${ACCESS_SEC}),
      refresh_expires_at = now() + make_interval(days => ${REFRESH_DAYS})
    where refresh_hash = ${old} and refresh_expires_at > now() and ${ACTIVE(sql, "user_id")} returning id`
  if (rows.length) return { access_token: access, refresh_token: refresh, expires_in: ACCESS_SEC }
  await sql`delete from public.mcp_connections where prev_refresh_hash = ${old} or (refresh_hash = ${old} and not ${ACTIVE(sql, "user_id")})`
  return null
}

export async function userByAccess(sql: Sql, accessToken: string): Promise<string | null> {
  const [r] = await sql<{ user_id: string }[]>`update public.mcp_connections set last_used_at = now()
    where access_hash = ${await sha256hex(accessToken)} and access_expires_at > now() and ${ACTIVE(sql, "user_id")} returning user_id`
  return r?.user_id ?? null
}

export async function logCall(sql: Sql, r: { userId: string; tool: string; args: unknown; ok: boolean; error?: string; ms: number }): Promise<void> {
  await sql`insert into public.mcp_calls (user_id, tool, args, ok, error, ms)
    values (${r.userId}, ${r.tool}, ${sql.json((r.args ?? {}) as Parameters<typeof sql.json>[0])}, ${r.ok}, ${r.error ?? null}, ${Math.round(r.ms)})`
}
