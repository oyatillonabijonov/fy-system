// SMS through Eskiz (migration 083): drains sms_messages (status 'queued') into notify.eskiz.uz and
// records Eskiz's delivery callback (POST /hooks/sms/status?token=…); GET /hooks/sms/templates hands the
// browser (session + 'sms' module) the texts Eskiz has approved. Woken by pg_notify('sms_outbox'),
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
      const rows = await sql<{ id: number; phone: string; text: string }[]>`
        select id, phone, text from sms_messages where status = 'queued' order by id limit 50`
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
  if (url.pathname !== "/hooks/sms/templates") return new Response("not found", { status: 404 })
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })
  const uid = await verifyJwt((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""))
  const [me] = uid ? await sql<{ ok: boolean }[]>`select public.has_permission(${uid}, 'sms') as ok` : []
  if (!me?.ok) return Response.json({ error: "forbidden" }, { status: 403, headers: CORS })
  if (!EMAIL || !PASSWORD) return Response.json({ error: "sms_off" }, { status: 503, headers: CORS })
  try {
    const r = await eskiz<{ result?: { id: number; template: string; original_text: string; status: string }[] }>("user/templates")
    // Only what Eskiz approved: "service" (eslatma) and "reklama"; moderation/rejected are left out
    const list = (r.result ?? []).filter((t) => t.status === "service" || t.status === "reklama")
      .map((t) => ({ id: t.id, template: t.template, example: t.original_text, kind: t.status === "reklama" ? "promo" : "reminder" }))
    return Response.json(list, { headers: CORS })
  } catch (e) {
    console.error(`[sms] templates: ${e instanceof Error ? e.message : e}`)
    return Response.json({ error: "eskiz_error" }, { status: 502, headers: CORS })
  }
}

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
  console.log(`[sms] Eskiz yoqildi (from ${FROM})`)
}
