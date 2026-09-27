import { useState } from "react"
import { Plus } from "@phosphor-icons/react"
import { useAuth } from "@/context/AuthContext"
import { useFinanceFilters } from "@/hooks/useFinanceFilters"
import { FinanceFilterBar } from "@/components/moliya/FinanceFilterBar"
import { FinanceKpis } from "@/components/moliya/FinanceKpis"
import { PaymentsTab } from "@/components/moliya/PaymentsTab"
import { DebtorsTab } from "@/components/moliya/DebtorsTab"
import { RecordPaymentModal, type RecordPaymentPreset } from "@/components/moliya/RecordPaymentModal"

const TABS = [
  { id: "payments", label: "To'lovlar" },
  { id: "debtors", label: "Qarzdorlar" },
] as const

// Global finance: one page over all events; an event is just a filter.
export function EventsMoliya() {
  const { canEdit } = useAuth()
  const editable = canEdit("tadbirlar-moliya")
  const { filters, get, set } = useFinanceFilters()
  const tab = get("tab") === "debtors" ? "debtors" : "payments"
  // undefined = closed; null = open blank; a preset = open for that client/event
  const [recording, setRecording] = useState<RecordPaymentPreset | null | undefined>(undefined)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FinanceFilterBar />
        {editable && (
          <button
            onClick={() => setRecording(null)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#141414] text-white rounded-[8px] text-[13px] font-bold hover:bg-[#333] transition-colors"
          >
            <Plus size={15} weight="bold" /> To'lov qo'shish
          </button>
        )}
      </div>

      <FinanceKpis filters={filters} />

      <div role="tablist" aria-label="Moliya bo'limlari" className="flex gap-1 border-b border-[#F0F0F0]">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => set({ tab: t.id === "payments" ? null : t.id })}
            className={`px-4 py-2 -mb-px text-[13px] font-semibold border-b-2 transition-colors ${
              tab === t.id ? "border-[#141414] text-[#141414]" : "border-transparent text-[#999] hover:text-[#141414]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "payments" ? (
        <PaymentsTab filters={filters} canEdit={editable} />
      ) : (
        <DebtorsTab
          filters={filters}
          canEdit={editable}
          onPay={(r) =>
            r.client_id &&
            setRecording({ client: { id: r.client_id, full_name: r.full_name, phone: r.phone, image: null }, eventId: r.event_id })
          }
        />
      )}

      {recording !== undefined && <RecordPaymentModal preset={recording ?? undefined} onClose={() => setRecording(undefined)} />}
    </div>
  )
}
