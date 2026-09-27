import { useState } from "react"
import { Plus, Minus } from "@phosphor-icons/react"
import { useAuth } from "@/context/AuthContext"
import { useFinanceFilters } from "@/hooks/useFinanceFilters"
import { FinanceFilterBar } from "@/components/moliya/FinanceFilterBar"
import { FinanceKpis } from "@/components/moliya/FinanceKpis"
import { PaymentsTab } from "@/components/moliya/PaymentsTab"
import { DebtorsTab } from "@/components/moliya/DebtorsTab"
import { ExpensesTab } from "@/components/moliya/ExpensesTab"
import { EventProfitTab } from "@/components/moliya/EventProfitTab"
import { RecordPaymentModal, type RecordPaymentPreset } from "@/components/moliya/RecordPaymentModal"
import { AddExpenseModal } from "@/components/moliya/ExpenseModals"

const TABS = [
  { id: "payments", label: "To'lovlar" },
  { id: "debtors", label: "Qarzdorlar" },
  { id: "expenses", label: "Xarajatlar" },
  { id: "events", label: "Tadbir natijalari" },
] as const
type TabId = (typeof TABS)[number]["id"]

// Global finance: one page over all events; an event is just a filter.
export function EventsMoliya() {
  const { canEdit } = useAuth()
  const editable = canEdit("tadbirlar-moliya")
  const { filters, get, set } = useFinanceFilters()
  const tab: TabId = TABS.find((t) => t.id === get("tab"))?.id ?? "payments"
  // undefined = closed; null = open blank; a preset = open for that client/event
  const [recording, setRecording] = useState<RecordPaymentPreset | null | undefined>(undefined)
  const [addingExpense, setAddingExpense] = useState(false)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FinanceFilterBar />
        {editable && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAddingExpense(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-mute-soft text-ink rounded-control text-base font-bold hover:bg-mute-soft-hover transition-colors"
            >
              <Minus size={16} /> Chiqim
            </button>
            <button
              onClick={() => setRecording(null)}
              className="flex items-center gap-1.5 px-4 py-2 bg-accent text-ink-on-accent rounded-control text-base font-bold hover:bg-accent-hover transition-colors"
            >
              <Plus size={16} /> Kirim
            </button>
          </div>
        )}
      </div>

      <FinanceKpis filters={filters} />

      <div role="tablist" aria-label="Moliya bo'limlari" className="flex items-center gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => set({ tab: t.id === "payments" ? null : t.id })}
            className={`h-control-md px-3.5 rounded-full whitespace-nowrap text-base font-medium transition-colors ${
              tab === t.id ? "bg-mute-soft text-ink" : "text-ink-muted hover:bg-mute-ghost-hover hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "payments" && <PaymentsTab filters={filters} canEdit={editable} />}
      {tab === "debtors" && (
        <DebtorsTab
          filters={filters}
          canEdit={editable}
          onPay={(r) =>
            r.client_id &&
            setRecording({ client: { id: r.client_id, full_name: r.full_name, phone: r.phone, image: null }, eventId: r.event_id })
          }
        />
      )}
      {tab === "expenses" && <ExpensesTab filters={filters} canEdit={editable} />}
      {tab === "events" && <EventProfitTab filters={filters} />}

      {recording !== undefined && <RecordPaymentModal preset={recording ?? undefined} onClose={() => setRecording(undefined)} />}
      {addingExpense && <AddExpenseModal defaultEventId={filters.eventId} onClose={() => setAddingExpense(false)} />}
    </div>
  )
}
