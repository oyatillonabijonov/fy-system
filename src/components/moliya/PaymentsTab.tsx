import { useState } from "react"
import { ArrowUUpLeft, Prohibit } from "@phosphor-icons/react"
import { usePaymentsList, usePaymentsCount } from "@/hooks/useFinance"
import type { FinanceFilters, PaymentRow } from "@/lib/supabase/queries/finance"
import type { PaymentMethod } from "@/lib/supabase/queries/payments"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { RefundModal, VoidPaymentModal } from "@/components/moliya/PaymentActionModals"
import { tbl } from "@/components/ui/table"
import { Pager, PAGE_SIZE } from "@/components/ui/Pager"
import { formatDate, formatMoney, formatPhone } from "@/lib/format"
import { ThinkingOrb } from "thinking-orbs"

const METHOD_LABEL: Record<PaymentMethod, string> = { naqd: "Naqd", karta: "Karta", transfer: "Transfer" }

export function PaymentsTab({ filters, canEdit }: { filters: FinanceFilters; canEdit: boolean }) {
  const [page, setPage] = useState(0)
  // `filters` is a fresh object every render (see useFinanceFilters) — key on its
  // values, not identity, and reset to page 0 whenever they actually change.
  const filtersKey = JSON.stringify(filters)
  const [prevFiltersKey, setPrevFiltersKey] = useState(filtersKey)
  if (prevFiltersKey !== filtersKey) {
    setPrevFiltersKey(filtersKey)
    setPage(0)
  }

  const { data: rows = [], isLoading } = usePaymentsList(filters, page)
  const { data: total = 0 } = usePaymentsCount(filters)
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const [voiding, setVoiding] = useState<PaymentRow | null>(null)
  const [refunding, setRefunding] = useState<PaymentRow | null>(null)

  return (
    <div className="flex flex-col gap-3">
      {isLoading ? (
        <div className="py-10 flex items-center justify-center">
          <ThinkingOrb state="searching" size={20} theme="light" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-base text-ink-muted">Bu filtrlar bo'yicha to'lov yo'q</div>
      ) : (
        <>
          <div className={tbl.scroll}>
            <table className={tbl.table}>
              <thead>
                <tr>
                  <th className={tbl.th}>Sana</th>
                  <th className={tbl.th}>Mijoz</th>
                  <th className={tbl.th}>Tadbir</th>
                  <th className={tbl.th}>Sotuvchi</th>
                  <th className={`${tbl.th} text-right`}>Summa</th>
                  <th className={tbl.th}>Usul</th>
                  <th className={tbl.th}>Kiritgan</th>
                  {canEdit && <th className={`${tbl.th} text-right`}>Amal</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const voided = !!p.voided_at
                  return (
                    <tr key={p.id} className={`${tbl.tr} ${voided ? "opacity-50" : ""}`}>
                      <td className={`${tbl.td} text-sm text-ink-muted whitespace-nowrap`}>{formatDate(p.paid_at)}</td>
                      <td className={`${tbl.td} whitespace-nowrap`}>
                        <div className="font-medium text-ink">{p.client_name}</div>
                        <div className="text-xs text-ink-muted">{formatPhone(p.client_phone)}</div>
                      </td>
                      <td className={`${tbl.td} text-ink-muted whitespace-nowrap`}>{p.event_name ?? "—"}</td>
                      <td className={`${tbl.td} text-ink-muted whitespace-nowrap`}>{p.seller_name ?? "—"}</td>
                      <td
                        className={`${tbl.td} font-medium text-right tabular-nums whitespace-nowrap ${
                          p.amount < 0 ? "text-danger-text" : "text-success-text"
                        } ${voided ? "line-through" : ""}`}
                      >
                        {p.amount < 0 ? "−" : "+"}
                        {formatMoney(Math.abs(p.amount))}
                      </td>
                      <td className={`${tbl.td} whitespace-nowrap`}>
                        {voided ? (
                          <span title={p.void_reason ?? undefined}>
                            <StatusBadge label="Bekor qilingan" variant="warning" />
                          </span>
                        ) : (
                          <StatusBadge label={p.kind === "refund" ? `Qaytarish · ${METHOD_LABEL[p.method]}` : METHOD_LABEL[p.method]} variant="neutral" />
                        )}
                      </td>
                      <td className={`${tbl.td} text-ink-muted whitespace-nowrap`}>{p.recorder_name ?? "—"}</td>
                      {canEdit && (
                        <td className={`${tbl.td} text-right whitespace-nowrap`}>
                          {!voided && (
                            <span className="inline-flex gap-1.5">
                              {p.kind === "payment" && p.participant_cash_paid > 0 && (
                                <RowAction onClick={() => setRefunding(p)} label="Qaytarish" icon={<ArrowUUpLeft size={16} />} />
                              )}
                              <RowAction onClick={() => setVoiding(p)} label="Bekor qilish" icon={<Prohibit size={16} />} danger />
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} pageCount={pageCount} total={total} onPage={setPage} />
        </>
      )}

      {voiding && <VoidPaymentModal payment={voiding} onClose={() => setVoiding(null)} />}
      {refunding && <RefundModal payment={refunding} onClose={() => setRefunding(null)} />}
    </div>
  )
}

export function RowAction({ onClick, label, icon, danger }: { onClick: () => void; label: string; icon: React.ReactNode; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-tag text-xs font-semibold bg-mute-soft hover:bg-mute-soft-hover transition-colors ${
        danger ? "text-danger-text" : "text-ink"
      }`}
    >
      {icon} {label}
    </button>
  )
}
