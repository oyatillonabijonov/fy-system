import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query"
import {
  getFinanceSummary,
  listPayments,
  countPayments,
  listDebtors,
  recordPayment,
  voidPayment,
  refundPayment,
  settleNoShow,
  updateParticipantFinance,
  listExpenses,
  countExpenses,
  addExpense,
  voidExpense,
  attachReceipt,
  listEventProfit,
  type FinanceFilters,
  type FinanceSummary,
  type PaymentRow,
  type DebtorRow,
  type DebtStatus,
  type ParticipantFinancePatch,
  type RecordPaymentInput,
  type AddExpenseInput,
  type ReceiptKind,
  type ExpenseRow,
  type EventProfitRow,
} from "@/lib/supabase/queries/finance"
import { FINANCE_KEY, PARTICIPANTS_KEY, EVENT_COUNTS_KEY } from "@/hooks/useEvents"
import { CLIENTS_KEY } from "@/hooks/useClients"
import { CLIENT_CASHBACK_KEY } from "@/hooks/useCashback"

// Money must never look stale: every view that shows it, after any movement.
// FINANCE_KEY's own queries already set refetchOnMount: true, so a plain
// invalidate is enough there. Everything else relies on main.tsx's global
// refetchOnMount: false, which only refetches a query that's active — an
// inactive one (e.g. Mijozlar, Boshqaruv participants) would stay on stale
// cache until its screen happens to remount, so force those with refetchType.
function invalidateMoney(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: FINANCE_KEY })
  qc.invalidateQueries({ queryKey: PARTICIPANTS_KEY, refetchType: "all" })
  qc.invalidateQueries({ queryKey: EVENT_COUNTS_KEY, refetchType: "all" })
  qc.invalidateQueries({ queryKey: CLIENTS_KEY, refetchType: "all" })
  qc.invalidateQueries({ queryKey: CLIENT_CASHBACK_KEY, refetchType: "all" })
  qc.invalidateQueries({ queryKey: ["client-journey"], refetchType: "all" })
  qc.invalidateQueries({ queryKey: ["client-participations"], refetchType: "all" })
}

// refetchOnMount: true — main.tsx defaults this off globally (avoids tab-return
// flicker), but a money movement invalidates other tabs' queries while they're
// inactive, only marking them stale; without this they'd stay on the stale cache
// forever. `true` still only refetches when actually stale, so no extra traffic.
export function useFinanceSummary(f: FinanceFilters) {
  return useQuery<FinanceSummary>({
    queryKey: [...FINANCE_KEY, "summary", f],
    queryFn: () => getFinanceSummary(f),
    refetchOnMount: true,
  })
}

export function usePaymentsList(f: FinanceFilters, page: number) {
  return useQuery<PaymentRow[]>({
    queryKey: [...FINANCE_KEY, "payments", f, page],
    queryFn: () => listPayments(f, page),
    placeholderData: (prev) => prev, // keeps the rows on screen while the next page loads
    refetchOnMount: true,
  })
}

export function usePaymentsCount(f: FinanceFilters) {
  return useQuery<number>({
    queryKey: [...FINANCE_KEY, "payments-count", f],
    queryFn: () => countPayments(f),
    refetchOnMount: true,
  })
}

export function useDebtors(f: FinanceFilters, status: DebtStatus) {
  return useQuery<DebtorRow[]>({
    queryKey: [...FINANCE_KEY, "debtors", f, status],
    queryFn: () => listDebtors(f, status),
    refetchOnMount: true,
  })
}

export function useExpensesList(f: FinanceFilters, page: number) {
  return useQuery<ExpenseRow[]>({
    queryKey: [...FINANCE_KEY, "expenses", f, page],
    queryFn: () => listExpenses(f, page),
    placeholderData: (prev) => prev,
    refetchOnMount: true,
  })
}

export function useExpensesCount(f: FinanceFilters) {
  return useQuery<number>({
    queryKey: [...FINANCE_KEY, "expenses-count", f],
    queryFn: () => countExpenses(f),
    refetchOnMount: true,
  })
}

export function useEventProfit(f: FinanceFilters) {
  return useQuery<EventProfitRow[]>({
    queryKey: [...FINANCE_KEY, "event-profit", f],
    queryFn: () => listEventProfit(f),
    refetchOnMount: true,
  })
}

// Money modals show the RPC's error inline, so only the success is announced here
function useMoneyMutation<V, R>(fn: (vars: V) => Promise<R>, success?: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => invalidateMoney(qc), meta: { success, silent: true } })
}

// A receipt that fails to upload never undoes the money: the row stays saved and the
// receipt can be attached later from the list. Resolves false when it wasn't attached.
async function saveThenAttach(kind: ReceiptKind, save: () => Promise<string | null>, file: File | null): Promise<boolean> {
  const id = await save()
  if (!file || !id) return true
  try {
    await attachReceipt(kind, id, file)
    return true
  } catch {
    return false
  }
}

export const useRecordPayment = () =>
  useMoneyMutation((v: RecordPaymentInput & { receipt: File | null }) => saveThenAttach("payment", () => recordPayment(v), v.receipt), "To'lov saqlandi")
export const useVoidPayment = () =>
  useMoneyMutation((v: { id: string; reason: string }) => voidPayment(v.id, v.reason), "To'lov bekor qilindi")
export const useRefundPayment = () => useMoneyMutation(refundPayment, "Pul qaytarildi")
export const useSettleNoShow = () => useMoneyMutation(settleNoShow, "Qatnashmadi — hisob yopildi")
export const useUpdateParticipantFinance = () =>
  useMoneyMutation((v: { id: string; patch: ParticipantFinancePatch }) => updateParticipantFinance(v.id, v.patch), "Saqlandi")

export const useAddExpense = () =>
  useMoneyMutation((v: AddExpenseInput & { receipt: File | null }) => saveThenAttach("expense", () => addExpense(v), v.receipt), "Xarajat qo'shildi")
export const useAttachReceipt = () =>
  useMoneyMutation((v: { kind: ReceiptKind; id: string; file: File }) => attachReceipt(v.kind, v.id, v.file), "Chek biriktirildi")
export const useVoidExpense = () =>
  useMoneyMutation((v: { id: string; reason: string }) => voidExpense(v.id, v.reason), "Xarajat bekor qilindi")
