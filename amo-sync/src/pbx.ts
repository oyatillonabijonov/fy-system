// OnlinePBX (migration 074). The panel API key lives only here.
//   - every minute: call history (mongo_history) → log_pbx_call() → crm_calls, tied to client/deal/staff
//   - GET /hooks/pbx/me            the signed-in staff member's own WebRTC (Verto) login, for the browser phone
//   - GET /hooks/pbx/exts          admin: the PBX's internal numbers with registration state
//   - GET /hooks/pbx/record/<uuid> a fresh (30 min) link to a call recording
// The browser authenticates with its Supabase session (HS256 JWT, JWT_SECRET).

import type { Sql } from "postgres"

const DOMAIN = process.env.ONLINEPBX_DOMAIN ?? ""
const KEY = process.env.ONLINEPBX_KEY ?? ""
const JWT_SECRET = process.env.JWT_SECRET ?? ""
const API = `https://api2.onlinepbx.ru/${DOMAIN}`
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type" }

// ─── API client: key_id:key lives 3 days from last use; re-auth only when told to ───

let session: string | null = null

async function auth(): Promise<string> {
  const res = await fetch(`${API}/auth.json`, { method: "POST", body: new URLSearchParams({ auth_key: KEY, new: "true" }) })
  const j = (await res.json()) as { status: string; data?: { key_id: string; key: string }; errorCode?: string }
  if (j.status !== "1" || !j.data) throw new Error(`OnlinePBX auth: ${j.errorCode ?? res.status}`)
  return (session = `${j.data.key_id}:${j.data.key}`)
}

export async function pbx<T>(path: string, params: Record<string, string>): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const key = session ?? (await auth())
    const res = await fetch(`${API}/${path}`, { method: "POST", headers: { "x-pbx-authentication": key }, body: new URLSearchParams(params) })
    const j = (await res.json()) as { status: string; data: T; isNotAuth?: boolean; errorCode?: string; comment?: string }
    if (j.isNotAuth) { session = null; continue }
    if (j.status !== "1") throw new Error(`OnlinePBX ${path}: ${j.errorCode ?? j.comment ?? res.status}`)
    return j.data
  }
  throw new Error(`OnlinePBX ${path}: not authorised`)
}

// ─── History → crm_calls ─────────────────────────────────────────────────────

interface HistoryCall {
  uuid: string; accountcode: string; caller_id_number: string; destination_number: string
  start_stamp: number; end_stamp: number; duration: number; user_talk_time: number; hangup_cause: string
}

const WEEK = 6 * 86_400   // the API serves at most a week per request
/** Last successful history pass (for /hooks/health) */
export let pbxSyncedAt = 0

/** Read the history from where the last pass stopped (amo_sync_state 'pbx_synced_to'), so a long
 *  outage of this service doesn't lose calls: a gap is replayed week by week. First run: the last day. */
async function syncCalls(sql: Sql): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  const [row] = await sql<{ value: string | null }[]>`select value from amo_sync_state where key = 'pbx_synced_to'`
  let from = Number(row?.value) || now - 86_400
  let logged = 0
  while (from < now) {
    const to = Math.min(from + WEEK, now)
    // By END time: a long call that started long ago still gets picked up when it ends.
    // 5 min overlap for the PBX's ~1 min publishing delay; log_pbx_call ignores known uuids.
    const calls = await pbx<HistoryCall[]>("mongo_history/search.json", { end_stamp_from: String(from - 300), end_stamp_to: String(to) })
    for (const c of calls ?? []) {
      const [{ r }] = await sql<{ r: string }[]>`
        select public.log_pbx_call(${c.uuid}, ${c.accountcode}, ${String(c.caller_id_number ?? "")}, ${String(c.destination_number ?? "")},
                                   ${c.start_stamp}, ${c.duration ?? 0}, ${c.user_talk_time ?? 0}, ${c.hangup_cause ?? null}) as r`
      if (r === "logged") logged++
    }
    await sql`insert into amo_sync_state (key, value, updated_at) values ('pbx_synced_to', ${String(to)}, now())
              on conflict (key) do update set value = excluded.value, updated_at = now()`
    from = to
  }
  pbxSyncedAt = Date.now()
  if (logged) console.log(`[pbx] ${logged} ta yangi qo'ng'iroq yozildi`)
}

export function startPbxSync(sql: Sql): void {
  if (!DOMAIN || !KEY) { console.log("[pbx] ONLINEPBX_DOMAIN/KEY yo'q — telefoniya o'chiq"); return }
  const tick = () => syncCalls(sql).catch((e) => console.error(`[pbx] ${e instanceof Error ? e.message : e}`))
  void tick()
  setInterval(tick, 60_000)
  console.log(`[pbx] ${DOMAIN}: qo'ng'iroqlar tarixi har daqiqada o'qiladi`)
}

// ─── Browser endpoints ───────────────────────────────────────────────────────

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))

