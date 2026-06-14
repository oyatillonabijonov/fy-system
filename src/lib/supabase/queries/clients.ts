import { supabase } from "../client"
import type { Database } from "../types"
import { normalizePhone } from "@/lib/utils"
import type { CashbackTransaction } from "./cashback"

type ClientRow = Database["public"]["Tables"]["clients"]["Row"] & { location?: string | null }
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
  location: string | null
  total_spent: number
  events_count: number
  cashback_balance: number
  join_date: string | null
  created_at: string
  updated_at: string
  auth_user_id: string | null
  community_approved: boolean
}

export async function getClients(): Promise<ClientRow[]> {
  const result = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false })
  const { data, error } = result as unknown as { data: ClientRow[] | null; error: Error | null }
  if (error) throw error
  return data!
}

export interface ClientEventHistory {
  id: string
  event_id: string
  event_name: string
  event_date: string | null
  paid: number
  registered_at: string
}

export async function getClientEventHistory(clientId: string): Promise<ClientEventHistory[]> {
  const { data, error } = await supabase
    .from("event_participants")
    .select("id, event_id, paid, created_at, events(name, date)")
    .eq("contact_id", clientId)
    .order("created_at", { ascending: false })
    .limit(20)

  if (error) throw error

  return ((data ?? []) as unknown as Array<{
    id: string; event_id: string; paid: number; created_at: string;
    events: { name: string; date: string | null } | null
  }>).map(row => ({
    id: row.id,
    event_id: row.event_id,
    event_name: row.events?.name ?? "Nomaʼlum tadbir",
    event_date: row.events?.date ?? null,
    paid: row.paid,
    registered_at: row.created_at,
  }))
}

export async function createClient(client: ClientInsert): Promise<ClientRow> {
  const { data, error } = await supabase
    .from("clients")
    .insert({ ...client, phone: normalizePhone(client.phone) })
    .select()
    .single()

  if (error) throw error
  return data
}

type ClientUpdateExtended = ClientUpdate & { location?: string | null }

export async function updateClient(
  id: string,
  updates: ClientUpdateExtended
): Promise<ClientRow> {
  const { data, error } = await supabase
    .from("clients")
    .update({ ...updates, ...(updates.phone !== undefined && { phone: normalizePhone(updates.phone) }) })
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

/**
 * Create a mobile-app login for a club member via the `admin-create-member`
 * Edge Function. Service role work happens server-side; admin is re-verified
 * inside the function.
 */
export async function createMemberAccount(input: {
  client_id: string
  email: string
  password: string
}): Promise<{ user_id: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error("Tizimga kirilmagan")

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const functionUrl = `${supabaseUrl}/functions/v1/admin-create-member`

  let response: Response
  try {
    response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(input),
    })
  } catch (err) {
    throw new Error(
      err instanceof Error
        ? `Edge Function'ga ulanishda xatolik: ${err.message}`
        : "Edge Function'ga ulanishda xatolik",
    )
  }

  let payload: { ok?: boolean; user_id?: string; error?: string } = {}
  try {
    payload = await response.json() as { ok?: boolean; user_id?: string; error?: string }
  } catch {
    /* non-JSON response */
  }

  if (!response.ok) {
    throw new Error(payload.error ?? `Xatolik (HTTP ${response.status})`)
  }

  if (!payload.user_id) {
    throw new Error("Edge Function user_id qaytarmadi")
  }

  return { user_id: payload.user_id }
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

// ─── Client Journey ───────────────────────────────────────────────────────────

export interface ClientJourneyEvent {
  participant_id: string
  event_id: string
  event_name: string
  event_date: string | null
  event_cover: string | null
  paid: number
  debt: number
  cashback_earned: number
  attended: boolean
}

export interface ClientJourney {
  events: ClientJourneyEvent[]
  cashback_history: CashbackTransaction[]
  totals: {
    total_paid: number
    events_count: number
    attended_count: number
    total_debt: number
    cashback_balance: number
  }
}

export async function getClientJourney(clientId: string): Promise<ClientJourney> {
  type ParticipantRow = {
    id: string
    event_id: string
    paid: number
    debt: number | null
    cashback_earned: number | null
    attended: boolean | null
    events: { name: string; date: string | null; cover_url: string | null } | null
  }

  const [participantsResult, cashbackResult, clientResult] = await Promise.all([
    supabase
      .from("event_participants")
      .select("id, event_id, paid, debt, cashback_earned, attended, events(name, date, cover_url)")
      .eq("contact_id", clientId)
      .order("created_at", { ascending: false }),
    supabase
      .from("cashback_transactions")
      .select("id, client_id, event_id, participant_id, type, amount, description, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("clients")
      .select("cashback_balance")
      .eq("id", clientId)
      .single(),
  ])

  if (participantsResult.error) throw participantsResult.error
  if (cashbackResult.error) throw cashbackResult.error
  if (clientResult.error) throw clientResult.error

  const rows = (participantsResult.data ?? []) as unknown as ParticipantRow[]
  const events: ClientJourneyEvent[] = rows.map(row => ({
    participant_id: row.id,
    event_id: row.event_id,
    event_name: row.events?.name ?? "Nomaʿlum tadbir",
    event_date: row.events?.date ?? null,
    event_cover: row.events?.cover_url ?? null,
    paid: row.paid,
    debt: row.debt ?? 0,
    cashback_earned: Number(row.cashback_earned ?? 0),
    attended: row.attended ?? false,
  }))

  return {
    events,
    cashback_history: (cashbackResult.data ?? []) as unknown as CashbackTransaction[],
    totals: {
      total_paid: events.reduce((sum, e) => sum + e.paid, 0),
      events_count: events.length,
      attended_count: events.filter(e => e.attended).length,
      total_debt: events.reduce((sum, e) => sum + e.debt, 0),
      cashback_balance: Number(clientResult.data?.cashback_balance ?? 0),
    },
  }
}

export async function getClientsLastEventDates(): Promise<Map<string, string>> {
  type Row = { contact_id: string | null; events: { date: string | null } | null }

  const { data, error } = await supabase
    .from("event_participants")
    .select("contact_id, events(date)")
    .not("contact_id", "is", null)

  if (error) throw error

  const map = new Map<string, string>()
  for (const row of (data ?? []) as unknown as Row[]) {
    if (!row.contact_id || !row.events?.date) continue
    const existing = map.get(row.contact_id)
    if (!existing || row.events.date > existing) {
      map.set(row.contact_id, row.events.date)
    }
  }
  return map
}
