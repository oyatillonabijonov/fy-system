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
  "assignee:assignee_id(full_name, avatar_url), event:event_id(name), task_comments(count)"

type TaskRow = Omit<Task, "comments_count"> & { task_comments: { count: number }[] }
const toTask = (r: TaskRow): Task => ({ ...r, comments_count: r.task_comments?.[0]?.count ?? 0 })

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
