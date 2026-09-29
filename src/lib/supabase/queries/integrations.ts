import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase } from "../client"

// ponytail: untyped client until `bun run gen:types` picks up migration 070
const db = supabase as unknown as SupabaseClient

/** What the bot does in a group — one switch per message kind (migration 070) */
export type GroupRole = "payments" | "expenses" | "task_digest" | "task_reminders" | "task_bot"

export const GROUP_ROLES: { id: GroupRole; label: string; short: string; desc: string }[] = [
  { id: "payments", label: "To'lov cheklari", short: "To'lovlar", desc: "Kirim, qaytarish, bekor qilish va keshbek cheklari" },
  { id: "expenses", label: "Xarajat cheklari", short: "Xarajatlar", desc: "Yangi va bekor qilingan chiqimlar cheki" },
  { id: "task_digest", label: "Ertalabki hisobot", short: "Hisobot 9:00", desc: "Har kuni 9:00 da vazifalar holati" },
  { id: "task_reminders", label: "Muddat eslatmalari", short: "Eslatmalar", desc: "1 soat oldin, vaqtida va kechikkanda — mas'ul belgilanadi" },
  { id: "task_bot", label: "Chatdan vazifa", short: "Chatdan vazifa", desc: "@bot yoki /vazifa bilan yozilgan xabar vazifa bo'ladi" },
]

export type TelegramGroup = {
  chat_id: number
  title: string
  note: string
  bot_status: string | null
  created_at: string
} & Record<GroupRole, boolean>

export async function getTelegramGroups(): Promise<TelegramGroup[]> {
  const { data, error } = await db.from("telegram_groups").select("*").order("created_at")
  if (error) throw error
  return data as TelegramGroup[]
}

export async function addTelegramGroup(g: { chat_id: number; title: string; note: string }): Promise<void> {
  const { error } = await db.from("telegram_groups").insert(g)
  if (error) throw error.code === "23505" ? new Error("Bu guruh allaqachon ro'yxatda") : error
}

export async function updateTelegramGroup(chatId: number, patch: Partial<TelegramGroup>): Promise<void> {
  const { error } = await db.from("telegram_groups").update({ ...patch, updated_at: new Date().toISOString() }).eq("chat_id", chatId)
  if (error) throw error
}

export async function deleteTelegramGroup(chatId: number): Promise<void> {
  const { error } = await db.from("telegram_groups").delete().eq("chat_id", chatId)
  if (error) throw error
}
