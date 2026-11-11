// SMS through Eskiz (migration 083, 095): drains due sms_messages into notify.eskiz.uz, records Eskiz's
// delivery callback (POST /hooks/sms/status?token=…) and keeps sms_templates in sync with Eskiz
// (POST /hooks/sms/templates/sync, every 10 min). Woken by pg_notify('sms_outbox'),
// plus a 30 s poll. Sends only 9:00–21:00 Tashkent — anything left waits for the morning.
// Env: ESKIZ_EMAIL / ESKIZ_PASSWORD (the SMS gateway's login, not the cabinet's), ESKIZ_FROM (4546).
// Unset = the queue just waits.

import type { Sql } from "postgres"
import { verifyJwt } from "./pbx"

const API = "https://notify.eskiz.uz/api"
const EMAIL = process.env.ESKIZ_EMAIL ?? ""
const PASSWORD = process.env.ESKIZ_PASSWORD ?? ""
const FROM = process.env.ESKIZ_FROM || "4546"
const BASE = process.env.PUBLIC_API_URL || "https://api.fikryetakchilari.uz"
const MAX_ATTEMPTS = 3

// ─── Eskiz client: the token lives 30 days; log in again on 401 ───

let token: string | null = null

async function login(): Promise<string> {
  const form = new FormData()
  form.append("email", EMAIL)
  form.append("password", PASSWORD)
  const res = await fetch(`${API}/auth/login`, { method: "POST", body: form })
  const j = (await res.json()) as { data?: { token?: string }; message?: string }
  if (!j.data?.token) throw new Error(`Eskiz login: ${j.message ?? res.status}`)
  return (token = j.data.token)
}

