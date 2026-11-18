// Telegram messages tied to the voronka's event date (migration 102): "N days before the event at HH:MM send
// template X to this voronka's bitimlar". Each bitim is claimed in tg_schedule_runs before the send, so a restart
// or an overlapping tick never sends it twice.
import type { Sql } from "postgres"
import { tgEnabled } from "./accounts"
import { TgError } from "./port"
import { sendToLead, type SendBody } from "./send"

const WINDOW = 12 * 3600_000   // a late start still sends the same day; a long outage doesn't send a stale reminder
const GAP = 3000               // one message every 3 s (Telegram flood limits)

/** The event's Tashkent calendar day (events.date is a timestamptz) − days, at the Tashkent wall-clock time (UTC+5, no DST) */
export function dueAt(eventDate: string, daysBefore: number, atTime: string): Date {
  const d = new Date(`${eventDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - daysBefore)
  return new Date(`${d.toISOString().slice(0, 10)}T${atTime.slice(0, 5)}:00+05:00`)
}

export const isDue = (now: Date, due: Date) => now >= due && now.getTime() - due.getTime() < WINDOW

type Rule = { id: string; template_id: string; body: string; created_by: string | null; event_date: string; days_before: number; at_time: string }
type Send = (sql: Sql, uid: string | null, body: SendBody) => Promise<void>

export async function runSchedules(sql: Sql, now = new Date(), send: Send = sendToLead, sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))): Promise<void> {
  const rules = await sql<Rule[]>`
    select s.id, s.template_id, t.body, s.created_by, to_char(e.date at time zone 'Asia/Tashkent', 'YYYY-MM-DD') as event_date, s.days_before, s.at_time::text as at_time
    from tg_schedules s join crm_pipelines p on p.id = s.pipeline_id join events e on e.id = p.event_id
    join tg_templates t on t.id = s.template_id
    where s.enabled and e.date is not null`
  for (const r of rules) {
    if (!isDue(now, dueAt(r.event_date, r.days_before, r.at_time))) continue
    const leads = await sql<{ id: string }[]>`
      select l.id from crm_leads l join tg_schedules s on s.id = ${r.id}
      where l.pipeline_id = s.pipeline_id
        and (case when cardinality(s.stage_ids) = 0 then not l.is_won and not l.is_lost else l.stage_id = any(s.stage_ids) end)
        and not exists (select 1 from tg_schedule_runs x where x.schedule_id = s.id and x.lead_id = l.id)
      order by l.created_at`
    for (const l of leads) {
      const [claimed] = await sql`insert into tg_schedule_runs (schedule_id, lead_id, status) values (${r.id}, ${l.id}, 'sent') on conflict do nothing returning lead_id`
      if (!claimed) continue
      try {
        await send(sql, r.created_by, { lead_id: l.id, text: r.body, template_id: r.template_id })
      } catch (e) {
        const reason = e instanceof TgError ? e.code : e instanceof Error ? e.message.slice(0, 200) : String(e)
        await sql`update tg_schedule_runs set status = 'failed', error = ${reason} where schedule_id = ${r.id} and lead_id = ${l.id}`
      }
      await sleep(GAP)
    }
  }
}

let running = false
export function startTgSchedules(sql: Sql): void {
  if (!tgEnabled()) return
  setInterval(() => {
    if (running) return
    running = true
    runSchedules(sql).catch((e) => console.error(`[tg] schedules: ${e instanceof Error ? e.message : e}`)).finally(() => { running = false })
  }, 60_000)
}
