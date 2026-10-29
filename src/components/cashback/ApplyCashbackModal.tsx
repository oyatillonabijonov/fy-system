import { useId, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "@phosphor-icons/react"
import { useQueryClient } from "@tanstack/react-query"
import { useSpendCashback } from "@/hooks/useCashback"
import { PARTICIPANTS_KEY } from "@/hooks/useEvents"
import type { Participant } from "@/lib/supabase/queries/events"
import { useDialog } from "@/hooks/useDialog"
import { useMedia } from "@/hooks/useMedia"
import { sheet, sheetMotion } from "@/components/ui/sheetStyles"
import { formatNumber } from "@/lib/format"

interface ApplyCashbackModalProps {
  isOpen: boolean
  onClose: () => void
  participant: Pick<Participant, "id" | "contact_id" | "event_id" | "full_name" | "price" | "paid">
  balance: number
  onSuccess?: (msg: string) => void
}

interface InnerProps {
  onClose: () => void
  participant: Pick<Participant, "id" | "contact_id" | "event_id" | "full_name" | "price" | "paid">
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
  const phone = useMedia("(width < 40rem)")

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
        {...sheetMotion(phone)}
        {...(phone ? {} : { transition: { type: "spring" as const, damping: 25, stiffness: 300 } })}
        className="fixed inset-0 flex items-end sm:items-center justify-center z-[110] pointer-events-none sm:p-4"
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="bg-surface-raised rounded-t-[20px] sm:rounded-overlay w-full sm:max-w-md pointer-events-auto flex flex-col max-h-[92dvh] sm:max-h-[calc(100dvh-32px)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className={sheet.grabber} />
          <div className="flex items-center justify-between gap-3 px-4 pt-2 pb-3 sm:px-5 sm:py-4 sm:border-b border-line">
            <div className="flex flex-col gap-0.5 min-w-0">
              <h2 id={titleId} className="text-lg sm:text-md font-bold text-ink">Cashback bilan to'lash</h2>
              <span className="text-xs text-ink-muted">{participant.full_name}</span>
            </div>
            <button
              onClick={onClose}
              disabled={busy}
              aria-label="Yopish"
              className="p-2 max-sm:size-10 max-sm:flex max-sm:items-center max-sm:justify-center sm:p-1.5 shrink-0 rounded-full hover:bg-mute-ghost-hover transition-colors"
            >
              <X size={20} className="text-ink-muted" />
            </button>
          </div>

          <div className="px-4 pb-4 sm:p-5 flex flex-col gap-4 min-h-0 overflow-y-auto">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface-sunken border border-line rounded-control p-3">
                <p className="text-xs font-bold text-ink uppercase tracking-wider mb-1">Joriy balans</p>
                <p className="text-md font-bold text-ink tabular-nums">{formatNumber(balance)} so'm</p>
              </div>
              <div className="bg-warning-soft border border-line rounded-control p-3">
                <p className="text-xs font-bold text-warning-dark uppercase tracking-wider mb-1">Qarz</p>
                <p className="text-md font-bold text-warning-dark tabular-nums">{formatNumber(debt)} so'm</p>
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
                inputMode="numeric"
                value={amount ? formatNumber(amount) : ""}
                onChange={(e) => setAmount(Math.min(Number(e.target.value.replace(/\D/g, "")), maxApplicable))}
                autoFocus
                className="w-full border border-line rounded-control px-3 py-2 max-sm:h-16 max-sm:text-[32px] max-sm:font-semibold max-sm:text-center max-sm:tabular-nums text-base text-ink focus:outline-none focus:border-line-focus transition-colors"
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

          <div className="flex flex-wrap items-center justify-end gap-2 p-4 pb-[calc(16px+env(safe-area-inset-bottom))] sm:px-5 sm:py-4 border-t border-line max-sm:flex-nowrap">
            <button
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 max-sm:h-12 max-sm:py-0 max-sm:bg-mute-soft max-sm:text-ink whitespace-nowrap rounded-full text-base font-medium text-ink-muted hover:text-ink transition-colors"
            >
              Bekor qilish
            </button>
            <button
              onClick={handleApply}
              disabled={busy || amount <= 0}
              className={`px-5 py-2 max-sm:h-12 max-sm:py-0 max-sm:flex-1 whitespace-nowrap rounded-full text-base font-bold text-ink-on-accent transition-colors ${
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
