import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  XMarkIcon,
  PlusIcon,
  TrashIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  PencilIcon,
  CheckIcon,
} from "@heroicons/react/24/solid"
import type { CrmStage } from "@/lib/supabase/queries/crm"
import {
  createCrmStage,
  updateCrmStage,
  deleteCrmStage,
  reorderStages,
  updateCrmPipeline,
  deleteCrmPipeline,
} from "@/lib/supabase/queries/crm"

interface PipelineSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  pipelineId: string
  pipelineName: string
  stages: CrmStage[]
  onUpdated: () => void
  onPipelineDeleted?: () => void
}

const STAGE_COLORS = [
  "#3B82F6", "#F59E0B", "#8B5CF6", "#EC4899",
  "#06B6D4", "#10B981", "#EF4444", "#141414",
]

export function PipelineSettingsModal({
  isOpen,
  onClose,
  pipelineId,
  pipelineName,
  stages,
  onUpdated,
  onPipelineDeleted,
}: PipelineSettingsModalProps) {
  // Pipeline name edit
  const [editingPipelineName, setEditingPipelineName] = useState(false)
  const [pipelineNameValue, setPipelineNameValue] = useState(pipelineName)
  const [pipelineNameSaving, setPipelineNameSaving] = useState(false)
  const pipelineNameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setPipelineNameValue(pipelineName)
  }, [pipelineName])

  useEffect(() => {
    if (editingPipelineName) pipelineNameRef.current?.focus()
  }, [editingPipelineName])

  // Stage management
  const [newStageName, setNewStageName] = useState("")
  const [newStageColor, setNewStageColor] = useState(STAGE_COLORS[0])
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editColor, setEditColor] = useState("")
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteStageId, setConfirmDeleteStageId] = useState<string | null>(null)

  // Pipeline delete
  const [showDeletePipeline, setShowDeletePipeline] = useState(false)
  const [deletingPipeline, setDeletingPipeline] = useState(false)

  async function handleSavePipelineName() {
    if (!pipelineNameValue.trim() || pipelineNameValue === pipelineName) {
      setEditingPipelineName(false)
      setPipelineNameValue(pipelineName)
      return
    }
    setPipelineNameSaving(true)
    try {
      await updateCrmPipeline(pipelineId, { name: pipelineNameValue.trim() })
      setEditingPipelineName(false)
      onUpdated()
    } catch (err) {
      console.error("Pipeline nom o'zgartirishda xatolik:", err)
      setPipelineNameValue(pipelineName)
    } finally {
      setPipelineNameSaving(false)
    }
  }

  async function handleAddStage() {
    if (!newStageName.trim()) return
    setAdding(true)
    try {
      await createCrmStage(pipelineId, newStageName.trim(), newStageColor)
      setNewStageName("")
      onUpdated()
    } catch (err) {
      console.error("Stage qo'shishda xatolik:", err)
    } finally {
      setAdding(false)
    }
  }

  async function handleSaveEdit(id: string) {
    if (!editName.trim()) return
    setSaving(true)
    try {
      await updateCrmStage(id, { name: editName.trim(), color: editColor })
      setEditingId(null)
      onUpdated()
    } catch (err) {
      console.error("Stage tahrirlashda xatolik:", err)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await deleteCrmStage(id)
      setConfirmDeleteStageId(null)
      onUpdated()
    } catch (err) {
      console.error("Stage o'chirishda xatolik:", err)
    } finally {
      setDeletingId(null)
    }
  }

  async function handleMove(index: number, direction: "up" | "down") {
    const swapIdx = direction === "up" ? index - 1 : index + 1
    if (swapIdx < 0 || swapIdx >= stages.length) return

    const updated = stages.map((s, i) => {
      if (i === index) return { id: s.id, sort_order: stages[swapIdx].sort_order }
      if (i === swapIdx) return { id: s.id, sort_order: stages[index].sort_order }
      return { id: s.id, sort_order: s.sort_order }
    })

    try {
      await reorderStages(updated)
      onUpdated()
    } catch (err) {
      console.error("Tartibni o'zgartirishda xatolik:", err)
    }
  }

  async function handleDeletePipeline() {
    setDeletingPipeline(true)
    try {
      await deleteCrmPipeline(pipelineId)
      onClose()
      onPipelineDeleted?.()
    } catch (err) {
      console.error("Pipeline o'chirishda xatolik:", err)
    } finally {
      setDeletingPipeline(false)
    }
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
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
          >
            <div
              className="bg-white rounded-[12px] w-full max-w-md shadow-2xl pointer-events-auto max-h-[80vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header with pipeline name */}
              <div className="flex items-center justify-between p-5 pb-4 border-b border-[#F0F0F0] shrink-0">
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <span className="text-[11px] font-bold text-[#999] uppercase tracking-wider">Pipeline sozlamalari</span>
                  {editingPipelineName ? (
                    <div className="flex items-center gap-2">
                      <input
                        ref={pipelineNameRef}
                        type="text"
                        value={pipelineNameValue}
                        onChange={(e) => setPipelineNameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSavePipelineName()
                          if (e.key === "Escape") { setEditingPipelineName(false); setPipelineNameValue(pipelineName) }
                        }}
                        disabled={pipelineNameSaving}
                        className="text-[16px] font-bold text-[#141414] border border-[#E0E0E0] rounded-[6px] px-2 py-0.5 focus:outline-none focus:border-[#141414] flex-1"
                      />
                      <button
                        onClick={handleSavePipelineName}
                        disabled={pipelineNameSaving}
                        className="p-1 rounded-[4px] hover:bg-[#F5F5F5] disabled:opacity-50"
                      >
                        <CheckIcon className="w-4 h-4 text-emerald-500" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h2 className="text-[16px] font-bold text-[#141414] truncate">{pipelineName}</h2>
                      <button
                        onClick={() => setEditingPipelineName(true)}
                        className="p-1 rounded-[4px] hover:bg-[#F5F5F5] shrink-0"
                      >
                        <PencilIcon className="w-3.5 h-3.5 text-[#999]" />
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-[6px] hover:bg-[#F5F5F5] transition-colors shrink-0 ml-3"
                >
                  <XMarkIcon className="w-5 h-5 text-[#999999]" />
                </button>
              </div>

              {/* Stages list */}
              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-2">
                <span className="text-[11px] font-bold text-[#999] uppercase tracking-wider mb-1">
                  Bosqichlar ({stages.length})
                </span>

                {stages.map((stage, index) => (
                  <div
                    key={stage.id}
                    className="flex items-center gap-2 bg-[#FBFBFB] rounded-[8px] p-3 group"
                  >
                    {editingId === stage.id ? (
                      <>
                        {/* Color picker row */}
                        <div className="flex flex-col gap-2 flex-1">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-4 h-4 rounded-full shrink-0 cursor-pointer ring-2 ring-offset-1 ring-[#E0E0E0]"
                              style={{ backgroundColor: editColor }}
                            />
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveEdit(stage.id)
                                if (e.key === "Escape") setEditingId(null)
                              }}
                              autoFocus
                              className="flex-1 border border-[#E0E0E0] rounded-[6px] px-2 py-1 text-[13px] focus:outline-none focus:border-[#141414]"
                            />
                            <button
                              onClick={() => handleSaveEdit(stage.id)}
                              disabled={saving}
                              className="px-2 py-1 bg-[#141414] text-white text-[11px] font-bold rounded-[6px] hover:bg-[#333] disabled:opacity-50"
                            >
                              {saving ? "..." : "OK"}
                            </button>
                          </div>
                          <div className="flex items-center gap-1.5 pl-6">
                            {STAGE_COLORS.map((c) => (
                              <button
                                key={c}
                                onClick={() => setEditColor(c)}
                                className={`w-5 h-5 rounded-full transition-all ${editColor === c ? "ring-2 ring-offset-1 ring-[#141414] scale-110" : "hover:scale-110"}`}
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div
                          className="w-4 h-4 rounded-full shrink-0"
                          style={{ backgroundColor: stage.color }}
                        />
                        <span
                          className="flex-1 text-[13px] font-medium text-[#141414] cursor-pointer hover:text-[#666] transition-colors"
                          onClick={() => {
                            setEditingId(stage.id)
                            setEditName(stage.name)
                            setEditColor(stage.color)
                          }}
                        >
                          {stage.name}
                        </span>
                        {stage.is_won && (
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                            Yutildi
                          </span>
                        )}
                        {stage.is_lost && (
                          <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                            Yutqazildi
                          </span>
                        )}
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleMove(index, "up")}
                            disabled={index === 0}
                            className="p-0.5 rounded hover:bg-[#EBEBEB] disabled:opacity-30"
                          >
                            <ArrowUpIcon className="w-3 h-3 text-[#999]" />
                          </button>
                          <button
                            onClick={() => handleMove(index, "down")}
                            disabled={index === stages.length - 1}
                            className="p-0.5 rounded hover:bg-[#EBEBEB] disabled:opacity-30"
                          >
                            <ArrowDownIcon className="w-3 h-3 text-[#999]" />
                          </button>
                          {confirmDeleteStageId === stage.id ? (
                            <div className="flex items-center gap-1 ml-1">
                              <button
                                onClick={() => handleDelete(stage.id)}
                                disabled={deletingId === stage.id}
                                className="px-1.5 py-0.5 text-[10px] font-bold text-white bg-red-500 rounded hover:bg-red-600 disabled:opacity-50"
                              >
                                {deletingId === stage.id ? "..." : "Ha"}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteStageId(null)}
                                className="text-[10px] text-[#999] hover:text-[#666]"
                              >
                                Yo'q
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteStageId(stage.id)}
                              className="p-0.5 rounded hover:bg-red-50"
                            >
                              <TrashIcon className="w-3 h-3 text-red-400" />
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}

                {stages.length === 0 && (
                  <div className="text-center text-[13px] text-[#999] py-8">
                    Bosqichlar yo'q. Yangi bosqich qo'shing.
                  </div>
                )}
              </div>

              {/* Add new stage */}
              <div className="px-5 py-3 border-t border-[#F0F0F0] shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-5 h-5 rounded-full shrink-0 cursor-pointer border border-[#E0E0E0]"
                    style={{ backgroundColor: newStageColor }}
                    onClick={() => {
                      const idx = STAGE_COLORS.indexOf(newStageColor)
                      setNewStageColor(STAGE_COLORS[(idx + 1) % STAGE_COLORS.length])
                    }}
                    title="Rang tanlash"
                  />
                  <input
                    type="text"
                    value={newStageName}
                    onChange={(e) => setNewStageName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddStage() }}
                    placeholder="Yangi bosqich nomi"
                    className="flex-1 border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] placeholder:text-[#CCC] focus:outline-none focus:border-[#141414]"
                  />
                  <button
                    onClick={handleAddStage}
                    disabled={adding || !newStageName.trim()}
                    className="flex items-center gap-1 px-3 py-2 bg-[#141414] text-white text-[12px] font-bold rounded-[8px] hover:bg-[#333] disabled:bg-[#CCC] disabled:cursor-not-allowed transition-colors"
                  >
                    <PlusIcon className="w-3.5 h-3.5" />
                    {adding ? "..." : "Qo'shish"}
                  </button>
                </div>

                {/* Color picker for new stage */}
                <div className="flex items-center gap-1.5 pl-7">
                  {STAGE_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewStageColor(c)}
                      className={`w-4 h-4 rounded-full transition-all ${newStageColor === c ? "ring-2 ring-offset-1 ring-[#141414] scale-110" : "hover:scale-110"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Delete pipeline */}
              <div className="px-5 py-4 border-t border-[#F0F0F0] shrink-0">
                {showDeletePipeline ? (
                  <div className="flex flex-col gap-2">
                    <span className="text-[12px] font-medium text-red-600">
                      Bu pipeline va undagi barcha lidlar o'chiriladi. Davom etasizmi?
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleDeletePipeline}
                        disabled={deletingPipeline}
                        className="px-4 py-1.5 bg-red-500 text-white text-[12px] font-bold rounded-[8px] hover:bg-red-600 disabled:opacity-50 transition-colors"
                      >
                        {deletingPipeline ? "O'chirilmoqda..." : "Ha, o'chirish"}
                      </button>
                      <button
                        onClick={() => setShowDeletePipeline(false)}
                        className="text-[12px] text-[#999] hover:text-[#666]"
                      >
                        Bekor
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowDeletePipeline(true)}
                    className="flex items-center gap-1.5 text-[12px] font-medium text-red-500 hover:text-red-600 transition-colors"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                    Pipeline o'chirish
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
