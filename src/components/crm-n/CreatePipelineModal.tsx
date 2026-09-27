import { useId, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Check } from "@phosphor-icons/react"
import {
  createCrmPipeline,
  batchCreateCrmStages,
} from "@/lib/supabase/queries/crm"
import { useDialog } from "@/hooks/useDialog"

interface CreatePipelineModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: (pipelineId: string) => void
}

const PIPELINE_COLORS = [
  "#3B82F6", "#F59E0B", "#8B5CF6", "#EC4899",
  "#06B6D4", "#10B981", "#EF4444", "#141414",
]

interface DefaultStage {
  name: string
  color: string
  is_won: boolean
  is_lost: boolean
  checked: boolean
}

const DEFAULT_STAGES: DefaultStage[] = [
  { name: "Yangi lid", color: "#3B82F6", is_won: false, is_lost: false, checked: true },
  { name: "Saralandi", color: "#F59E0B", is_won: false, is_lost: false, checked: true },
  { name: "Qo'ng'iroq qilindi", color: "#8B5CF6", is_won: false, is_lost: false, checked: true },
  { name: "Uchrashuv", color: "#EC4899", is_won: false, is_lost: false, checked: true },
  { name: "Taklif yuborildi", color: "#06B6D4", is_won: false, is_lost: false, checked: true },
  { name: "Yutildi", color: "#10B981", is_won: true, is_lost: false, checked: true },
  { name: "Yutqazildi", color: "#EF4444", is_won: false, is_lost: true, checked: true },
]

export function CreatePipelineModal({
  isOpen,
  onClose,
  onCreated,
}: CreatePipelineModalProps) {
  const [name, setName] = useState("")
  const [color, setColor] = useState(PIPELINE_COLORS[0])
  const [stages, setStages] = useState<DefaultStage[]>(
    DEFAULT_STAGES.map((s) => ({ ...s }))
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const titleId = useId()
  const nameFieldId = useId()
  const panelRef = useDialog<HTMLDivElement>(handleClose, isOpen)

  function toggleStage(index: number) {
    setStages((prev) =>
      prev.map((s, i) => i === index ? { ...s, checked: !s.checked } : s)
    )
  }

  async function handleSubmit() {
    if (!name.trim()) return
    setSaving(true)
    setError(null)

    try {
      // 1. Create pipeline
      const pipeline = await createCrmPipeline(name.trim(), color)

      // 2. Create default stages
      const checkedStages = stages.filter((s) => s.checked)
      if (checkedStages.length > 0) {
        await batchCreateCrmStages(
          checkedStages.map((s, i) => ({
            pipeline_id: pipeline.id,
            name: s.name,
            color: s.color,
            sort_order: i,
            is_won: s.is_won,
            is_lost: s.is_lost,
          }))
        )
      }

      onCreated(pipeline.id)
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik yuz berdi")
    } finally {
      setSaving(false)
    }
  }

  function handleClose() {
    setName("")
    setColor(PIPELINE_COLORS[0])
    setStages(DEFAULT_STAGES.map((s) => ({ ...s })))
    setError(null)
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-surface-overlay backdrop-blur-[2px] z-50"
            onClick={handleClose}
          />

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
              className="bg-surface-raised rounded-overlay w-full max-w-md pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 pb-4 border-b border-line">
                <div className="flex items-center gap-2">
                  <h2 id={titleId} className="text-md font-bold text-ink">
                    Yangi voronka yaratish
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

                {/* Nomi */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={nameFieldId} className="text-sm font-medium text-ink-muted">Voronka nomi *</label>
                  <input
                    id={nameFieldId}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Masalan: Asosiy voronka"
                    autoFocus
                    className="w-full border border-line rounded-control px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors"
                  />
                </div>

                {/* Rang */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-ink-muted">Rang</label>
                  <div className="flex items-center gap-2">
                    {PIPELINE_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setColor(c)}
                        aria-label={`Rang: ${c}`}
                        aria-pressed={color === c}
                        className={`w-7 h-7 rounded-full transition-all ${color === c ? "ring-2 ring-offset-2 ring-line-focus scale-110" : "hover:scale-110"}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                {/* Default bosqichlar */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-ink-muted">Default bosqichlar</label>
                  <div className="flex flex-col gap-1.5 bg-surface-sunken rounded-control p-3">
                    {stages.map((stage, index) => (
                      <label
                        key={index}
                        className="flex items-center gap-2.5 py-1 cursor-pointer group"
                      >
                        <button
                          onClick={() => toggleStage(index)}
                          aria-pressed={stage.checked}
                          aria-label={stage.name}
                          className={`w-4.5 h-4.5 rounded-checkbox flex items-center justify-center shrink-0 transition-colors ${
                            stage.checked
                              ? "bg-accent"
                              : "bg-surface-raised border border-line"
                          }`}
                          style={{ width: 18, height: 18 }}
                        >
                          {stage.checked && <Check size={12} weight="bold" className="text-ink-on-accent" />}
                        </button>
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: stage.color }}
                        />
                        <span className={`text-base ${stage.checked ? "text-ink font-medium" : "text-ink-muted"}`}>
                          {stage.name}
                        </span>
                        {stage.is_won && (
                          <span className="text-xs font-bold text-ink bg-surface-sunken px-1 py-0.5 rounded-tag ml-auto">
                            Yutildi
                          </span>
                        )}
                        {stage.is_lost && (
                          <span className="text-xs font-bold text-danger-text bg-danger-soft px-1 py-0.5 rounded-tag ml-auto">
                            Yutqazildi
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
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
                  disabled={saving || !name.trim()}
                  className={`px-5 py-2 rounded-control text-base font-bold transition-colors ${
                    saving || !name.trim()
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