async function eskiz<T = { id?: string }>(path: string, form?: FormData): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${API}/${path}`, { method: form ? "POST" : "GET", headers: { Authorization: `Bearer ${token ?? (await login())}` }, body: form })
    if (res.status === 401) { token = null; continue }
    const j = (await res.json().catch(() => ({}))) as T & { message?: string; status?: string }
    if (!res.ok || j.status === "error") throw new Error(`Eskiz ${res.status}: ${String(j.message ?? "").slice(0, 200)}`)
    return j
  }
  throw new Error("Eskiz: not authorised")
}

// The callback's pass: one HMAC of a constant with JWT_SECRET (Eskiz posts back to the URL we gave it)
async function callbackToken(): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(process.env.JWT_SECRET ?? ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("sms.callback"))
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** Tashkent hour (UTC+5, no DST) */
export const sendingHours = (now = new Date()): boolean => {
  const h = (now.getUTCHours() + 5) % 24
  return h >= 9 && h < 21
}

/** Eskiz delivery status → ours (null = still on its way) */
export function mapStatus(s: string): "delivered" | "failed" | null {
  const v = s.toUpperCase()
  if (v === "DELIVRD" || v === "DELIVERED") return "delivered"
  if (["UNDELIV", "UNDELIVERABLE", "REJECTD", "REJECTED", "EXPIRED", "FAILED", "DELETED", "UNKNOWN"].includes(v)) return "failed"
  return null
}

// ─── Templates (095): ours ↔ Eskiz's ───────────────────────────────────────────

const BLANK = /\{([^{}\s]+)\}/g
/** The same rule as the web's src/lib/sms.ts: {ism} = one word, other blanks up to 10 words */
export const toPattern = (text: string): string => text.replace(BLANK, (_, k: string) => (k === "ism" ? "%w" : "%w{1,10}"))
const squash = (s: string) => s.replace(/\s+/g, " ").trim()
export const sameText = (a: string, b: string): boolean => squash(a) === squash(b)

export function eskizState(s: string): { status: "approved" | "moderation" | "rejected"; kind: "promo" | "reminder" | null } {
  if (s === "service") return { status: "approved", kind: "reminder" }
  if (s === "reklama") return { status: "approved", kind: "promo" }
  return { status: s === "rejected" ? "rejected" : "moderation", kind: null }   // unknown = still waiting
}

/** A template made on my.eskiz.uz: its %w / %d holes become blanks {matn1}, {matn2}… */
export function importText(template: string): string {
  let n = 0
  return template.replace(/%[wd](?:\{\d+,\d+\})?/g, () => `{matn${++n}}`)
}

interface EskizTpl { id: number; template: string; original_text: string | null; status: string }
let syncing: Promise<void> | null = null
let lastSync = 0

/** Submit new templates, then mirror Eskiz's list into sms_templates (link by id, else by text, else import) */
export function syncTemplates(sql: Sql): Promise<void> {
  if (syncing) return syncing
  syncing = (async () => {
    const pending = await sql<{ id: string; text: string }[]>`select id, text from sms_templates where status = 'moderation' and submitted_at is null`
    for (const t of pending) {
      // One refused submission must not stop the rest (or the state sync below)
      const pattern = toPattern(t.text)
      try {
        const form = new FormData()
        form.append("template", pattern)
        await eskiz("user/template", form)
        await sql`update sms_templates set pattern = ${pattern}, submitted_at = now(), error = null where id = ${t.id}`
        console.log(`[sms] shablon Eskiz'ga yuborildi: ${t.id}`)
      } catch (err) {
        const msg = (err instanceof Error ? err.message : String(err)).slice(0, 300)
        await sql`update sms_templates set status = 'rejected', error = ${msg}, checked_at = now() where id = ${t.id}`
        console.error(`[sms] shablon yuborilmadi ${t.id}: ${msg}`)
      }
    }
    const r = await eskiz<{ result?: EskizTpl[] }>("user/templates")
    const retired = new Set((await sql<{ eskiz_id: number }[]>`select eskiz_id from sms_eskiz_retired`).map((x) => x.eskiz_id))
    const ours = await sql<{ id: string; eskiz_id: number | null; text: string; pattern: string | null; status: string }[]>`
      select id, eskiz_id, text, pattern, status from sms_templates`
    for (const e of r.result ?? []) {
      if (retired.has(e.id) || !e.template) continue   // replaced by an edit or deleted here — Eskiz can't delete it
      const original = e.original_text ?? e.template
      const st = eskizState(e.status)
      const mine = ours.find((o) => o.eskiz_id === e.id)
        ?? ours.find((o) => o.eskiz_id === null && o.pattern !== null && sameText(o.pattern, e.template))
        ?? ours.find((o) => o.eskiz_id === null && o.status === "draft" && sameText(o.text, original))   // an old saved text Eskiz approved
      if (mine) {
        await sql`update sms_templates set eskiz_id = ${e.id}, status = ${st.status}, kind = ${st.kind}, pattern = ${e.template},
                    text = ${mine.status === "draft" ? importText(e.template) : mine.text}, checked_at = now() where id = ${mine.id}`
        mine.eskiz_id = e.id
      } else {
        const title = squash(original).split(" ").slice(0, 5).join(" ")
        await sql`insert into sms_templates (title, text, status, kind, eskiz_id, pattern, checked_at, created_by)
                  values (${title || "Shablon"}, ${importText(e.template)}, ${st.status}, ${st.kind}, ${e.id}, ${e.template}, now(), null)
                  on conflict (eskiz_id) do nothing`
      }
    }
    lastSync = Date.now()
  })().finally(() => { syncing = null })
  return syncing
}

// ─── Queue ───────────────────────────────────────────────────────────────────

let running = false
let again = false

