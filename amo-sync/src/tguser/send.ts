// A seller sends to a bitim's client from the ERP (migration 100): which account and chat is decided by
// tg_send_target / tg_create_chat; here the blanks are filled, files fetched, Telegram called, the message logged.
import type { Sql } from "postgres"
import { portFor } from "./accounts"
import { TgError, type TgFile, type TgPeer } from "./port"
import { bucket } from "./storage"

export type SendFile = { path: string; name: string; mime: string }
export type SendBody = { lead_id: string; text: string; template_id?: string | null; files?: SendFile[] }

const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"]
const CAPTION_MAX = 1024

export const uzDate = (d: string | null) => {
  const m = d?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${Number(m[3])}-${MONTHS[Number(m[2]) - 1]}` : ""
}

/** {ism} = the client's first name, {tadbir} / {sana} = the voronka's event; other braces stay as typed */
export const fillBlanks = (text: string, v: { ism: string; tadbir: string; sana: string }) =>
  text.replace(/\{(ism|tadbir|sana)\}/g, (_, k: "ism" | "tadbir" | "sana") => v[k])

/** Database refusals raised as plain codes (tg_cap, tg_not_found, tg_no_account) → TgError */
const fromDb = (e: unknown) => (e instanceof Error && /^tg_[a-z_]+$/.test(e.message) ? new TgError(e.message) : e)

type Store = { get(path: string): Promise<Uint8Array> }

export async function sendToLead(sql: Sql, uid: string | null, body: SendBody, store: Store = bucket): Promise<void> {
  const text0 = (body.text ?? "").trim()
  const files = [...(body.files ?? [])]
  if (files.some((f) => !/^(out|templates)\/[^]+$/.test(f.path) || f.path.includes(".."))) throw new TgError("tg_bad_file")

  let templateId: string | null = null
  if (body.template_id) {
    const [t] = await sql<{ files: SendFile[] }[]>`select files from tg_templates where id = ${body.template_id}`
    if (t) { templateId = body.template_id; files.unshift(...t.files) }
  }
  if (!text0 && !files.length) throw new TgError("tg_empty")

  const [target] = await sql<{ account_id: string; chat_id: string | null; tg_user_id: number | null; access_hash: string | null; phone: string | null }[]>`
    select * from public.tg_send_target(${body.lead_id})`.catch((e: unknown) => { throw fromDb(e) })
  const port = portFor(target.account_id)
  if (!port) throw new TgError("tg_logged_out")

  let chatId = target.chat_id
  let opened = false
  let peer: TgPeer
  if (chatId && target.tg_user_id) {
    peer = { userId: Number(target.tg_user_id), accessHash: target.access_hash ?? "", username: null, title: "", phone: target.phone }
  } else {
    const found = await port.resolvePhone(target.phone ?? "")
    if (!found) throw new TgError("tg_not_found")
    peer = found
    const [c] = await sql<{ id: string }[]>`
      select public.tg_create_chat(${target.account_id}, ${body.lead_id}, ${found.userId}, ${found.accessHash}, ${found.username}, ${found.title}) as id`
      .catch((e: unknown) => { throw fromDb(e) })
    chatId = c.id
    opened = true
  }

  const [v] = await sql<{ client_name: string | null; event_name: string | null; event_date: string | null }[]>`
    select c.full_name as client_name, e.name as event_name, e.date::text as event_date
    from crm_leads l left join clients c on c.id = l.client_id
    left join crm_pipelines p on p.id = l.pipeline_id left join events e on e.id = p.event_id
    where l.id = ${body.lead_id}`
  const text = fillBlanks(text0, { ism: (v?.client_name ?? "").trim().split(/\s+/)[0] ?? "", tadbir: v?.event_name ?? "", sana: uzDate(v?.event_date ?? null) })

  const log = (msgId: number, t: string, f: (SendFile & { size: number })[]) =>
    sql`select public.tg_log_message(${chatId}, ${msgId}, ${"out"}, ${t}, ${sql.json(f)}, ${uid}, ${templateId}, ${new Date()})`

  try {
    await deliver(text)
  } catch (e) {
    // the first message never left: no empty chat, and its place in today's 30 is given back
    if (opened) await sql`delete from tg_chats where id = ${chatId} and not exists (select 1 from tg_messages m where m.chat_id = tg_chats.id)`.catch(() => {})
    throw e
  }

  async function deliver(text: string): Promise<void> {
  if (!files.length) { await log(await port!.sendText(peer, text), text, []); return }

  const loaded: TgFile[] = await Promise.all(files.map(async (f) => ({ name: f.name, mime: f.mime, data: await store.get(f.path) })))
  const meta = files.map((f, i) => ({ ...f, size: loaded[i].data.length }))
  if (text.length > CAPTION_MAX) {
    await log(await port!.sendText(peer, text), text, [])
    const [first] = await port!.sendFiles(peer, loaded, "")
    await log(first, "", meta)
  } else {
    const [first] = await port!.sendFiles(peer, loaded, text)
    await log(first, text, meta)
  }
  }
}

/** The seller opened the Telegram tab: mark the lead's chats read on Telegram (they see ✓✓) and here */
export async function readLead(sql: Sql, leadId: string): Promise<void> {
  const chats = await sql<{ account_id: string; tg_user_id: number; access_hash: string }[]>`
    select account_id, tg_user_id, access_hash from tg_chats where lead_id = ${leadId} and unread > 0`
  for (const c of chats) {
    await portFor(c.account_id)?.readHistory({ userId: Number(c.tg_user_id), accessHash: c.access_hash, username: null, title: "", phone: null }).catch(() => {})
  }
  await sql`select public.tg_read(${leadId})`
}

/** The seller opened the client's chat (window or inbox): every unread chat of that client is read on Telegram
 *  (they see ✓✓) and here — by client, so a chat whose bitim was deleted or merged still clears */
export async function readClient(sql: Sql, clientId: string): Promise<void> {
  const chats = await sql<{ id: string; account_id: string; tg_user_id: number; access_hash: string }[]>`
    select id, account_id, tg_user_id, access_hash from tg_chats where client_id = ${clientId} and unread > 0`
  if (!chats.length) return
  for (const c of chats) {
    await portFor(c.account_id)?.readHistory({ userId: Number(c.tg_user_id), accessHash: c.access_hash, username: null, title: "", phone: null }).catch(() => {})
  }
  await sql`update tg_chats set unread = 0 where id = any(${chats.map((c) => c.id)}::uuid[])`
}
