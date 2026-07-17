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

// ─── Event-scoped & global payment log ─────────────────────────────────────────
// The payments table has no event_id/client_id columns; both are derived via the
// participant join (participant.event_id, participant.contact_id).

export interface EventPayment {
  id: string
  participant_id: string
  participant_name: string
  event_id: string | null
  client_id: string | null
  amount: number
  method: PaymentMethod
  recorded_by: string | null
  note: string | null
  paid_at: string
  created_at: string
  client_name: string | null
  client_phone: string | null
  recorded_by_name: string | null
  event_name: string | null
  // Participant context (current state, not a historical snapshot).
  price: number          // kelishilgan umumiy summa
  debt: number           // qolgan qarzdorlik = price - paid (current)
}

interface PaymentJoinRow {
  id: string
  participant_id: string
  amount: number
  method: PaymentMethod
  paid_at: string
  created_at: string
  recorded_by: string | null
  note: string | null
  recorder: { full_name: string } | null
  participant: {
    full_name: string
    price: number
    paid: number
    event_id: string | null
    contact_id: string | null
    event: { name: string } | null
    client: { full_name: string; phone: string | null } | null
  } | null
}

const PAYMENT_JOIN_SELECT =
  "id, participant_id, amount, method, paid_at, created_at, recorded_by, note, " +
  "recorder:recorded_by(full_name), " +
  "participant:participant_id!inner(full_name, price, paid, event_id, contact_id, " +
  "event:event_id(name), client:contact_id(full_name, phone))"

function mapEventPayment(row: PaymentJoinRow): EventPayment {
  const price = row.participant?.price ?? 0
  const paid = row.participant?.paid ?? 0
  return {
    id: row.id,
    participant_id: row.participant_id,
    participant_name: row.participant?.full_name ?? "",
    event_id: row.participant?.event_id ?? null,
    client_id: row.participant?.contact_id ?? null,
    amount: row.amount,
    method: row.method,
    recorded_by: row.recorded_by,
    note: row.note,
    paid_at: row.paid_at,
    created_at: row.created_at,
    client_name: row.participant?.client?.full_name ?? null,
    client_phone: row.participant?.client?.phone ?? null,
    recorded_by_name: row.recorder?.full_name ?? null,
    event_name: row.participant?.event?.name ?? null,
    price,
    debt: price - paid,
  }
}

// All payments for one event, newest first.
export async function getEventPayments(eventId: string): Promise<EventPayment[]> {
  const { data, error } = await supabase
    .from("payments")
    .select(PAYMENT_JOIN_SELECT)
    .eq("participant.event_id", eventId)
    .order("paid_at", { ascending: false })

  if (error) throw error
  return ((data ?? []) as unknown as PaymentJoinRow[]).map(mapEventPayment)
}

// Global payment log across all events, newest first (Sprint C log).
export async function getRecentPayments(limit = 50, offset = 0): Promise<EventPayment[]> {
  const { data, error } = await supabase
    .from("payments")
    .select(PAYMENT_JOIN_SELECT)
    .order("paid_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw error
  return ((data ?? []) as unknown as PaymentJoinRow[]).map(mapEventPayment)
}

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

// ─── Finance KPI totals (Moliya → Umumiy) ─────────────────────────────────────
// Server-side aggregate via RPC (migration 047). Never sum in the browser: an
// unbounded select is capped by PostgREST max_rows and would silently undercount.
export interface FinanceTotals {
  total_income: number           // SUM(payments.amount) — real cash, cashback excluded
  total_debt: number             // SUM(GREATEST(price - paid, 0))
  total_cashback_balance: number // SUM(clients.cashback_balance)
}

export async function getFinanceTotals(): Promise<FinanceTotals> {
  // Stale types workaround (CLAUDE.md): types.ts doesn't know this RPC yet
  // (needs a local Supabase stand to regenerate). Cast until gen:types runs.
  const { data, error } = await (supabase.rpc as unknown as
    (fn: string) => Promise<{ data: FinanceTotals[] | null; error: Error | null }>
  )("event_finance_totals")
  if (error) throw error

  // The RPC returns TABLE(...) → supabase-js gives an array of one row.
  const row = (data as unknown as FinanceTotals[] | null)?.[0]
  return {
    total_income:           Number(row?.total_income ?? 0),
    total_debt:             Number(row?.total_debt ?? 0),
    total_cashback_balance: Number(row?.total_cashback_balance ?? 0),
  }
}
