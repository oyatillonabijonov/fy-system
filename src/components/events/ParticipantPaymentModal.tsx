import { useState, useId } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "@phosphor-icons/react"
import type { Participant } from "@/lib/supabase/queries/events"
import type { PaymentMethod } from "@/lib/supabase/queries/payments"
import { useAddPayment } from "@/hooks/usePayments"
import { useAuth } from "@/context/AuthContext"
import { useDialog } from "@/hooks/useDialog"
import { formatMoney, formatNumber } from "@/lib/format"

interface ParticipantPaymentModalProps {
  isOpen: boolean
  participant: Participant | null
  onClose: () => void
  onPaid: () => void
}

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "naqd", label: "Naqd" },
  { value: "karta", label: "Karta" },
  { value: "transfer", label: "Transfer" },
]

const INPUT =
  "w-full border border-line rounded-control px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors"

export function ParticipantPaymentModal({ isOpen, participant, onClose, onPaid }: ParticipantPaymentModalProps) {
  const { user } = useAuth()
  const titleId = useId()
  const amountLabelId = useId()
  const noteLabelId = useId()
  const panelRef = useDialog<HTMLDivElement>(onClose, isOpen && !!participant)
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState<PaymentMethod>("naqd")
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const addMutation = useAddPayment(participant?.id ?? "")

  const amountNum = amount ? Number(amount) : 0
  const debt = participant ? Math.max(participant.price - participant.paid, 0) : 0

  function handleSubmit() {
    if (!participant) return
    if (amountNum <= 0) { setError("To'lov summasi 0 dan katta bo'lishi kerak"); return }
    // Paying past the debt drives it negative and awards cashback on money that
    // was never owed — the trigger chain has no way to tell it was a typo.
    if (debt <= 0) {
      setError("Bu ishtirokchida qarz yo'q. Avval kelishilgan narxni belgilang")
      return
    }
    if (amountNum > debt) {
      setError(`To'lov qarzdan ko'p. Qolgan qarz: ${formatMoney(debt)}`)
      return
    }
    setError(null)
    addMutation.mutate(
      { participantId: participant.id, amount: amountNum, method, paidAt: new Date().toISOString(), note: note.trim() || undefined },
      {
        onSuccess: () => { onPaid(); onClose() },
        onError: (err) => setError(err instanceof Error ? err.message : "Xatolik yuz berdi"),
      },
    )
  }

  return (
    <AnimatePresence>
      {isOpen && participant && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="absolute inset-0 bg-surface-overlay backdrop-blur-sm"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="bg-surface-raised rounded-overlay w-full max-w-sm relative overflow-hidden flex flex-col"
          >
            <div className="p-5 border-b border-line flex items-center justify-between">
              <div className="flex flex-col min-w-0">
                <h3 id={titleId} className="text-base font-semibold text-ink truncate">{participant.full_name}</h3>
                <span className="text-xs text-ink-muted">To'lov qo'shish</span>
              </div>
              <button onClick={onClose} aria-label="Yopish" className="p-1 hover:bg-mute-ghost-hover rounded-full transition-all">
                <X size={20} className="text-ink-muted" weight="bold" />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              {error && (
                <div className="px-3 py-2 rounded-control text-sm font-medium bg-danger-soft text-danger-dark">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-between px-3 py-2 rounded-control bg-surface-sunken border border-line text-sm">
                <span className="text-ink-muted">Qolgan qarz</span>
                <span className={`font-bold tabular-nums ${debt > 0 ? "text-danger-text" : "text-success-text"}`}>{formatMoney(debt)}</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={amountLabelId} className="text-sm font-medium text-ink-muted">To'lov summasi *</label>
                <div className="relative">
                  <input
                    id={amountLabelId}
                    inputMode="numeric"
                    value={amount ? formatNumber(Number(amount)) : ""}
                    onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                    placeholder="100,000"
                    autoFocus
                    className={`${INPUT} pr-12 tabular-nums`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted pointer-events-none">UZS</span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-ink-muted">To'lov turi *</label>
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
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={noteLabelId} className="text-sm font-medium text-ink-muted">Izoh</label>
                <textarea
                  id={noteLabelId}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Ixtiyoriy..."
                  className={`${INPUT} resize-none`}
                />
              </div>

              <div className="text-xs text-ink-muted">
                Mas'ul: <span className="font-semibold text-ink">{user?.full_name ?? "—"}</span>
              </div>
            </div>

            <div className="p-5 pt-0 flex gap-3">
              <button
                onClick={onClose}
                disabled={addMutation.isPending}
                className="flex-1 px-4 py-2.5 bg-mute-soft text-ink rounded-control text-base font-bold hover:bg-mute-soft-hover transition-all disabled:opacity-50"
              >
                Bekor qilish
              </button>
              <button
                onClick={handleSubmit}
                disabled={addMutation.isPending || amountNum <= 0}
                className={`flex-1 px-4 py-2.5 rounded-control text-base font-bold transition-all flex items-center justify-center gap-2 ${
                  addMutation.isPending || amountNum <= 0 ? "bg-mute-soft text-ink-muted cursor-not-allowed" : "bg-accent text-ink-on-accent hover:bg-accent-hover active:scale-95"
                }`}
              >
                {addMutation.isPending ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Saqlanmoqda...
                  </>
                ) : (
                  "Saqlash"
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
