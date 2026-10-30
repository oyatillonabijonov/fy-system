import { useState } from "react"
import { Plus, Minus } from "@phosphor-icons/react"
import { useAuth } from "@/context/AuthContext"
import { useFinanceFilters } from "@/hooks/useFinanceFilters"
import { FinanceFilterBar, MobileFilterBar } from "@/components/moliya/FinanceFilterBar"
import { FinanceKpis } from "@/components/moliya/FinanceKpis"
import { PaymentsTab } from "@/components/moliya/PaymentsTab"
import { DebtorsTab } from "@/components/moliya/DebtorsTab"
import { ExpensesTab } from "@/components/moliya/ExpensesTab"
import { EventProfitTab } from "@/components/moliya/EventProfitTab"
import { RecordPaymentModal, type RecordPaymentPreset } from "@/components/moliya/RecordPaymentModal"
import { AddExpenseModal } from "@/components/moliya/ExpenseModals"
import { Fab } from "@/components/ui/Fab"
import { Segmented } from "@/components/moliya/mobile"

const TABS = [
  { id: "payments", label: "To'lovlar", short: "To'lovlar" },
  { id: "debtors", label: "Qarzdorlar", short: "Qarzdorlar" },
  { id: "expenses", label: "Xarajatlar", short: "Xarajatlar" },
  { id: "events", label: "Tadbir natijalari", short: "Natijalar" },
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
    <div className="flex flex-col gap-5 max-lg:gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 max-lg:hidden">
        <FinanceFilterBar />
        {editable && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAddingExpense(true)}
              className="flex items-center gap-1.5 px-4 py-2 whitespace-nowrap bg-mute-soft text-ink rounded-full text-base font-bold hover:bg-mute-soft-hover transition-colors"
            >
              <Minus size={16} /> Chiqim
            </button>
            <button
              onClick={() => setRecording(null)}
              className="flex items-center gap-1.5 px-4 py-2 whitespace-nowrap bg-accent text-ink-on-accent rounded-full text-base font-bold hover:bg-accent-hover transition-colors"
            >
              <Plus size={16} /> Kirim
            </button>
          </div>
        )}
      </div>

      <MobileFilterBar />

      <FinanceKpis filters={filters} />

      <div className="lg:hidden sticky -top-4 sm:-top-6 z-10 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 bg-ground">
        <Segmented
          label="Moliya bo'limlari"
          options={TABS.map((t) => ({ id: t.id, label: t.short }))}
          value={tab}
          onChange={(id) => set({ tab: id === "payments" ? null : id })}
        />
      </div>
      <div role="tablist" aria-label="Moliya bo'limlari" className="flex items-center gap-1 overflow-x-auto no-scrollbar max-lg:hidden">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => set({ tab: t.id === "payments" ? null : t.id })}
            className={`h-control-md px-3.5 rounded-full shrink-0 whitespace-nowrap text-base font-medium transition-colors ${
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

      {/* Qarzdorlar: every card carries its own "To'lov", so no floating button there */}
      {editable && tab !== "debtors" && (tab === "expenses"
        ? <Fab icon={<Minus size={20} weight="bold" />} label="Chiqim" onClick={() => setAddingExpense(true)} />
        : <Fab icon={<Plus size={20} weight="bold" />} label="Kirim" onClick={() => setRecording(null)} />)}
      {editable && tab !== "debtors" && <div className="h-20 lg:hidden" aria-hidden />}

      {recording !== undefined && <RecordPaymentModal preset={recording ?? undefined} onClose={() => setRecording(undefined)} />}
      {addingExpense && <AddExpenseModal defaultEventId={filters.eventId} onClose={() => setAddingExpense(false)} />}
    </div>
  )
}
