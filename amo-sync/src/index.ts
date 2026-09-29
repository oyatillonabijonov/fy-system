// amo-sync — copies AmoCRM data into the amo_* tables (migration 049).
//
// The only process that talks to AmoCRM. The web Dashboard reads the tables
// through amo_dashboard(); the AmoCRM token lives only in this service's env.
//
// Each run:
//   pipelines + statuses, users            full refresh (small)
//   leads                                  incremental by updated_at; full once a day
//                                          (a full pass also drops leads deleted in AmoCRM)
//   lead status changes (events)           incremental by created_at
//   open tasks                             full replace
//   + settle_event_cashback() and expire_cashback() (not AmoCRM — see expireCashback below)
// Alongside the loop: Telegram payment receipts (src/telegram.ts), event-driven;
// the Vazifalar morning report at 9:00 on its own minute timer (src/tasks.ts); and
// tasks created from the team chat by mentioning the bot (src/taskbot.ts, Gemini).
//
// Env: DATABASE_URL, AMO_SUBDOMAIN, AMO_TOKEN (long-lived), SYNC_INTERVAL_MIN (10),
//      EVENTS_FROM (2025-01-01, first backfill of status history).
// `bun run src/index.ts --once` runs a single pass and exits.

import postgres from "postgres"
import { startTelegram } from "./telegram"
import { startTaskDigest } from "./tasks"
import { startTaskBot } from "./taskbot"
import { seedGroups } from "./groups"

const env = (k: string, d?: string): string => {
  const v = process.env[k] ?? d
  if (v === undefined || v === "") throw new Error(`env ${k} kerak`)
  return v
}

const sql = postgres(env("DATABASE_URL"), { max: 2, onnotice: () => {} })
const BASE = `https://${env("AMO_SUBDOMAIN")}.amocrm.ru`
const TOKEN = env("AMO_TOKEN")
const INTERVAL_MIN = Number(env("SYNC_INTERVAL_MIN", "10"))
const EVENTS_FROM = Math.floor(new Date(env("EVENTS_FROM", "2025-01-01")).getTime() / 1000)
const FULL_EVERY_H = 24
const OVERLAP_S = 10 * 60 // re-read the last 10 minutes; upserts make it idempotent

// ─── AmoCRM client ───────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function amo<T>(path: string): Promise<T | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(BASE + path, {
      headers: { Authorization: `Bearer ${TOKEN}`, "User-Agent": "fy-system-amo-sync" },
    })
    if (res.status === 204) return null
    if (res.status === 429 || res.status >= 500) {
      await sleep(1000 * (attempt + 1))
      continue
    }
    if (!res.ok) throw new Error(`AmoCRM ${res.status} ${path}: ${(await res.text()).slice(0, 200)}`)
    await sleep(150) // stay well under AmoCRM's 7 req/s
    return (await res.json()) as T
  }
  throw new Error(`AmoCRM qayta urinishlar tugadi: ${path}`)
}

/** Walks `?page=` until AmoCRM returns an empty page (204). */
async function pages<T>(path: string, key: string, limit = 250): Promise<T[]> {
  const out: T[] = []
  for (let page = 1; ; page++) {
    const sep = path.includes("?") ? "&" : "?"
    const body = await amo<{ _embedded?: Record<string, T[]> }>(`${path}${sep}limit=${limit}&page=${page}`)
    const items = body?._embedded?.[key] ?? []
    if (items.length === 0) break
    out.push(...items)
    if (items.length < limit) break
  }
  return out
}

const ts = (unix: number | null | undefined): Date | null => (unix ? new Date(unix * 1000) : null)

// ─── AmoCRM shapes (only the fields we read) ─────────────────────────────────

interface AmoStatus { id: number; name: string; sort: number; color?: string; pipeline_id: number }
interface AmoPipeline { id: number; name: string; sort: number; is_archive: boolean; _embedded: { statuses: AmoStatus[] } }
interface AmoUser { id: number; name: string }
interface AmoField { id: number; name: string }
interface AmoLossReason { id: number; name: string }
interface AmoLead {
  id: number; name: string | null; price: number | null; pipeline_id: number; status_id: number
  responsible_user_id: number | null; created_at: number; updated_at: number; closed_at: number | null
  loss_reason_id: number | null
  custom_fields_values: { field_id: number; field_name: string; values: { value: unknown }[] }[] | null
  _embedded?: { tags?: { name: string }[] }
}
interface AmoEvent {
  id: string; entity_id: number; created_at: number
  value_before: { lead_status?: { id: number; pipeline_id: number } }[]
  value_after: { lead_status?: { id: number; pipeline_id: number } }[]
}
interface AmoTask { id: number; entity_id: number | null; entity_type: string; responsible_user_id: number | null; complete_till: number; text: string | null }

