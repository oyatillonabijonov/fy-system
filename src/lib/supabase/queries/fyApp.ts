// The FY members' app (migration 105): events with show_in_app are pushed by amo-sync; the browser
// reads the push status through PostgREST and talks to the app only through the worker (/hooks/fy/*),
// so the app's admin key never reaches it.
import { config } from "@/lib/config"
import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase } from "../client"

// ponytail: untyped client until `bun run gen:types` picks up migration 105
const db = supabase as unknown as SupabaseClient

/** The app's own category list (its events.category) */
export const APP_CATEGORIES = ["Nonushta", "Master-klass", "Safari", "Networking"] as const

export type FyRegistration = { name: string; phone: string; status: "registered" | "applied"; createdAt: string }
export type FyPush = { status: "pending" | "sent" | "failed"; response: string | null; sent_at: string | null; created_at: string }

const ERRORS: Record<string, string> = {
  fy_off: "Ilova ulanmagan", forbidden: "Ruxsat yo'q", fy_error: "Ilova javob bermadi", bad_request: "Ma'lumot noto'g'ri",
}

async function fyHook<T>(path: string, body?: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${config.apiUrl}/hooks/fy/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${session?.access_token ?? ""}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as { error?: string } & T
  if (!res.ok) throw new Error(ERRORS[json.error ?? ""] ?? `HTTP ${res.status}`)
  return json
}

/** The app's own numbers; null until it serves GET /admin/stats */
export type FyStats = { members: number; newMembers7d: number }
export type FyOverview = { stats: FyStats | null; registrations: Record<string, FyRegistration[] | null> }
export type FyAnnouncement = { id: number; text: string; sent: number; created_at: string; author: { full_name: string } | null }

export const getFyOverview = () => fyHook<FyOverview>("overview")
export const getFyRegistrations = (eventId: string) => fyHook<FyRegistration[]>(`registrations/${eventId}`)

export async function getFyAnnouncements(): Promise<FyAnnouncement[]> {
  const { data, error } = await db.from("fy_app_announcements").select("id, text, sent, created_at, author:created_by(full_name)")
    .order("id", { ascending: false }).limit(8)
  if (error) throw error
  return data as unknown as FyAnnouncement[]
}

/** The latest push of every event at once (the Ilova page's status column) */
export async function getFyPushes(): Promise<Record<string, FyPush>> {
  const { data, error } = await db.from("fy_app_outbox").select("event_id, status, response, sent_at, created_at")
    .eq("kind", "event").order("id", { ascending: false }).limit(300)
  if (error) throw error
  const out: Record<string, FyPush> = {}
  for (const r of data as (FyPush & { event_id: string })[]) out[r.event_id] ??= r
  return out
}
export const sendFyAnnouncement = (text: string, href: string) => fyHook<{ sent: number }>("announce", { text, href })

/** The latest push of the event itself (null = never queued) */
export async function getFyPush(eventId: string): Promise<FyPush | null> {
  const { data, error } = await db.from("fy_app_outbox").select("status, response, sent_at, created_at")
    .eq("event_id", eventId).eq("kind", "event").order("id", { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data as FyPush | null
}

/** Public URL of a new cover in event-covers (the app shows it as is) */
export async function uploadEventCover(eventId: string, file: File): Promise<string> {
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"
  const path = `${eventId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from("event-covers").upload(path, file, { contentType: file.type })
  if (error) throw error
  return supabase.storage.from("event-covers").getPublicUrl(path).data.publicUrl
}
