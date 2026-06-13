import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, DeviceMobile } from "@phosphor-icons/react"
import { useCreateMemberAccount } from "@/hooks/useClients"

interface CreateMemberAccountModalProps {
  isOpen: boolean
  onClose: () => void
  clientId: string
  clientName: string
  clientEmail: string
  onSuccess?: () => void
}

interface CreateFormProps {
  onClose: () => void
  clientId: string
  clientName: string
  clientEmail: string
  onSuccess?: () => void
}

// Inner form is only mounted while the modal is open, so state initialises
// naturally per open without a setState-in-effect cascade.
function CreateForm({ onClose, clientId, clientName, clientEmail, onSuccess }: CreateFormProps) {
  const [email, setEmail] = useState(clientEmail)
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)

  const createMutation = useCreateMemberAccount()
  const saving = createMutation.isPending

  function handleClose() {
    if (saving) return
    onClose()
  }

  async function handleSubmit() {
    setError(null)
    const trimmedEmail = email.trim()
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Email noto'g'ri")
      return
    }
    if (password.length < 6) {
      setError("Parol kamida 6 ta belgi bo'lishi kerak")
      return
    }

    try {
      await createMutation.mutateAsync({
        client_id: clientId,
        email: trimmedEmail,
        password,
      })
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik yuz berdi")
    }
  }

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
              <h2 className="text-[16px] font-bold text-[#141414]">Mobil ilova akkaunti</h2>
              <span className="text-[11px] text-[#999]">{clientName}</span>
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

            <div className="flex items-start gap-2 px-3 py-2.5 rounded-[8px] bg-[#F9F9F8] border border-[#F0F0F0]">
              <DeviceMobile size={18} className="text-[#999] mt-0.5 flex-shrink-0" weight="bold" />
              <span className="text-[12px] text-[#666] leading-snug">
                A'zo shu email va parol bilan mobil ilovaga kiradi. Parolni a'zoga o'zingiz yetkazasiz.
              </span>
            </div>

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#999]">Email *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="azo@example.uz"
                autoFocus={!clientEmail}
                className="w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] placeholder:text-[#CCC] focus:outline-none focus:border-[#141414] transition-colors"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#999]">Parol * (kamida 6 belgi)</label>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                autoFocus={Boolean(clientEmail)}
                className="w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] placeholder:text-[#CCC] focus:outline-none focus:border-[#141414] transition-colors"
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
              disabled={saving || !email.trim() || password.length < 6}
              className={`px-5 py-2 rounded-[8px] text-[13px] font-bold text-white transition-colors ${
                saving || !email.trim() || password.length < 6
                  ? "bg-[#CCCCCC] cursor-not-allowed"
                  : "bg-[#141414] hover:bg-[#333]"
              }`}
            >
              {saving ? "Yaratilmoqda..." : "Akkaunt ochish"}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  )
}

export function CreateMemberAccountModal({
  isOpen,
  onClose,
  clientId,
  clientName,
  clientEmail,
  onSuccess,
}: CreateMemberAccountModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <CreateForm
          onClose={onClose}
          clientId={clientId}
          clientName={clientName}
          clientEmail={clientEmail}
          onSuccess={onSuccess}
        />
      )}
    </AnimatePresence>
  )
}
