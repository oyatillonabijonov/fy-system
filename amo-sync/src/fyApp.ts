// The FY members' app (migration 105): events marked show_in_app are pushed to its /admin API.
// Triggers queue rows in fy_app_outbox; every 30 s this sends what is due:
//   'event'   → PUT /admin/events/<id> with the event as it is NOW (so a burst of edits sends once),
//               or DELETE when the event is hidden, inactive or gone
//   'confirm' → POST /admin/events/<id>/registrations/<phone>/confirm once the participant's debt is 0
// 2xx = done; 4xx (but 429) = failed, not retried (404 on confirm = the person isn't in the app);
// 5xx / 429 / network = retried after 1, 5, 15, 60 minutes, then failed.
// The browser's side (session JWT, like /hooks/tg/*):
//   GET  /hooks/fy/overview                   tadbirlar → {stats, registrations: {event id: rows}} for the Ilova page
//   GET  /hooks/fy/registrations/<event id>   tadbirlar → the app's sign-ups and applications
//   POST /hooks/fy/announce {text, href?}      admin     → {sent}, kept in fy_app_announcements (106)
// No FY_ADMIN_TOKEN = off; rows wait. The token goes only in the Authorization header.

import type { Sql } from "postgres"
import { verifyJwt } from "./pbx"
import { COMPANY } from "./company"

const BASE = COMPANY.fyAppUrl
const TOKEN = BASE ? process.env.FY_ADMIN_TOKEN ?? "" : ""   // no address (a customer's install) = off, like no token

export interface EventRow {
  id: string; name: string; description: string | null; location: string | null; cover_image: string | null
  day: string | null; start_time: string | null; end_day: string | null; show_in_app: boolean; is_active: boolean | null
  app_category: string | null; app_capacity: number | null; app_pipeline_id: string | null
  host: string | null; min_price: number | null
}

/** The PUT body; a string = why the event can't go to the app (logged as the row's failure) */
export function eventBody(e: EventRow): Record<string, unknown> | string {
  if (!e.day || !e.start_time) return "boshlanish sanasi yoki vaqti yo'q"
  if (e.min_price === null) return "tarif yo'q"
  const startsAt = `${e.day}T${e.start_time.slice(0, 5)}:00+05:00`
  return {
    title: e.name,
    startsAt,
    // ponytail: ERP keeps only the end DAY; the app gets its last minute
    endsAt: e.end_day && e.end_day > e.day ? `${e.end_day}T23:59:00+05:00` : null,
    price: Math.round(e.min_price),
    about: e.description ?? "",
    place: e.location ?? "",
    imageUrl: e.cover_image || null,
    pipelineId: e.app_pipeline_id,
    isActive: true,
    category: e.app_category,
    capacity: e.app_capacity,
    host: e.host ?? "",
  }
}

export type Verdict = "sent" | "retry" | "failed"
export function verdict(status: number): Verdict {
  if (status >= 200 && status < 300) return "sent"
  if (status === 429 || status >= 500 || status === 0) return "retry"
  return "failed"
}

/** Minutes to wait after the `attempts`-th failed try; null = that was the last */
export function retryAfterMin(attempts: number): number | null {
  return [1, 5, 15, 60][attempts - 1] ?? null
}

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; text: string }> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method, signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${TOKEN}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: res.status, text: (await res.text().catch(() => "")).slice(0, 500) }
  } catch (e) {
    return { status: 0, text: e instanceof Error ? e.message.slice(0, 200) : String(e) }
  }
}

interface Due { id: number; kind: "event" | "confirm"; event_id: string; phone: string | null; attempts: number; version: string }

async function send(sql: Sql, d: Due): Promise<{ status: number; text: string }> {
  if (d.kind === "confirm") {
    return call("POST", `/admin/events/${d.event_id}/registrations/${encodeURIComponent(d.phone ?? "")}/confirm`)
  }
  const [e] = await sql<EventRow[]>`
    select e.id, e.name, e.description, e.location, e.cover_image, e.show_in_app, e.is_active,
           to_char(e.date at time zone 'Asia/Tashkent', 'YYYY-MM-DD') as day, to_char(e.start_time, 'HH24:MI') as start_time,
           to_char(e.end_date at time zone 'Asia/Tashkent', 'YYYY-MM-DD') as end_day,
           e.app_category, e.app_capacity, e.app_pipeline_id, p.full_name as host,
           (select min(t.price)::float8 from event_tariffs t where t.event_id = e.id) as min_price
    from events e left join profiles p on p.id = e.manager_id where e.id = ${d.event_id}`
  if (!e || !e.show_in_app || e.is_active === false) return call("DELETE", `/admin/events/${d.event_id}`)
  const body = eventBody(e)
  if (typeof body === "string") return { status: 422, text: body }
  return call("PUT", `/admin/events/${d.event_id}`, body)
}

let busy = false

