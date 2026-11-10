// A missed call nobody returned in 2 hours (migration 087) → one message to the groups with
// telegram_groups.missed_calls on (Sozlamalar → Integratsiyalar). Checked every minute;
// crm_calls.missed_alerted_at makes it once per call. Sent only 9:00–21:00 Tashkent: what
// falls due at night goes out at 9:00.

import type { Sql } from "postgres"
import { chatsFor } from "./groups"

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ""
const BITIM_URL = "https://app.fikryetakchilari.uz/sotuv/bitim/"

export interface MissedRow {
  phone: string; client_name: string | null; lead_id: string | null
  owner: string | null; telegram: string | null; calls: number; last_missed: Date
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const clock = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", minute: "2-digit" }).format(d)
export const tashkentHour = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", hourCycle: "h23" }).format(d))
export const isSendingHour = (d: Date) => { const h = tashkentHour(d); return h >= 9 && h < 21 }

export function missedCallText(r: MissedRow): string {
  // A bitim opened by a call is named by the phone: don't show the number twice
  const name = r.client_name && r.client_name.replace(/\D/g, "") !== r.phone.replace(/\D/g, "") ? r.client_name : null
  const owner = r.telegram ? (r.telegram.startsWith("@") ? r.telegram : `@${r.telegram}`) : r.owner
  return [
    "🔴 <b>Javobsiz qo'ng'iroq</b>",
    "2 soat ichida qayta qo'ng'iroq qilinmadi. Shu odamga qo'ng'iroq qiling:",
    "",
    ...(name ? [`👤 ${esc(name)}`] : []),
    `📞 ${esc(r.phone)}`,
    `🕐 ${clock(r.last_missed)}${r.calls > 1 ? ` · ${r.calls} marta` : ""}`,
    `Mas'ul: ${owner ? esc(owner) : "belgilanmagan"}`,
    ...(r.lead_id ? ["", `<a href="${BITIM_URL}${r.lead_id}">Bitimni ochish</a>`] : []),
  ].join("\n")
}

async function send(chat: string, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true }),
  })
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

let busy = false

async function tick(sql: Sql): Promise<void> {
  if (busy || !isSendingHour(new Date())) return
  busy = true
  try {
    const rows = await sql<MissedRow[]>`select * from public.missed_calls_due()`
    if (!rows.length) return
    const chats = await chatsFor(sql, "missed_calls")
    for (const r of rows) {
      let reached = 0
      for (const chat of chats) {
        try { await send(chat, missedCallText(r)); reached++ }
        catch (err) { console.error(`[missed] ${chat}: ${err instanceof Error ? err.message : err}`) }
      }
      // ponytail: reached no group = retry next minute; a group that did get it may hear it twice then
      if (chats.length && !reached) continue
      // No group switched on = nobody to tell: stamped too, so switching on doesn't replay old calls
      await sql`update crm_calls set missed_alerted_at = now()
                where phone = ${r.phone} and direction = 'in' and talk_time = 0
                  and missed_alerted_at is null and started_at <= ${r.last_missed}`
      if (reached) console.log(`[missed] ${r.phone}: ${reached} guruhga xabar berildi`)
    }
  } catch (err) {
    console.error(`[missed] ${err instanceof Error ? err.message : err}`)
  } finally {
    busy = false
  }
}

// ─── At once, to the seller's own chat (migration 089) ───────────────────────
// Day or night, no 2-hour wait: the seller switched it on in the bot (taskbot.ts → private chat).

export interface DmRow { phone: string; client_name: string | null; lead_id: string | null; owner_id: string | null; calls: number; last_missed: Date }
export interface Subscriber { id: string; chat: string }

/** The bitim's owner if they switched it on, else everyone who did */
export function dmTargets(subs: Subscriber[], ownerId: string | null): Subscriber[] {
  const owner = subs.filter((s) => s.id === ownerId)
  return owner.length ? owner : subs
}

export function missedDmText(r: DmRow): string {
  const name = r.client_name && r.client_name.replace(/\D/g, "") !== r.phone.replace(/\D/g, "") ? r.client_name : null
  return [
    "🔴 <b>Javobsiz qo'ng'iroq</b>",
    "",
    ...(name ? [`👤 ${esc(name)}`] : []),
    `📞 ${esc(r.phone)}`,
    `🕐 ${clock(r.last_missed)}${r.calls > 1 ? ` · ${r.calls} marta` : ""}`,
    ...(r.lead_id ? ["", `<a href="${BITIM_URL}${r.lead_id}">Bitimni ochish</a>`] : []),
  ].join("\n")
}

let dmBusy = false

async function dmTick(sql: Sql): Promise<void> {
  if (dmBusy) return
  dmBusy = true
  try {
    const rows = await sql<DmRow[]>`select * from public.missed_calls_dm()`
    if (!rows.length) return
    const subs = await sql<Subscriber[]>`
      select id, telegram_chat_id::text as chat from profiles
      where missed_dm and telegram_chat_id is not null and coalesce(is_active, true)`
    for (const r of rows) {
      const to = dmTargets(subs, r.owner_id)
      let reached = 0
      for (const s of to) {
        try { await send(s.chat, missedDmText(r)); reached++ }
        catch (err) { console.error(`[missed-dm] ${s.chat}: ${err instanceof Error ? err.message : err}`) }
      }
      // ponytail: same retry rule as the group alert above
      if (to.length && !reached) continue
      await sql`update crm_calls set missed_dm_at = now()
                where phone = ${r.phone} and direction = 'in' and talk_time = 0
                  and missed_dm_at is null and started_at <= ${r.last_missed}`
      if (reached) console.log(`[missed-dm] ${r.phone}: ${reached} kishiga yuborildi`)
    }
  } catch (err) {
    console.error(`[missed-dm] ${err instanceof Error ? err.message : err}`)
  } finally {
    dmBusy = false
  }
}

export function startMissedCalls(sql: Sql): void {
  if (!TOKEN) return
  setInterval(() => void tick(sql), 60_000)
  // PBX history arrives once a minute (pbx.ts); checking twice as often keeps the wait under ~1.5 min
  setInterval(() => void dmTick(sql), 30_000)
  void tick(sql)
  void dmTick(sql)
  console.log("[missed] javobsiz qo'ng'iroq: guruhga 2 soatdan keyin, sotuvchiga darhol")
}
