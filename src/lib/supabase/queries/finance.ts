import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase } from "../client"
import type { PaymentMethod } from "./payments"
import { ClientExistsError, ENROLL_ERRORS, type EnrollClient } from "./events"
import { dayEnd, dayStart } from "@/lib/period"
import { formatMoney } from "@/lib/format"
import { PAGE_SIZE } from "@/components/ui/Pager"

// ponytail: untyped client until `bun run gen:types` picks up migration 053.
const db = supabase as unknown as SupabaseClient

export type DebtStatus = "debt" | "overdue" | "paid" | "all"

export interface FinanceFilters {
  from: string | null            // YYYY-MM-DD, Tashkent calendar day
  to: string | null
  eventId: string | null
  seller: string | null          // profile id; "none" = no seller; null = any
  method: PaymentMethod | null
}

function filterParams(f: FinanceFilters) {
  return {
    p_from: f.from,
    p_to: f.to,
    p_event_id: f.eventId,
    p_seller_id: f.seller && f.seller !== "none" ? f.seller : null,
    p_no_seller: f.seller === "none",
  }
}

const FINANCE_ERRORS: Record<string, string> = {
  ...ENROLL_ERRORS,
  "forbidden: finance_only": "Moliyani tahrirlash uchun ruxsat yo'q",
  "forbidden: finance_fields": "Kelishuv summasi va to'lov sanasini faqat Moliya o'zgartiradi",
  invalid_amount: "Summa 0 dan katta bo'lishi kerak",
  invalid_price: "Kelishuv summasi manfiy bo'lishi mumkin emas",
  enroll_required: "Mijoz bu tadbirda yo'q — tarif va sotuvchini tanlang",
  reason_required: "Bekor qilish sababini yozing",
  already_voided: "Bu yozuv allaqachon bekor qilingan",
  expense_not_found: "Xarajat topilmadi",
  payment_not_found: "To'lov topilmadi",
  participant_not_found: "Ishtirokchi topilmadi",
  void_would_overpay: "Bu qaytarishni bekor qilsak, to'langan summa kelishuvdan oshib ketadi",
  void_would_go_negative: "Avval shu to'lovga tegishli qaytarishni bekor qiling — aks holda to'langan summa manfiy bo'ladi",
  price_below_paid: "Kelishuv summasi to'langan summadan kam bo'lishi mumkin emas — avval qaytarish qiling",
  invalid_receipt_path: "Chek fayli noto'g'ri joyga yuklangan",
  receipt_exists: "Bu yozuvda chek allaqachon bor",
  receipt_target_not_found: "Yozuv topilmadi",
}

function financeError(e: { message: string; code?: string }): Error {
  const exists = /^client_exists:([0-9a-f-]{36}):(.*)$/s.exec(e.message)
  if (exists) return new ClientExistsError(exists[1], exists[2])
  const debt = /^amount_exceeds_debt \(debt=([\d.]+)\)$/.exec(e.message)
  if (debt) return new Error(`To'lov qarzdan ko'p. Qolgan qarz: ${formatMoney(Number(debt[1]))}`)
  const cash = /^refund_exceeds_paid \(paid=([\d.]+)\)$/.exec(e.message)
  if (cash) return new Error(`Qaytarish to'langan puldan ko'p. Ko'pi bilan: ${formatMoney(Number(cash[1]))}`)
  if (e.code === "23505") return new Error("Bu telefon raqam boshqa mijozda band")
  if (e.code === "22003") return new Error("Summa juda katta")
  return new Error(FINANCE_ERRORS[e.message] ?? e.message)
}

// ─── KPIs ────────────────────────────────────────────────────────────────────

export interface FinanceSummary {
  income: number            // active payments − refunds (cashback excluded)
  expense: number           // active expenses; ignores seller / method filters
  net: number               // income − expense
  debt: number
  overdue_debt: number
  agreed: number            // SUM(price)
  collected: number         // SUM(paid)
  cashback_balance: number  // all clients, unfiltered
}

