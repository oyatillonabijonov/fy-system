import type { ActiveCall } from "@/context/PhoneContext"

/**
 * The socket dropped mid-call and came back: the PBX re-attaches the same call (Verto `verto.attach`).
 * It's still the call on the card, so the timer goes on. If the card has already gone (a long gap,
 * a page reload) it's rebuilt from the dialog; such dialogs are always "inbound", display_direction says which way it went.
 */
export function resumeCall(card: ActiveCall | null, id: string, params: Record<string, string | undefined>): ActiveCall {
  if (card?.id === id) return { ...card, state: "active", answeredAt: card.answeredAt ?? Date.now(), muted: false }
  return {
    id,
    dir: params.display_direction === "outbound" ? "out" : "in",
    phone: params.remote_caller_id_number ?? "",
    state: "active",
    answeredAt: Date.now(),
    muted: false,
    contact: null,
  }
}

/** Someone who rang while this seller was on a call (turned away silently, the PBX tries the next seller) */
export interface BusyCall { phone: string; name: string | null }

const sameNumber = (a: string, b: string) => a.replace(/\D/g, "").slice(-9) === b.replace(/\D/g, "").slice(-9)

/** Newest first, one row per number: the PBX can offer the same caller again and again while they wait. */
export function addBusyCall(list: BusyCall[], phone: string): BusyCall[] {
  if (!phone) return list
  const old = list.find((b) => sameNumber(b.phone, phone))
  return [{ phone, name: old?.name ?? null }, ...list.filter((b) => b !== old)]
}

export function nameBusyCall(list: BusyCall[], phone: string, name: string): BusyCall[] {
  return list.map((b) => (sameNumber(b.phone, phone) ? { ...b, name } : b))
}
