// Vazifalar morning report (migration 066): every day at TASKS_DIGEST_HOUR:00
// Tashkent time, one message to the team group —
//   1. per upcoming event (and "Umumiy"): progress bar + done / in progress /
//      not started / failed counts and days left,
//   2. tasks completed yesterday,
//   3. "Bugun e'tibor": open tasks overdue, due today or tomorrow, one quote
//      block per owner, staff @mentioned by profiles.telegram.
// A minute timer checks the clock; amo_sync_state.tasks_digest_date makes it once
// a day (a restart after the hour still sends that day's report).
//
// Reminders (migration 069), on the same timer, only for open tasks with a due date
// AND time: 1 h before, at the time, then once a day at that time while overdue —
// the owner @mentioned. task_reminders records each one so none repeats.
// Off until TELEGRAM_BOT_TOKEN and TELEGRAM_TASKS_CHAT_ID are set.

import type { Sql } from "postgres"

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ""
const CHAT_ID = process.env.TELEGRAM_TASKS_CHAT_ID ?? ""
const HOUR = Number(process.env.TASKS_DIGEST_HOUR ?? "9")
const LIMIT = 3900        // Telegram caps a message at 4096 chars
const YESTERDAY_MAX = 10  // "Kecha bajarildi" list length

export interface EventStat {
  name: string | null     // null = "Umumiy"
  start: string | null    // YYYY-MM-DD, Tashkent
  done: number; in_progress: number; todo: number; failed: number
}
export interface DoneRow { title: string; owner: string | null; telegram: string | null }
export interface DueRow { title: string; due: string; time?: string | null; owner: string | null; telegram: string | null }

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentyabr", "oktyabr", "noyabr", "dekabr"]
const dayLabel = (d: string) => `${Number(d.slice(8, 10))}-${MONTHS[Number(d.slice(5, 7)) - 1]}`
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
const who = (r: { owner: string | null; telegram: string | null }) =>
  r.telegram ? esc(r.telegram.startsWith("@") ? r.telegram : `@${r.telegram}`) : `<b>${esc(r.owner ?? "Mas'ul belgilanmagan")}</b>`
const bar = (done: number, total: number) => {
  const n = total ? Math.round((done / total) * 10) : 0
  return `<code>${"▰".repeat(n)}${"▱".repeat(10 - n)}</code> ${total ? Math.round((done / total) * 100) : 0}%`
}

/** Tashkent calendar day, hour and minute of day, without depending on the container's timezone */
function tashkentNow(): { day: string; hour: number; minute: number } {
  const t = new Date(Date.now() + 5 * 3600_000)
  return { day: t.toISOString().slice(0, 10), hour: t.getUTCHours(), minute: t.getUTCHours() * 60 + t.getUTCMinutes() }
}

const SOON_MIN = 60   // "muddatga oz qoldi" — this long before the due time

export type ReminderKind = "soon" | "due" | "late"
export interface ReminderRow { id: string; title: string; due: string; time: string; owner: string | null; telegram: string | null; event: string | null; section: string | null }

/** Which reminder a task is due for right now (day + minute of day, Tashkent), with its once-only key */
export function reminderFor(day: string, minute: number, due: string, time: string): { kind: ReminderKind; key: string } | null {
  const at = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
  const moment = `${due} ${time.slice(0, 5)}`
  const d = days(due, day)                       // days since the due day
  const left = at - minute - d * 1440            // minutes until the due moment
  if (left > 0) return left <= SOON_MIN ? { kind: "soon", key: moment } : null
  if (d === 0) return { kind: "due", key: moment }
  return minute >= at ? { kind: "late", key: day } : null
}

const HEAD: Record<ReminderKind, string> = { soon: "⏰ <b>Muddatga oz qoldi</b>", due: "🔔 <b>Vazifa vaqti keldi</b>", late: "🔴 <b>Muddati o'tgan</b>" }

