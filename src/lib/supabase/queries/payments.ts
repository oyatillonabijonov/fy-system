import { supabase } from "../client"

export type PaymentMethod = "naqd" | "karta" | "transfer"

// ─── Client → event participations (Add-payment modal event picker) ────────────
export interface ClientParticipation {
  participant_id: string
  event_id: string
  event_name: string
  event_date: string | null
  price: number
  paid: number
}

export async function getClientParticipations(clientId: string): Promise<ClientParticipation[]> {
  const { data, error } = await supabase
    .from("event_participants")
    .select("id, event_id, price, paid, events(name, date)")
    .eq("contact_id", clientId)
    .order("created_at", { ascending: false })

  if (error) throw error

  return ((data ?? []) as unknown as Array<{
    id: string; event_id: string; price: number; paid: number
    events: { name: string; date: string | null } | null
  }>).map((row) => ({
    participant_id: row.id,
    event_id: row.event_id,
    event_name: row.events?.name ?? "Nomaʼlum tadbir",
    event_date: row.events?.date ?? null,
    price: row.price,
    paid: row.paid,
  }))
}
