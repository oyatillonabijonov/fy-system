// Telegram widget (migration 100): reads through PostgREST + RLS, writes through the worker (/hooks/tg/*).
import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase } from "../client"
import { tgErrorText } from "@/lib/telegram"

// ponytail: untyped client until `bun run gen:types` picks up migration 100
const db = supabase as unknown as SupabaseClient

export type TgFileRef = { path: string; name: string; mime: string; size?: number }
export type TgAccount = { id: string; title: string; phone: string | null; status: "pending" | "active" | "logged_out"; profile_id: string | null; connected_at: string | null; owner: { full_name: string } | null }
export type TgChat = { id: string; account_id: string; lead_id: string | null; title: string; username: string | null; unread: number; last_message_at: string | null }
export type TgMessage = { id: string; chat_id: string; direction: "in" | "out"; text: string; files: TgFileRef[]; read_at: string | null; created_at: string; sender: { full_name: string } | null }
export type TgTemplate = { id: string; title: string; body: string; files: TgFileRef[]; sort: number }
export type TgUnread = { lead_id: string; unread: number; title: string; last_message_at: string | null; lead: { name: string | null; responsible_user_id: string | null } | null }
export type LoginState = { state: "wait" } | { state: "qr"; url: string } | { state: "password" } | { state: "done"; title: string } | { state: "error"; message: string }

/** The worker; a refusal becomes an Error with the Uzbek text */
export async function tgHook<T>(path: string, body?: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${(import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, "")}/hooks/tg/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${session?.access_token ?? ""}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as { error?: string; seconds?: number } & T
  if (!res.ok) throw new Error(json.error ? tgErrorText(json.error, json.seconds) : `HTTP ${res.status}`)
  return json
}

export async function getLeadTelegram(leadId: string): Promise<{ chats: TgChat[]; messages: TgMessage[] }> {
  const { data: chats, error } = await db.from("tg_chats").select("id, account_id, lead_id, title, username, unread, last_message_at").eq("lead_id", leadId)
  if (error) throw error
  const ids = (chats as TgChat[]).map((c) => c.id)
  if (!ids.length) return { chats: [], messages: [] }
  const { data: messages, error: e2 } = await db.from("tg_messages")
    .select("id, chat_id, direction, text, files, read_at, created_at, sender:sent_by(full_name)").in("chat_id", ids).order("created_at")
  if (e2) throw e2
  return { chats: chats as TgChat[], messages: messages as unknown as TgMessage[] }
}

/** Chats waiting for an answer (unread), with their bitim's owner — the caller filters to "mine or unowned" */
export async function getTgUnread(): Promise<TgUnread[]> {
  const { data, error } = await db.from("tg_chats").select("lead_id, unread, title, last_message_at, lead:lead_id(name, responsible_user_id)")
    .gt("unread", 0).not("lead_id", "is", null).order("last_message_at", { ascending: false })
  if (error) throw error
  return data as unknown as TgUnread[]
}

export async function getTgAccounts(): Promise<TgAccount[]> {
  const { data, error } = await db.from("telegram_accounts").select("id, title, phone, status, profile_id, connected_at, owner:profile_id(full_name)")
    .neq("status", "pending").order("created_at")
  if (error) throw error
  return data as unknown as TgAccount[]
}

export async function getTgTemplates(): Promise<TgTemplate[]> {
  const { data, error } = await db.from("tg_templates").select("id, title, body, files, sort").order("sort").order("created_at")
  if (error) throw error
  return data as TgTemplate[]
}

export async function saveTgTemplate(t: Omit<TgTemplate, "id"> & { id?: string }): Promise<void> {
  const row = { title: t.title.trim(), body: t.body, files: t.files, sort: t.sort, updated_at: new Date().toISOString() }
  const { error } = t.id ? await db.from("tg_templates").update(row).eq("id", t.id) : await db.from("tg_templates").insert(row)
  if (error) throw error
}

export async function deleteTgTemplate(id: string): Promise<void> {
  const { error } = await db.from("tg_templates").delete().eq("id", id)
  if (error) throw error
}

/** A file for a template or a message → the private bucket; returns the reference to send */
export async function uploadTgFile(folder: string, file: File): Promise<TgFileRef> {
  const safe = file.name.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(-80) || "fayl"
  const path = `${folder}/${crypto.randomUUID().slice(0, 8)}-${safe}`
  const { error } = await supabase.storage.from("telegram-files").upload(path, file, { contentType: file.type || "application/octet-stream" })
  if (error) throw error
  return { path, name: file.name, mime: file.type || "application/octet-stream", size: file.size }
}

export async function tgFileUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("telegram-files").createSignedUrl(path, 300)
  if (error) throw error
  return data.signedUrl
}
