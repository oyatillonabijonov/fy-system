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

/** Bugun (seller home): a number that rang unanswered and nobody called back since */
export interface Callback { phone: string; name: string | null; leadId: string | null; ownerId: string | null; calls: number; last: string }
export interface CallbackRow { phone: string; direction: "in" | "out"; talk_time: number; started_at: string; lead_id: string | null; client: { full_name: string } | null; lead: { responsible_user_id: string | null } | null }

/** Rows newest first: an answered or outgoing call settles that number's older missed calls */
export function pickCallbacks(rows: CallbackRow[]): Callback[] {
  const out = new Map<string, Callback>()
  const handled = new Set<string>()
  for (const r of rows) {
    if (handled.has(r.phone)) continue
    if (r.direction === "out" || r.talk_time > 0) { handled.add(r.phone); continue }
    const c = out.get(r.phone)
    if (c) { c.calls++; c.leadId ??= r.lead_id; c.ownerId ??= r.lead?.responsible_user_id ?? null; c.name ??= r.client?.full_name ?? null }
    else out.set(r.phone, { phone: r.phone, name: r.client?.full_name ?? null, leadId: r.lead_id, ownerId: r.lead?.responsible_user_id ?? null, calls: 1, last: r.started_at })
  }
  return [...out.values()]
}
