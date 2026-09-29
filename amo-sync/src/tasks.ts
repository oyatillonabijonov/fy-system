// Vazifalar reminder (migration 066): once a day, after TASKS_DIGEST_HOUR Tashkent
// time, one message to the team group — open tasks that are overdue, due today or
// due tomorrow, grouped by owner, staff @mentioned by their profiles.telegram.
// Runs from the amo-sync loop (every ~10 min); amo_sync_state.tasks_digest_date
// makes it once per day. Off until TELEGRAM_BOT_TOKEN and TELEGRAM_TASKS_CHAT_ID are set.

import type { Sql } from "postgres"

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ""
const CHAT_ID = process.env.TELEGRAM_TASKS_CHAT_ID ?? ""
const HOUR = Number(process.env.TASKS_DIGEST_HOUR ?? "9")
const LIMIT = 3900 // Telegram caps a message at 4096 chars

interface Row { title: string; due: string; owner: string | null; telegram: string | null; event: string | null }

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentyabr", "oktyabr", "noyabr", "dekabr"]
const dayLabel = (d: string) => `${Number(d.slice(8, 10))}-${MONTHS[Number(d.slice(5, 7)) - 1]}`

/** Tashkent calendar day and hour, without depending on the container's timezone */
function tashkentNow(): { day: string; hour: number } {
  const t = new Date(Date.now() + 5 * 3600_000)
  return { day: t.toISOString().slice(0, 10), hour: t.getUTCHours() }
}

async function send(text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true }),
  })
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

/** The message(s): header, then one block per owner; split between blocks if too long */
export function buildDigest(rows: Row[], today: string): string[] {
  const tomorrow = new Date(`${today}T00:00:00Z`)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  const tmr = tomorrow.toISOString().slice(0, 10)
  const mark = (d: string) => (d < today ? "🔴" : d === today ? "🟡" : "🔵")
  const count = (f: (d: string) => boolean) => rows.filter((r) => f(r.due)).length

  const head =
    `📋 <b>Vazifalar — ${dayLabel(today)}</b>\n` +
    `🔴 Muddati o'tgan: ${count((d) => d < today)} · 🟡 Bugun: ${count((d) => d === today)} · 🔵 Ertaga: ${count((d) => d === tmr)}`

  const byOwner = new Map<string, Row[]>()
  for (const r of rows) {
    const who = r.telegram ? `${esc(r.telegram)} (${esc(r.owner ?? "")})` : `<b>${esc(r.owner ?? "Mas'ul belgilanmagan")}</b>`
    byOwner.set(who, [...(byOwner.get(who) ?? []), r])
  }
  const blocks = [...byOwner.entries()].map(([who, list]) =>
    [who, ...list.map((r) => `${mark(r.due)} ${esc(r.title)}${r.event ? ` — <i>${esc(r.event)}</i>` : ""}${r.due < today ? ` (${dayLabel(r.due)})` : ""}`)].join("\n"),
  )

  const out: string[] = []
  let cur = head
  for (const b of blocks) {
    if (cur.length + b.length + 2 > LIMIT) { out.push(cur); cur = b } else cur += `\n\n${b}`
  }
  out.push(cur)
  return out
}

export async function taskDigest(sql: Sql): Promise<void> {
  if (!TOKEN || !CHAT_ID) return
  const { day, hour } = tashkentNow()
  if (hour < HOUR) return
  try {
    const [last] = await sql<{ value: string | null }[]>`select value from amo_sync_state where key = 'tasks_digest_date'`
    if (last?.value === day) return

    const rows = await sql<Row[]>`
      select t.title, t.due_date::text as due, coalesce(p.full_name, t.assignee_name) as owner,
             nullif(btrim(p.telegram), '') as telegram, e.name as event
      from tasks t
      left join profiles p on p.id = t.assignee_id
      left join events e on e.id = t.event_id
      where t.status in ('todo', 'in_progress') and t.due_date <= ${day}::date + 1
      order by owner nulls last, t.due_date, t.sort_order`
    if (rows.length) for (const text of buildDigest(rows, day)) await send(text)

    await sql`insert into amo_sync_state (key, value, updated_at) values ('tasks_digest_date', ${day}, now())
              on conflict (key) do update set value = excluded.value, updated_at = now()`
    console.log(`[tasks] ${day}: eslatma — ${rows.length} ta vazifa`)
  } catch (err) {
    console.error(`[tasks] eslatma: ${err instanceof Error ? err.message : String(err)}`)
  }
}
