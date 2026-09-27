import { useState } from "react"
import { Coins } from "@phosphor-icons/react"
import { useDebtors, useUpdateParticipantFinance } from "@/hooks/useFinance"
import { useFinanceFilters } from "@/hooks/useFinanceFilters"
import { useSetParticipantCashbackPercent } from "@/hooks/useCashback"
import { useUsers } from "@/hooks/useUsers"
import type { DebtorRow, DebtStatus, FinanceFilters, ParticipantFinancePatch } from "@/lib/supabase/queries/finance"
import { ApplyCashbackModal } from "@/components/cashback/ApplyCashbackModal"
import { CashbackPercentCell, PriceCell } from "@/components/moliya/cells"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { tashkentToday } from "@/lib/period"
import { formatDate, formatMoney, formatPhone } from "@/lib/format"
import { ThinkingOrb } from "thinking-orbs"

const STATUS_LABEL: Record<DebtStatus, string> = {
  debt: "Qarzdorlar",
  overdue: "Muddati o'tganlar",
  paid: "To'liq to'laganlar",
  all: "Hammasi",
}

const SELECT =
  "border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] bg-white focus:outline-none focus:border-[#141414] transition-colors"

// Receivables aging, counted from the enrolment day.
function aging(days: number): { label: string; color: string } {
  if (days <= 30) return { label: "0–30 kun", color: "#999999" }
  if (days <= 60) return { label: "31–60 kun", color: "#B7791F" }
  return { label: "60+ kun", color: "#D13328" }
}

interface SellerOption {
  id: string
  full_name: string
}