/** Supabase access token → user id (signature, expiry, role checked) */
export async function verifyJwt(token: string, secret = JWT_SECRET): Promise<string | null> {
  const [h, p, s] = token.split(".")
  if (!h || !p || !s || !secret) return null
  try {
    if ((JSON.parse(new TextDecoder().decode(b64url(h))) as { alg?: string }).alg !== "HS256") return null
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"])
    if (!(await crypto.subtle.verify("HMAC", key, b64url(s), new TextEncoder().encode(`${h}.${p}`)))) return null
    const claims = JSON.parse(new TextDecoder().decode(b64url(p))) as { sub?: string; exp?: number; role?: string }
    if (claims.role !== "authenticated" || !claims.sub || !claims.exp || claims.exp * 1000 < Date.now()) return null
    return claims.sub
  } catch { return null }
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS })

// Recordings are streamed through us too (api2.onlinepbx.ru is blocked in some staff browsers):
// /record/<uuid> (session) hands out /audio/<uuid>?exp&sig, signed for 30 min — an <audio> tag
// can't send the session header, so the signature is its pass.
const b64u = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
async function sign(v: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(process.env.JWT_SECRET ?? ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return b64u(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`record.${v}`)))
}

export async function audioLink(uuid: string, base: string, now = Date.now()): Promise<string> {
  const exp = Math.floor(now / 1000) + 1800
  return `${base}/hooks/pbx/audio/${uuid}?exp=${exp}&sig=${await sign(`${uuid}.${exp}`)}`
}

export async function audioAllowed(uuid: string, exp: string, sig: string, now = Date.now()): Promise<boolean> {
  return Number(exp) * 1000 > now && !!process.env.JWT_SECRET && sig === (await sign(`${uuid}.${exp}`))
}

async function streamAudio(req: Request, sql: Sql, uuid: string): Promise<Response> {
  const q = new URL(req.url).searchParams
  if (!(await audioAllowed(uuid, q.get("exp") ?? "", q.get("sig") ?? ""))) return new Response("forbidden", { status: 403 })
  const [call] = await sql<{ uuid: string }[]>`select uuid from crm_calls where uuid = ${uuid} and talk_time > 0`
  if (!call) return new Response("not found", { status: 404 })
  const src = await fetch(await pbx<string>("mongo_history/search.json", { uuid, download: "1" }), {
    headers: req.headers.get("range") ? { range: req.headers.get("range")! } : {},   // seeking in the player
  })
  const headers = new Headers({ "content-type": src.headers.get("content-type") ?? "audio/mpeg", "cache-control": "private, max-age=1800" })
  for (const h of ["content-length", "content-range", "accept-ranges"]) { const v = src.headers.get(h); if (v) headers.set(h, v) }
  return new Response(src.body, { status: src.status, headers })
}

export async function handlePbx(req: Request, sql: Sql, path: string): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })
  if (!DOMAIN || !KEY) return json({ error: "pbx_off" }, 503)
  const audio = path.match(/^audio\/([\w-]+)$/)
  if (audio) return streamAudio(req, sql, audio[1]).catch((e) => {
    console.error(`[pbx] audio: ${e instanceof Error ? e.message : e}`)
    return new Response("pbx error", { status: 502 })
  })
  const uid = await verifyJwt((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""))
  if (!uid) return json({ error: "unauthorized" }, 401)
  const [me] = await sql<{ ext: string | null; sales: boolean; admin: boolean }[]>`
    select pbx_ext as ext, public.has_permission(id, 'sotuv-crmn') as sales, public.is_admin(id) as admin from profiles where id = ${uid}`
  if (!me?.sales) return json({ error: "forbidden" }, 403)

  try {
    if (path === "me") {
      if (!me.ext) return json({ error: "no_ext" }, 404)
      const [u] = await pbx<{ num: string; webrtc?: { host?: string; user?: string; password?: string } }[]>("user/get.json", { num: me.ext, fields: "num,webrtc" })
      const w = u?.webrtc
      if (!w?.user || !w.password) return json({ error: "no_webrtc" }, 404)
      const host = w.host || `${DOMAIN}:8082`
      // Signalling goes through our own gateway (location /pbx/verto → the PBX's :8082): some staff
      // browsers' blockers stop any page request to *.onpbx.ru, but never to our API domain.
      const api = req.headers.get("host")
      return json({ ext: me.ext, login: `${w.user}@${host.replace(/:\d+$/, "")}`, password: w.password,
                    socketUrl: api ? `wss://${api}/pbx/verto` : `wss://${host}` })
    }
    if (path === "exts") {
      if (!me.admin) return json({ error: "forbidden" }, 403)
      const users = await pbx<{ num: string; name: string; enabled: boolean; device?: { agent?: string } | [] }[]>("user/get.json", { fields: "num,name,enabled,device" })
      return json((users ?? []).map((u) => ({ num: String(u.num), name: u.name, enabled: u.enabled, registered: !!u.device && !Array.isArray(u.device) })))
    }
    const rec = path.match(/^record\/([\w-]+)$/)
    if (rec) {
      const [call] = await sql<{ uuid: string }[]>`select uuid from crm_calls where uuid = ${rec[1]} and talk_time > 0`
      if (!call) return json({ error: "not_found" }, 404)
      return json({ url: await audioLink(call.uuid, `https://${req.headers.get("host") ?? "api.fikryetakchilari.uz"}`) })
    }
    return json({ error: "not_found" }, 404)
  } catch (e) {
    console.error(`[pbx] ${path}: ${e instanceof Error ? e.message : e}`)
    return json({ error: "pbx_error" }, 502)
  }
}