export async function getFinanceSummary(f: FinanceFilters): Promise<FinanceSummary> {
  const { data, error } = await db.rpc("finance_summary", { ...filterParams(f), p_method: f.method })
  if (error) throw financeError(error)
  const row = ((data ?? []) as Array<Record<keyof FinanceSummary, number | string | null>>)[0]
  return {
    income: Number(row?.income ?? 0),
    expense: Number(row?.expense ?? 0),
    net: Number(row?.net ?? 0),
    debt: Number(row?.debt ?? 0),
    overdue_debt: Number(row?.overdue_debt ?? 0),
    agreed: Number(row?.agreed ?? 0),
    collected: Number(row?.collected ?? 0),
    cashback_balance: Number(row?.cashback_balance ?? 0),
  }
}

// ─── Payments log ────────────────────────────────────────────────────────────

export interface PaymentRow {
  id: string
  participant_id: string
  amount: number                  // negative for refunds
  kind: "payment" | "refund"
  method: PaymentMethod
  paid_at: string
  note: string | null
  voided_at: string | null
  void_reason: string | null
  receipt_path: string | null
  recorder_name: string | null
  client_name: string
  client_phone: string | null
  event_name: string | null
  seller_name: string | null
  participant_cash_paid: number   // paid − cashback_used: the most that can be refunded
}

interface PaymentJoin {
  id: string
  participant_id: string
  amount: number | string
  kind: "payment" | "refund"
  method: PaymentMethod
  paid_at: string
  note: string | null
  voided_at: string | null
  void_reason: string | null
  receipt_path: string | null
  recorder: { full_name: string } | null
  participant: {
    full_name: string
    phone: string | null
    paid: number | string
    cashback_used: number | string | null
    event: { name: string } | null
    seller: { full_name: string } | null
  } | null
}

