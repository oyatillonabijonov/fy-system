// Telegram receipts: drains public.telegram_outbox (migration 060) into a group.
// Woken by pg_notify on every queued row, plus a 30 s poll as a safety net.
// Disabled (queue just waits) until TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set.

import type { Sql } from "postgres"
import { renderReceipt, receiptCaption, type ReceiptData, type ReceiptKind } from "./receipt"

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ""
const CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? ""
const MAX_ATTEMPTS = 5

interface OutboxRow { id: number; kind: ReceiptKind; payment_id: string | null; cashback_id: string | null }

interface DetailRow {
  ref: string; participant: string; amount: string; at: Date; method: string | null; staff: string | null; reason: string | null
  client: string; phone: string | null; event: string; price: string; paid: string; no_show: boolean
}

/** Paid by participant `ep` at moment `op.t`: live payments then + cashback spent by then */
const paidAt = (sql: Sql) => sql`
  coalesce((select sum(x.amount) from payments x where x.participant_id = ep.id
            and x.created_at <= op.t and (x.voided_at is null or x.voided_at > op.t)), 0)
  + coalesce((select sum(y.amount) from cashback_transactions y where y.participant_id = ep.id
            and y.type = 'used' and y.created_at <= op.t), 0)`

export async function loadReceipt(sql: Sql, row: OutboxRow): Promise<ReceiptData | null> {
  // `paid` is as of this operation, not now — a receipt sent late must still show
  // that moment. Computed in SQL: timestamps lose microseconds in JS Dates.
  const [d] = row.payment_id
    ? await sql<DetailRow[]>`
        with op as (select case when ${row.kind} = 'void' then voided_at else created_at end as t
                    from payments where id = ${row.payment_id})
        select p.id::text as ref, ep.id::text as participant, p.amount, p.method, p.void_reason as reason,
               case when ${row.kind} = 'void' then p.voided_at else p.created_at end as at,
               case when ${row.kind} = 'void' then vb.full_name else rb.full_name end as staff,
               ep.full_name as client, coalesce(ep.phone, c.phone) as phone, e.name as event, ep.price,
               ${paidAt(sql)} as paid, ep.no_show_at is not null as no_show
        from op, payments p
        join event_participants ep on ep.id = p.participant_id
        join events e on e.id = ep.event_id
        left join clients c on c.id = ep.contact_id
        left join profiles rb on rb.id = p.recorded_by
        left join profiles vb on vb.id = p.voided_by
        where p.id = ${row.payment_id}`
    : await sql<DetailRow[]>`
        with op as (select created_at as t from cashback_transactions where id = ${row.cashback_id})
        select t.id::text as ref, ep.id::text as participant, t.amount, t.created_at as at, null as method, null as staff, null as reason,
               ep.full_name as client, coalesce(ep.phone, c.phone) as phone, e.name as event, ep.price,
               ${paidAt(sql)} as paid, false as no_show
        from op, cashback_transactions t
        join event_participants ep on ep.id = t.participant_id
        join events e on e.id = ep.event_id
        left join clients c on c.id = t.client_id
        where t.id = ${row.cashback_id}`
  if (!d) return null
  return {
    kind: row.kind,
    number: d.ref.slice(0, 8).toUpperCase(),
    amount: Math.abs(Number(d.amount)),
    at: new Date(d.at),
    client: d.client,
    phone: d.phone,
    event: d.event,
    method: d.method,
    staff: d.staff,
    // A no-show refund (settle_no_show) says so on the receipt
    reason: row.kind === "void" ? d.reason : row.kind === "refund" && d.no_show ? "Qatnashmadi" : null,
    price: Number(d.price),
    paid: Number(d.paid),
  }
}

async function sendPhoto(png: Uint8Array<ArrayBuffer>, caption: string): Promise<void> {
  const form = new FormData()
  form.append("chat_id", CHAT_ID)
  form.append("caption", caption)
  form.append("photo", new Blob([png], { type: "image/png" }), "chek.png")
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, { method: "POST", body: form })
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

let running = false
let again = false

/** One pass over the queue; overlapping wake-ups collapse into a follow-up pass. */
async function drain(sql: Sql): Promise<void> {
  if (running) { again = true; return }
  running = true
  try {
    do {
      again = false
      // Enabling the bot later must not flood the group with old history
      await sql`update telegram_outbox set sent_at = now(), last_error = 'stale: older than a day'
                where sent_at is null and created_at < now() - interval '1 day'`
      const rows = await sql<OutboxRow[]>`
        select id, kind, payment_id, cashback_id from telegram_outbox
        where sent_at is null and attempts < ${MAX_ATTEMPTS} order by id limit 20`
      for (const row of rows) {
        try {
          const data = await loadReceipt(sql, row)
          if (data) await sendPhoto(renderReceipt(data), receiptCaption(data))
          await sql`update telegram_outbox set sent_at = now(), last_error = ${data ? null : "source row gone"} where id = ${row.id}`
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          await sql`update telegram_outbox set attempts = attempts + 1, last_error = ${msg} where id = ${row.id}`
          console.error(`[telegram] #${row.id}: ${msg}`)
        }
      }
    } while (again)
  } finally {
    running = false
  }
}

export async function startTelegram(sql: Sql): Promise<void> {
  if (!TOKEN || !CHAT_ID) {
    console.log("[telegram] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID yo'q — cheklar navbatda kutadi")
    return
  }
  const wake = () => { drain(sql).catch((e) => console.error(`[telegram] ${e instanceof Error ? e.message : e}`)) }
  await sql.listen("telegram_outbox", wake)
  setInterval(wake, 30_000)
  wake()
  console.log("[telegram] cheklar yoqildi")
}
