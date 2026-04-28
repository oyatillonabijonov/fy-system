import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { XMarkIcon, CheckIcon } from "@heroicons/react/24/solid"
import {
  createCrmPipeline,
  batchCreateCrmStages,
} from "@/lib/supabase/queries/crm"

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
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50"
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
              className="bg-white rounded-[12px] w-full max-w-md shadow-2xl pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 pb-4 border-b border-[#F0F0F0]">
                <div className="flex items-center gap-2">
                  <h2 className="text-[16px] font-bold text-[#141414]">
                    Yangi voronka yaratish
                  </h2>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] text-[10px] font-bold bg-emerald-50 text-emerald-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    CRM-N
                  </span>
                </div>
                <button
                  onClick={handleClose}
                  className="p-1.5 rounded-[6px] hover:bg-[#F5F5F5] transition-colors"
                >
                  <XMarkIcon className="w-5 h-5 text-[#999999]" />
                </button>
              </div>

              {/* Form */}
              <div className="p-5 flex flex-col gap-4">
                {error && (
                  <div className="px-3 py-2 rounded-[8px] text-[12px] font-medium bg-red-50 text-red-700 border border-red-200">
                    {error}
                  </div>
                )}

                {/* Nomi */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-[#999999]">Voronka nomi *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Masalan: Asosiy voronka"
                    autoFocus
                    className="w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] placeholder:text-[#CCCCCC] focus:outline-none focus:border-[#141414] transition-colors"
                  />
                </div>

                {/* Rang */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-[#999999]">Rang</label>
                  <div className="flex items-center gap-2">
                    {PIPELINE_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setColor(c)}
                        className={`w-7 h-7 rounded-full transition-all ${color === c ? "ring-2 ring-offset-2 ring-[#141414] scale-110" : "hover:scale-110"}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                {/* Default bosqichlar */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-[#999999]">Default bosqichlar</label>
                  <div className="flex flex-col gap-1.5 bg-[#FBFBFB] rounded-[8px] p-3">
                    {stages.map((stage, index) => (
                      <label
                        key={index}
                        className="flex items-center gap-2.5 py-1 cursor-pointer group"
                      >
                        <button
                          onClick={() => toggleStage(index)}
                          className={`w-4.5 h-4.5 rounded-[4px] flex items-center justify-center shrink-0 transition-colors ${
                            stage.checked
                              ? "bg-[#141414]"
                              : "bg-white border border-[#D0D0D0] group-hover:border-[#999]"
                          }`}
                          style={{ width: 18, height: 18 }}
                        >
                          {stage.checked && <CheckIcon className="w-3 h-3 text-white" />}
                        </button>
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: stage.color }}
                        />
                        <span className={`text-[13px] ${stage.checked ? "text-[#141414] font-medium" : "text-[#999]"}`}>
                          {stage.name}
                        </span>
                        {stage.is_won && (
                          <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded ml-auto">
                            Yutildi
                          </span>
                        )}
                        {stage.is_lost && (
                          <span className="text-[9px] font-bold text-red-600 bg-red-50 px-1 py-0.5 rounded ml-auto">
                            Yutqazildi
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
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
                  disabled={saving || !name.trim()}
                  className={`px-5 py-2 rounded-[8px] text-[13px] font-bold text-white transition-colors ${
                    saving || !name.trim()
                      ? "bg-[#CCCCCC] cursor-not-allowed"
                      : "bg-[#141414] hover:bg-[#333333]"
                  }`}
                >
                  {saving ? (
                    <div className="flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
