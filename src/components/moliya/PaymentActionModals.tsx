import { useId, useState } from "react"
import { X } from "@phosphor-icons/react"
import type { PaymentMethod } from "@/lib/supabase/queries/payments"
import type { PaymentRow } from "@/lib/supabase/queries/finance"
import { useRefundPayment, useVoidPayment } from "@/hooks/useFinance"
import { useDialog } from "@/hooks/useDialog"
import { formatMoney, formatNumber } from "@/lib/format"

const INPUT =
  "w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] placeholder:text-[#CCCCCC] focus:outline-none focus:border-[#141414] transition-colors"
const LABEL = "text-[12px] font-medium text-[#999999]"
const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "naqd", label: "Naqd" },
  { value: "karta", label: "Karta" },
  { value: "transfer", label: "Transfer" },
]

// Both modals are mounted only while open, so their state starts fresh.
function ModalShell({
  title,
  error,
  submitLabel,
  canSubmit,
  pending,
  danger,
  onSubmit,
  onClose,
  children,
}: {
  title: string
  error: string | null
  submitLabel: string
  canSubmit: boolean
  pending: boolean
  danger?: boolean
  onSubmit: () => void
  onClose: () => void
  children: React.ReactNode
}) {
  const titleId = useId()
  const guardedClose = () => !pending && onClose()
  const panelRef = useDialog<HTMLDivElement>(guardedClose, true)
  const enabled = canSubmit && !pending
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div onClick={guardedClose} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="bg-white rounded-[12px] shadow-2xl w-full max-w-sm relative flex flex-col"
      >
        <div className="p-5 border-b border-[#F0F0F0] flex items-center justify-between">
          <h3 id={titleId} className="text-[16px] font-bold text-[#141414]">{title}</h3>
          <button onClick={onClose} aria-label="Yopish" className="p-1 hover:bg-[#F5F5F5] rounded-full transition-all">
            <X size={20} className="text-[#999999]" weight="bold" />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          {error && (
            <div role="alert" className="px-3 py-2 rounded-[8px] text-[12px] font-medium bg-red-50 text-red-700 border border-red-200">
              {error}
            </div>
          )}
          {children}
        </div>
        <div className="p-5 pt-0 flex gap-3">
          <button
            onClick={onClose}
            disabled={pending}
            className="flex-1 px-4 py-2.5 bg-[#F5F5F5] text-[#141414] rounded-[8px] text-[13px] font-bold hover:bg-[#EAEAEA] transition-all disabled:opacity-50"
          >
            Yopish
          </button>
          <button
            onClick={onSubmit}
            disabled={!enabled}
            className={`flex-1 px-4 py-2.5 rounded-[8px] text-[13px] font-bold transition-all ${
              enabled ? (danger ? "bg-[#D13328] text-white hover:bg-[#B02A20]" : "bg-[#141414] text-white hover:bg-black") : "bg-[#E0E0E0] text-[#999] cursor-not-allowed"
            }`}
          >
            {pending ? "Saqlanmoqda..." : submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function VoidPaymentModal({ payment, onClose }: { payment: PaymentRow; onClose: () => void }) {
  const voidPay = useVoidPayment()
  const reasonId = useId()
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)

  return (
    <ModalShell
      title={payment.kind === "refund" ? "Qaytarishni bekor qilish" : "To'lovni bekor qilish"}
      error={error}
      submitLabel="Bekor qilish"
      danger
      canSubmit={reason.trim().length > 0}
      pending={voidPay.isPending}
      onClose={onClose}
      onSubmit={() =>
        voidPay.mutate({ id: payment.id, reason: reason.trim() }, { onSuccess: onClose, onError: (e) => setError(e.message) })
      }
    >
      <p className="text-[12px] text-[#666]">
        <span className="font-bold text-[#141414]">{payment.client_name}</span> · {formatMoney(Math.abs(payment.amount))}.
        Yozuv o'chirilmaydi — ro'yxatda chizilgan holda qoladi, qarz va keshbek qayta hisoblanadi.
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={reasonId} className={LABEL}>Sabab *</label>
        <textarea id={reasonId} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus className={INPUT} placeholder="Masalan: summa xato kiritilgan" />
      </div>
    </ModalShell>
  )
}

export function RefundModal({ payment, onClose }: { payment: PaymentRow; onClose: () => void }) {
  const refund = useRefundPayment()
  const amountId = useId()
  const noteId = useId()
  const max = Math.max(payment.participant_cash_paid, 0)
  const [amount, setAmount] = useState(String(Math.round(Math.min(Math.abs(payment.amount), max))))
  const [method, setMethod] = useState<PaymentMethod>(payment.method)
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const amountNum = amount ? Number(amount) : 0

  return (
    <ModalShell
      title="Pulni qaytarish"
      error={error}
      submitLabel="Qaytarish"
      canSubmit={amountNum > 0 && amountNum <= max}
      pending={refund.isPending}
      onClose={onClose}
      onSubmit={() =>
        refund.mutate(
          { participantId: payment.participant_id, amount: amountNum, method, note: note.trim() },
          { onSuccess: onClose, onError: (e) => setError(e.message) },
        )
      }
    >
      <p className="text-[12px] text-[#666]">
        <span className="font-bold text-[#141414]">{payment.client_name}</span> · {payment.event_name ?? "—"}. Ko'pi bilan{" "}
        {formatMoney(max)} qaytarish mumkin.
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={amountId} className={LABEL}>Summa *</label>
        <input
          id={amountId}
          inputMode="numeric"
          value={amount ? formatNumber(Number(amount)) : ""}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
          aria-invalid={amountNum > max}
          className={`${INPUT} ${amountNum > max ? "border-[#D13328]" : ""}`}
        />
      </div>
      <div className="flex gap-2">
        {METHODS.map((m) => (
          <button
            key={m.value}
            onClick={() => setMethod(m.value)}
            aria-pressed={method === m.value}
            className={`flex-1 py-2 rounded-[8px] text-[12px] font-semibold border transition-colors ${
              method === m.value ? "bg-[#141414] text-white border-[#141414]" : "bg-white text-[#666] border-[#E0E0E0] hover:bg-[#F5F5F5]"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={noteId} className={LABEL}>Izoh</label>
        <input id={noteId} value={note} onChange={(e) => setNote(e.target.value)} className={INPUT} placeholder="Masalan: tadbirga kela olmadi" />
      </div>
    </ModalShell>
  )
}
