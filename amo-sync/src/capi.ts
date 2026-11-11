// Meta Conversions API (migration 093). Triggers queue Lead / QualifiedLead / Purchase into
// meta_events_log (once per bitim per event); every 30 s this sends what is due to pixel
// 1647118073645060. Retries after 1, 10 and 60 minutes, then `failed`; an event older than
// 7 days is `skipped` (Meta refuses them). No META_CAPI_TOKEN = off, rows wait.
// The token goes in the request body only — never into a URL, a log line or the stored response.

import { createHash } from "node:crypto"
import type { Sql } from "postgres"
import type { Capi } from "./leadScore"

const TOKEN = process.env.META_CAPI_TOKEN ?? ""
const TEST_CODE = process.env.META_TEST_EVENT_CODE ?? ""
const PIXEL = "1647118073645060"
const ENDPOINT = `https://graph.facebook.com/v26.0/${PIXEL}/events`   // v26.0: newest Marketing API version (checked 2026-11-11)

export interface QueuedEvent {
  id: number; lead_id: string; event_name: "Lead" | "QualifiedLead" | "Purchase"; event_id: string; event_time: Date
  value: number | null; attempts: number; phone: string | null; name: string | null; capi: Capi; content_fallback: string | null
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex")

/** Phone as Meta wants it hashed: digits only, with 998 */
const phoneDigits = (p: string) => {
  const d = p.replace(/\D/g, "")
  return d.length === 9 ? `998${d}` : d
}

/** One data[] entry */
export function buildPayload(e: QueuedEvent): Record<string, unknown> {
  const c = e.capi
  const user_data: Record<string, unknown> = {
    ...(e.phone && phoneDigits(e.phone) ? { ph: [sha(phoneDigits(e.phone))] } : {}),
    // fn is the FIRST name in Meta's matching; a full name hashed never matches
    ...(e.name?.trim() ? { fn: [sha(e.name.trim().split(/\s+/)[0].toLowerCase())] } : {}),
    external_id: [sha(e.lead_id)],
    ...(c.fbc ? { fbc: c.fbc } : {}),
    ...(c.fbp ? { fbp: c.fbp } : {}),
    ...(c.client_ip ? { client_ip_address: c.client_ip } : {}),
    ...(c.user_agent ? { client_user_agent: c.user_agent } : {}),
  }
  const content_name = c.content_name || e.content_fallback
  return {
    event_name: e.event_name,
    event_time: Math.floor(e.event_time.getTime() / 1000),
    event_id: e.event_id,
    action_source: "website",
    ...(c.event_source_url ? { event_source_url: c.event_source_url } : {}),
    user_data,
    custom_data: {
      ...(content_name ? { content_name } : {}),
      ...(e.event_name === "Purchase" && e.value !== null ? { value: e.value, currency: "UZS" } : {}),
    },
  }
}

/** Minutes to wait after the `attempts`-th failed try; null = that was the last */
export function retryAfterMin(attempts: number): number | null {
  return [1, 10, 60][attempts - 1] ?? null
}

export function isStale(e: QueuedEvent, now: Date): boolean {
  return now.getTime() - e.event_time.getTime() > 7 * 86_400_000
}

let busy = false

async function tick(sql: Sql): Promise<void> {
  if (busy) return
  busy = true
  try {
    const due = await sql<QueuedEvent[]>`
      select m.id, m.lead_id, m.event_name, m.event_id, m.event_time, m.value::float8 as value, m.attempts,
             c.phone, c.full_name as name, coalesce(l.capi, '{}'::jsonb) as capi, coalesce(e.name, p.name) as content_fallback
      from meta_events_log m
      join crm_leads l on l.id = m.lead_id
      left join clients c on c.id = l.client_id
      left join crm_pipelines p on p.id = l.pipeline_id
      left join events e on e.id = p.event_id
      where m.status = 'pending' and m.next_try_at <= now()
      order by m.id limit 20`
    for (const e of due) {
      if (isStale(e, new Date())) {
        await sql`update meta_events_log set status = 'skipped', response = ${sql.json({ reason: "7 kundan eski" })} where id = ${e.id}`
        console.log(`[capi] ${e.event_name} ${e.lead_id.slice(0, 8)} skipped (7 kundan eski)`)
        continue
      }
      let answer: unknown = null
      let ok = false
      try {
        const res = await fetch(ENDPOINT, {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(30_000),
          body: JSON.stringify({ data: [buildPayload(e)], access_token: TOKEN, ...(TEST_CODE ? { test_event_code: TEST_CODE } : {}) }),
        })
        answer = await res.json().catch(() => ({ status: res.status }))
        ok = res.ok
      } catch (err) {
        answer = { error: err instanceof Error ? err.message.slice(0, 200) : String(err) }
      }
      if (ok) {
        await sql`update meta_events_log set status = 'sent', sent_at = now(), attempts = attempts + 1, response = ${sql.json(answer as never)} where id = ${e.id}`
        console.log(`[capi] ${e.event_name} ${e.lead_id.slice(0, 8)} sent`)
        continue
      }
      const wait = retryAfterMin(e.attempts + 1)
      if (wait === null) await sql`update meta_events_log set status = 'failed', attempts = attempts + 1, response = ${sql.json(answer as never)} where id = ${e.id}`
      else await sql`update meta_events_log set attempts = attempts + 1, response = ${sql.json(answer as never)}, next_try_at = now() + make_interval(mins => ${wait}) where id = ${e.id}`
      console.error(`[capi] ${e.event_name} ${e.lead_id.slice(0, 8)} ${wait === null ? "failed" : `retry in ${wait}m`}: ${JSON.stringify(answer).slice(0, 200)}`)
    }
  } finally {
    busy = false
  }
}

export function startCapi(sql: Sql): void {
  if (!TOKEN) { console.log("[capi] META_CAPI_TOKEN yo'q — Meta'ga yuborish o'chiq (hodisalar navbatda kutadi)"); return }
  setInterval(() => void tick(sql).catch((e) => console.error(`[capi] ${e instanceof Error ? e.message : e}`)), 30_000)
  console.log(`[capi] Meta Conversions API yoqildi (piksel ${PIXEL}${TEST_CODE ? ", test rejimi" : ""})`)
}
