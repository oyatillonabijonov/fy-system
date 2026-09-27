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
import { tbl } from "@/components/ui/table"
import { Pager, usePaged } from "@/components/ui/Pager"
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
  "h-control-md pl-3 pr-8 rounded-control bg-surface-sunken text-base text-ink border border-transparent outline-none focus:border-line-focus"

// Receivables aging, counted from the enrolment day.
function aging(days: number): { label: string; variant: "neutral" | "warning" | "danger" } {
  if (days <= 30) return { label: "0–30 kun", variant: "neutral" }
  if (days <= 60) return { label: "31–60 kun", variant: "warning" }
  return { label: "60+ kun", variant: "danger" }
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
  const paged = usePaged(rows)
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
        {!isLoading && <span className="text-sm text-ink-muted tabular-nums">{rows.length} ta</span>}
      </div>

      {isLoading ? (
        <div className="py-10 flex items-center justify-center">
          <ThinkingOrb state="searching" size={20} theme="light" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-base text-ink-muted">Bu filtrlar bo'yicha ishtirokchi yo'q</div>
      ) : (
        <>
          <div className={tbl.scroll}>
            <table className={tbl.table}>
              <thead>
                <tr>
                  <th className={tbl.th}>Mijoz</th>
                  <th className={tbl.th}>Tadbir</th>
                  <th className={tbl.th}>Sotuvchi</th>
                  <th className={`${tbl.th} text-right`}>Kelishuv</th>
                  <th className={`${tbl.th} text-right`}>To'langan</th>
                  <th className={`${tbl.th} text-right`}>Qoldiq</th>
                  <th className={tbl.th}>Keyingi to'lov</th>
                  <th className={`${tbl.th} text-right`}>Keshbek</th>
                  {canEdit && <th className={`${tbl.th} text-right`}>Amal</th>}
                </tr>
              </thead>
              <tbody>
                {paged.pageItems.map((r) => (
                  <DebtorTableRow key={r.participant_id} r={r} sellers={sellers} today={today} canEdit={canEdit} onPay={onPay} onSpend={setSpending} />
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={paged.page} pageCount={paged.pageCount} total={rows.length} onPage={paged.setPage} />
        </>
      )}

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
    <tr className={tbl.tr}>
      <td className={`${tbl.td} whitespace-nowrap`}>
        <div className="font-medium text-ink">{r.full_name}</div>
        <div className="text-xs text-ink-muted">{formatPhone(r.phone)}</div>
      </td>
      <td className={`${tbl.td} whitespace-nowrap`}>
        <div className="text-ink-muted">{r.event_name}</div>
        <div className="text-xs text-ink-faint">{r.tariff_name ?? "Individual"}</div>
      </td>
      <td className={`${tbl.td} whitespace-nowrap`}>
        {canEdit ? (
          <select
            aria-label={`${r.full_name} sotuvchisi`}
            value={r.seller_id ?? ""}
            onChange={(e) => patch({ seller_id: e.target.value || null })}
            className="border border-transparent hover:border-line rounded-item px-1.5 py-1 text-base text-ink-muted bg-transparent focus:outline-none focus:border-line-focus"
          >
            <option value="">Belgilanmagan</option>
            {sellerOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
        ) : (
          <span className="text-ink-muted">{r.seller_name ?? "Belgilanmagan"}</span>
        )}
      </td>
      <td className={`${tbl.td} text-right whitespace-nowrap`}>
        {canEdit ? <PriceCell value={r.price} onSave={(price) => patch({ price })} /> : <span className="text-ink">{formatMoney(r.price)}</span>}
      </td>
      <td className={`${tbl.td} text-ink text-right tabular-nums whitespace-nowrap`}>{formatMoney(r.paid)}</td>
      <td className={`${tbl.td} text-right whitespace-nowrap`}>
        {inDebt ? (
          <span className="inline-flex flex-col items-end gap-1">
            <span className="font-bold text-danger-text tabular-nums">{formatMoney(r.debt)}</span>
            <StatusBadge label={age.label} variant={age.variant} />
          </span>
        ) : (
          <span className="inline-flex justify-end"><StatusBadge label="To'langan" variant="success" dot /></span>
        )}
      </td>
      <td className={`${tbl.td} whitespace-nowrap`}>
        {canEdit && inDebt ? (
          <input
            type="date"
            aria-label={`${r.full_name} keyingi to'lov sanasi`}
            value={r.next_due_date ?? ""}
            onChange={(e) => patch({ next_due_date: e.target.value || null })}
            className={`border rounded-item px-2 py-1 text-sm bg-surface focus:outline-none focus:border-line-focus ${
              overdue ? "border-danger-text text-danger-text" : "border-line text-ink"
            }`}
          />
        ) : (
          <span className={`text-sm ${overdue ? "text-danger-text" : "text-ink-muted"}`}>{r.next_due_date ? formatDate(r.next_due_date) : "—"}</span>
        )}
      </td>
      <td className={`${tbl.td} text-right whitespace-nowrap`}>
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
        <td className={`${tbl.td} text-right whitespace-nowrap`}>
          <span className="inline-flex items-center gap-1.5 justify-end">
            {r.client_id && r.cashback_balance > 0 && inDebt && (
              <button
                onClick={() => onSpend(r)}
                title={`Keshbek balansi: ${formatMoney(r.cashback_balance)}`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-tag text-xs font-semibold text-ink bg-mute-soft hover:bg-mute-soft-hover transition-colors"
              >
                Keshbek
              </button>
            )}
            {inDebt && (
              <button
                onClick={() => onPay(r)}
                disabled={!r.client_id}
                title={r.client_id ? "To'lov qo'shish" : "Mijoz kartasi bog'lanmagan — to'lovni kiritib bo'lmaydi"}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-tag text-xs font-semibold text-ink bg-mute-soft hover:bg-mute-soft-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Coins size={16} /> To'lov
              </button>
            )}
          </span>
        </td>
      )}
    </tr>
  )
}
