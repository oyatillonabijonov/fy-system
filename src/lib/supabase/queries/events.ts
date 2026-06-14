import { supabase } from "../client"

// ─── Types ───────────────────────────────────────────────

export interface Event {
  id: string
  name: string
  description: string | null
  date: string | null
  end_date: string | null
  location: string | null
  cover_image: string | null
  is_active: boolean
  cashback_percent: number
  price: number
  total_value: number
  manager_id: string | null
  has_tariffs: boolean
  created_at: string
  updated_at: string
}

export interface Participant {
  id: string
  event_id: string
  contact_id: string | null
  full_name: string
  phone: string | null
  email: string | null
  company: string | null
  role: string | null
  photo_url: string | null
  notes: string | null
  activity: string | null
  price: number
  paid: number
  attended: boolean
  sort_order: number
  cashback_percent: number | null
  cashback_earned: number
  cashback_used: number
  created_at: string
}

export interface ClientContact {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  company: string | null
  image: string | null
  activity: string | null
  role: string | null
  status: string
  total_spent: number
  events_count: number
  join_date: string | null
}

export interface CreateEventInput {
  name: string
  description?: string
  date?: string
  end_date?: string | null
  location?: string
  cover_image?: string
  cashback_percent?: number
  price?: number
  total_value?: number
  manager_id?: string | null
  has_tariffs?: boolean
}

export interface CreateParticipantInput {
  event_id: string
  full_name: string
  contact_id?: string
  phone?: string
  email?: string
  company?: string
  role?: string
  photo_url?: string
  notes?: string
  price?: number
  paid?: number
}

// ─── Events ──────────────────────────────────────────────

export async function getEvents(): Promise<Event[]> {
  const { data, error } = await supabase
    .from("events")
    .select("id, name, description, date, end_date, location, cover_image, is_active, cashback_percent, price, total_value, manager_id, has_tariffs, created_at, updated_at")
    .order("date", { ascending: false })

  if (error) throw error
  return data as Event[]
}

export async function getEvent(id: string): Promise<Event> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single()

  if (error) throw error
  return data as Event
}

export async function createEvent(input: CreateEventInput): Promise<Event> {
  const { data, error } = await supabase
    .from("events")
    .insert({
      name: input.name,
      description: input.description ?? null,
      date: input.date ?? null,
      end_date: input.end_date ?? null,
      location: input.location ?? null,
      cover_image: input.cover_image ?? null,
      manager_id: input.manager_id ?? null,
      ...(input.cashback_percent !== undefined ? { cashback_percent: input.cashback_percent } : {}),
      ...(input.price !== undefined ? { price: input.price } : {}),
      ...(input.total_value !== undefined ? { total_value: input.total_value } : {}),
      ...(input.has_tariffs !== undefined ? { has_tariffs: input.has_tariffs } : {}),
    })
    .select()
    .single()

  if (error) throw error
  return data as Event
}

export async function updateEvent(
  id: string,
  updates: Partial<Pick<Event, "name" | "description" | "date" | "end_date" | "location" | "cover_image" | "is_active" | "cashback_percent" | "price" | "total_value" | "manager_id" | "has_tariffs">>
): Promise<void> {
  const { error } = await supabase
    .from("events")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)

  if (error) throw error
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase
    .from("events")
    .delete()
    .eq("id", id)

  if (error) throw error
}

// ─── Event Cover Upload ─────────────────────────────────

export async function uploadEventCover(
  file: File,
  eventId: string
): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg"
  const path = `${eventId}/cover.${ext}`

  const { error } = await supabase.storage
    .from("event-covers")
    .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" })

  if (error) throw error

  const { data } = supabase.storage
    .from("event-covers")
    .getPublicUrl(path)

  return data.publicUrl
}

// ─── Participants ────────────────────────────────────────

export async function getParticipants(eventId: string): Promise<Participant[]> {
  const { data, error } = await supabase
    .from("event_participants")
    .select("id, event_id, contact_id, full_name, phone, email, company, role, photo_url, notes, price, paid, attended, sort_order, cashback_percent, cashback_earned, cashback_used, created_at, clients(activity)")
    .eq("event_id", eventId)
    .order("sort_order")
    .order("created_at")

  if (error) throw error

  return (data ?? []).map((row) => {
    const clientData = row.clients as { activity: string | null } | null
    return {
      id: row.id,
      event_id: row.event_id ?? eventId,
      contact_id: row.contact_id,
      full_name: row.full_name,
      phone: row.phone,
      email: row.email,
      company: row.company,
      role: row.role,
      photo_url: row.photo_url,
      notes: row.notes,
      activity: clientData?.activity ?? null,
      price: row.price,
      paid: row.paid,
      attended: row.attended,
      sort_order: row.sort_order ?? 0,
      cashback_percent: row.cashback_percent,
      cashback_earned: row.cashback_earned ?? 0,
      cashback_used: row.cashback_used ?? 0,
      created_at: row.created_at ?? new Date().toISOString(),
    }
  })
}

