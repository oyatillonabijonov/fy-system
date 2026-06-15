import { useState } from "react"
import { Plus, Receipt } from "@phosphor-icons/react"
import { useRecentPayments } from "@/hooks/usePayments"
import type { PaymentMethod } from "@/lib/supabase/queries/payments"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { AddPaymentModal } from "@/components/events/AddPaymentModal"
import { formatMoney, formatPhone, formatDate } from "@/lib/format"

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
        <span className="flex items-center gap-2 text-[15px] font-bold text-[#141414]">
          <Receipt size={18} weight="bold" /> To'lovlar tarixi
        </span>
        <button
          onClick={() => { setOpenKey((k) => k + 1); setShowAdd(true) }}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#141414] text-white rounded-[8px] text-[13px] font-bold hover:bg-[#333] transition-colors"
        >
          <Plus size={15} weight="bold" />
          To'lov qo'shish
        </button>
      </div>

      <div className="bg-white border border-[#F0F0F0] rounded-[12px] overflow-hidden">
        {isLoading ? (
          <div className="py-10 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-[#141414] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : payments.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-[#999]">Hali to'lov qilinmagan</div>
        ) : (
          <>
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[11px] font-bold text-[#999] border-b border-[#F0F0F0]">
                    <th className="px-4 py-2.5 font-bold">Ism / familiya</th>
                    <th className="px-4 py-2.5 font-bold">Telefon</th>
                    <th className="px-4 py-2.5 font-bold text-right">To'lov summasi</th>
                    <th className="px-4 py-2.5 font-bold text-right">Kelishilgan summa</th>
                    <th className="px-4 py-2.5 font-bold text-right">Qolgan qarz</th>
                    <th className="px-4 py-2.5 font-bold">Tadbir</th>
                    <th className="px-4 py-2.5 font-bold">To'lov turi</th>
                    <th className="px-4 py-2.5 font-bold">Mas'ul</th>
                    <th className="px-4 py-2.5 font-bold">Sana</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-[#F7F7F7] last:border-0 hover:bg-[#FBFBFB] transition-colors">
                      <td className="px-4 py-2.5 text-[13px] font-medium text-[#141414] whitespace-nowrap">
                        {p.client_name ?? p.participant_name ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-[#666] whitespace-nowrap">{formatPhone(p.client_phone)}</td>
                      <td className="px-4 py-2.5 text-[13px] font-bold text-right whitespace-nowrap" style={{ color: "#1E7E34" }}>
                        +{formatMoney(p.amount)}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-[#141414] text-right whitespace-nowrap">{formatMoney(p.price)}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {p.debt <= 0 ? (
                          <span className="inline-flex justify-end">
                            <StatusBadge label="To'langan" variant="success" dot />
                          </span>
                        ) : (
                          <span className="text-[13px] font-bold" style={{ color: "#D13328" }}>{formatMoney(p.debt)}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-[#666] whitespace-nowrap">{p.event_name ?? "—"}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <StatusBadge label={METHOD_LABEL[p.method]} variant="neutral" />
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-[#666] whitespace-nowrap">{p.recorded_by_name ?? "—"}</td>
                      <td className="px-4 py-2.5 text-[12px] text-[#999] whitespace-nowrap">{formatDate(p.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {canLoadMore && (
              <div className="p-3 border-t border-[#F0F0F0] flex justify-center">
                <button
                  onClick={() => setLimit((l) => l + PAGE)}
                  className="px-4 py-1.5 rounded-[8px] text-[12px] font-semibold text-[#666] border border-[#E0E0E0] hover:bg-[#F5F5F5] transition-colors"
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
