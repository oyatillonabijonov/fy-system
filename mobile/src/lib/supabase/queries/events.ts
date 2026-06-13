import { supabase } from "../client"
import type { Database } from "../types"

export type EventRow = Database["public"]["Tables"]["events"]["Row"]
export type ParticipantRow = Database["public"]["Tables"]["event_participants"]["Row"]

/** Active events, newest first. RLS already hides inactive ones from members. */
export async function getEvents(): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("date", { ascending: false })

  if (error) throw error
  return data
}

export async function getEvent(id: string): Promise<EventRow | null> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .maybeSingle()

  if (error) throw error
  return data
}

export interface MyParticipation extends ParticipantRow {
  events: Pick<EventRow, "id" | "name" | "date" | "location"> | null
}

/** The member's own participations (RLS limits rows to contact_id = my client). */
export async function getMyParticipations(): Promise<MyParticipation[]> {
  const { data, error } = await supabase
    .from("event_participants")
    .select("*, events(id, name, date, location)")
    .order("created_at", { ascending: false })

  if (error) throw error
  return data as MyParticipation[]
}

/** Self-registration through the SECURITY DEFINER RPC. Returns participant id. */
export async function registerForEvent(eventId: string): Promise<string> {
  const { data, error } = await supabase.rpc("register_for_event", {
    p_event_id: eventId,
  })
  if (error) throw error
  return data
}
