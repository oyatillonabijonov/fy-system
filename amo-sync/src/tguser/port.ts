// The company Telegram account (MTProto user client, migration 100). This is the only file that imports mtcute;
// everything else talks to the small TgPort interface, so it can be tested with a fake.
import { TelegramClient, InputMedia, FileLocation, tl, type Message, type User } from "@mtcute/bun"

export type TgPeer = { userId: number; accessHash: string; username: string | null; title: string; phone: string | null }
export type TgMedia = { name: string; mime: string; size: number }
export type TgIncoming = {
  peer: TgPeer; msgId: number; out: boolean; isBot: boolean; isPrivate: boolean; isService: boolean
  text: string; media: TgMedia | null; date: Date
}
export type TgFile = { name: string; mime: string; data: Uint8Array }

export interface TgPort {
  /** QR sign-in; resolves with the signed-in account */
  start(h: { qr(url: string, expires: Date): void; password(): Promise<string> }): Promise<{ id: number; name: string; phone: string | null }>
  /** reconnect a saved session; false = the session is gone */
  resume(): Promise<boolean>
  onMessage(cb: (m: TgIncoming) => void): void
  onReadOutbox(cb: (userId: number, maxId: number) => void): void
  onLoggedOut(cb: () => void): void
  resolvePhone(phone: string): Promise<TgPeer | null>
  sendText(peer: TgPeer, text: string): Promise<number>
  sendFiles(peer: TgPeer, files: TgFile[], caption: string): Promise<number[]>
  download(m: TgIncoming): Promise<Uint8Array | null>
  readHistory(peer: TgPeer): Promise<void>
  logout(): Promise<void>
  close(): Promise<void>
}

/** A Telegram refusal the seller sees in Uzbek (web: TG_ERRORS) */
export class TgError extends Error {
  constructor(readonly code: string, readonly seconds = 0) { super(code) }
}

export const sessionPath = (accountId: string) => `${process.env.TG_DATA_DIR ?? "/data"}/tg-${accountId}.session`

const LOGGED_OUT = ["AUTH_KEY_UNREGISTERED", "SESSION_REVOKED", "USER_DEACTIVATED", "USER_DEACTIVATED_BAN", "AUTH_KEY_DUPLICATED"]

/** mtcute errors → TgError (flood → seconds to wait) */
export function mapError(e: unknown): unknown {
  if (tl.RpcError.is(e)) {
    if (e.text === "FLOOD_WAIT_%d" || e.code === 420) return new TgError("tg_flood", (e as unknown as { seconds?: number }).seconds ?? 0)
    if (LOGGED_OUT.includes(e.text)) return new TgError("tg_logged_out")
    if (e.text === "PHONE_NOT_OCCUPIED" || e.text === "USERNAME_NOT_OCCUPIED" || e.text === "PEER_ID_INVALID") return new TgError("tg_not_found")
  }
  return e
}

const peerOf = (u: User): TgPeer => ({
  userId: u.id,
  accessHash: String((u.raw as { accessHash?: unknown }).accessHash ?? ""),
  username: u.username,
  title: u.displayName,
  phone: u.phoneNumber,
})

const mediaOf = (m: Message): TgMedia | null => {
  const md = m.media
  if (!md || !(md instanceof FileLocation)) return null   // location, poll, dice…: no file
  const f = md as unknown as { fileName?: string | null; mimeType?: string; fileSize?: number }
  const ext = md.type === "photo" ? "jpg" : (f.mimeType?.split("/")[1] ?? "bin")
  return { name: f.fileName || `${md.type}.${ext}`, mime: md.type === "photo" ? "image/jpeg" : (f.mimeType ?? "application/octet-stream"), size: f.fileSize ?? 0 }
}

export function mtcutePort(accountId: string): TgPort {
  const tg = new TelegramClient({ apiId: Number(process.env.TELEGRAM_API_ID), apiHash: process.env.TELEGRAM_API_HASH ?? "", storage: sessionPath(accountId) })
  const loggedOut: (() => void)[] = []
  const lost = () => loggedOut.forEach((cb) => cb())
  tg.onError.add((e) => { if (mapError(e) instanceof TgError && (mapError(e) as TgError).code === "tg_logged_out") lost() })
  const call = async <T>(fn: () => Promise<T>): Promise<T> => {
    try { return await fn() } catch (e) {
      const m = mapError(e)
      if (m instanceof TgError && m.code === "tg_logged_out") lost()
      throw m
    }
  }
  const msgs = new Map<string, Message>()   // incoming kept briefly so download() can fetch the file
  const input = (p: TgPeer) => p.userId

  return {
    async start(h) {
      const me = await tg.start({ qrCodeHandler: h.qr, password: h.password })
      return { id: me.id, name: me.displayName, phone: me.phoneNumber }
    },
    async resume() {
      try { await tg.start({}); return true } catch (e) { const m = mapError(e); if (m instanceof TgError && m.code === "tg_logged_out") return false; throw e }
    },
    onMessage(cb) {
      tg.onNewMessage.add((m) => {
        const s = m.chat
        const user = s.type === "user" ? (s as User) : null
        const key = `${s.id}:${m.id}`
        msgs.set(key, m)
        setTimeout(() => msgs.delete(key), 10 * 60_000)
        cb({
          peer: user ? peerOf(user) : { userId: s.id, accessHash: "", username: null, title: s.displayName, phone: null },
          msgId: m.id, out: m.isOutgoing, isBot: user?.isBot ?? false, isPrivate: s.type === "user", isService: m.isService,
          text: m.text, media: mediaOf(m), date: m.date,
        })
      })
    },
    onReadOutbox(cb) { tg.onHistoryRead.add((u) => { if (u.isOutbox) cb(u.chatId, u.maxReadId) }) },
    onLoggedOut(cb) { loggedOut.push(cb) },
    async resolvePhone(phone) {
      return call(async () => {
        try {
          await tg.resolvePhoneNumber(phone.replace(/^\+/, ""))
        } catch (e) {
          const m = mapError(e)
          if (m instanceof TgError && m.code === "tg_not_found") return null
          throw e
        }
        const [u] = await tg.getUsers(phone.replace(/^\+/, ""))
        return u ? peerOf(u) : null
      })
    },
    sendText: (peer, text) => call(async () => (await tg.sendText(input(peer), text)).id),
    sendFiles: (peer, files, caption) => call(async () => {
      const media = files.map((f, i) => InputMedia.document(f.data, { fileName: f.name, fileMime: f.mime, caption: i === 0 ? caption : undefined }))
      if (media.length === 1) return [(await tg.sendMedia(input(peer), media[0])).id]
      return (await tg.sendMediaGroup(input(peer), media)).map((m) => m.id)
    }),
    async download(m) {
      const msg = msgs.get(`${m.peer.userId}:${m.msgId}`)
      const md = msg?.media
      if (!(md instanceof FileLocation)) return null
      return call(() => tg.downloadAsBuffer(md))
    },
    readHistory: (peer) => call(() => tg.readHistory(input(peer))),
    async logout() { await tg.logOut().catch(() => {}) },
    async close() { await tg.destroy() },
  }
}
