import { useId, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "@phosphor-icons/react"
import { useQueryClient } from "@tanstack/react-query"
import { useSpendCashback } from "@/hooks/useCashback"
import { PARTICIPANTS_KEY } from "@/hooks/useEvents"
import type { Participant } from "@/lib/supabase/queries/events"
import { useDialog } from "@/hooks/useDialog"
import { formatNumber } from "@/lib/format"

interface ApplyCashbackModalProps {
  isOpen: boolean
  onClose: () => void
  participant: Participant
  balance: number
  onSuccess?: (msg: string) => void
}

interface InnerProps {
  onClose: () => void
  participant: Participant
  balance: number
  onSuccess?: (msg: string) => void
}

function ApplyForm({ onClose, participant, balance, onSuccess }: InnerProps) {
  const qc = useQueryClient()
  const spendMutation = useSpendCashback()

  const debt = Math.max(0, Number(participant.price) - Number(participant.paid))
  const maxApplicable = Math.min(balance, debt)

  const [amount, setAmount] = useState<number>(maxApplicable)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const titleId = useId()
  const amountId = useId()
  const panelRef = useDialog<HTMLDivElement>(() => { if (!busy) onClose() })

  async function handleApply() {
    setError(null)

    if (amount <= 0) {
      setError("Summa noldan katta bo'lishi kerak")
      return
    }
    if (amount > maxApplicable) {
      setError("Summa balansdan yoki qarzdan oshib ketdi")
      return
    }
    if (!participant.contact_id) {
      setError("Ushbu ishtirokchining mijoz profili yo'q")
      return
    }

    setBusy(true)
    try {
      // spend_cashback RPC handles balance check, transaction, cashback_used,
      // and paid update atomically (migration 035).
      await spendMutation.mutateAsync({
        participantId: participant.id,
        clientId: participant.contact_id,
        eventId: participant.event_id,
        amount,
      })

      qc.invalidateQueries({ queryKey: PARTICIPANTS_KEY })
      onSuccess?.(`${formatNumber(amount)} so'm chegirma qo'llandi`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik yuz berdi")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[110]"
        onClick={() => !busy && onClose()}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed inset-0 flex items-center justify-center z-[110] pointer-events-none p-4"
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="bg-surface-raised rounded-overlay w-full max-w-md pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-line">
            <div className="flex flex-col gap-0.5">
              <h2 id={titleId} className="text-md font-bold text-ink">Cashback bilan to'lash</h2>
              <span className="text-xs text-ink-muted">{participant.full_name}</span>
            </div>
            <button
              onClick={onClose}
              disabled={busy}
              aria-label="Yopish"
              className="p-1.5 rounded-control-sm hover:bg-mute-ghost-hover transition-colors"
            >
              <X size={20} className="text-ink-muted" />
            </button>
          </div>

          <div className="p-5 flex flex-col gap-4">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface-sunken border border-line rounded-control p-3">
                <p className="text-xs font-bold text-ink uppercase tracking-wider mb-1">Joriy balans</p>
                <p className="text-md font-bold text-ink">{formatNumber(balance)} so'm</p>
              </div>
              <div className="bg-warning-soft border border-line rounded-control p-3">
                <p className="text-xs font-bold text-warning-dark uppercase tracking-wider mb-1">Qarz</p>
                <p className="text-md font-bold text-warning-dark">{formatNumber(debt)} so'm</p>
              </div>
            </div>

            {error && (
              <div className="px-3 py-2 rounded-control text-sm font-medium bg-danger-soft text-danger-text border border-line">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor={amountId} className="text-sm font-medium text-ink-muted">Qo'llanadigan summa (so'm)</label>
              <input
                id={amountId}
                type="number"
                min={0}
                max={maxApplicable}
                step={500}
                value={amount}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  setAmount(Math.max(0, Math.min(v, maxApplicable)))
                }}
                autoFocus
                className="w-full border border-line rounded-control px-3 py-2 text-base text-ink focus:outline-none focus:border-line-focus transition-colors"
              />
              <span className="text-xs text-ink-muted">
                Maksimum: <strong>{formatNumber(maxApplicable)} so'm</strong>
                {balance < debt && " (balans yetarli emas — qarzning bir qismi qoladi)"}
              </span>
            </div>

            <p className="text-xs text-ink-muted italic">
              💡 Cashback orqali to'lov uchun yangi cashback berilmaydi
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-line">
            <button
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 rounded-control text-base font-medium text-ink-muted hover:text-ink transition-colors"
            >
              Bekor qilish
            </button>
            <button
              onClick={handleApply}
              disabled={busy || amount <= 0}
              className={`px-5 py-2 rounded-control text-base font-bold text-ink-on-accent transition-colors ${
                busy || amount <= 0 ? "bg-mute-soft cursor-not-allowed" : "bg-accent hover:bg-accent-hover"
              }`}
            >
              {busy ? "Qo'llanmoqda..." : "Qo'llash"}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  )
}

export function ApplyCashbackModal({ isOpen, onClose, participant, balance, onSuccess }: ApplyCashbackModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <ApplyForm
          key={participant.id}
          onClose={onClose}
          participant={participant}
          balance={balance}
          onSuccess={onSuccess}
        />
      )}
    </AnimatePresence>
  )
}
