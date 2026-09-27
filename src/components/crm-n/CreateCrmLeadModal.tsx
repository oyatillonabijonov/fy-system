import { useState, useEffect, useId } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "@phosphor-icons/react"
import type { CrmStage } from "@/lib/supabase/queries/crm"
import {
  createCrmContact,
  createCrmLead,
} from "@/lib/supabase/queries/crm"
import type { CrmUser } from "@/lib/supabase/queries/crm"
import { useDialog } from "@/hooks/useDialog"

interface CreateCrmLeadModalProps {
  isOpen: boolean
  onClose: () => void
  stages: CrmStage[]
  pipelineId: string
  users: CrmUser[]
  onLeadCreated: () => void
}

export function CreateCrmLeadModal({
  isOpen,
  onClose,
  stages,
  pipelineId,
  users,
  onLeadCreated,
}: CreateCrmLeadModalProps) {
  const [contactName, setContactName] = useState("")
  const [contactPhone, setContactPhone] = useState("")
  const [leadName, setLeadName] = useState("")
  const [stageId, setStageId] = useState<string>(stages[0]?.id ?? "")
  const [price, setPrice] = useState("")
  const [responsibleUserId, setResponsibleUserId] = useState<string>("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const titleId = useId()
  const contactNameFieldId = useId()
  const contactPhoneFieldId = useId()
  const leadNameFieldId = useId()
  const stageFieldId = useId()
  const priceFieldId = useId()
  const responsibleFieldId = useId()
  const panelRef = useDialog<HTMLDivElement>(handleClose, isOpen)

  // Auto-set first stage when stages load (replaces setState-in-render)
  useEffect(() => {
    if (!stageId && stages.length > 0) setStageId(stages[0].id)
  }, [stages, stageId])

  async function handleSubmit() {
    if (!contactName.trim()) return
    setSaving(true)
    setError(null)

    try {
      // 1. Create contact
      const contact = await createCrmContact({
        name: contactName.trim(),
        phone: contactPhone.trim() || undefined,
      })

      // 2. Create lead
      await createCrmLead({
        name: leadName.trim() || `${contactName.trim()} — Yangi lid`,
        pipeline_id: pipelineId,
        stage_id: stageId,
        contact_id: contact.id,
        price: price ? Number(price) : 0,
        responsible_user_id: responsibleUserId || undefined,
      })

      onLeadCreated()
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik yuz berdi")
    } finally {
      setSaving(false)
    }
  }

  function handleClose() {
    setContactName("")
    setContactPhone("")
    setLeadName("")
    setPrice("")
    setResponsibleUserId("")
    setError(null)
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-surface-overlay backdrop-blur-[2px] z-50"
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
          >
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              className="bg-surface-raised rounded-overlay w-full max-w-lg pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 pb-4 border-b border-line">
                <div className="flex items-center gap-2">
                  <h2 id={titleId} className="text-md font-bold text-ink">
                    Yangi lid yaratish
                  </h2>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-tag text-xs font-bold bg-surface-sunken text-ink">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                    CRM-N
                  </span>
                </div>
                <button
                  onClick={handleClose}
                  className="p-1.5 rounded-item hover:bg-mute-ghost-hover transition-colors"
                  aria-label="Yopish"
                >
                  <X size={20} className="text-ink-muted" />
                </button>
              </div>

              {/* Form */}
              <div className="p-5 flex flex-col gap-4">
                {error && (
                  <div className="px-3 py-2 rounded-control text-sm font-medium bg-danger-soft text-danger-dark border border-line">
                    {error}
                  </div>
                )}

                {/* Ism */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={contactNameFieldId} className="text-sm font-medium text-ink-muted">Ism *</label>
                  <input
                    id={contactNameFieldId}
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Kontakt ismi"
                    autoFocus
                    className="w-full border border-line rounded-control px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors"
                  />
                </div>

                {/* Telefon */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={contactPhoneFieldId} className="text-sm font-medium text-ink-muted">Telefon</label>
                  <input
                    id={contactPhoneFieldId}
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+998 90 123 45 67"
                    className="w-full border border-line rounded-control px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors"
                  />
                </div>

                {/* Lead nomi */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={leadNameFieldId} className="text-sm font-medium text-ink-muted">Lead nomi</label>
                  <input
                    id={leadNameFieldId}
                    type="text"
                    value={leadName}
                    onChange={(e) => setLeadName(e.target.value)}
                    placeholder={contactName ? `${contactName} — Yangi lid` : "Avtomatik to'ldiriladi"}
                    className="w-full border border-line rounded-control px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors"
                  />
                </div>

                {/* Bosqich + Summa */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={stageFieldId} className="text-sm font-medium text-ink-muted">Bosqich</label>
                    <select
                      id={stageFieldId}
                      value={stageId}
                      onChange={(e) => setStageId(e.target.value)}
                      className="w-full border border-line rounded-control px-3 py-2 text-base text-ink focus:outline-none focus:border-line-focus transition-colors"
                    >
                      {stages
                        .filter((s) => !s.is_won && !s.is_lost)
                        .map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={priceFieldId} className="text-sm font-medium text-ink-muted">Summa</label>
                    <input
                      id={priceFieldId}
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="0"
                      className="w-full border border-line rounded-control px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors"
                    />
                  </div>
                </div>

                {/* Mas'ul */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={responsibleFieldId} className="text-sm font-medium text-ink-muted">Mas'ul</label>
                  <select
                    id={responsibleFieldId}
                    value={responsibleUserId}
                    onChange={(e) => setResponsibleUserId(e.target.value)}
                    className="w-full border border-line rounded-control px-3 py-2 text-base text-ink focus:outline-none focus:border-line-focus transition-colors"
                  >
                    <option value="">Tanlanmagan</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
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
                  disabled={saving || !contactName.trim()}
                  className={`px-5 py-2 rounded-control text-base font-bold transition-colors ${
                    saving || !contactName.trim()
                      ? "bg-mute-soft text-ink-faint cursor-not-allowed"
                      : "bg-accent text-ink-on-accent hover:bg-accent-hover"
                  }`}
                >
                  {saving ? (
                    <div className="flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 border-2 border-ink-on-accent border-t-transparent rounded-full animate-spin" />
                      Yaratilmoqda...
                    </div>
                  ) : (
                    "Yaratish"
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
