import { supabase } from "../client"

export interface Payment {
  id: string
  participant_id: string
  amount: number
  method: "naqd" | "karta" | "transfer"
  paid_at: string
  recorded_by: string | null
  recorder_name: string | null
  note: string | null
  created_at: string
}

export type PaymentMethod = Payment["method"]

export async function getParticipantPayments(participantId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from("payments")
    .select("id, participant_id, amount, method, paid_at, recorded_by, note, created_at, recorder:recorded_by(full_name)")
    .eq("participant_id", participantId)
    .order("paid_at", { ascending: false })

  if (error) throw error

  return ((data ?? []) as unknown as Array<{
    id: string; participant_id: string; amount: number
    method: "naqd" | "karta" | "transfer"
    paid_at: string; recorded_by: string | null; note: string | null; created_at: string
    recorder: { full_name: string } | null
  }>).map(row => ({
    id: row.id,
    participant_id: row.participant_id,
    amount: row.amount,
    method: row.method,
    paid_at: row.paid_at,
    recorded_by: row.recorded_by,
    recorder_name: row.recorder?.full_name ?? null,
    note: row.note,
    created_at: row.created_at,
  }))
}

export async function addPayment(input: {
  participantId: string
  amount: number
  method: PaymentMethod
  paidAt: string
  note?: string
}): Promise<Payment> {
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from("payments")
    .insert({
      participant_id: input.participantId,
      amount:         input.amount,
      method:         input.method,
      paid_at:        input.paidAt,
      recorded_by:    user?.id ?? null,
      note:           input.note ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return data as unknown as Payment
}

export async function deletePayment(id: string): Promise<void> {
  const { error } = await supabase.from("payments").delete().eq("id", id)
  if (error) throw error
}
