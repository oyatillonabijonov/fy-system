// Connected company Telegram accounts (migration 100): one live TgPort per active account, the QR sign-in the
// admin runs from Integratsiyalar, and what happens when Telegram ends a session.
import { unlink } from "node:fs/promises"
import type { Sql } from "postgres"
import { mtcutePort, sessionPath, type TgPort } from "./port"
import { handleIncoming, shouldStore } from "./incoming"
import { bucket } from "./storage"

export type LoginState = { state: "wait" } | { state: "qr"; url: string } | { state: "password" } | { state: "done"; title: string } | { state: "error"; message: string }

const LOGIN_TIMEOUT = 5 * 60_000

const ports = new Map<string, TgPort>()
const logins = new Map<string, { state: LoginState; password?: (pw: string) => void }>()

async function botAlert(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.ALERT_CHAT_ID
  if (!token || !chat) return
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text }),
  }).catch(() => {})
}

let cfg: { make: (id: string) => TgPort; alert: (text: string) => Promise<void>; pingMs: number } = { make: mtcutePort, alert: botAlert, pingMs: 5 * 60_000 }
const pings = new Map<string, ReturnType<typeof setInterval>>()
const stopPing = (id: string) => { clearInterval(pings.get(id)); pings.delete(id) }
/** tests swap the Telegram client and the alert sender */
export function configureTg(c: Partial<typeof cfg>): void { cfg = { ...cfg, ...c }; ports.clear(); logins.clear(); for (const id of [...pings.keys()]) stopPing(id) }

export const tgEnabled = () => !!process.env.TELEGRAM_API_ID && !!process.env.TELEGRAM_API_HASH
export const portFor = (id: string) => ports.get(id)
export const loginState = (id: string): LoginState => logins.get(id)?.state ?? { state: "error", message: "Ulanish topilmadi — qaytadan boshlang" }

async function dropSession(id: string): Promise<void> {
  for (const f of [sessionPath(id), `${sessionPath(id)}-wal`, `${sessionPath(id)}-shm`]) await unlink(f).catch(() => {})
}

const log = (e: unknown) => console.error(`[tg] ${e instanceof Error ? e.message : String(e)}`)

/** Telegram ended the session (from the phone, or revoked): logged_out, one alert */
async function lost(sql: Sql, id: string): Promise<void> {
  const port = ports.get(id)
  ports.delete(id)
  stopPing(id)
  const [row] = await sql<{ title: string }[]>`
    update telegram_accounts set status = 'logged_out' where id = ${id} and status <> 'logged_out' returning title`
  await port?.close().catch(() => {})
  await dropSession(id)
  if (row) await cfg.alert(`Telegram akkaunt uzildi: ${row.title} — Integratsiyalar'da qayta ulang`)
}

function attach(sql: Sql, id: string, port: TgPort): void {
  ports.set(id, port)
  let gone = false
  port.onMessage((m) => { if (shouldStore(m)) handleIncoming(sql, id, port, m, bucket).catch(log) })
  port.onReadOutbox((userId, maxId) => {
    sql`select public.tg_read_outbox(c.id, ${maxId}, now()) from tg_chats c where c.account_id = ${id} and c.tg_user_id = ${userId}`.catch(log)
  })
  port.onLoggedOut(() => { if (!gone) { gone = true; lost(sql, id).catch(log) } })
  // mtcute's update loop stops silently when Telegram ends the session; a call every few minutes notices it
  pings.set(id, setInterval(() => { port.ping().catch(() => { /* logged-out fires onLoggedOut; other errors: next time */ }) }, cfg.pingMs))
}

/** On boot: reconnect every active account (Telegram replays what came in while we were down) */
export async function startTgAccounts(sql: Sql): Promise<void> {
  await sql`delete from telegram_accounts where status = 'pending'`
  const rows = await sql<{ id: string }[]>`select id from telegram_accounts where status = 'active' order by created_at`
  for (const { id } of rows) {
    const port = cfg.make(id)
    try {
      if (await port.resume()) attach(sql, id, port)
      else { ports.set(id, port); await lost(sql, id) }
    } catch (e) { log(e) }
  }
  if (rows.length) console.log(`[tg] ${ports.size} ta Telegram akkaunt ulandi`)
}

const loginError = (e: unknown) => {
  const t = e instanceof Error ? e.message : String(e)
  if (t.includes("PASSWORD_HASH_INVALID")) return "Parol noto'g'ri — qaytadan ulang"
  if (t === "timeout") return "Vaqt tugadi — QR kod skanerlanmadi"
  return `Ulanmadi: ${t}`
}

/** Admin pressed "Telegram ulash": a pending account and a QR to scan; the caller polls loginState */
export async function beginLogin(sql: Sql, profileId: string | null, title: string): Promise<string> {
  const [row] = await sql<{ id: string }[]>`insert into telegram_accounts (profile_id, title) values (${profileId}, ${title}) returning id`
  const id = row.id
  const entry: { state: LoginState; password?: (pw: string) => void } = { state: { state: "wait" } }
  logins.set(id, entry)
  const port = cfg.make(id)
  const timer = setTimeout(() => { if (entry.state.state !== "done") fail(new Error("timeout")) }, LOGIN_TIMEOUT)
  const fail = (e: unknown) => {
    clearTimeout(timer)
    entry.state = { state: "error", message: loginError(e) }
    port.close().catch(() => {})
    dropSession(id).catch(() => {})
    sql`delete from telegram_accounts where id = ${id} and status = 'pending'`.catch(log)
  }
  port.start({
    qr: (url) => { entry.state = { state: "qr", url } },
    password: () => new Promise<string>((resolve) => { entry.state = { state: "password" }; entry.password = resolve }),
  }).then(async (me) => {
    clearTimeout(timer)
    await sql`update telegram_accounts set status = 'active', tg_user_id = ${me.id}, phone = ${me.phone}, connected_at = now() where id = ${id}`
    attach(sql, id, port)
    entry.state = { state: "done", title: me.name }
  }, fail)
  return id
}

export function submitPassword(id: string, pw: string): void {
  const e = logins.get(id)
  if (e?.password) { const f = e.password; e.password = undefined; f(pw) }
}

/** Admin pressed "Uzish": end the session on Telegram, keep the history */
export async function logoutAccount(sql: Sql, id: string): Promise<void> {
  const port = ports.get(id)
  ports.delete(id)
  stopPing(id)
  await port?.logout().catch(() => {})
  await port?.close().catch(() => {})
  await dropSession(id)
  await sql`update telegram_accounts set status = 'logged_out' where id = ${id}`
}
