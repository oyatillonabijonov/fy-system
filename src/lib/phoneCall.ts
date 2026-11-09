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
