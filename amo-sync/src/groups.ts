// Telegram groups the bot serves (migration 070, Sozlamalar → Integratsiyalar):
// each message kind goes only to the groups with that switch on.

import type { Sql } from "postgres"

export type GroupRole = "payments" | "expenses" | "task_digest" | "task_reminders" | "task_bot"

/** Chat ids with this role switched on (read every time, so a UI change applies at once) */
export async function chatsFor(sql: Sql, role: GroupRole): Promise<string[]> {
  const rows = await sql<{ chat_id: string }[]>`select chat_id::text as chat_id from telegram_groups where ${sql(role)} = true`
  return rows.map((r) => r.chat_id)
}

/** First start after 070: carry the env-configured groups over with the jobs they had */
export async function seedGroups(sql: Sql): Promise<void> {
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from telegram_groups`
  if (n > 0) return
  const pay = process.env.TELEGRAM_CHAT_ID ?? ""
  const tasks = process.env.TELEGRAM_TASKS_CHAT_ID ?? ""
  for (const id of new Set([pay, tasks].filter(Boolean))) {
    const t = id === tasks
    await sql`insert into telegram_groups (chat_id, title, note, payments, task_digest, task_reminders, task_bot)
              values (${id}, 'Asosiy guruh', 'Oldingi sozlamadan ko''chirildi', ${id === pay}, ${t}, ${t}, ${t})
              on conflict do nothing`
  }
}

/** The bot was added to / removed from a chat: list it (all jobs off) or mark its status */
export async function registerChat(sql: Sql, chatId: number, title: string, status: string): Promise<void> {
  if (chatId >= 0) return   // private chats aren't groups
  await sql`insert into telegram_groups (chat_id, title, bot_status) values (${chatId}, ${title}, ${status})
            on conflict (chat_id) do update set title = excluded.title, bot_status = excluded.bot_status, updated_at = now()`
}
