// Lead intake (migration 073): form webhooks → Sotuv bo'limi.
//   POST /hooks/lead/<source>?token=…   Tilda / Framer / any site form (JSON, urlencoded or multipart)
//   GET  /hooks/lead/meta?hub.…         Meta webhook verification (verify token = the source token)
//   POST /hooks/lead/meta?token=…       Meta lead ads: leadgen ids → Graph API → the form's answers
// The gateway routes /hooks/ here. Everything is decided in intake_lead() (token, on/off,
// voronka, one open deal per phone); this file only turns a request into name/phone/details.

import type { Sql } from "postgres"
import { handlePbx, pbxSyncedAt } from "./pbx"

const PORT = Number(process.env.INTAKE_PORT ?? 8787)
const GRAPH = "https://graph.facebook.com/v19.0"
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }

const NAME_KEYS = ["name", "full_name", "fullname", "ism", "ismingiz", "firstname", "first_name", "fio", "имя", "input_name", "inputname"]
const PHONE_KEYS = ["phone", "phone_number", "telefon", "tel", "telefon raqamingiz", "raqam", "телефон", "input_phone", "inputphone"]
const SKIP_KEYS = new Set(["tranid", "cookies", "token", "test", "formid", "last_name", "lastname"])

export interface ParsedLead { name: string; phone: string; details: string }

/** Any form's fields → name, phone and the rest as "Savol: javob" lines */
export function parseLead(fields: Record<string, string>): ParsedLead {
  const entries = Object.entries(fields).map(([k, v]) => [k.trim(), String(v ?? "").trim()] as const).filter(([, v]) => v)
  const find = (keys: string[]) => entries.find(([k]) => keys.includes(k.toLowerCase()))
  const nameE = find(NAME_KEYS)
  // No phone field by name → the first value that looks like a phone number
  const phoneE = find(PHONE_KEYS) ?? entries.find(([, v]) => /^\+?[\d\s()-]{9,18}$/.test(v) && v.replace(/\D/g, "").length >= 9)
  const last = entries.find(([k]) => ["last_name", "lastname"].includes(k.toLowerCase()))?.[1]
  const name = [nameE?.[1], last].filter(Boolean).join(" ")
  const details = entries
    .filter(([k]) => k !== nameE?.[0] && k !== phoneE?.[0] && !SKIP_KEYS.has(k.toLowerCase()))
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
    .join("\n")
  return { name, phone: phoneE?.[1] ?? "", details }
}

/** Nested JSON (Framer, custom sites) flattened to strings */
function flatten(o: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (o && typeof o === "object" && !Array.isArray(o)) {
    for (const [k, v] of Object.entries(o)) flatten(v, prefix ? `${prefix}.${k}` : k, out)
  } else if (Array.isArray(o)) out[prefix] = o.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ")
  else if (o !== null && o !== undefined) out[prefix] = String(o)
  return out
}

async function readBody(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? ""
  if (type.includes("application/json")) return flatten(await req.json())
  if (type.includes("form")) {
    const out: Record<string, string> = {}
    for (const [k, v] of (await req.formData()).entries()) if (typeof v === "string") out[k] = v
    return out
  }
  const text = await req.text()
  try { return flatten(JSON.parse(text)) } catch { return Object.fromEntries(new URLSearchParams(text)) }
}

async function intake(sql: Sql, source: string, token: string, p: ParsedLead, raw: Record<string, string>) {
  const [{ r }] = await sql<{ r: { ok: boolean; lead_id?: string; duplicate?: boolean; skipped?: boolean } }[]>`
    select public.intake_lead(${source}, ${token}, ${p.name}, ${p.phone}, ${p.details}, ${sql.json(raw)}) as r`
  console.log(`[intake] ${source}: ${r.skipped ? "manba o'chiq, faqat log" : r.duplicate ? "qayta murojaat" : "yangi sdelka"} ${r.lead_id ?? ""}`)
  return r
}

