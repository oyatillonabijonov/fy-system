import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "@phosphor-icons/react"
import { useQueryClient } from "@tanstack/react-query"
import { useSpendCashback } from "@/hooks/useCashback"
import { PARTICIPANTS_KEY } from "@/hooks/useEvents"
import type { Participant } from "@/lib/supabase/queries/events"
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
          className="bg-white rounded-[12px] w-full max-w-md shadow-2xl pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F0F0]">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-[16px] font-bold text-[#141414]">Cashback bilan to'lash</h2>
              <span className="text-[11px] text-[#999]">{participant.full_name}</span>
            </div>
            <button
              onClick={onClose}
              disabled={busy}
              className="p-1.5 rounded-[6px] hover:bg-[#F5F5F5] transition-colors"
            >
              <X size={20} className="text-[#999]" weight="bold" />
            </button>
          </div>

          <div className="p-5 flex flex-col gap-4">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#F5F5F5] border border-[#E8E8E8] rounded-[8px] p-3">
                <p className="text-[10px] font-bold text-[#141414] uppercase tracking-wider mb-1">Joriy balans</p>
                <p className="text-[16px] font-bold text-[#141414]">{formatNumber(balance)} so'm</p>
              </div>
              <div className="bg-orange-50 border border-orange-100 rounded-[8px] p-3">
                <p className="text-[10px] font-bold text-orange-700 uppercase tracking-wider mb-1">Qarz</p>
                <p className="text-[16px] font-bold text-orange-700">{formatNumber(debt)} so'm</p>
              </div>
            </div>

            {error && (
              <div className="px-3 py-2 rounded-[8px] text-[12px] font-medium bg-red-50 text-red-700 border border-red-200">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#999]">Qo'llanadigan summa (so'm)</label>
              <input
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
                className="w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] focus:outline-none focus:border-[#141414] transition-colors"
              />
              <span className="text-[11px] text-[#999]">
                Maksimum: <strong>{formatNumber(maxApplicable)} so'm</strong>
                {balance < debt && " (balans yetarli emas — qarzning bir qismi qoladi)"}
              </span>
            </div>

            <p className="text-[11px] text-[#999] italic">
              💡 Cashback orqali to'lov uchun yangi cashback berilmaydi
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#F0F0F0]">
            <button
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 rounded-[8px] text-[13px] font-medium text-[#999] hover:text-[#666] transition-colors"
            >
              Bekor qilish
            </button>
            <button
              onClick={handleApply}
              disabled={busy || amount <= 0}
              className={`px-5 py-2 rounded-[8px] text-[13px] font-bold text-white transition-colors ${
                busy || amount <= 0 ? "bg-[#CCC] cursor-not-allowed" : "bg-[#141414] hover:bg-[#333]"
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
