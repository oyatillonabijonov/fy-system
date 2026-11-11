// A lead form request the webhook refused or failed on (094: webhook_logs.error) → one Telegram message to
// the admin alert chat (ALERT_CHAT_ID, the same chat the backup job and the uptime check use), at most every
// 30 minutes. Checked every minute; amo_sync_state 'intake_alert_seen' / 'intake_alert_sent' remember
// where it stopped. The message names counts and reasons only — the bodies stay in the database.

import type { Sql } from "postgres"

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ""
const CHAT = process.env.ALERT_CHAT_ID ?? ""
const GAP_MS = 30 * 60_000

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const clock = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", minute: "2-digit" }).format(d)

export function alertText(a: { n: number; first: Date; sources: string[]; reason: string }): string {
  return [
    "⚠️ <b>Lid formasi: xato bilan qaytgan so'rovlar</b>",
    `${a.n} ta so'rov, birinchisi ${clock(a.first)} da · manba: ${esc(a.sources.join(", "))}`,
    `Sabab: <code>${esc(a.reason.slice(0, 300))}</code>`,
    "Arizalar yo'qolmagan: tanasi bazada (webhook_logs, error ustuni), qo'lda tiklash mumkin.",
  ].join("\n")
}

export function shouldSend(lastSent: Date | null, now: Date): boolean {
  return !lastSent || now.getTime() - lastSent.getTime() >= GAP_MS
}

let busy = false

async function tick(sql: Sql): Promise<void> {
  if (busy) return
  busy = true
  try {
    const state = await sql<{ key: string; value: string }[]>`select key, value from amo_sync_state where key in ('intake_alert_seen', 'intake_alert_sent')`
    const get = (k: string) => state.find((r) => r.key === k)?.value
    const seen = get("intake_alert_seen") ?? new Date().toISOString()
    if (!get("intake_alert_seen")) {   // first start: older failures are history
      await sql`insert into amo_sync_state (key, value) values ('intake_alert_seen', ${seen}) on conflict (key) do nothing`
      return
    }
    const sent = get("intake_alert_sent")
    if (!shouldSend(sent ? new Date(sent) : null, new Date())) return
    const [r] = await sql<{ n: number; first: Date | null; last: string | null; sources: string[] | null; reason: string | null }[]>`
      select count(*)::int as n, min(created_at) as first, max(created_at)::text as last,   -- as text: a JS Date would drop the microseconds and report the last row again
             array_agg(distinct source) as sources, (array_agg(error order by created_at))[1] as reason
      from webhook_logs where error is not null and created_at > ${seen}::timestamptz`
    if (!r || r.n === 0 || !r.first || !r.last) return
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({ chat_id: CHAT, parse_mode: "HTML", text: alertText({ n: r.n, first: r.first, sources: r.sources ?? [], reason: r.reason ?? "" }) }),
    })
    if (!res.ok) throw new Error(`Telegram ${res.status}`)
    await sql`insert into amo_sync_state (key, value) values ('intake_alert_seen', ${r.last}), ('intake_alert_sent', ${new Date().toISOString()})
              on conflict (key) do update set value = excluded.value, updated_at = now()`
    console.log(`[intake-alert] ${r.n} ta xato haqida xabar yuborildi`)
  } finally {
    busy = false
  }
}

export function startIntakeAlert(sql: Sql): void {
  if (!TOKEN || !CHAT) { console.log("[intake-alert] TELEGRAM_BOT_TOKEN/ALERT_CHAT_ID yo'q — ogohlantirish o'chiq"); return }
  setInterval(() => void tick(sql).catch((e) => console.error(`[intake-alert] ${e instanceof Error ? e.message : e}`)), 60_000)
  console.log("[intake-alert] lid formasi xatolari kuzatiladi")
}