async function drain(sql: Sql): Promise<void> {
  if (running) { again = true; return }
  running = true
  try {
    const callback = `${BASE}/hooks/sms/status?token=${await callbackToken()}`
    do {
      again = false
      if (!sendingHours()) return
      // Only what is due (095: a scheduled send waits for its time; a cancelled one never goes)
      const rows = await sql<{ id: number; phone: string; text: string }[]>`
        select m.id, m.phone, m.text from sms_messages m join sms_campaigns c on c.id = m.campaign_id
        where m.status = 'queued' and c.send_at <= now() and c.cancelled_at is null order by m.id limit 50`
      for (const row of rows) {
        try {
          const form = new FormData()
          form.append("mobile_phone", row.phone.replace(/\D/g, ""))
          form.append("message", row.text)
          form.append("from", FROM)
          form.append("callback_url", callback)
          const r = await eskiz("message/sms/send", form)
          await sql`update sms_messages set status = 'sent', eskiz_id = ${r.id ?? null}, sent_at = now(), error = null, updated_at = now()
                    where id = ${row.id}`
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          await sql`update sms_messages set attempts = attempts + 1, error = ${msg}, updated_at = now(),
                      status = case when attempts + 1 >= ${MAX_ATTEMPTS} then 'failed' else status end
                    where id = ${row.id}`
          console.error(`[sms] #${row.id}: ${msg}`)
        }
      }
      if (rows.length === 50) again = true
    } while (again)
  } finally {
    running = false
  }
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type" }

/** /hooks/sms/status (Eskiz → us) and /hooks/sms/templates (browser) */
export async function handleSms(req: Request, sql: Sql, url: URL): Promise<Response> {
  if (url.pathname === "/hooks/sms/status") return handleStatus(req, sql, url)
  if (url.pathname === "/hooks/sms/templates/sync") return handleSync(req, sql)
  return new Response("not found", { status: 404 })
}

/** POST /hooks/sms/templates/sync — the Shablonlar tab's "Yangilash" (and its first open): submit + re-read now */
async function handleSync(req: Request, sql: Sql): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: SYNC_CORS })
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: SYNC_CORS })
  const uid = await verifyJwt((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""))
  const [me] = uid ? await sql<{ ok: boolean }[]>`select public.has_permission(${uid}, 'sms') or public.has_permission(${uid}, 'sotuv-crmn') as ok` : []
  if (!me?.ok) return Response.json({ error: "forbidden" }, { status: 403, headers: SYNC_CORS })
  if (!EMAIL || !PASSWORD) return Response.json({ error: "sms_off" }, { status: 503, headers: SYNC_CORS })
  try {
    if (Date.now() - lastSync > 20_000) await syncTemplates(sql)
    return Response.json({ ok: true }, { headers: SYNC_CORS })
  } catch (e) {
    console.error(`[sms] sync: ${e instanceof Error ? e.message : e}`)
    return Response.json({ error: "eskiz_error" }, { status: 502, headers: SYNC_CORS })
  }
}
const SYNC_CORS = { ...CORS, "Access-Control-Allow-Methods": "POST, OPTIONS" }

/** POST /hooks/sms/status — Eskiz's delivery report */
async function handleStatus(req: Request, sql: Sql, url: URL): Promise<Response> {
  if (req.method !== "POST" || url.searchParams.get("token") !== (await callbackToken()) || !process.env.JWT_SECRET) {
    return new Response("forbidden", { status: 403 })
  }
  const type = req.headers.get("content-type") ?? ""
  const body: Record<string, unknown> = type.includes("json")
    ? ((await req.json().catch(() => ({}))) as Record<string, unknown>)
    : Object.fromEntries((await req.formData().catch(() => new FormData())).entries())
  const status = mapStatus(String(body.status ?? ""))
  // Eskiz names the send's id differently across versions
  const ids = [body.message_id, body.request_id, body.id].filter((v) => v != null).map(String)
  if (status && ids.length) {
    await sql`update sms_messages set status = ${status}, updated_at = now(),
                error = ${status === "failed" ? String(body.status) : null}
              where eskiz_id = any(${ids}) and status <> 'delivered'`
  }
  return new Response("ok")
}

export async function startSms(sql: Sql): Promise<void> {
  if (!EMAIL || !PASSWORD) { console.log("[sms] ESKIZ_EMAIL/PASSWORD yo'q — SMS navbatda kutadi"); return }
  const wake = () => { drain(sql).catch((e) => console.error(`[sms] ${e instanceof Error ? e.message : e}`)) }
  await sql.listen("sms_outbox", wake)
  setInterval(wake, 30_000)
  wake()
  // Template states (095): every 10 minutes, and at once from the Shablonlar tab
  const sync = () => { syncTemplates(sql).catch((e) => console.error(`[sms] sync: ${e instanceof Error ? e.message : e}`)) }
  setInterval(sync, 10 * 60_000)
  sync()
  console.log(`[sms] Eskiz yoqildi (from ${FROM})`)
}
