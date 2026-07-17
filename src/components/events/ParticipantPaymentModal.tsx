import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "@phosphor-icons/react"
import type { Participant } from "@/lib/supabase/queries/events"
import type { PaymentMethod } from "@/lib/supabase/queries/payments"
import { useAddPayment } from "@/hooks/usePayments"
import { useAuth } from "@/context/AuthContext"
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
  "w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] placeholder:text-[#CCCCCC] focus:outline-none focus:border-[#141414] transition-colors"

export function ParticipantPaymentModal({ isOpen, participant, onClose, onPaid }: ParticipantPaymentModalProps) {
  const { user } = useAuth()
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState<PaymentMethod>("naqd")
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const addMutation = useAddPayment(participant?.id ?? "")

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

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
            onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="bg-white rounded-[12px] shadow-2xl w-full max-w-sm relative overflow-hidden flex flex-col"
          >
            <div className="p-5 border-b border-[#F0F0F0] flex items-center justify-between">
              <div className="flex flex-col min-w-0">
                <h3 className="text-[15px] font-bold text-[#141414] truncate">{participant.full_name}</h3>
                <span className="text-[11px] text-[#999]">To'lov qo'shish</span>
              </div>
              <button onClick={onClose} className="p-1 hover:bg-[#F5F5F5] rounded-full transition-all">
                <X size={20} className="text-[#999999]" weight="bold" />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              {error && (
                <div className="px-3 py-2 rounded-[8px] text-[12px] font-medium bg-red-50 text-red-700 border border-red-200">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-between px-3 py-2 rounded-[8px] bg-[#FBFBFB] border border-[#F0F0F0] text-[12px]">
                <span className="text-[#999]">Qolgan qarz</span>
                <span className="font-bold" style={{ color: debt > 0 ? "#D13328" : "#1E7E34" }}>{formatMoney(debt)}</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-[#999999]">To'lov summasi *</label>
                <div className="relative">
                  <input
                    inputMode="numeric"
                    value={amount ? formatNumber(Number(amount)) : ""}
                    onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                    placeholder="100,000"
                    autoFocus
                    className={`${INPUT} pr-12`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[#999] pointer-events-none">UZS</span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-[#999999]">To'lov turi *</label>
                <div className="flex gap-2">
                  {METHODS.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => setMethod(m.value)}
                      className={`flex-1 py-2 rounded-[8px] text-[12px] font-semibold border transition-colors ${
                        method === m.value ? "bg-[#141414] text-white border-[#141414]" : "bg-white text-[#666] border-[#E0E0E0] hover:bg-[#F5F5F5]"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-[#999999]">Izoh</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Ixtiyoriy..."
                  className={`${INPUT} resize-none`}
                />
              </div>

              <div className="text-[11px] text-[#999]">
                Mas'ul: <span className="font-semibold text-[#141414]">{user?.full_name ?? "—"}</span>
              </div>
            </div>

            <div className="p-5 pt-0 flex gap-3">
              <button
                onClick={onClose}
                disabled={addMutation.isPending}
                className="flex-1 px-4 py-2.5 bg-[#F5F5F5] text-[#141414] rounded-[8px] text-[13px] font-bold hover:bg-[#EAEAEA] transition-all disabled:opacity-50"
              >
                Bekor qilish
              </button>
              <button
                onClick={handleSubmit}
                disabled={addMutation.isPending || amountNum <= 0}
                className={`flex-1 px-4 py-2.5 rounded-[8px] text-[13px] font-bold transition-all flex items-center justify-center gap-2 ${
                  addMutation.isPending || amountNum <= 0 ? "bg-[#E0E0E0] text-[#999] cursor-not-allowed" : "bg-[#141414] text-white hover:bg-black active:scale-95"
                }`}
              >
                {addMutation.isPending ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
