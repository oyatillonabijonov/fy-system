import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase } from "../client"

// ponytail: untyped client until `bun run gen:types` picks up migration 052
// (same trick as community.ts); drop the cast once types.ts is regenerated.
const db = supabase as unknown as SupabaseClient

export interface EventTariff {
  id: string
  event_id: string
  name: string
  price: number
  sort_order: number
}

export interface TariffDraft {
  id?: string
  name: string
  price: number
}

export async function getEventTariffs(eventId: string): Promise<EventTariff[]> {
  const { data, error } = await db
    .from("event_tariffs")
    .select("id, event_id, name, price, sort_order")
    .eq("event_id", eventId)
    .order("sort_order")
  if (error) throw error
  return ((data ?? []) as EventTariff[]).map((t) => ({ ...t, price: Number(t.price) }))
}

// Makes the event's tariff list equal `drafts` (array order = sort_order).
// ponytail: delete + update + insert are three requests, not one transaction —
// a mid-way network failure leaves a partial list the user can re-save; move to
// an RPC if that ever bites.
export async function saveEventTariffs(eventId: string, drafts: TariffDraft[]): Promise<void> {
  const keepIds = drafts.flatMap((d) => (d.id ? [d.id] : []))

  let del = db.from("event_tariffs").delete().eq("event_id", eventId)
  if (keepIds.length > 0) del = del.not("id", "in", `(${keepIds.join(",")})`)
  const { error: delErr } = await del
  if (delErr) {
    if (delErr.code === "23503") {
      throw new Error("O'chirilgan tarifda ishtirokchilar bor. Avval ularning tarifini almashtiring")
    }
    throw delErr
  }

  const rows = drafts.map((d, i) => ({ event_id: eventId, name: d.name.trim(), price: d.price, sort_order: i, id: d.id }))
  const existing = rows.filter((r) => r.id)
  const fresh = rows
    .filter((r) => !r.id)
    .map((r) => ({ event_id: r.event_id, name: r.name, price: r.price, sort_order: r.sort_order }))

  if (existing.length > 0) {
    const { error } = await db.from("event_tariffs").upsert(existing)
    if (error) throw error
  }
  if (fresh.length > 0) {
    const { error } = await db.from("event_tariffs").insert(fresh)
    if (error) throw error
  }
}