/** Meta sends only leadgen ids; the answers come from the Graph API with the page token */
async function metaLeads(sql: Sql, token: string, body: unknown) {
  const pageToken = process.env.META_PAGE_ACCESS_TOKEN
  const entries = (body as { entry?: { changes?: { field: string; value: { leadgen_id?: string; form_id?: string } }[] }[] }).entry ?? []
  for (const ch of entries.flatMap((e) => e.changes ?? [])) {
    if (ch.field !== "leadgen" || !ch.value.leadgen_id) continue
    if (!pageToken) { console.error("[intake] meta: META_PAGE_ACCESS_TOKEN yo'q — lid olinmadi", ch.value.leadgen_id); continue }
    try {
      const res = await fetch(`${GRAPH}/${ch.value.leadgen_id}?fields=field_data,form_id&access_token=${encodeURIComponent(pageToken)}`)
      if (!res.ok) throw new Error(`Graph ${res.status}: ${(await res.text()).slice(0, 200)}`)
      const lead = (await res.json()) as { field_data?: { name: string; values: string[] }[]; form_id?: string }
      const fields: Record<string, string> = Object.fromEntries((lead.field_data ?? []).map((f) => [f.name, f.values.join(", ")]))
      await intake(sql, "meta", token, parseLead(fields), { ...fields, leadgen_id: ch.value.leadgen_id, form_id: lead.form_id ?? ch.value.form_id ?? "" })
    } catch (e) {
      console.error(`[intake] meta ${ch.value.leadgen_id}: ${e instanceof Error ? e.message : e}`)
    }
  }
}

/** Uptime check (GitHub Actions every 5 min): DB reachable, AmoCRM pass ≤ 30 min old, call history
 *  ≤ 5 min old (when the PBX is configured), a backup in the last 26 h. 503 if anything is off. */
async function health(sql: Sql): Promise<Response> {
  const checks: Record<string, boolean | string> = {}
  try {
    const rows = await sql<{ key: string; age: number }[]>`
      select key, extract(epoch from now() - coalesce(value::timestamptz, updated_at))::int as age
      from amo_sync_state where key in ('last_success_at', 'backup_last_ok')`
    const age = (k: string) => rows.find((r) => r.key === k)?.age ?? Infinity
    checks.db = true
    checks.amocrm = age("last_success_at") < 30 * 60
    checks.backup = age("backup_last_ok") < 26 * 3600
  } catch (e) {
    checks.db = `${e instanceof Error ? e.message : e}`.slice(0, 120)
  }
  if (process.env.ONLINEPBX_KEY) checks.calls = Date.now() - pbxSyncedAt < 5 * 60_000
  const ok = Object.values(checks).every((v) => v === true)
  return Response.json({ ok, checks }, { status: ok ? 200 : 503 })
}

export function startIntake(sql: Sql): void {
  Bun.serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url)
      if (url.pathname.startsWith("/hooks/pbx/")) return handlePbx(req, sql, url.pathname.slice("/hooks/pbx/".length))
      if (url.pathname === "/hooks/health") return health(sql)
      const m = url.pathname.match(/^\/hooks\/lead\/([a-z0-9_-]+)\/?$/)
      if (!m) return new Response("not found", { status: 404 })
      const source = m[1]
      const token = url.searchParams.get("token") ?? url.searchParams.get("hub.verify_token") ?? ""

      // A site's own form may post from the browser
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })
      const metaOk = async () => (await sql<{ ok: boolean }[]>`select token = ${token} as ok from crm_lead_sources where id = 'meta'`)[0]?.ok
      if (req.method === "GET" && source === "meta" && url.searchParams.get("hub.mode") === "subscribe") {
        return (await metaOk()) ? new Response(url.searchParams.get("hub.challenge") ?? "") : new Response("forbidden", { status: 403 })
      }
      if (req.method !== "POST") return new Response("method not allowed", { status: 405 })

      try {
        if (source === "meta") {
          if (!(await metaOk())) return new Response("forbidden", { status: 403 })
          const body = await req.json()
          // Answer Meta at once (it retries slow webhooks); fetch the answers after
          void metaLeads(sql, token, body)
          return Response.json({ ok: true })
        }
        const raw = await readBody(req)
        if (Object.keys(raw).length === 1 && raw.test) return new Response("ok")   // Tilda's "check webhook" ping
        const r = await intake(sql, source, token, parseLead(raw), raw)
        return Response.json({ ok: true, duplicate: !!r.duplicate }, { headers: CORS })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.includes("unknown source or token")) return new Response("forbidden", { status: 403 })
        console.error(`[intake] ${source}: ${msg}`)
        return Response.json({ ok: false }, { status: 500 })
      }
    },
  })
  console.log(`[intake] listening on :${PORT}`)
}