async function tick(sql: Sql): Promise<void> {
  if (busy) return
  busy = true
  try {
    const due = await sql<Due[]>`
      select id, kind, event_id, phone, attempts, next_try_at::text as version from fy_app_outbox
      where status = 'pending' and next_try_at <= now() order by id limit 20`
    for (const d of due) {
      const r = await send(sql, d)
      const v = verdict(r.status)
      const wait = v === "retry" ? retryAfterMin(d.attempts + 1) : null
      const status = v === "sent" ? "sent" : v === "failed" || wait === null ? "failed" : "pending"
      const response = `${r.status} ${r.text}`.trim()
      // A change made while this was on its way bumped next_try_at (fy_app_queue): leave the row pending,
      // the next tick sends the newer state
      const done = await sql`update fy_app_outbox set status = ${status}, attempts = attempts + 1, response = ${response},
               sent_at = ${status === "sent" ? new Date() : null}, next_try_at = now() + make_interval(mins => ${wait ?? 0})
               where id = ${d.id} and next_try_at = ${d.version}::timestamptz`
      if (!done.count) continue
      const what = `${d.kind} ${d.event_id.slice(0, 8)}${d.phone ? ` ${d.phone.slice(0, 6)}…` : ""}`
      if (status === "sent") console.log(`[fy-app] ${what} sent`)
      else console.error(`[fy-app] ${what} ${status === "failed" ? "failed" : `retry in ${wait}m`}: ${response.slice(0, 200)}`)
    }
  } finally {
    busy = false
  }
}

export function startFyApp(sql: Sql): void {
  if (!TOKEN) { console.log(`[fy-app] ${BASE ? "FY_ADMIN_TOKEN" : "FY_APP_URL"} yo'q — ilovaga yuborish o'chiq (navbat kutadi)`); return }
  setInterval(() => void tick(sql).catch((e) => console.error(`[fy-app] ${e instanceof Error ? e.message : e}`)), 30_000)
  console.log("[fy-app] FY ilovasiga tadbirlar yuboriladi")
}

// ─── The browser's side ──────────────────────────────────────────────────────

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type" }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { ...CORS, "cache-control": "no-store" } })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function handleFy(req: Request, sql: Sql, path: string): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })
  if (!TOKEN) return json({ error: "fy_off" }, 503)
  const uid = await verifyJwt((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""))
  if (!uid) return json({ error: "unauthorized" }, 401)
  const [me] = await sql<{ events: boolean; admin: boolean }[]>`
    select public.has_permission(id, 'tadbirlar') as events, public.is_admin(id) as admin from profiles where id = ${uid}`

  // The Ilova page in one call: the app's member numbers (null until the app serves /admin/stats) and
  // the sign-ups of every event shown in it (null = the app didn't answer for that one)
  if (path === "overview" && req.method === "GET") {
    if (!me?.events) return json({ error: "forbidden" }, 403)
    const shown = await sql<{ id: string }[]>`select id from events where show_in_app`
    const [stats, ...lists] = await Promise.all([
      call("GET", "/admin/stats"),
      ...shown.map((e) => call("GET", `/admin/events/${e.id}/registrations`)),
    ])
    const parse = (r: { status: number; text: string }) => { try { return r.status === 200 ? JSON.parse(r.text) as unknown : null } catch { return null } }
    return json({ stats: parse(stats), registrations: Object.fromEntries(shown.map((e, i) => [e.id, parse(lists[i])])) })
  }

  const reg = path.match(/^registrations\/([\w-]+)$/)
  if (reg && req.method === "GET") {
    if (!me?.events) return json({ error: "forbidden" }, 403)
    if (!UUID.test(reg[1])) return json({ error: "bad_request" }, 400)
    const r = await call("GET", `/admin/events/${reg[1]}/registrations`)
    if (r.status !== 200) { console.error(`[fy-app] registrations ${reg[1].slice(0, 8)}: ${r.status} ${r.text.slice(0, 200)}`); return json({ error: "fy_error" }, 502) }
    return new Response(r.text, { headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store" } })
  }
  if (path === "announce" && req.method === "POST") {
    if (!me?.admin) return json({ error: "forbidden" }, 403)
    const body = (await req.json().catch(() => ({}))) as { text?: unknown; href?: unknown }
    const text = typeof body.text === "string" ? body.text.trim() : ""
    const href = typeof body.href === "string" && body.href.startsWith("/") ? body.href : "/"
    if (!text || text.length > 500) return json({ error: "bad_request" }, 400)
    const r = await call("POST", "/admin/announcements", { text, href })
    console.log(`[fy-app] e'lon ${r.status} ${r.text.slice(0, 100)}`)
    if (r.status !== 200) return json({ error: "fy_error" }, 502)
    // Sent already: a failed history row must not turn into "not sent" (and a retry into a second notice)
    let sent = 0
    try { sent = Number((JSON.parse(r.text) as { sent?: unknown }).sent) || 0 } catch { /* answered 200 all the same */ }
    await sql`insert into fy_app_announcements (text, href, sent, created_by) values (${text}, ${href}, ${sent}, ${uid})`
      .catch((e) => console.error(`[fy-app] e'lon tarixga yozilmadi: ${e instanceof Error ? e.message : e}`))
    return new Response(r.text, { headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store" } })
  }
  return json({ error: "not_found" }, 404)
}
