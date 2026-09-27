import { useId, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, DeviceMobile } from "@phosphor-icons/react"
import { useCreateMemberAccount } from "@/hooks/useClients"
import { useDialog } from "@/hooks/useDialog"

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
  const titleId = useId()
  const formId = useId()

  function handleClose() {
    if (saving) return
    onClose()
  }

  const panelRef = useDialog<HTMLDivElement>(handleClose)

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
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="bg-surface-raised rounded-overlay w-full max-w-md pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-line">
            <div className="flex flex-col gap-0.5">
              <h2 id={titleId} className="text-md font-bold text-ink">Mobil ilova akkaunti</h2>
              <span className="text-xs text-ink-muted">{clientName}</span>
            </div>
            <button
              onClick={handleClose}
              disabled={saving}
              aria-label="Yopish"
              className="p-1.5 rounded-control-sm hover:bg-mute-ghost-hover transition-colors"
            >
              <X size={20} className="text-ink-muted" weight="bold" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 flex flex-col gap-4">
            {error && (
              <div className="px-3 py-2 rounded-control text-sm font-medium bg-danger-soft text-danger-text border border-line">
                {error}
              </div>
            )}

            <div className="flex items-start gap-2 px-3 py-2.5 rounded-control bg-surface-sunken border border-line">
              <DeviceMobile size={18} className="text-ink-muted mt-0.5 flex-shrink-0" weight="bold" />
              <span className="text-sm text-ink-muted leading-snug">
                A'zo shu email va parol bilan mobil ilovaga kiradi. Parolni a'zoga o'zingiz yetkazasiz.
              </span>
            </div>

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${formId}-email`} className="text-sm font-medium text-ink-muted">Email *</label>
              <input
                id={`${formId}-email`}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="azo@example.uz"
                autoFocus={!clientEmail}
                className="w-full border border-line rounded-control px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${formId}-password`} className="text-sm font-medium text-ink-muted">Parol * (kamida 6 belgi)</label>
              <input
                id={`${formId}-password`}
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                autoFocus={Boolean(clientEmail)}
                className="w-full border border-line rounded-control px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-line">
            <button
              onClick={handleClose}
              disabled={saving}
              className="px-4 py-2 rounded-control text-base font-medium text-ink-muted hover:text-ink transition-colors"
            >
              Bekor qilish
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !email.trim() || password.length < 6}
              className={`px-5 py-2 rounded-control text-base font-bold text-ink-on-accent transition-colors ${
                saving || !email.trim() || password.length < 6
                  ? "bg-mute-soft cursor-not-allowed"
                  : "bg-accent hover:bg-accent-hover"
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