export function DebtorsTab({ filters, canEdit, onPay }: { filters: FinanceFilters; canEdit: boolean; onPay: (row: DebtorRow) => void }) {
  const { get, set } = useFinanceFilters()
  const raw = get("status")
  const status: DebtStatus = raw === "overdue" || raw === "paid" || raw === "all" ? raw : "debt"
  const { data: rows = [], isLoading } = useDebtors(filters, status)
  const { data: users = [] } = useUsers()
  const sellers: SellerOption[] = users
    .filter((u) => u.is_active && u.department === "sotuv")
    .map((u) => ({ id: u.id, full_name: u.full_name }))
  const [spending, setSpending] = useState<DebtorRow | null>(null)
  const today = tashkentToday()

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <select
          aria-label="Holat"
          value={status}
          onChange={(e) => set({ status: e.target.value === "debt" ? null : e.target.value })}
          className={SELECT}
        >
          {(Object.keys(STATUS_LABEL) as DebtStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
        {!isLoading && <span className="text-[12px] text-[#999]">{rows.length} ta</span>}
      </div>

      <div className="bg-white border border-[#F0F0F0] rounded-[12px] overflow-hidden">
        {isLoading ? (
          <div className="py-10 flex items-center justify-center">
            <ThinkingOrb state="searching" size={20} theme="light" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-[#999]">Bu filtrlar bo'yicha ishtirokchi yo'q</div>
        ) : (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11px] font-bold text-[#999] border-b border-[#F0F0F0]">
                  <th className="px-4 py-2.5 font-bold">Mijoz</th>
                  <th className="px-4 py-2.5 font-bold">Tadbir</th>
                  <th className="px-4 py-2.5 font-bold">Sotuvchi</th>
                  <th className="px-4 py-2.5 font-bold">Tarif</th>
                  <th className="px-4 py-2.5 font-bold text-right">Kelishuv</th>
                  <th className="px-4 py-2.5 font-bold text-right">To'langan</th>
                  <th className="px-4 py-2.5 font-bold text-right">Qoldiq</th>
                  <th className="px-4 py-2.5 font-bold">Keyingi to'lov</th>
                  <th className="px-4 py-2.5 font-bold">Qarz yoshi</th>
                  <th className="px-4 py-2.5 font-bold text-right">Keshbek</th>
                  {canEdit && <th className="px-4 py-2.5 font-bold text-right">Amal</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <DebtorTableRow key={r.participant_id} r={r} sellers={sellers} today={today} canEdit={canEdit} onPay={onPay} onSpend={setSpending} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {spending && (
        <ApplyCashbackModal
          isOpen
          onClose={() => setSpending(null)}
          participant={{
            id: spending.participant_id,
            contact_id: spending.client_id,
            event_id: spending.event_id,
            full_name: spending.full_name,
            price: spending.price,
            paid: spending.paid,
          }}
          balance={spending.cashback_balance}
        />
      )}
    </div>
  )
}

// One row per component: the cashback-% hook is keyed by the row's event.
function DebtorTableRow({
  r,
  sellers,
  today,
  canEdit,
  onPay,
  onSpend,
}: {
  r: DebtorRow
  sellers: SellerOption[]
  today: string
  canEdit: boolean
  onPay: (row: DebtorRow) => void
  onSpend: (row: DebtorRow) => void
}) {
  const update = useUpdateParticipantFinance()
  const setPercent = useSetParticipantCashbackPercent(r.event_id)
  const inDebt = r.debt > 0
  const overdue = inDebt && !!r.next_due_date && r.next_due_date < today
  const age = aging(r.age_days)
  // A seller who has since left Sotuv still shows on their old sales.
  const sellerOptions =
    r.seller_id && !sellers.some((s) => s.id === r.seller_id)
      ? [...sellers, { id: r.seller_id, full_name: r.seller_name ?? "—" }]
      : sellers

  function patch(p: ParticipantFinancePatch) {
    update.mutate({ id: r.participant_id, patch: p }, { onError: (e) => window.alert(e.message) })
  }

  return (
    <tr className="border-b border-[#F7F7F7] last:border-0 hover:bg-[#FBFBFB] transition-colors">
      <td className="px-4 py-2.5 whitespace-nowrap">
        <div className="text-[13px] font-medium text-[#141414]">{r.full_name}</div>
        <div className="text-[11px] text-[#999]">{formatPhone(r.phone)}</div>
      </td>
      <td className="px-4 py-2.5 text-[13px] text-[#666] whitespace-nowrap">{r.event_name}</td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        {canEdit ? (
          <select
            aria-label={`${r.full_name} sotuvchisi`}
            value={r.seller_id ?? ""}
            onChange={(e) => patch({ seller_id: e.target.value || null })}
            className="border border-transparent hover:border-[#E0E0E0] rounded-[6px] px-1.5 py-1 text-[13px] text-[#666] bg-transparent focus:outline-none focus:border-[#141414]"
          >
            <option value="">Belgilanmagan</option>
            {sellerOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
        ) : (
          <span className="text-[13px] text-[#666]">{r.seller_name ?? "Belgilanmagan"}</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-[13px] text-[#666] whitespace-nowrap">{r.tariff_name ?? "Individual"}</td>
      <td className="px-4 py-2.5 text-right whitespace-nowrap">
        {canEdit ? <PriceCell value={r.price} onSave={(price) => patch({ price })} /> : <span className="text-[13px] text-[#141414]">{formatMoney(r.price)}</span>}
      </td>
      <td className="px-4 py-2.5 text-[13px] text-[#141414] text-right whitespace-nowrap">{formatMoney(r.paid)}</td>
      <td className="px-4 py-2.5 text-right whitespace-nowrap">
        {inDebt ? (
          <span className="text-[13px] font-bold" style={{ color: "#D13328" }}>{formatMoney(r.debt)}</span>
        ) : (
          <span className="inline-flex justify-end"><StatusBadge label="To'langan" variant="success" dot /></span>
        )}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        {canEdit && inDebt ? (
          <input
            type="date"
            aria-label={`${r.full_name} keyingi to'lov sanasi`}
            value={r.next_due_date ?? ""}
            onChange={(e) => patch({ next_due_date: e.target.value || null })}
            className="border border-[#E0E0E0] rounded-[6px] px-2 py-1 text-[12px] bg-white focus:outline-none focus:border-[#141414]"
            style={{ color: overdue ? "#D13328" : "#141414" }}
          />
        ) : (
          <span className="text-[12px]" style={{ color: overdue ? "#D13328" : "#999" }}>{r.next_due_date ? formatDate(r.next_due_date) : "—"}</span>
        )}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap text-[12px] font-semibold" style={{ color: inDebt ? age.color : "#CCCCCC" }}>
        {inDebt ? age.label : "—"}
      </td>
      <td className="px-4 py-2.5 text-right whitespace-nowrap">
        {canEdit ? (
          <CashbackPercentCell
            percent={r.cashback_percent}
            earned={r.cashback_earned}
            defaultPercent={r.event_cashback_percent}
            onSet={(percent) =>
              setPercent.mutate({ participantId: r.participant_id, percent }, { onError: (e) => window.alert(e.message) })
            }
          />
        ) : (
          <StatusBadge label={`${r.cashback_percent ?? r.event_cashback_percent}%`} variant="neutral" />
        )}
      </td>
      {canEdit && (
        <td className="px-4 py-2.5 text-right whitespace-nowrap">
          <span className="inline-flex items-center gap-1.5 justify-end">
            {r.client_id && r.cashback_balance > 0 && inDebt && (
              <button
                onClick={() => onSpend(r)}
                title={`Keshbek balansi: ${formatMoney(r.cashback_balance)}`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-semibold text-[#141414] bg-[#F5F5F5] hover:bg-[#EBEBEB] transition-colors"
              >
                Keshbek
              </button>
            )}
            {inDebt && (
              <button
                onClick={() => onPay(r)}
                disabled={!r.client_id}
                title={r.client_id ? "To'lov qo'shish" : "Mijoz kartasi bog'lanmagan — to'lovni kiritib bo'lmaydi"}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-semibold text-[#141414] border border-[#E0E0E0] hover:bg-[#F5F5F5] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Coins size={13} weight="bold" /> To'lov
              </button>
            )}
          </span>
        </td>
      )}
    </tr>
  )
}