/** One message per tick: a heading per kind, one quote block per task */
export function buildReminders(day: string, items: { row: ReminderRow; kind: ReminderKind }[]): string {
  const out: string[] = []
  for (const kind of ["late", "due", "soon"] as ReminderKind[]) {
    const list = items.filter((i) => i.kind === kind)
    if (!list.length) continue
    out.push(HEAD[kind])
    for (const { row: r } of list) {
      const at = r.time.slice(0, 5)
      const late = days(r.due, day)
      const when = kind === "late" ? `${dayLabel(r.due)} ${at} · ${late} kun kechikdi` : `${r.due === day ? "bugun" : dayLabel(r.due)} ${at}`
      const where = r.event ? `\n${esc(r.event)}${r.section ? ` › ${esc(r.section)}` : ""}` : ""
      out.push(`<blockquote>${who(r)}\n${esc(r.title)} · ${when}${where}</blockquote>`)
    }
  }
  return out.join("\n")
}

/** The report, split between blocks if it outgrows one message */
export function buildDigest(today: string, events: EventStat[], yesterday: DoneRow[], due: DueRow[]): string[] {
  const blocks: string[] = [`🌅 <b>Xayrli tong! Vazifalar — ${dayLabel(today)}</b>`]

  for (const e of events) {
    const total = e.done + e.in_progress + e.todo + e.failed
    const left = e.start ? days(today, e.start) : null
    const when = left === null ? "" : left > 0 ? ` · ${left} kun qoldi` : left === 0 ? " · bugun" : " · davom etmoqda"
    blocks.push(
      `📌 <b>${esc(e.name ?? "Umumiy vazifalar")}</b>${when}\n${bar(e.done, total)}\n` +
      `✅ ${e.done} bajarildi · 🔄 ${e.in_progress} jarayonda\n⏳ ${e.todo} boshlanmagan · ❌ ${e.failed} bajarilmadi`,
    )
  }

  if (yesterday.length) {
    const more = yesterday.length > YESTERDAY_MAX ? `\n… yana ${yesterday.length - YESTERDAY_MAX} ta` : ""
    blocks.push(`<b>Kecha bajarildi (${yesterday.length})</b>\n` +
      yesterday.slice(0, YESTERDAY_MAX).map((r) => `✅ ${esc(r.title)} — ${who(r)}`).join("\n") + more)
  }

  if (due.length) {
    const byOwner = new Map<string, DueRow[]>()
    for (const r of due) byOwner.set(who(r), [...(byOwner.get(who(r)) ?? []), r])
    const line = (r: DueRow) => {
      const late = days(r.due, today)
      const at = r.time ? ` ${r.time.slice(0, 5)}` : ""
      return late > 0 ? `🔴 ${esc(r.title)} · ${late} kun kechikdi` : late === 0 ? `🟡 ${esc(r.title)} · bugun${at}` : `🔵 ${esc(r.title)} · ertaga${at}`
    }
    blocks.push(`<b>Bugun e'tibor (${due.length})</b>`)
    for (const [name, list] of byOwner) blocks.push(`<blockquote>${name}\n${list.map(line).join("\n")}</blockquote>`)
  } else {
    blocks.push("👌 Bugun va ertaga muddati tugaydigan vazifa yo'q")
  }

  // Header + blocks joined by blank lines; a new message starts between blocks.
  // (A quote block right after another needs no blank line — Telegram spaces them.)
  const out: string[] = []
  let cur = ""
  for (const b of blocks) {
    const sep = cur === "" ? "" : b.startsWith("<blockquote>") ? "\n" : "\n\n"
    if (cur && cur.length + sep.length + b.length > LIMIT) { out.push(cur); cur = b } else cur += sep + b
  }
  out.push(cur)
  return out
}

async function send(text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true }),
  })
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

let busy = false

