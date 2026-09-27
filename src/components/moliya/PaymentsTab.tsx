import { useState } from "react"
import { ArrowUUpLeft, Prohibit } from "@phosphor-icons/react"
import { usePaymentsList } from "@/hooks/useFinance"
import { PAYMENTS_PAGE, type FinanceFilters, type PaymentRow } from "@/lib/supabase/queries/finance"
import type { PaymentMethod } from "@/lib/supabase/queries/payments"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { RefundModal, VoidPaymentModal } from "@/components/moliya/PaymentActionModals"
import { formatDate, formatMoney, formatPhone } from "@/lib/format"
import { ThinkingOrb } from "thinking-orbs"

const METHOD_LABEL: Record<PaymentMethod, string> = { naqd: "Naqd", karta: "Karta", transfer: "Transfer" }

export function PaymentsTab({ filters, canEdit }: { filters: FinanceFilters; canEdit: boolean }) {
  const [limit, setLimit] = useState(PAYMENTS_PAGE)
  const { data: rows = [], isLoading } = usePaymentsList(filters, limit)
  const [voiding, setVoiding] = useState<PaymentRow | null>(null)
  const [refunding, setRefunding] = useState<PaymentRow | null>(null)

  return (
    <div className="bg-white border border-[#F0F0F0] rounded-[12px] overflow-hidden">
      {isLoading ? (
        <div className="py-10 flex items-center justify-center">
          <ThinkingOrb state="searching" size={20} theme="light" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-[#999]">Bu filtrlar bo'yicha to'lov yo'q</div>
      ) : (
        <>
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11px] font-bold text-[#999] border-b border-[#F0F0F0]">
                  <th className="px-4 py-2.5 font-bold">Sana</th>
                  <th className="px-4 py-2.5 font-bold">Mijoz</th>
                  <th className="px-4 py-2.5 font-bold">Tadbir</th>
                  <th className="px-4 py-2.5 font-bold">Sotuvchi</th>
                  <th className="px-4 py-2.5 font-bold text-right">Summa</th>
                  <th className="px-4 py-2.5 font-bold">Usul</th>
                  <th className="px-4 py-2.5 font-bold">Kiritgan</th>
                  {canEdit && <th className="px-4 py-2.5 font-bold text-right">Amal</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const voided = !!p.voided_at
                  return (
                    <tr key={p.id} className={`border-b border-[#F7F7F7] last:border-0 hover:bg-[#FBFBFB] transition-colors ${voided ? "opacity-50" : ""}`}>
                      <td className="px-4 py-2.5 text-[12px] text-[#999] whitespace-nowrap">{formatDate(p.paid_at)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="text-[13px] font-medium text-[#141414]">{p.client_name}</div>
                        <div className="text-[11px] text-[#999]">{formatPhone(p.client_phone)}</div>
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-[#666] whitespace-nowrap">{p.event_name ?? "—"}</td>
                      <td className="px-4 py-2.5 text-[13px] text-[#666] whitespace-nowrap">{p.seller_name ?? "—"}</td>
                      <td
                        className="px-4 py-2.5 text-[13px] font-bold text-right whitespace-nowrap"
                        style={{ color: p.amount < 0 ? "#D13328" : "#1E7E34", textDecoration: voided ? "line-through" : undefined }}
                      >
                        {p.amount < 0 ? "−" : "+"}
                        {formatMoney(Math.abs(p.amount))}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {voided ? (
                          <span title={p.void_reason ?? undefined}>
                            <StatusBadge label="Bekor qilingan" variant="warning" />
                          </span>
                        ) : (
                          <StatusBadge label={p.kind === "refund" ? `Qaytarish · ${METHOD_LABEL[p.method]}` : METHOD_LABEL[p.method]} variant="neutral" />
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-[#666] whitespace-nowrap">{p.recorder_name ?? "—"}</td>
                      {canEdit && (
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          {!voided && (
                            <span className="inline-flex gap-1.5">
                              {p.kind === "payment" && p.participant_cash_paid > 0 && (
                                <RowAction onClick={() => setRefunding(p)} label="Qaytarish" icon={<ArrowUUpLeft size={13} weight="bold" />} />
                              )}
                              <RowAction onClick={() => setVoiding(p)} label="Bekor qilish" icon={<Prohibit size={13} weight="bold" />} danger />
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
          {rows.length === limit && (
            <div className="p-3 border-t border-[#F0F0F0] flex justify-center">
              <button
                onClick={() => setLimit((l) => l + PAYMENTS_PAGE)}
                className="px-4 py-1.5 rounded-[8px] text-[12px] font-semibold text-[#666] border border-[#E0E0E0] hover:bg-[#F5F5F5] transition-colors"
              >
                Ko'proq yuklash
              </button>
            </div>
          )}
        </>
      )}

      {voiding && <VoidPaymentModal payment={voiding} onClose={() => setVoiding(null)} />}
      {refunding && <RefundModal payment={refunding} onClose={() => setRefunding(null)} />}
    </div>
  )
}

function RowAction({ onClick, label, icon, danger }: { onClick: () => void; label: string; icon: React.ReactNode; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11px] font-semibold border border-[#E0E0E0] hover:bg-[#F5F5F5] transition-colors ${
        danger ? "text-[#D13328]" : "text-[#141414]"
      }`}
    >
      {icon} {label}
    </button>
  )
}
