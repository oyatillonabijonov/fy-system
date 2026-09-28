import { useId, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "@phosphor-icons/react"
import type { PaymentMethod } from "@/lib/supabase/queries/payments"
import type { PaymentRow } from "@/lib/supabase/queries/finance"
import { useRefundPayment, useSettleNoShow, useVoidPayment } from "@/hooks/useFinance"
import { useDialog } from "@/hooks/useDialog"
import { formatMoney, formatNumber } from "@/lib/format"

export const INPUT =
  "w-full border border-line rounded-control px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors"
export const LABEL = "text-sm font-medium text-ink-muted"
const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "naqd", label: "Naqd" },
  { value: "karta", label: "Karta" },
  { value: "transfer", label: "Transfer" },
]

// Both modals are mounted only while open, so their state starts fresh.
export function ModalShell({
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
  // Mounted only while open (the parent renders it conditionally) — AnimatePresence
  // here only plays the enter animation; the exit can't run because the parent
  // unmounts the whole tree in the same tick it stops rendering this component.
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={guardedClose} className="absolute inset-0 bg-surface-overlay backdrop-blur-sm"
        />
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="bg-surface-raised rounded-overlay w-full max-w-sm relative flex flex-col"
        >
          <div className="p-5 border-b border-line flex items-center justify-between">
            <h3 id={titleId} className="text-md font-semibold text-ink">{title}</h3>
            <button onClick={guardedClose} aria-label="Yopish" className="p-1 hover:bg-mute-ghost-hover rounded-full transition-all">
              <X size={20} className="text-ink-muted" />
            </button>
          </div>
          <div className="p-5 flex flex-col gap-4">
            {error && (
              <div role="alert" className="px-3 py-2 rounded-control text-sm font-medium bg-danger-soft text-danger-dark">
                {error}
              </div>
            )}
            {children}
          </div>
          <div className="p-5 pt-0 flex gap-3">
            <button
              onClick={onClose}
              disabled={pending}
              className="flex-1 px-4 py-2.5 bg-mute-soft text-ink rounded-control text-base font-bold hover:bg-mute-soft-hover transition-all disabled:opacity-50"
            >
              Yopish
            </button>
            <button
              onClick={onSubmit}
              disabled={!enabled}
              className={`flex-1 px-4 py-2.5 rounded-control text-base font-bold transition-all ${
                enabled
                  ? danger
                    ? "bg-danger text-white hover:opacity-90"
                    : "bg-accent text-ink-on-accent hover:bg-accent-hover"
                  : "bg-mute-soft text-ink-muted cursor-not-allowed"
              }`}
            >
              {pending ? "Saqlanmoqda..." : submitLabel}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
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
      <p className="text-sm text-ink-muted">
        <span className="font-bold text-ink">{payment.client_name}</span> · {formatMoney(Math.abs(payment.amount))}.
        Yozuv o'chirilmaydi — ro'yxatda chizilgan holda qoladi, qarz va keshbek qayta hisoblanadi.
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={reasonId} className={LABEL}>Sabab *</label>
        <textarea id={reasonId} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus className={`${INPUT} resize-none`} placeholder="Masalan: summa xato kiritilgan" />
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
      <p className="text-sm text-ink-muted">
        <span className="font-bold text-ink">{payment.client_name}</span> · {payment.event_name ?? "—"}. Ko'pi bilan{" "}
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
          className={`${INPUT} ${amountNum > max ? "border-danger-text" : ""}`}
        />
      </div>
      <div className="flex gap-2">
        {METHODS.map((m) => (
          <button
            key={m.value}
            onClick={() => setMethod(m.value)}
            aria-pressed={method === m.value}
            className={`flex-1 py-2 rounded-control text-sm font-semibold border transition-colors ${
              method === m.value ? "bg-accent text-ink-on-accent border-transparent" : "bg-surface text-ink-muted border-line hover:bg-mute-ghost-hover"
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

/** "Qatnashmadi": keep part of the cash, refund the rest, close the debt — one call (settle_no_show). */
export function NoShowModal({ payment, onClose }: { payment: PaymentRow; onClose: () => void }) {
  const settle = useSettleNoShow()
  const keepId = useId()
  const noteId = useId()
  const cash = Math.max(payment.participant_cash_paid, 0)
  const [keep, setKeep] = useState("")
  const [method, setMethod] = useState<PaymentMethod>(payment.method)
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const keepNum = keep ? Number(keep) : 0
  const refund = cash - keepNum
  const valid = keep !== "" && keepNum >= 0 && keepNum <= cash

  return (
    <ModalShell
      title="Qatnashmadi — pulni qaytarish"
      error={error}
      submitLabel={refund > 0 ? `${formatMoney(refund)} qaytarish` : "Tasdiqlash"}
      canSubmit={valid}
      pending={settle.isPending}
      onClose={onClose}
      onSubmit={() =>
        settle.mutate(
          { participantId: payment.participant_id, keep: keepNum, method, note: note.trim() },
          { onSuccess: onClose, onError: (e) => setError(e.message) },
        )
      }
    >
      <p className="text-sm text-ink-muted">
        <span className="font-semibold text-ink">{payment.client_name}</span> · {payment.event_name ?? "—"} uchun{" "}
        {formatMoney(cash)} to'lagan. Ushlab qolinadigan summani yozing — qolgani qaytariladi, kelishuv shu summaga
        tushadi (qarz qolmaydi) va keshbek berilmaydi.
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={keepId} className={LABEL}>Ushlab qolinadi *</label>
        <input
          id={keepId}
          inputMode="numeric"
          autoFocus
          value={keep ? formatNumber(Number(keep)) : ""}
          onChange={(e) => setKeep(e.target.value.replace(/\D/g, ""))}
          aria-invalid={keepNum > cash}
          placeholder="0"
          className={`${INPUT} ${keepNum > cash ? "border-danger-text" : ""}`}
        />
      </div>
      <div className="flex items-center justify-between px-3.5 py-2.5 rounded-control bg-surface-sunken text-base">
        <span className="text-ink-muted">Qaytariladi</span>
        <span className={`font-semibold tabular-nums ${keepNum > cash ? "text-danger-text" : "text-ink"}`}>
          {keepNum > cash ? "To'langandan ko'p" : formatMoney(Math.max(refund, 0))}
        </span>
      </div>
      {refund > 0 && (
        <div className="flex gap-2">
          {METHODS.map((m) => (
            <button
              key={m.value}
              onClick={() => setMethod(m.value)}
              aria-pressed={method === m.value}
              className={`flex-1 py-2 rounded-control text-sm font-semibold border transition-colors ${
                method === m.value ? "bg-accent text-ink-on-accent border-transparent" : "bg-surface text-ink-muted border-line hover:bg-mute-ghost-hover"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={noteId} className={LABEL}>Izoh</label>
        <input id={noteId} value={note} onChange={(e) => setNote(e.target.value)} className={INPUT} placeholder="Masalan: oxirgi kuni bekor qildi" />
      </div>
    </ModalShell>
  )
}