export async function listPayments(f: FinanceFilters, page: number): Promise<PaymentRow[]> {
  let q = db
    .from("payments")
    .select(
      "id, participant_id, amount, kind, method, paid_at, note, voided_at, void_reason, receipt_path, " +
        "recorder:recorded_by(full_name), " +
        "participant:participant_id!inner(full_name, phone, paid, cashback_used, event_id, seller_id, " +
        "event:event_id(name), seller:seller_id(full_name))",
    )
    .order("paid_at", { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
  if (f.from) q = q.gte("paid_at", dayStart(f.from))
  if (f.to) q = q.lte("paid_at", dayEnd(f.to))
  if (f.method) q = q.eq("method", f.method)
  if (f.eventId) q = q.eq("participant.event_id", f.eventId)
  if (f.seller === "none") q = q.is("participant.seller_id", null)
  else if (f.seller) q = q.eq("participant.seller_id", f.seller)

  const { data, error } = await q
  if (error) throw financeError(error)
  return ((data ?? []) as unknown as PaymentJoin[]).map((r) => ({
    id: r.id,
    participant_id: r.participant_id,
    amount: Number(r.amount),
    kind: r.kind,
    method: r.method,
    paid_at: r.paid_at,
    note: r.note,
    voided_at: r.voided_at,
    void_reason: r.void_reason,
    receipt_path: r.receipt_path,
    recorder_name: r.recorder?.full_name ?? null,
    client_name: r.participant?.full_name ?? "—",
    client_phone: r.participant?.phone ?? null,
    event_name: r.participant?.event?.name ?? null,
    seller_name: r.participant?.seller?.full_name ?? null,
    participant_cash_paid: Number(r.participant?.paid ?? 0) - Number(r.participant?.cashback_used ?? 0),
  }))
}

// Same filters as listPayments, head-only — drives the Pager's "Jami N ta".
export async function countPayments(f: FinanceFilters): Promise<number> {
  let q = db
    .from("payments")
    .select("id, participant:participant_id!inner(event_id, seller_id)", { count: "exact", head: true })
  if (f.from) q = q.gte("paid_at", dayStart(f.from))
  if (f.to) q = q.lte("paid_at", dayEnd(f.to))
  if (f.method) q = q.eq("method", f.method)
  if (f.eventId) q = q.eq("participant.event_id", f.eventId)
  if (f.seller === "none") q = q.is("participant.seller_id", null)
  else if (f.seller) q = q.eq("participant.seller_id", f.seller)

  const { count, error } = await q
  if (error) throw financeError(error)
  return count ?? 0
}

// ─── Debtors ─────────────────────────────────────────────────────────────────

export interface DebtorRow {
  participant_id: string
  event_id: string
  event_name: string
  client_id: string | null
  full_name: string
  phone: string | null
  seller_id: string | null
  seller_name: string | null
  tariff_id: string | null
  tariff_name: string | null
  price: number
  paid: number
  debt: number
  cashback_used: number
  cashback_earned: number
  cashback_percent: number | null
  event_cashback_percent: number
  cashback_balance: number
  next_due_date: string | null
  enrolled_at: string
  age_days: number
}

export async function listDebtors(f: FinanceFilters, status: DebtStatus): Promise<DebtorRow[]> {
  const { data, error } = await db.rpc("finance_debtors", { ...filterParams(f), p_status: status })
  if (error) throw financeError(error)
  // Normalise numerics once here so the UI never does arithmetic on strings.
  return ((data ?? []) as Array<DebtorRow & Record<string, unknown>>).map((r) => ({
    ...r,
    price: Number(r.price),
    paid: Number(r.paid),
    debt: Number(r.debt),
    cashback_used: Number(r.cashback_used),
    cashback_earned: Number(r.cashback_earned),
    cashback_percent: r.cashback_percent === null ? null : Number(r.cashback_percent),
    event_cashback_percent: Number(r.event_cashback_percent),
    cashback_balance: Number(r.cashback_balance),
    age_days: Number(r.age_days),
  }))
}

// ─── Money movements (RPC only — payments has no write policy) ──────────────

export interface RecordPaymentInput {
  eventId: string
  amount: number
  method: PaymentMethod
  paidAt: string
  client: EnrollClient
  // Required when the client isn't in the event yet: enrols them in the same transaction.
  enroll: { tariffId: string; sellerId: string; price: number } | null
  nextDueDate: string | null
  note: string
}

export async function recordPayment(i: RecordPaymentInput): Promise<string> {
  const c = i.client
  const { data, error } = await db.rpc("record_payment", {
    p_event_id: i.eventId,
    p_amount: i.amount,
    p_method: i.method,
    p_paid_at: i.paidAt,
    p_client_id: "clientId" in c ? c.clientId : null,
    p_full_name: "fullName" in c ? c.fullName : null,
    p_phone: "phone" in c ? c.phone : null,
    p_tariff_id: i.enroll?.tariffId ?? null,
    p_seller_id: i.enroll?.sellerId ?? null,
    p_price: i.enroll?.price ?? null,
    p_next_due_date: i.nextDueDate,
    p_note: i.note || null,
  })
  if (error) throw financeError(error)
  return data as string
}

export async function voidPayment(id: string, reason: string): Promise<void> {
  const { error } = await db.rpc("void_payment", { p_payment_id: id, p_reason: reason })
  if (error) throw financeError(error)
}

export async function refundPayment(v: {
  participantId: string
  amount: number
  method: PaymentMethod
  note: string
}): Promise<void> {
  const { error } = await db.rpc("refund_payment", {
    p_participant_id: v.participantId,
    p_amount: v.amount,
    p_method: v.method,
    p_note: v.note || null,
  })
  if (error) throw financeError(error)
}

export interface ParticipantFinancePatch {
  price?: number
  seller_id?: string | null
  next_due_date?: string | null
}

// price / next_due_date are guarded in the DB (053): non-finance users get forbidden: finance_fields.
export async function updateParticipantFinance(id: string, patch: ParticipantFinancePatch): Promise<void> {
  const { error } = await db.from("event_participants").update(patch).eq("id", id)
  if (error) throw financeError(error)
}

// ─── Expenses (RPC writes only — expenses has no write policy) ───────────────

export type ExpenseCategory = "zal" | "spiker" | "kofe_brek" | "reklama" | "maosh" | "ofis" | "boshqa"

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  zal: "Zal",
  spiker: "Spiker",
  kofe_brek: "Kofe-brek",
  reklama: "Reklama",
  maosh: "Maosh",
  ofis: "Ofis",
  boshqa: "Boshqa",
}

export interface ExpenseRow {
  id: string
  event_id: string | null         // null = general expense
  event_name: string | null
  category: ExpenseCategory
  amount: number
  spent_at: string                // YYYY-MM-DD
  note: string | null
  voided_at: string | null
  void_reason: string | null
  receipt_path: string | null
  recorder_name: string | null
}

interface ExpenseJoin extends Omit<ExpenseRow, "amount" | "event_name" | "recorder_name"> {
  amount: number | string
  event: { name: string } | null
  recorder: { full_name: string } | null
}

// Expenses have no seller or payment method: only the period and event filters apply.
export async function listExpenses(f: FinanceFilters, page: number): Promise<ExpenseRow[]> {
  let q = db
    .from("expenses")
    .select("id, event_id, category, amount, spent_at, note, voided_at, void_reason, receipt_path, event:event_id(name), recorder:recorded_by(full_name)")
    .order("spent_at", { ascending: false })
    .order("created_at", { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
  if (f.from) q = q.gte("spent_at", f.from)
  if (f.to) q = q.lte("spent_at", f.to)
  if (f.eventId) q = q.eq("event_id", f.eventId)

  const { data, error } = await q
  if (error) throw financeError(error)
  return ((data ?? []) as unknown as ExpenseJoin[]).map(({ event, recorder, ...r }) => ({
    ...r,
    amount: Number(r.amount),
    event_name: event?.name ?? null,
    recorder_name: recorder?.full_name ?? null,
  }))
}

export async function countExpenses(f: FinanceFilters): Promise<number> {
  let q = db.from("expenses").select("id", { count: "exact", head: true })
  if (f.from) q = q.gte("spent_at", f.from)
  if (f.to) q = q.lte("spent_at", f.to)
  if (f.eventId) q = q.eq("event_id", f.eventId)

  const { count, error } = await q
  if (error) throw financeError(error)
  return count ?? 0
}

export interface AddExpenseInput {
  category: ExpenseCategory
  amount: number
  spentAt: string                 // YYYY-MM-DD
  eventId: string | null
  note: string
}

export async function addExpense(i: AddExpenseInput): Promise<string> {
  const { data, error } = await db.rpc("add_expense", {
    p_category: i.category,
    p_amount: i.amount,
    p_spent_at: i.spentAt,
    p_event_id: i.eventId,
    p_note: i.note || null,
  })
  if (error) throw financeError(error)
  return data as string
}

export async function voidExpense(id: string, reason: string): Promise<void> {
  const { error } = await db.rpc("void_expense", { p_expense_id: id, p_reason: reason })
  if (error) throw financeError(error)
}

// ─── Per-event profit (Tadbirlar tab) ────────────────────────────────────────

export interface EventProfitRow {
  event_id: string | null         // null = general (no-event) expenses
  event_name: string | null
  event_date: string | null
  total_value: number             // plan (events.total_value); 0 = not set
  agreed: number
  collected: number               // cash: payments − refunds
  debt: number
  expense: number
  profit: number                  // collected − expense
}

export async function listEventProfit(f: FinanceFilters): Promise<EventProfitRow[]> {
  const { data, error } = await db.rpc("event_profit", { p_from: f.from, p_to: f.to, p_event_id: f.eventId })
  if (error) throw financeError(error)
  return ((data ?? []) as Array<EventProfitRow & Record<string, unknown>>).map((r) => ({
    ...r,
    total_value: Number(r.total_value),
    agreed: Number(r.agreed),
    collected: Number(r.collected),
    debt: Number(r.debt),
    expense: Number(r.expense),
    profit: Number(r.profit),
  }))
}

// ─── Receipts (chek) — private bucket, path '<kind>/<id>/<file>' ────────────

export type ReceiptKind = "payment" | "expense"
export const RECEIPT_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf"
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024

// Upload, then link through attach_receipt (the RPC checks the path belongs to that row).
export async function attachReceipt(kind: ReceiptKind, id: string, file: File): Promise<void> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "bin"
  const path = `${kind}/${id}/${crypto.randomUUID()}.${ext}`
  const { error: uploadError } = await supabase.storage.from("receipts").upload(path, file, { contentType: file.type })
  if (uploadError) throw new Error(`Chek yuklanmadi: ${uploadError.message}`)
  const { error } = await db.rpc("attach_receipt", { p_kind: kind, p_id: id, p_path: path })
  if (error) throw financeError(error)
}

// Short-lived link: the bucket is private.
export async function receiptUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("receipts").createSignedUrl(path, 300)
  if (error) throw new Error(error.message)
  return data.signedUrl
}