// Lead source: the "Manba" field when a manager set it (rare), else utm_source,
// else the tags integrations stamp on the lead. Ad/site tags beat telephony tags,
// which get added to any lead once it's called.
// ponytail: tag regexes measured on the live account (2026-09); new tag styles land in "Noma'lum" until added here.
const TAG_SOURCES: [RegExp, string][] = [
  [/^fb\d|facebook|target/, "Facebook"],
  [/^tilda$/, "Tilda"],
  [/framer|^sayt/, "Sayt"],
  [/tgform|telegram/, "Telegram"],
  [/import|импорт|baza|sheet/, "Baza (import)"],
  [/входящий|пропущенный/, "Kiruvchi qo'ng'iroq"],
  [/исходящий/, "Chiquvchi qo'ng'iroq"],
]
function leadSource(l: AmoLead, manba: string | null): string | null {
  if (manba) return manba
  const utm = String(l.custom_fields_values?.find((f) => f.field_name === "utm_source")?.values?.[0]?.value ?? "").toLowerCase()
  if (utm === "ig" || utm === "instagram") return "Instagram"
  if (utm === "fb" || utm === "facebook") return "Facebook"
  const tags = (l._embedded?.tags ?? []).map((t) => t.name.trim().toLowerCase())
  return TAG_SOURCES.find(([re]) => tags.some((t) => re.test(t)))?.[1] ?? null
}

// ─── Sync state ──────────────────────────────────────────────────────────────

async function getState(key: string): Promise<string | null> {
  const [row] = await sql<{ value: string | null }[]>`select value from amo_sync_state where key = ${key}`
  return row?.value ?? null
}
async function setState(key: string, value: string | null): Promise<void> {
  await sql`insert into amo_sync_state (key, value, updated_at) values (${key}, ${value}, now())
            on conflict (key) do update set value = excluded.value, updated_at = now()`
}

// ─── Steps ───────────────────────────────────────────────────────────────────

async function syncPipelines(): Promise<void> {
  const body = await amo<{ _embedded: { pipelines: AmoPipeline[] } }>("/api/v4/leads/pipelines")
  const pipelines = body?._embedded.pipelines ?? []
  const statuses = pipelines.flatMap((p) =>
    p._embedded.statuses.map((s) => ({
      pipeline_id: p.id, id: s.id, name: s.name, sort: s.sort, color: s.color ?? null,
      kind: s.id === 142 ? "won" : s.id === 143 ? "lost" : "open",
    })),
  )
  await sql.begin(async (tx) => {
    await tx`delete from amo_statuses`
    await tx`delete from amo_pipelines`
    if (pipelines.length)
      await tx`insert into amo_pipelines ${tx(pipelines.map((p) => ({ id: p.id, name: p.name, sort: p.sort, is_archive: p.is_archive })))}`
    if (statuses.length) await tx`insert into amo_statuses ${tx(statuses)}`
  })
}

async function syncUsers(): Promise<void> {
  const users = await pages<AmoUser>("/api/v4/users", "users")
  if (!users.length) return
  await sql`insert into amo_users ${sql(users.map((u) => ({ id: u.id, name: u.name })))}
            on conflict (id) do update set name = excluded.name`
}

async function syncLeads(full: boolean): Promise<number> {
  // Custom fields and loss reasons are looked up by name every run — ids differ per account.
  const fields = await pages<AmoField>("/api/v4/leads/custom_fields", "custom_fields")
  const sourceField = fields.find((f) => f.name.trim().toLowerCase() === "manba")?.id
  const objectionField = fields.find((f) => f.name.trim().toLowerCase() === "e'tiroz sababi")?.id
  const reasonsBody = await amo<{ _embedded: { loss_reasons: AmoLossReason[] } }>("/api/v4/leads/loss_reasons")
  const reasons = new Map((reasonsBody?._embedded.loss_reasons ?? []).map((r) => [r.id, r.name]))

  const since = full ? 0 : Number((await getState("leads_since")) ?? 0)
  const filter = since > 0 ? `&filter[updated_at][from]=${since - OVERLAP_S}` : ""
  const leads = await pages<AmoLead>(`/api/v4/leads?order[updated_at]=asc${filter}`, "leads")

  const cf = (l: AmoLead, id: number | undefined): string | null => {
    const v = id === undefined ? undefined : l.custom_fields_values?.find((f) => f.field_id === id)?.values?.[0]?.value
    return v === undefined || v === null ? null : String(v)
  }
  const rows = leads.map((l) => ({
    id: l.id, name: l.name, price: l.price ?? 0, pipeline_id: l.pipeline_id, status_id: l.status_id,
    responsible_user_id: l.responsible_user_id, created_at: ts(l.created_at)!, updated_at: ts(l.updated_at)!,
    closed_at: ts(l.closed_at), loss_reason: l.loss_reason_id ? (reasons.get(l.loss_reason_id) ?? null) : null,
    objection: cf(l, objectionField), source: leadSource(l, cf(l, sourceField)),
  }))

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    await sql`insert into amo_leads ${sql(chunk)} on conflict (id) do update set
      name = excluded.name, price = excluded.price, pipeline_id = excluded.pipeline_id,
      status_id = excluded.status_id, responsible_user_id = excluded.responsible_user_id,
      created_at = excluded.created_at, updated_at = excluded.updated_at, closed_at = excluded.closed_at,
      loss_reason = excluded.loss_reason, objection = excluded.objection, source = excluded.source`
  }
  // A full pass saw every live lead — anything else was deleted in AmoCRM.
  if (full && rows.length > 0) {
    await sql`delete from amo_leads where not (id = any(${rows.map((r) => r.id)}::bigint[]))`
    await setState("last_full_at", String(Math.floor(Date.now() / 1000)))
  }
  const maxUpdated = leads.reduce((m, l) => Math.max(m, l.updated_at), since)
  await setState("leads_since", String(maxUpdated))
  return rows.length
}

