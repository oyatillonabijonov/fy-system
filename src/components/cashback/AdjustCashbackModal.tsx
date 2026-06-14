import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Plus, Minus } from "@phosphor-icons/react"
import { useAdjustCashback } from "@/hooks/useCashback"
import { formatNumber } from "@/lib/format"

interface AdjustCashbackModalProps {
  isOpen: boolean
  onClose: () => void
  clientId: string
  clientName: string
  currentBalance: number
  onSuccess?: (delta: number, type: "add" | "subtract") => void
}

interface AdjustFormProps {
  onClose: () => void
  clientId: string
  clientName: string
  currentBalance: number
  onSuccess?: (delta: number, type: "add" | "subtract") => void
}

// Inner form is only mounted while the modal is open, so state initialises
// naturally per open without a setState-in-effect cascade.
function AdjustForm({ onClose, clientId, clientName, currentBalance, onSuccess }: AdjustFormProps) {
  const [type, setType] = useState<"add" | "subtract">("add")
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")
  const [error, setError] = useState<string | null>(null)

  const adjustMutation = useAdjustCashback()
  const saving = adjustMutation.isPending

  function handleClose() {
    if (saving) return
    onClose()
  }

  async function handleSubmit() {
    setError(null)
    const numericAmount = Number(amount)
    if (!numericAmount || numericAmount <= 0) {
      setError("Summa noto'g'ri")
      return
    }
    if (!description.trim()) {
      setError("Tavsif majburiy")
      return
    }
    if (type === "subtract" && numericAmount > currentBalance) {
      setError("Joriy balansdan ko'p ayirib bo'lmaydi")
      return
    }

    try {
      await adjustMutation.mutateAsync({
        clientId,
        amount: numericAmount,
        type,
        description: description.trim(),
      })
      onSuccess?.(numericAmount, type)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik yuz berdi")
    }
  }

  const formattedBalance = formatNumber(currentBalance)

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[110]"
        onClick={handleClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed inset-0 flex items-center justify-center z-[110] pointer-events-none"
      >
        <div
          className="bg-white rounded-[12px] w-full max-w-md shadow-2xl pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F0F0]">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-[16px] font-bold text-[#141414]">Cashbackni o'zgartirish</h2>
              <span className="text-[11px] text-[#999]">{clientName} · joriy: {formattedBalance} so'm</span>
            </div>
            <button
              onClick={handleClose}
              disabled={saving}
              className="p-1.5 rounded-[6px] hover:bg-[#F5F5F5] transition-colors"
            >
              <X size={20} className="text-[#999]" weight="bold" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 flex flex-col gap-4">
            {error && (
              <div className="px-3 py-2 rounded-[8px] text-[12px] font-medium bg-red-50 text-red-700 border border-red-200">
                {error}
              </div>
            )}

            {/* Type selector */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType("add")}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-[8px] text-[13px] font-bold transition-colors border ${
                  type === "add"
                    ? "bg-[#F5F5F5] text-[#141414] border-[#E0E0E0]"
                    : "bg-white text-[#999] border-[#E0E0E0] hover:bg-[#F9F9F9]"
                }`}
              >
                <Plus size={14} weight="bold" />
                Qo'shish
              </button>
              <button
                type="button"
                onClick={() => setType("subtract")}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-[8px] text-[13px] font-bold transition-colors border ${
                  type === "subtract"
                    ? "bg-orange-50 text-orange-700 border-orange-200"
                    : "bg-white text-[#999] border-[#E0E0E0] hover:bg-[#F9F9F9]"
                }`}
              >
                <Minus size={14} weight="bold" />
                Ayirish
              </button>
            </div>

            {/* Amount */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#999]">Summa (so'm) *</label>
              <input
                type="number"
                min={0}
                step={500}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="10000"
                autoFocus
                className="w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] placeholder:text-[#CCC] focus:outline-none focus:border-[#141414] transition-colors"
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#999]">Tavsif *</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Masalan: bayram bonusi"
                rows={2}
                className="w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] placeholder:text-[#CCC] focus:outline-none focus:border-[#141414] transition-colors resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#F0F0F0]">
            <button
              onClick={handleClose}
              disabled={saving}
              className="px-4 py-2 rounded-[8px] text-[13px] font-medium text-[#999] hover:text-[#666] transition-colors"
            >
              Bekor qilish
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !amount || !description.trim()}
              className={`px-5 py-2 rounded-[8px] text-[13px] font-bold text-white transition-colors ${
                saving || !amount || !description.trim()
                  ? "bg-[#CCCCCC] cursor-not-allowed"
                  : "bg-[#141414] hover:bg-[#333]"
              }`}
            >
              {saving ? "Saqlanmoqda..." : "Saqlash"}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  )
}

export function AdjustCashbackModal({
  isOpen,
  onClose,
  clientId,
  clientName,
  currentBalance,
  onSuccess,
}: AdjustCashbackModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <AdjustForm
          onClose={onClose}
          clientId={clientId}
          clientName={clientName}
          currentBalance={currentBalance}
          onSuccess={onSuccess}
        />
      )}
    </AnimatePresence>
  )
}
