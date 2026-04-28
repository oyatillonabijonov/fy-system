import { supabase } from "../client"
import type { Database } from "../types"

type ClientRow = Database["public"]["Tables"]["clients"]["Row"]
type ClientInsert = Database["public"]["Tables"]["clients"]["Insert"]
type ClientUpdate = Database["public"]["Tables"]["clients"]["Update"]

export interface Client {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  company: string | null
  activity: string | null
  role: string | null
  status: string
  image: string | null
  total_spent: number
  events_count: number
  join_date: string | null
  created_at: string
  updated_at: string
}

export async function getClients(): Promise<ClientRow[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) throw error
  return data
}

export async function createClient(client: ClientInsert): Promise<ClientRow> {
  const { data, error } = await supabase
    .from("clients")
    .insert(client)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateClient(
  id: string,
  updates: ClientUpdate
): Promise<ClientRow> {
  const { data, error } = await supabase
    .from("clients")
    .update(updates)
    .eq("id", id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteClient(id: string): Promise<void> {
  const { error } = await supabase.from("clients").delete().eq("id", id)
  if (error) throw error
}

export async function deleteClients(ids: string[]): Promise<void> {
  const { error } = await supabase.from("clients").delete().in("id", ids)
  if (error) throw error
}

export async function uploadClientImage(
  file: Blob,
  clientId: string
): Promise<string> {
  const path = `${clientId}.jpg`

  const { error } = await supabase.storage
    .from("client-images")
    .upload(path, file, { upsert: true, contentType: "image/jpeg" })

  if (error) throw error

  const { data } = supabase.storage
    .from("client-images")
    .getPublicUrl(path)

  // Add cache-bust to force refresh
  return `${data.publicUrl}?t=${Date.now()}`
}
