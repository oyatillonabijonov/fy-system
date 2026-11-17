// A message in the company Telegram account → tg_chats / tg_messages (rules in tg_link_chat, migration 100).
import type { Sql } from "postgres"
import type { TgIncoming, TgPort } from "./port"
import { safeName, type FileStore } from "./storage"

const MAX_FILE = 20 * 1024 * 1024

/** Private chats with people; groups, channels, bots and service messages are never stored */
export const shouldStore = (m: TgIncoming) => m.isPrivate && !m.isBot && !m.isService

export async function handleIncoming(sql: Sql, accountId: string, port: TgPort, m: TgIncoming, store: FileStore): Promise<void> {
  const p = m.peer
  const [chat] = await sql<{ id: string | null }[]>`
    select public.tg_link_chat(${accountId}, ${p.userId}, ${p.accessHash}, ${p.username}, ${p.title}, ${p.phone}) as id`
  if (!chat?.id) return

  let text = m.text
  const files: { path: string; name: string; mime: string; size: number }[] = []
  if (m.media) {
    if (m.media.size > MAX_FILE) {
      text = [text, `📎 Fayl Telegramda (${Math.round(m.media.size / 1048576)} MB)`].filter(Boolean).join("\n")
    } else {
      const data = await port.download(m)
      if (data) {
        const path = `in/${chat.id}/${m.msgId}-${safeName(m.media.name)}`
        await store.put(path, data, m.media.mime)
        files.push({ path, name: m.media.name, mime: m.media.mime, size: m.media.size || data.length })
      }
    }
  }
  await sql`select public.tg_log_message(${chat.id}, ${m.msgId}, ${m.out ? "out" : "in"}, ${text}, ${JSON.stringify(files)}::jsonb, ${null}, ${null}, ${m.date})`
}
