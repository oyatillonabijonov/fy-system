import { supabase } from "../client"

export interface CashbackTransaction {
  id: string
  client_id: string
  event_id: string | null
  participant_id: string | null
  type: "earned" | "used" | "manual_add" | "manual_subtract" | "clawback"
  amount: number
  description: string | null
  created_at: string
}

// Get client's cashback history
export async function getClientCashbackHistory(clientId: string): Promise<CashbackTransaction[]> {
  const { data, error } = await supabase
    .from("cashback_transactions")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })

  if (error) throw error
  return (data ?? []) as CashbackTransaction[]
}

// Calculate cashback for a participant
export function calculateCashback(price: number, percent: number): number {
  return Math.round((price * percent) / 100)
}

/** @deprecated Use the DB trigger `auto_award_cashback` (migration 023) instead.
 *  Kept here only for one-off manual awards (e.g. backfill scripts). */
export async function awardCashback(
  participantId: string,
  clientId: string,
  eventId: string,
  price: number,
  percent: number,
): Promise<void> {
  const amount = calculateCashback(price, percent)

  // Insert transaction (DB trigger updates clients.cashback_balance)
  const { error: txErr } = await supabase.from("cashback_transactions").insert({
    client_id: clientId,
    event_id: eventId,
    participant_id: participantId,
    type: "earned",
    amount,
    description: `Tadbir: cashback ${percent}%`,
  })
  if (txErr) throw txErr

  const { error: updErr } = await supabase
    .from("event_participants")
    .update({ cashback_earned: amount })
    .eq("id", participantId)
  if (updErr) throw updErr
}

// Spend cashback as a discount on the participant's payment.
// Delegates to the atomic DB RPC spend_cashback() (migration 035).
export async function spendCashback(input: {
  participantId: string
  clientId: string
  eventId: string
  amount: number
}): Promise<void> {
  const { participantId, clientId, eventId, amount } = input
  const { error } = await supabase.rpc("spend_cashback", {
    p_participant_id: participantId,
    p_client_id:      clientId,
    p_event_id:       eventId,
    p_amount:         amount,
  })
  if (error) {
    if (error.message?.includes("cashback_insufficient")) {
      throw new Error("Cashback balansi yetarli emas")
    }
    throw error
  }
}

// Manual adjust (admin)
export async function adjustCashback(
  clientId: string,
  amount: number,
  type: "add" | "subtract",
  description: string,
): Promise<void> {
  const { error } = await supabase.from("cashback_transactions").insert({
    client_id: clientId,
    type: type === "add" ? "manual_add" : "manual_subtract",
    amount: Math.abs(amount),
    description,
  })
  if (error) throw error
}

// Set custom cashback percent for a participant (null = inherit event default)
export async function setParticipantCashbackPercent(
  participantId: string,
  percent: number | null,
): Promise<void> {
  const { error } = await supabase
    .from("event_participants")
    .update({ cashback_percent: percent })
    .eq("id", participantId)
  if (error) throw error
}

// Set event default cashback percent
export async function setEventCashbackPercent(
  eventId: string,
  percent: number,
): Promise<void> {
  const { error } = await supabase
    .from("events")
    .update({ cashback_percent: percent })
    .eq("id", eventId)
  if (error) throw error
}
