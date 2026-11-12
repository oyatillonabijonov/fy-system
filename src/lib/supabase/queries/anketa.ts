import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase } from "../client"
import { anketaError, type AnketaFields } from "@/lib/anketa"

// ponytail: untyped client until `bun run gen:types` picks up migration 097
const db = supabase as unknown as SupabaseClient

export interface AnketaOpen extends AnketaFields { kind: "personal" | "universal"; image: string | null; photo_path: string | null; phone_masked: string | null }
export type AnketaStatus = "pending" | "approved" | "rejected"
export interface AnketaClient extends AnketaFields { id: string; phone: string | null; image: string | null }
export interface AnketaSubmission {
  id: string; link_id: string; client_id: string | null; phone: string | null
  full_name: string; company: string | null; role: string | null; activity: string | null; photo_path: string | null
  status: AnketaStatus; created_at: string; reviewed_at: string | null
  client: AnketaClient | null
}

/** Database error codes ('anketa_…') become the Uzbek text the toast / page shows */
const fail = (e: { message: string }) => new Error(anketaError(e.message))

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args)
  if (error) throw fail(error)
  return data as T
}

export const getClientAnketaToken = (clientId: string) => rpc<string>("client_profile_link", { p_client: clientId })
export const getUniversalAnketaToken = (regenerate = false) => rpc<string>("universal_profile_link", { p_regenerate: regenerate })
export const openAnketa = (token: string) => rpc<AnketaOpen>("anketa_open", { p_token: token })
export const submitAnketa = (token: string, data: AnketaFields & { phone?: string; photo_path?: string | null }) =>
  rpc<null>("anketa_submit", { p_token: token, p_data: data })
export const approveAnketa = (id: string, overrides: Partial<AnketaFields> & { image?: string }) =>
  rpc<string>("approve_profile_submission", { p_id: id, p_overrides: overrides })
export const rejectAnketa = (id: string) => rpc<null>("reject_profile_submission", { p_id: id })

export const anketaPhotoUrl = (path: string) => supabase.storage.from("client-images").getPublicUrl(path).data.publicUrl

export async function uploadAnketaPhoto(token: string, file: Blob): Promise<string> {
  const path = `anketa/${token}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from("client-images").upload(path, file, { upsert: false, contentType: "image/jpeg" })
  if (error) throw new Error(anketaError("anketa_photo"))
  return path
}

const SUBMISSION = "id, link_id, client_id, phone, full_name, company, role, activity, photo_path, status, created_at, reviewed_at, client:clients(id, full_name, company, role, activity, phone, image)"

export async function getAnketaSubmissions(view: "pending" | "reviewed"): Promise<AnketaSubmission[]> {
  const q = db.from("client_profile_submissions").select(SUBMISSION)
  const { data, error } = await (view === "pending" ? q.eq("status", "pending") : q.neq("status", "pending"))
    .order(view === "pending" ? "created_at" : "reviewed_at", { ascending: false }).limit(500)
  if (error) throw error
  return (data ?? []).map((r) => ({ ...r, client: Array.isArray(r.client) ? r.client[0] ?? null : r.client })) as AnketaSubmission[]
}

export async function getPendingAnketaFor(clientId: string): Promise<AnketaSubmission | null> {
  const { data, error } = await db.from("client_profile_submissions").select(SUBMISSION).eq("client_id", clientId).eq("status", "pending").limit(1)
  if (error) throw error
  const r = data?.[0]
  return r ? ({ ...r, client: Array.isArray(r.client) ? r.client[0] ?? null : r.client } as AnketaSubmission) : null
}
