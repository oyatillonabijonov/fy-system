import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase } from "../client"

// ponytail: untyped client until `bun run gen:types` picks up migration 066
// (same trick as tariffs.ts); drop the cast once types.ts is regenerated.
const db = supabase as unknown as SupabaseClient

export type TaskStatus = "todo" | "in_progress" | "done" | "failed"

export const TASK_STATUSES: { id: TaskStatus; label: string }[] = [
  { id: "todo", label: "Boshlanmagan" },
  { id: "in_progress", label: "Jarayonda" },
  { id: "done", label: "Bajarildi" },
  { id: "failed", label: "Bajarilmadi" },
]

export interface Task {
  id: string
  event_id: string | null        // null = "Umumiy"
  section: string | null         // bo'lim
  title: string
  status: TaskStatus
  assignee_id: string | null     // staff owner…
  assignee_name: string | null   // …or an outside person ("Hikmat aka")
  due_date: string | null        // YYYY-MM-DD
  due_time: string | null        // HH:MM:SS, Tashkent, only with due_date (067)
  sort_order: number
  created_by: string | null
  created_at: string
  completed_at: string | null
  assignee: { full_name: string; avatar_url: string | null } | null
  event: { name: string } | null
  comments_count: number
  attachments_count: number      // yo'riqnoma (071)
}

export interface TaskComment {
  id: string
  body: string
  created_at: string
  author_id: string | null
  author: { full_name: string; avatar_url: string | null } | null
}

export type TaskDraft = Pick<Task, "event_id" | "section" | "title" | "status" | "assignee_id" | "assignee_name" | "due_date" | "due_time">

const SELECT =
  "id, event_id, section, title, status, assignee_id, assignee_name, due_date, due_time, sort_order, created_by, created_at, completed_at, " +
  "assignee:assignee_id(full_name, avatar_url), event:event_id(name), task_comments(count), task_attachments(count)"

type TaskRow = Omit<Task, "comments_count" | "attachments_count"> & { task_comments: { count: number }[]; task_attachments: { count: number }[] }
const toTask = ({ task_comments, task_attachments, ...r }: TaskRow): Task =>
  ({ ...r, comments_count: task_comments?.[0]?.count ?? 0, attachments_count: task_attachments?.[0]?.count ?? 0 })

/** Tasks of one event, or the general ones (eventId null) */
export async function getEventTasks(eventId: string | null): Promise<Task[]> {
  let q = db.from("tasks").select(SELECT).order("sort_order").order("created_at")
  q = eventId ? q.eq("event_id", eventId) : q.is("event_id", null)
  const { data, error } = await q
  if (error) throw error
  return ((data ?? []) as unknown as TaskRow[]).map(toTask)
}

/** Task counts per event ("umumiy" = no event) for the filter tabs: total and still open */
export async function getTaskCounts(): Promise<Record<string, { total: number; open: number }>> {
  // ponytail: counts rows client-side; a SQL group-by once there are thousands of tasks
  const { data, error } = await db.from("tasks").select("event_id, status")
  if (error) throw error
  const out: Record<string, { total: number; open: number }> = {}
  for (const r of (data ?? []) as { event_id: string | null; status: TaskStatus }[]) {
    const c = (out[r.event_id ?? "umumiy"] ??= { total: 0, open: 0 })
    c.total++
    if (r.status === "todo" || r.status === "in_progress") c.open++
  }
  return out
}

/** Open tasks of one person across all events ("Mening vazifalarim") */
export async function getMyTasks(userId: string): Promise<Task[]> {
  const { data, error } = await db
    .from("tasks")
    .select(SELECT)
    .eq("assignee_id", userId)
    .in("status", ["todo", "in_progress"])
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("due_time", { ascending: true, nullsFirst: false })
  if (error) throw error
  return ((data ?? []) as unknown as TaskRow[]).map(toTask)
}

export async function createTask(draft: TaskDraft & { sort_order: number }): Promise<void> {
  const { error } = await db.from("tasks").insert(draft)
  if (error) throw error
}

export async function updateTask(id: string, patch: Partial<TaskDraft>): Promise<void> {
  const { error } = await db.from("tasks").update(patch).eq("id", id)
  if (error) throw error
}

export async function deleteTask(id: string): Promise<void> {
  const { data, error } = await db.from("tasks").delete().eq("id", id).select("id")
  if (error) throw error
  // RLS turns a forbidden delete into "0 rows", not an error
  if (!data?.length) throw new Error("Vazifani faqat uni yaratgan hodim yoki administrator o'chira oladi")
}

export async function copyEventTasks(fromEventId: string, toEventId: string): Promise<number> {
  const { data, error } = await db.rpc("copy_event_tasks", { p_from: fromEventId, p_to: toEventId })
  if (error) throw error
  return data as number
}

export async function getTaskComments(taskId: string): Promise<TaskComment[]> {
  const { data, error } = await db
    .from("task_comments")
    .select("id, body, created_at, author_id, author:author_id(full_name, avatar_url)")
    .eq("task_id", taskId)
    .order("created_at")
  if (error) throw error
  return (data ?? []) as unknown as TaskComment[]
}

export async function addTaskComment(taskId: string, body: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await db.from("task_comments").insert({ task_id: taskId, body: body.trim(), author_id: user?.id })
  if (error) throw error
}

// ─── Yo'riqnoma (071): a link or a file on a task ───────────────────────────

export interface TaskAttachment {
  id: string
  title: string
  url: string | null
  file_path: string | null
  file_size: number | null
  created_by: string | null
  created_at: string
}

export const ATTACH_MAX = 10 * 1024 * 1024
export const ATTACH_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx"

export async function getTaskAttachments(taskId: string): Promise<TaskAttachment[]> {
  const { data, error } = await db.from("task_attachments")
    .select("id, title, url, file_path, file_size, created_by, created_at").eq("task_id", taskId).order("created_at")
  if (error) throw error
  return (data ?? []) as TaskAttachment[]
}

export async function addTaskLink(taskId: string, url: string, title: string): Promise<void> {
  const clean = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`
  const { error } = await db.from("task_attachments").insert({ task_id: taskId, url: clean, title: title.trim() || new URL(clean).hostname.replace(/^www\./, "") })
  if (error) throw error
}

/** Upload to the private task-files bucket, then add the row */
export async function addTaskFile(taskId: string, file: File): Promise<void> {
  if (file.size > ATTACH_MAX) throw new Error("Fayl 10 MB dan katta")
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "bin"
  const path = `${taskId}/${crypto.randomUUID()}.${ext}`
  const up = await supabase.storage.from("task-files").upload(path, file, { contentType: file.type || undefined })
  if (up.error) throw up.error
  const { error } = await db.from("task_attachments").insert({ task_id: taskId, file_path: path, file_size: file.size, title: file.name })
  if (error) throw error
}

export async function deleteTaskAttachment(id: string): Promise<void> {
  const { error } = await db.from("task_attachments").delete().eq("id", id)
  if (error) throw error
}

/** A 5-minute link to open a private file */
export async function taskFileUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("task-files").createSignedUrl(path, 300)
  if (error) throw error
  return data.signedUrl
}
