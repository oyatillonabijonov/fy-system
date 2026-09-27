import { useState } from "react"
import { Plus, Receipt } from "@phosphor-icons/react"
import { useRecentPayments } from "@/hooks/usePayments"
import type { PaymentMethod } from "@/lib/supabase/queries/payments"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { AddPaymentModal } from "@/components/events/AddPaymentModal"
import { formatMoney, formatPhone, formatDate } from "@/lib/format"
import { tbl } from "@/components/ui/table"
import { ThinkingOrb } from "thinking-orbs"

const METHOD_LABEL: Record<PaymentMethod, string> = {
  naqd: "Naqd",
  karta: "Karta",
  transfer: "Transfer",
}

const PAGE = 50

export function PaymentsLog() {
  const [limit, setLimit] = useState(PAGE)
  const [showAdd, setShowAdd] = useState(false)
  const [openKey, setOpenKey] = useState(0) // bump on open → modal remounts fresh
  const { data: payments = [], isLoading } = useRecentPayments(limit)

  const canLoadMore = payments.length === limit

  return (
    <div className="flex flex-col gap-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-md font-semibold text-ink">
          <Receipt size={18} /> To'lovlar tarixi
        </span>
        <button
          onClick={() => { setOpenKey((k) => k + 1); setShowAdd(true) }}
          className="flex items-center gap-1.5 px-4 py-2 bg-accent text-ink-on-accent rounded-control text-base font-bold hover:bg-accent-hover transition-colors"
        >
          <Plus size={15} />
          To'lov qo'shish
        </button>
      </div>

      <div>
        {isLoading ? (
          <div className="py-10 flex items-center justify-center">
            <ThinkingOrb state="searching" size={20} theme="light" />
          </div>
        ) : payments.length === 0 ? (
          <div className="py-10 text-center text-base text-ink-muted">Hali to'lov qilinmagan</div>
        ) : (
          <>
            <div className={tbl.scroll}>
              <table className={tbl.table}>
                <thead>
                  <tr>
                    <th className={tbl.th}>Ism / familiya</th>
                    <th className={tbl.th}>Telefon</th>
                    <th className={`${tbl.th} text-right`}>To'lov summasi</th>
                    <th className={`${tbl.th} text-right`}>Kelishilgan summa</th>
                    <th className={`${tbl.th} text-right`}>Qolgan qarz</th>
                    <th className={tbl.th}>Tadbir</th>
                    <th className={tbl.th}>To'lov turi</th>
                    <th className={tbl.th}>Mas'ul</th>
                    <th className={tbl.th}>Sana</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className={tbl.tr}>
                      <td className={`${tbl.td} font-medium whitespace-nowrap`}>
                        {p.client_name ?? p.participant_name ?? "—"}
                      </td>
                      <td className={`${tbl.td} text-ink-muted whitespace-nowrap`}>{formatPhone(p.client_phone)}</td>
                      <td className={`${tbl.td} font-medium text-right tabular-nums whitespace-nowrap text-success-text`}>
                        +{formatMoney(p.amount)}
                      </td>
                      <td className={`${tbl.td} text-right tabular-nums whitespace-nowrap`}>{formatMoney(p.price)}</td>
                      <td className={`${tbl.td} text-right whitespace-nowrap`}>
                        {p.debt <= 0 ? (
                          <span className="inline-flex justify-end">
                            <StatusBadge label="To'langan" variant="success" dot />
                          </span>
                        ) : (
                          <span className="text-base font-bold text-danger-text tabular-nums">{formatMoney(p.debt)}</span>
                        )}
                      </td>
                      <td className={`${tbl.td} text-ink-muted whitespace-nowrap`}>{p.event_name ?? "—"}</td>
                      <td className={`${tbl.td} whitespace-nowrap`}>
                        <StatusBadge label={METHOD_LABEL[p.method]} variant="neutral" />
                      </td>
                      <td className={`${tbl.td} text-ink-muted whitespace-nowrap`}>{p.recorded_by_name ?? "—"}</td>
                      <td className={`${tbl.td} text-sm text-ink-muted whitespace-nowrap`}>{formatDate(p.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {canLoadMore && (
              <div className="pt-3 flex justify-center">
                <button
                  onClick={() => setLimit((l) => l + PAGE)}
                  className="px-4 h-control-sm rounded-control-sm text-sm font-medium text-ink bg-mute-soft hover:bg-mute-soft-hover transition-colors"
                >
                  Ko'proq yuklash
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <AddPaymentModal key={openKey} isOpen={showAdd} onClose={() => setShowAdd(false)} onAdded={() => setShowAdd(false)} />
    </div>
  )
}