async function syncStatusChanges(): Promise<number> {
  const since = Number((await getState("events_since")) ?? EVENTS_FROM)
  const events = await pages<AmoEvent>(
    `/api/v4/events?filter[type]=lead_status_changed&filter[created_at][from]=${since - OVERLAP_S}`,
    "events",
    100,
  )
  const rows = events.flatMap((e) => {
    const after = e.value_after?.[0]?.lead_status
    if (!after) return []
    return [{
      event_id: e.id, lead_id: e.entity_id, pipeline_id: after.pipeline_id,
      from_status_id: e.value_before?.[0]?.lead_status?.id ?? null, to_status_id: after.id,
      created_at: ts(e.created_at)!,
    }]
  })
  for (let i = 0; i < rows.length; i += 500)
    await sql`insert into amo_status_changes ${sql(rows.slice(i, i + 500))} on conflict (event_id) do nothing`
  const maxCreated = events.reduce((m, e) => Math.max(m, e.created_at), since)
  await setState("events_since", String(maxCreated))
  return rows.length
}

async function syncTasks(): Promise<number> {
  const tasks = await pages<AmoTask>("/api/v4/tasks?filter[is_completed]=0&filter[entity_type]=leads", "tasks")
  const rows = tasks.map((t) => ({
    id: t.id, lead_id: t.entity_type === "leads" ? t.entity_id : null,
    responsible_user_id: t.responsible_user_id, complete_till: ts(t.complete_till)!, text: t.text,
  }))
  await sql.begin(async (tx) => {
    await tx`delete from amo_tasks`
    for (let i = 0; i < rows.length; i += 500) await tx`insert into amo_tasks ${tx(rows.slice(i, i + 500))}`
  })
  return rows.length
}

// ─── Run loop ────────────────────────────────────────────────────────────────

async function runOnce(): Promise<void> {
  const started = Date.now()
  const lastFull = Number((await getState("last_full_at")) ?? 0)
  const full = Date.now() / 1000 - lastFull > FULL_EVERY_H * 3600
  try {
    await syncPipelines()
    await syncUsers()
    const leads = await syncLeads(full)
    const changes = await syncStatusChanges()
    const tasks = await syncTasks()
    await setState("last_success_at", new Date().toISOString())
    await setState("base_url", BASE) // for "open in AmoCRM" links on the Dashboard
    await setState("last_error", null)
    console.log(`[amo-sync] ${full ? "full" : "incremental"}: ${leads} leads, ${changes} status changes, ${tasks} open tasks — ${Date.now() - started} ms`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await setState("last_error", msg).catch(() => {})
    console.error(`[amo-sync] xatolik: ${msg}`)
  }
  await expireCashback()
}

// Not AmoCRM, but this is the system's only scheduled worker (CLAUDE.md): cashback
// is credited the day after an event (061) and expires after 12 months (059).
// Kept apart so it never marks the AmoCRM sync as failed.
async function expireCashback(): Promise<void> {
  try {
    const [award] = await sql<{ n: number }[]>`select public.settle_event_cashback() as n`
    if (award && award.n > 0) console.log(`[amo-sync] keshbek: ${award.n} ta ishtirokchida tadbirdan keyingi keshbek yangilandi`)
    const [row] = await sql<{ n: number }[]>`select public.expire_cashback() as n`
    if (row && row.n > 0) console.log(`[amo-sync] keshbek: ${row.n} ta mijozda muddati tugagan qism yechildi`)
  } catch (err) {
    console.error(`[amo-sync] keshbek muddati: ${err instanceof Error ? err.message : String(err)}`)
  }
}

if (process.argv.includes("--once")) {
  await runOnce()
  await sql.end()
} else {
  await seedGroups(sql).catch((e) => console.error(`[groups] ${e instanceof Error ? e.message : e}`))
  await startTelegram(sql)
  startTaskDigest(sql)
  await startTaskBot(sql).catch((e) => console.error(`[taskbot] ${e instanceof Error ? e.message : e}`))
  for (;;) {
    await runOnce()
    await sleep(INTERVAL_MIN * 60 * 1000)
  }
}
