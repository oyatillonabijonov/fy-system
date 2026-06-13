import { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "@phosphor-icons/react"
import type { AmoPipelineInfo } from "@/lib/amocrm/pipelines"
import type { CachedUser } from "@/lib/supabase/queries/amocrm"
import { createLead } from "@/lib/amocrm/mutations"

interface CreateLeadModalProps {
  isOpen: boolean
  onClose: () => void
  pipelines: AmoPipelineInfo[]
  selectedPipelineId: number | null
  users: CachedUser[]
  onLeadCreated: () => void
}

export function CreateLeadModal({
  isOpen,
  onClose,
  pipelines,
  selectedPipelineId,
  users,
  onLeadCreated,
}: CreateLeadModalProps) {
  const [contactName, setContactName] = useState("")
  const [contactPhone, setContactPhone] = useState("")
  const [leadName, setLeadName] = useState("")
  const [pipelineId, setPipelineId] = useState<number>(selectedPipelineId ?? pipelines[0]?.id ?? 0)
  const [statusId, setStatusId] = useState<number>(0)
  const [price, setPrice] = useState("")
  const [responsibleUserId, setResponsibleUserId] = useState<number>(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedPipeline = useMemo(
    () => pipelines.find((p) => p.id === pipelineId),
    [pipelines, pipelineId],
  )
  const statuses = useMemo(() => selectedPipeline?.statuses ?? [], [selectedPipeline])

  // Sync pipelineId when parent's selected pipeline changes (e.g. modal reopened on a new pipeline)
  useEffect(() => {
    if (selectedPipelineId && selectedPipelineId !== pipelineId) {
      setPipelineId(selectedPipelineId)
    }
  }, [selectedPipelineId, pipelineId])

  // Auto-set first status when statuses load or pipeline changes
  useEffect(() => {
    if (statuses.length > 0 && !statuses.some((s) => s.id === statusId)) {
      setStatusId(statuses[0].id)
    }
  }, [statuses, statusId])

  function handlePipelineChange(id: number) {
    setPipelineId(id)
    const pipeline = pipelines.find((p) => p.id === id)
    const firstStatus = pipeline?.statuses?.[0]
    if (firstStatus) setStatusId(firstStatus.id)
    else setStatusId(0)
  }

  async function handleSubmit() {
    if (!contactName.trim()) return
    setSaving(true)
    setError(null)

    try {
      await createLead({
        name: leadName.trim() || `${contactName.trim()} — Yangi lid`,
        pipelineId,
        statusId,
        price: price ? Number(price) : 0,
        responsibleUserId: responsibleUserId || undefined,
        contactName: contactName.trim(),
        contactPhone: contactPhone.trim() || undefined,
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
    setResponsibleUserId(0)
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
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50"
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
              className="bg-white rounded-[12px] w-full max-w-lg shadow-2xl pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 pb-4 border-b border-[#F0F0F0]">
                <h2 className="text-[16px] font-bold text-[#141414]">
                  Yangi lid yaratish
                </h2>
                <button
                  onClick={handleClose}
                  className="p-1.5 rounded-[6px] hover:bg-[#F5F5F5] transition-colors"
                >
                  <X size={20} className="text-[#999999]" weight="bold" />
                </button>
              </div>

              {/* Form */}
              <div className="p-5 flex flex-col gap-4">
                {error && (
                  <div className="px-3 py-2 rounded-[8px] text-[12px] font-medium bg-red-50 text-red-700 border border-red-200">
                    {error}
                  </div>
                )}

                {/* Ism */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-[#999999]">
                    Ism *
                  </label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Kontakt ismi"
                    autoFocus
                    className="w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] placeholder:text-[#CCCCCC] focus:outline-none focus:border-[#141414] transition-colors"
                  />
                </div>

                {/* Telefon */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-[#999999]">
                    Telefon
                  </label>
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+998 90 123 45 67"
                    className="w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] placeholder:text-[#CCCCCC] focus:outline-none focus:border-[#141414] transition-colors"
                  />
                </div>

                {/* Lead nomi */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-[#999999]">
                    Lead nomi
                  </label>
                  <input
                    type="text"
                    value={leadName}
                    onChange={(e) => setLeadName(e.target.value)}
                    placeholder={contactName ? `${contactName} — Yangi lid` : "Avtomatik to'ldiriladi"}
                    className="w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] placeholder:text-[#CCCCCC] focus:outline-none focus:border-[#141414] transition-colors"
                  />
                </div>

                {/* Pipeline + Bosqich */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[12px] font-medium text-[#999999]">
                      Pipeline
                    </label>
                    <select
                      value={pipelineId}
                      onChange={(e) => handlePipelineChange(Number(e.target.value))}
                      className="w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] focus:outline-none focus:border-[#141414] transition-colors"
                    >
                      {pipelines.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[12px] font-medium text-[#999999]">
                      Bosqich
                    </label>
                    <select
                      value={statusId}
                      onChange={(e) => setStatusId(Number(e.target.value))}
                      className="w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] focus:outline-none focus:border-[#141414] transition-colors"
                    >
                      {statuses.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Summa + Mas'ul */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[12px] font-medium text-[#999999]">
                      Summa
                    </label>
                    <input
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="0"
                      className="w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] placeholder:text-[#CCCCCC] focus:outline-none focus:border-[#141414] transition-colors"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[12px] font-medium text-[#999999]">
                      Mas'ul
                    </label>
                    <select
                      value={responsibleUserId}
                      onChange={(e) => setResponsibleUserId(Number(e.target.value))}
                      className="w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] focus:outline-none focus:border-[#141414] transition-colors"
                    >
                      <option value={0}>Tanlanmagan</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
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
                  disabled={saving || !contactName.trim()}
                  className={`px-5 py-2 rounded-[8px] text-[13px] font-bold text-white transition-colors ${
                    saving || !contactName.trim()
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
