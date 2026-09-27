import { useState } from "react"
import { Plus, Receipt } from "@phosphor-icons/react"
import { useRecentPayments } from "@/hooks/usePayments"
import type { PaymentMethod } from "@/lib/supabase/queries/payments"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { AddPaymentModal } from "@/components/events/AddPaymentModal"
import { formatMoney, formatPhone, formatDate } from "@/lib/format"
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
          <Receipt size={18} weight="bold" /> To'lovlar tarixi
        </span>
        <button
          onClick={() => { setOpenKey((k) => k + 1); setShowAdd(true) }}
          className="flex items-center gap-1.5 px-4 py-2 bg-accent text-ink-on-accent rounded-control text-base font-bold hover:bg-accent-hover transition-colors"
        >
          <Plus size={15} weight="bold" />
          To'lov qo'shish
        </button>
      </div>

      <div className="bg-surface border border-line rounded-surface overflow-hidden">
        {isLoading ? (
          <div className="py-10 flex items-center justify-center">
            <ThinkingOrb state="searching" size={20} theme="light" />
          </div>
        ) : payments.length === 0 ? (
          <div className="py-10 text-center text-base text-ink-muted">Hali to'lov qilinmagan</div>
        ) : (
          <>
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs font-medium text-ink-muted border-b border-line">
                    <th className="px-4 py-2.5 font-medium">Ism / familiya</th>
                    <th className="px-4 py-2.5 font-medium">Telefon</th>
                    <th className="px-4 py-2.5 font-medium text-right">To'lov summasi</th>
                    <th className="px-4 py-2.5 font-medium text-right">Kelishilgan summa</th>
                    <th className="px-4 py-2.5 font-medium text-right">Qolgan qarz</th>
                    <th className="px-4 py-2.5 font-medium">Tadbir</th>
                    <th className="px-4 py-2.5 font-medium">To'lov turi</th>
                    <th className="px-4 py-2.5 font-medium">Mas'ul</th>
                    <th className="px-4 py-2.5 font-medium">Sana</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-line last:border-0 hover:bg-mute-ghost-hover transition-colors">
                      <td className="px-4 py-2.5 text-base font-medium text-ink whitespace-nowrap">
                        {p.client_name ?? p.participant_name ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-base text-ink-muted whitespace-nowrap">{formatPhone(p.client_phone)}</td>
                      <td className="px-4 py-2.5 text-base font-bold text-right tabular-nums whitespace-nowrap text-success-text">
                        +{formatMoney(p.amount)}
                      </td>
                      <td className="px-4 py-2.5 text-base text-ink text-right tabular-nums whitespace-nowrap">{formatMoney(p.price)}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {p.debt <= 0 ? (
                          <span className="inline-flex justify-end">
                            <StatusBadge label="To'langan" variant="success" dot />
                          </span>
                        ) : (
                          <span className="text-base font-bold text-danger-text tabular-nums">{formatMoney(p.debt)}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-base text-ink-muted whitespace-nowrap">{p.event_name ?? "—"}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <StatusBadge label={METHOD_LABEL[p.method]} variant="neutral" />
                      </td>
                      <td className="px-4 py-2.5 text-base text-ink-muted whitespace-nowrap">{p.recorded_by_name ?? "—"}</td>
                      <td className="px-4 py-2.5 text-sm text-ink-muted whitespace-nowrap">{formatDate(p.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {canLoadMore && (
              <div className="p-3 border-t border-line flex justify-center">
                <button
                  onClick={() => setLimit((l) => l + PAGE)}
                  className="px-4 py-1.5 rounded-control text-sm font-semibold text-ink-muted border border-line hover:bg-mute-ghost-hover transition-colors"
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