export async function createParticipant(input: CreateParticipantInput): Promise<Participant> {
  const { data, error } = await supabase
    .from("event_participants")
    .insert({
      event_id: input.event_id,
      full_name: input.full_name,
      contact_id: input.contact_id ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      company: input.company ?? null,
      role: input.role ?? null,
      photo_url: input.photo_url ?? null,
      notes: input.notes ?? null,
      price: input.price ?? 0,
      paid: input.paid ?? 0,
    })
    .select()
    .single()

  if (error) throw error
  return data as Participant
}

export async function updateParticipant(
  id: string,
  updates: Partial<Pick<Participant, "full_name" | "phone" | "email" | "company" | "role" | "photo_url" | "notes" | "price" | "paid" | "attended" | "contact_id">>
): Promise<void> {
  const { error } = await supabase
    .from("event_participants")
    .update(updates)
    .eq("id", id)

  if (error) throw error
}

export async function reorderParticipants(
  participants: { id: string; sort_order: number }[]
): Promise<void> {
  const updates = participants.map(({ id, sort_order }) =>
    supabase
      .from("event_participants")
      .update({ sort_order })
      .eq("id", id)
  )
  const results = await Promise.all(updates)
  const failed = results.find((r) => r.error)
  if (failed?.error) throw failed.error
}

export async function deleteParticipant(id: string): Promise<void> {
  const { error } = await supabase
    .from("event_participants")
    .delete()
    .eq("id", id)

  if (error) throw error
}

export async function uploadParticipantPhoto(
  file: File,
  participantId: string
): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg"
  const path = `${participantId}.${ext}`

  const { error } = await supabase.storage
    .from("participant-photos")
    .upload(path, file, { upsert: true })

  if (error) throw error

  const { data } = supabase.storage
    .from("participant-photos")
    .getPublicUrl(path)

  return data.publicUrl
}

export async function getParticipantCount(eventId: string): Promise<number> {
  const { count, error } = await supabase
    .from("event_participants")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)

  if (error) throw error
  return count ?? 0
}

export async function getParticipantCounts(eventIds: string[]): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("event_participants")
    .select("event_id")
    .in("event_id", eventIds)

  if (error) throw error

  const counts: Record<string, number> = {}
  for (const id of eventIds) counts[id] = 0
  for (const row of data ?? []) {
    const eid = (row as { event_id: string }).event_id
    counts[eid] = (counts[eid] ?? 0) + 1
  }
  return counts
}

// ─── Contact Search ─────────────────────────────────────

export async function searchContacts(query: string): Promise<ClientContact[]> {
  if (!query || !query.trim()) {
    const { data } = await supabase
      .from("clients")
      .select("id, full_name, phone, email, company, activity, image, role, status, total_spent, events_count, join_date")
      .order("created_at", { ascending: false })
      .limit(6)
    return (data ?? []) as ClientContact[]
  }

  const q = `%${query.trim()}%`
  const { data, error } = await supabase
    .from("clients")
    .select("id, full_name, phone, email, company, activity, image, role, status, total_spent, events_count, join_date")
    .or(`full_name.ilike.${q},phone.ilike.${q}`)
    .order("full_name")
    .limit(8)

  if (error) throw error
  return (data ?? []) as ClientContact[]
}

export async function addExistingContactToEvent(
  eventId: string,
  contact: ClientContact
): Promise<void> {
  // Check if already added
  const { data: existing } = await supabase
    .from("event_participants")
    .select("id")
    .eq("event_id", eventId)
    .eq("contact_id", contact.id)
    .maybeSingle()

  if (existing) {
    throw new Error("Bu mijoz allaqachon ushbu tadbirga qo'shilgan")
  }

  const { error } = await supabase
    .from("event_participants")
    .insert({
      event_id: eventId,
      contact_id: contact.id,
      full_name: contact.full_name,
      phone: contact.phone,
      email: contact.email,
      company: contact.company,
      role: contact.role,
      photo_url: contact.image,
      price: 0,
      paid: 0,
      attended: false,
    })

  if (error) throw error

  // Increment events_count
  await supabase
    .from("clients")
    .update({
      events_count: (contact.events_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contact.id)
}

// Create a new client in the clients table AND add as participant
export async function createClientAndParticipant(input: {
  eventId: string
  fullName: string
  phone?: string
  email?: string
  company?: string
  activity?: string
  role?: string
  notes?: string
  image?: string
  price?: number
  paid?: number
}): Promise<Participant> {
  // 1. Create client in clients table
  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .insert({
      full_name: input.fullName,
      phone: input.phone ?? null,
      email: input.email ?? null,
      company: input.company ?? null,
      activity: input.activity ?? null,
      role: input.role ?? null,
      image: input.image ?? null,
      status: "Faol",
    })
    .select()
    .single()

  if (clientErr) throw clientErr

  // 2. Create participant linked to the new client
  return createParticipant({
    event_id: input.eventId,
    contact_id: (client as { id: string }).id,
    full_name: input.fullName,
    phone: input.phone,
    email: input.email,
    company: input.company,
    role: input.role,
    notes: input.notes,
    photo_url: input.image,
    price: input.price ?? 0,
    paid: input.paid ?? 0,
  })
}
