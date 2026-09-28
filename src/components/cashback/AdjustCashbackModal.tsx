import { useId, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Plus, Minus } from "@phosphor-icons/react"
import { useAdjustCashback } from "@/hooks/useCashback"
import { useDialog } from "@/hooks/useDialog"
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

  const titleId = useId()
  const amountId = useId()
  const descriptionId = useId()
  const panelRef = useDialog<HTMLDivElement>(handleClose)

  async function handleSubmit() {
    setError(null)
    const numericAmount = Number(amount)
    if (!numericAmount || numericAmount <= 0) {
      setError("Summa noto'g'ri")
      return
    }
    if (!description.trim()) {
      setError("Sababini yozing")
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
        className="fixed inset-0 bg-surface-overlay z-[110]"
        onClick={handleClose}
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
          className="bg-surface-raised border border-line rounded-overlay w-full max-w-md pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-line">
            <div className="flex flex-col gap-0.5">
              <h2 id={titleId} className="text-md font-semibold text-ink">Keshbekni o'zgartirish</h2>
              <span className="text-sm text-ink-muted">{clientName} · balans: {formattedBalance} so'm</span>
            </div>
            <button
              onClick={handleClose}
              disabled={saving}
              aria-label="Yopish"
              className="size-8 rounded-item flex items-center justify-center hover:bg-mute-ghost-hover transition-colors"
            >
              <X size={18} className="text-ink-muted" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 flex flex-col gap-4">
            {error && (
              <div role="alert" className="px-3.5 py-2.5 rounded-control text-sm font-medium bg-danger-soft text-danger-text">
                {error}
              </div>
            )}

            {/* Type selector */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-control bg-surface-sunken">
              <button
                type="button"
                onClick={() => setType("add")}
                aria-pressed={type === "add"}
                className={`flex items-center justify-center gap-2 h-8 rounded-item text-base font-medium transition-colors ${
                  type === "add" ? "bg-surface text-ink" : "text-ink-muted hover:text-ink"
                }`}
              >
                <Plus size={16} />
                Qo'shish
              </button>
              <button
                type="button"
                onClick={() => setType("subtract")}
                aria-pressed={type === "subtract"}
                className={`flex items-center justify-center gap-2 h-8 rounded-item text-base font-medium transition-colors ${
                  type === "subtract" ? "bg-surface text-ink" : "text-ink-muted hover:text-ink"
                }`}
              >
                <Minus size={16} />
                Ayirish
              </button>
            </div>

            {/* Amount */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor={amountId} className="text-sm font-medium text-ink-muted">Summa (so'm) *</label>
              <input
                id={amountId}
                type="number"
                min={0}
                step={500}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="10000"
                autoFocus
                className="w-full h-control-md border border-line rounded-control px-3 text-base text-ink bg-surface placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors"
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor={descriptionId} className="text-sm font-medium text-ink-muted">Sabab *</label>
              <textarea
                id={descriptionId}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Masalan: bayram bonusi"
                rows={2}
                className="w-full border border-line rounded-control px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-line">
            <button
              onClick={handleClose}
              disabled={saving}
              className="px-3.5 h-control-md rounded-control bg-mute-soft text-base font-medium text-ink hover:bg-mute-soft-hover transition-colors disabled:opacity-50"
            >
              Bekor qilish
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !amount || !description.trim()}
              className="px-4 h-control-md rounded-control bg-accent text-ink-on-accent text-base font-medium hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:pointer-events-none"
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