async function taskDigest(sql: Sql): Promise<void> {
  const { day, hour } = tashkentNow()
  if (hour < HOUR || busy) return
  busy = true
  try {
    const [last] = await sql<{ value: string | null }[]>`select value from amo_sync_state where key = 'tasks_digest_date'`
    if (last?.value === day) return

    // Events not over yet (or undated), plus the general tasks
    const events = await sql<EventStat[]>`
      select e.name, (e.date at time zone 'Asia/Tashkent')::date::text as start,
             count(*) filter (where t.status = 'done')::int        as done,
             count(*) filter (where t.status = 'in_progress')::int as in_progress,
             count(*) filter (where t.status = 'todo')::int        as todo,
             count(*) filter (where t.status = 'failed')::int      as failed
      from tasks t left join events e on e.id = t.event_id
      where e.id is null or e.date is null
         or (coalesce(e.end_date, e.date) at time zone 'Asia/Tashkent')::date >= ${day}::date
      group by e.id, e.name, e.date
      order by e.date nulls last`
    const yesterday = await sql<DoneRow[]>`
      select t.title, coalesce(p.full_name, t.assignee_name) as owner, nullif(btrim(p.telegram), '') as telegram
      from tasks t left join profiles p on p.id = t.assignee_id
      where t.status = 'done' and (t.completed_at at time zone 'Asia/Tashkent')::date = ${day}::date - 1
      order by t.completed_at`
    const due = await sql<DueRow[]>`
      select t.title, t.due_date::text as due, t.due_time::text as time, coalesce(p.full_name, t.assignee_name) as owner,
             nullif(btrim(p.telegram), '') as telegram
      from tasks t left join profiles p on p.id = t.assignee_id
      where t.status in ('todo', 'in_progress') and t.due_date <= ${day}::date + 1
      order by owner nulls last, t.due_date, t.due_time nulls last, t.sort_order`

    if (events.length) for (const text of buildDigest(day, events, yesterday, due)) await send(text)

    await sql`insert into amo_sync_state (key, value, updated_at) values ('tasks_digest_date', ${day}, now())
              on conflict (key) do update set value = excluded.value, updated_at = now()`
    console.log(`[tasks] ${day}: hisobot — ${events.length} tadbir, kecha ${yesterday.length} bajarildi, e'tibor ${due.length}`)
  } catch (err) {
    console.error(`[tasks] hisobot: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    busy = false
  }
}

let reminding = false

async function taskReminders(sql: Sql): Promise<void> {
  if (reminding) return
  reminding = true
  try {
    const { day, minute } = tashkentNow()
    const rows = await sql<ReminderRow[]>`
      select t.id, t.title, t.due_date::text as due, t.due_time::text as time,
             coalesce(p.full_name, t.assignee_name) as owner, nullif(btrim(p.telegram), '') as telegram,
             e.name as event, t.section
      from tasks t left join profiles p on p.id = t.assignee_id left join events e on e.id = t.event_id
      where t.status in ('todo', 'in_progress') and t.due_time is not null and t.due_date <= ${day}::date + 1
      order by t.due_date, t.due_time`
    const items: { row: ReminderRow; kind: ReminderKind; key: string }[] = []
    for (const row of rows) {
      const r = reminderFor(day, minute, row.due, row.time)
      if (!r) continue
      // claim first: a reminder already recorded is skipped
      const [won] = await sql`insert into task_reminders (task_id, kind, key) values (${row.id}, ${r.kind}, ${r.key})
                              on conflict do nothing returning task_id`
      if (won) items.push({ row, ...r })
    }
    if (!items.length) return
    try {
      await send(buildReminders(day, items))
    } catch (err) {
      // not sent — release the claims so the next minute retries
      for (const i of items) await sql`delete from task_reminders where task_id = ${i.row.id} and kind = ${i.kind} and key = ${i.key}`
      throw err
    }
    console.log(`[tasks] eslatma: ${items.map((i) => `${i.kind}:${i.row.title}`).join(", ")}`)
  } catch (err) {
    console.error(`[tasks] eslatma: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    reminding = false
  }
}

/** Minute timer, alongside the sync loop */
export function startTaskDigest(sql: Sql): void {
  if (!TOKEN || !CHAT_ID) {
    console.log("[tasks] TELEGRAM_TASKS_CHAT_ID yo'q — vazifalar hisoboti o'chiq")
    return
  }
  const tick = () => { void taskDigest(sql); void taskReminders(sql) }
  setInterval(tick, 60_000)
  tick()
  console.log(`[tasks] vazifalar hisoboti yoqildi (har kuni ${HOUR}:00) va muddat eslatmalari`)
}
