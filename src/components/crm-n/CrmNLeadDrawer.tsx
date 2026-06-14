import { useEffect, useState, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  X,
  Phone,
  Envelope,
  Buildings,
  Calendar,
  CheckCircle,
  Clock,
  Plus,
  PencilSimple,
} from "@phosphor-icons/react"
import type {
  CrmLeadWithContact,
  CrmStage,
  CrmNote,
  CrmTask,
} from "@/lib/supabase/queries/crm"
import {
  updateCrmLead,
  closeCrmLead,
  updateCrmContact,
  getCrmNotes,
  addCrmNote,
  getCrmTasks,
  addCrmTask,
  toggleCrmTask,
} from "@/lib/supabase/queries/crm"
import type { CachedUser } from "@/lib/supabase/queries/amocrm"
import { formatDate } from "@/lib/format"

// ─── Utility Components ─────────────────────────────────

function SectionHeader({ children }: { children: string }) {
  return (
    <h3 className="text-[11px] font-bold text-[#999999] uppercase tracking-wider">
      {children}
    </h3>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-[12px] text-[#999999] font-medium shrink-0" style={{ maxWidth: "45%" }}>
        {label}
      </span>
      <span className="text-[13px] text-[#141414] font-medium text-right overflow-hidden" style={{ maxWidth: "55%", wordBreak: "break-word" }}>
        {children}
      </span>
    </div>
  )
}

function ActionToast({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`px-3 py-2 rounded-[8px] text-[12px] font-medium ${
        type === "success"
          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
          : "bg-red-50 text-red-700 border border-red-200"
      }`}
    >
      {message}
    </motion.div>
  )
}

function InlineEdit({
  value,
  onSave,
  className,
  inputClassName,
  type = "text",
}: {
  value: string
  onSave: (val: string) => Promise<void>
  className?: string
  inputClassName?: string
  type?: "text" | "number"
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(value)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setEditValue(value)
  }, [value])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  async function handleSave() {
    if (editValue === value || !editValue.trim()) {
      setEditing(false)
      setEditValue(value)
      return
    }
    setSaving(true)
    try {
      await onSave(editValue)
    } catch {
      setEditValue(value)
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={type}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave()
          if (e.key === "Escape") { setEditValue(value); setEditing(false) }
        }}
        disabled={saving}
        className={`border border-[#141414] rounded-[4px] px-1.5 py-0.5 focus:outline-none ${saving ? "opacity-50" : ""} ${inputClassName ?? ""}`}
      />
    )
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={`cursor-pointer hover:bg-[#F0F0F0] rounded-[4px] px-1 -mx-1 transition-colors ${className ?? ""}`}
      title="Bosib tahrirlang"
    >
      {value}
    </span>
  )
}

// ─── Main Drawer ─────────────────────────────────────────

interface CrmNLeadDrawerProps {
  lead: CrmLeadWithContact | null
  isOpen: boolean
  onClose: () => void
  stages: CrmStage[]
  pipelineName: string
  users?: CachedUser[]
  onLeadUpdated?: () => void
}

export function CrmNLeadDrawer({
  lead,
  isOpen,
  onClose,
  stages,
  pipelineName,
  users,
  onLeadUpdated,
}: CrmNLeadDrawerProps) {
  // Notes & tasks
  const [notes, setNotes] = useState<CrmNote[]>([])
  const [tasks, setTasks] = useState<CrmTask[]>([])
  const [loading, setLoading] = useState(false)

  // Note form
  const [noteText, setNoteText] = useState("")
  const [noteSaving, setNoteSaving] = useState(false)

  // Task form
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskText, setTaskText] = useState("")
  const [taskDueDate, setTaskDueDate] = useState("")
  const [taskSaving, setTaskSaving] = useState(false)

  // Close lead
  const [closingSaving, setClosingSaving] = useState(false)
  const [showCloseConfirm, setShowCloseConfirm] = useState<"won" | "lost" | null>(null)

  // Contact editing
  const [editingContact, setEditingContact] = useState(false)
  const [contactEditName, setContactEditName] = useState("")
  const [contactEditPhone, setContactEditPhone] = useState("")
  const [contactSaving, setContactSaving] = useState(false)

  // Responsible
  const [responsibleSaving, setResponsibleSaving] = useState(false)

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Fetch notes & tasks
  useEffect(() => {
    if (!lead?.id || !isOpen) {
      setNotes([])
      setTasks([])
      setNoteText("")
      setTaskText("")
      setTaskDueDate("")
      setShowTaskForm(false)
      setShowCloseConfirm(null)
      setEditingContact(false)
      return
    }

    let cancelled = false
    async function fetchData() {
      setLoading(true)
      try {
        const [n, t] = await Promise.all([
          getCrmNotes(lead!.id),
          getCrmTasks(lead!.id),
        ])
        if (cancelled) return
        setNotes(n)
        setTasks(t)
      } catch (err) {
        if (!cancelled) console.error("[CRM-N] Notes/tasks fetch error:", err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
    // We intentionally depend on lead.id (not the whole lead object) to only refetch when the lead changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id, isOpen])

  // Escape key
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showCloseConfirm) setShowCloseConfirm(null)
        else onClose()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen, onClose, showCloseConfirm])

  const stage = lead ? stages.find((s) => s.id === lead.stage_id) : null
  const contact = lead?.crm_contacts

  // ─── Handlers ──────────────────────────────────────

  async function handleNameSave(newName: string) {
    if (!lead) return
    try {
      await updateCrmLead(lead.id, { name: newName })
      showToast("Nom o'zgartirildi", "success")
      onLeadUpdated?.()
    } catch {
      showToast("Xatolik yuz berdi", "error")
      throw new Error("failed")
    }
  }

  async function handlePriceSave(newPrice: string) {
    if (!lead) return
    const price = Number(newPrice)
    if (isNaN(price)) return
    try {
      await updateCrmLead(lead.id, { price })
      showToast("Summa o'zgartirildi", "success")
      onLeadUpdated?.()
    } catch {
      showToast("Xatolik yuz berdi", "error")
      throw new Error("failed")
    }
  }

  async function handleResponsibleChange(userId: number) {
    if (!lead) return
    setResponsibleSaving(true)
    try {
      await updateCrmLead(lead.id, { responsible_user_id: userId })
      showToast("Mas'ul o'zgartirildi", "success")
      onLeadUpdated?.()
    } catch {
      showToast("Xatolik yuz berdi", "error")
    } finally {
      setResponsibleSaving(false)
    }
  }

  async function handleCloseLead(type: "won" | "lost") {
    if (!lead) return
    setClosingSaving(true)
    try {
      await closeCrmLead(lead.id, type)
      setShowCloseConfirm(null)
      showToast(
        type === "won" ? "Lead yopildi — Yutildi!" : "Lead yopildi — Yutqazildi",
        "success"
      )
      onLeadUpdated?.()
      setTimeout(onClose, 500)
    } catch {
      showToast("Xatolik yuz berdi", "error")
    } finally {
      setClosingSaving(false)
    }
  }

  async function handleContactSave() {
    if (!contact) return
    setContactSaving(true)
    try {
      const fields: Record<string, string> = {}
      if (contactEditName.trim()) fields.name = contactEditName.trim()
      if (contactEditPhone.trim()) fields.phone = contactEditPhone.trim()
      await updateCrmContact(contact.id, fields)
      setEditingContact(false)
      showToast("Kontakt yangilandi", "success")
      onLeadUpdated?.()
    } catch {
      showToast("Xatolik yuz berdi", "error")
    } finally {
      setContactSaving(false)
    }
  }

  async function handleAddNote() {
    if (!lead || !noteText.trim()) return
    setNoteSaving(true)
    try {
      const note = await addCrmNote(lead.id, noteText.trim())
      setNotes((prev) => [note, ...prev])
      setNoteText("")
      showToast("Izoh qo'shildi", "success")
    } catch {
      showToast("Xatolik yuz berdi", "error")
    } finally {
      setNoteSaving(false)
    }
  }

  async function handleCreateTask() {
    if (!lead || !taskText.trim()) return
    setTaskSaving(true)
    try {
      const task = await addCrmTask(lead.id, taskText.trim(), taskDueDate || undefined)
      setTasks((prev) => [task, ...prev])
      setTaskText("")
      setTaskDueDate("")
      setShowTaskForm(false)
      showToast("Vazifa yaratildi", "success")
    } catch {
      showToast("Xatolik yuz berdi", "error")
    } finally {
      setTaskSaving(false)
    }
  }

  async function handleToggleTask(taskId: string, isDone: boolean) {
    try {
      await toggleCrmTask(taskId, isDone)
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, is_done: isDone } : t))
    } catch {
      showToast("Xatolik yuz berdi", "error")
    }
  }

  return (
    <AnimatePresence>
      {isOpen && lead && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/30 z-40"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: 420 }}
            animate={{ x: 0 }}
            exit={{ x: 420 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 bottom-0 w-[420px] bg-white border-l border-[#F0F0F0] z-50 flex flex-col shadow-xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between p-5 pb-4 border-b border-[#F0F0F0]">
              <div className="flex flex-col gap-2 flex-1 min-w-0">
                <InlineEdit
                  value={lead.name}
                  onSave={handleNameSave}
                  className="text-[18px] font-bold text-[#141414] leading-tight truncate"
                  inputClassName="text-[18px] font-bold text-[#141414] w-full"
                />
                {stage && (
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[11px] font-bold w-fit bg-[#f5f5f5] text-[#141414]"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: stage.color }}
                    />
                    {stage.name}
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-[6px] hover:bg-[#F5F5F5] transition-colors shrink-0 ml-3"
              >
                <X size={20} className="text-[#999999]" weight="bold" />
              </button>
            </div>

            {/* Toast */}
            <AnimatePresence>
              {toast && (
                <div className="px-5 pt-3">
                  <ActionToast message={toast.message} type={toast.type} />
                </div>
              )}
            </AnimatePresence>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-5 h-5 border-2 border-[#141414] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {/* Asosiy ma'lumotlar */}
                  <div className="flex flex-col gap-3">
                    <SectionHeader>Asosiy ma'lumotlar</SectionHeader>
                    <div className="flex flex-col gap-2.5 bg-[#FBFBFB] rounded-[8px] p-4">
                      <InfoRow label="Summa">
                        <InlineEdit
                          value={String(lead.price)}
                          onSave={handlePriceSave}
                          type="number"
                          className="font-bold"
                          inputClassName="font-bold text-[13px] w-24 text-right"
                        />
                        <span className="text-[#999999] font-medium text-[11px] ml-1">so'm</span>
                      </InfoRow>

                      <InfoRow label="Mas'ul">
                        {users && users.length > 0 ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={lead.responsible_user_id ?? ""}
                              onChange={(e) => {
                                if (e.target.value) handleResponsibleChange(Number(e.target.value))
                              }}
                              disabled={responsibleSaving}
                              className={`appearance-none bg-transparent text-[13px] font-medium text-[#141414] pr-5 cursor-pointer focus:outline-none ${
                                responsibleSaving ? "opacity-50" : ""
                              }`}
                            >
                              <option value="">Tanlanmagan</option>
                              {users.map((u) => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                              ))}
                            </select>
                            {responsibleSaving && (
                              <div className="w-3 h-3 border border-[#141414] border-t-transparent rounded-full animate-spin" />
                            )}
                          </div>
                        ) : (
                          <span>—</span>
                        )}
                      </InfoRow>

                      <InfoRow label="Pipeline">{pipelineName}</InfoRow>
                      <InfoRow label="Yaratilgan">{formatDate(lead.created_at)}</InfoRow>
                      <InfoRow label="Yangilangan">{formatDate(lead.updated_at)}</InfoRow>
                      <InfoRow label="Manba">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] text-[10px] font-bold bg-emerald-50 text-emerald-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          CRM-N
                        </span>
                      </InfoRow>
                    </div>
                  </div>

                  {/* Kontakt */}
                  <div className="flex flex-col gap-3">
                    <SectionHeader>Kontakt ma'lumotlari</SectionHeader>
                    <div className="flex flex-col gap-3 bg-[#FBFBFB] rounded-[8px] p-4">
                      {contact ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[13px] font-bold text-[#141414]">
                              {contact.name}
                            </span>
                            {!editingContact && (
                              <button
                                onClick={() => {
                                  setEditingContact(true)
                                  setContactEditName(contact.name)
                                  setContactEditPhone(contact.phone ?? "")
                                }}
                                className="p-1 rounded-[4px] hover:bg-[#EBEBEB] transition-colors"
                              >
                                <PencilSimple size={12} className="text-[#999]" weight="bold" />
                              </button>
                            )}
                          </div>

                          {editingContact ? (
                            <div className="flex flex-col gap-2 pt-1">
                              <input
                                type="text"
                                value={contactEditName}
                                onChange={(e) => setContactEditName(e.target.value)}
                                placeholder="Ism"
                                className="w-full border border-[#E0E0E0] rounded-[6px] px-2.5 py-1.5 text-[12px] focus:outline-none focus:border-[#141414]"
                              />
                              <input
                                type="tel"
                                value={contactEditPhone}
                                onChange={(e) => setContactEditPhone(e.target.value)}
                                placeholder="Telefon"
                                className="w-full border border-[#E0E0E0] rounded-[6px] px-2.5 py-1.5 text-[12px] focus:outline-none focus:border-[#141414]"
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={handleContactSave}
                                  disabled={contactSaving}
                                  className="px-3 py-1 bg-[#141414] text-white text-[11px] font-bold rounded-[6px] hover:bg-[#333] disabled:opacity-50"
                                >
                                  {contactSaving ? "..." : "Saqlash"}
                                </button>
                                <button
                                  onClick={() => setEditingContact(false)}
                                  className="text-[11px] text-[#999] hover:text-[#666]"
                                >
                                  Bekor
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {contact.phone && (
                                <div className="flex items-center gap-2">
                                  <Phone size={14} className="text-[#999999]" weight="bold" />
                                  <a href={`tel:${contact.phone}`} className="text-[12px] text-[#141414] hover:underline">
                                    {contact.phone}
                                  </a>
                                </div>
                              )}
                              {contact.email && (
                                <div className="flex items-center gap-2">
                                  <Envelope size={14} className="text-[#999999]" weight="bold" />
                                  <a href={`mailto:${contact.email}`} className="text-[12px] text-[#141414] hover:underline">
                                    {contact.email}
                                  </a>
                                </div>
                              )}
                              {contact.company && (
                                <div className="flex items-center gap-2">
                                  <Buildings size={14} className="text-[#999999]" weight="bold" />
                                  <span className="text-[12px] text-[#141414]">{contact.company}</span>
                                </div>
                              )}
                              {contact.notes && (
                                <div className="mt-1 px-3 py-2 bg-white rounded-[6px] border border-[#F0F0F0]">
                                  <div className="text-[10px] font-bold text-[#999] uppercase mb-1">Qo'shimcha</div>
                                  <p className="text-[12px] text-[#141414] whitespace-pre-line">{contact.notes}</p>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      ) : (
                        <span className="text-[12px] text-[#999]">Kontakt mavjud emas</span>
                      )}
                    </div>
                  </div>

                  {/* Izohlar */}
                  <div className="flex flex-col gap-3">
                    <SectionHeader>Izohlar</SectionHeader>
                    <div className="flex flex-col gap-2">
                      <textarea
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Izoh yozing..."
                        rows={2}
                        className="w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[12px] text-[#141414] placeholder:text-[#CCC] focus:outline-none focus:border-[#141414] resize-none"
                      />
                      <button
                        onClick={handleAddNote}
                        disabled={noteSaving || !noteText.trim()}
                        className="self-end px-3 py-1.5 bg-[#141414] text-white text-[11px] font-bold rounded-[6px] hover:bg-[#333] disabled:bg-[#CCC] disabled:cursor-not-allowed transition-colors"
                      >
                        {noteSaving ? "..." : "Qo'shish"}
                      </button>
                    </div>

                    {notes.length > 0 && (
                      <div className="flex flex-col gap-2 mt-1">
                        {notes.map((note) => (
                          <div key={note.id} className="bg-[#FBFBFB] rounded-[8px] p-3 flex flex-col gap-1">
                            <p className="text-[12px] text-[#141414] whitespace-pre-wrap">{note.text}</p>
                            <span className="text-[10px] text-[#999]">{formatDate(note.created_at)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Vazifalar */}
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <SectionHeader>Vazifalar</SectionHeader>
                      <button
                        onClick={() => setShowTaskForm(true)}
                        className="flex items-center gap-1 text-[11px] font-medium text-[#999] hover:text-[#666] transition-colors"
                      >
                        <Plus size={12} weight="bold" />
                        Qo'shish
                      </button>
                    </div>

                    {showTaskForm && (
                      <div className="flex flex-col gap-2 bg-[#FBFBFB] rounded-[8px] p-3">
                        <input
                          type="text"
                          value={taskText}
                          onChange={(e) => setTaskText(e.target.value)}
                          placeholder="Vazifa matni"
                          className="w-full border border-[#E0E0E0] rounded-[6px] px-2.5 py-1.5 text-[12px] focus:outline-none focus:border-[#141414]"
                        />
                        <input
                          type="datetime-local"
                          value={taskDueDate}
                          onChange={(e) => setTaskDueDate(e.target.value)}
                          className="w-full border border-[#E0E0E0] rounded-[6px] px-2.5 py-1.5 text-[12px] focus:outline-none focus:border-[#141414]"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleCreateTask}
                            disabled={taskSaving || !taskText.trim()}
                            className="px-3 py-1 bg-[#141414] text-white text-[11px] font-bold rounded-[6px] hover:bg-[#333] disabled:bg-[#CCC] disabled:cursor-not-allowed"
                          >
                            {taskSaving ? "..." : "Saqlash"}
                          </button>
                          <button
                            onClick={() => { setShowTaskForm(false); setTaskText(""); setTaskDueDate("") }}
                            className="text-[11px] text-[#999] hover:text-[#666]"
                          >
                            Bekor
                          </button>
                        </div>
                      </div>
                    )}

                    {tasks.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {tasks.map((task) => (
                          <div
                            key={task.id}
                            className="flex items-start gap-2 bg-[#FBFBFB] rounded-[8px] p-3"
                          >
                            <button
                              onClick={() => handleToggleTask(task.id, !task.is_done)}
                              className="mt-0.5 shrink-0"
                            >
                              <CheckCircle
                                size={16}
                                className={task.is_done ? "text-emerald-500" : "text-[#D0D0D0]"}
                                weight="bold"
                              />
                            </button>
                            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                              <span className={`text-[12px] ${task.is_done ? "line-through text-[#999]" : "text-[#141414]"}`}>
                                {task.text}
                              </span>
                              {task.due_date && (
                                <div className="flex items-center gap-1">
                                  <Clock size={12} className="text-[#999]" weight="bold" />
                                  <span className="text-[10px] text-[#999]">{formatDate(task.due_date)}</span>
                                </div>
                              )}
                              <span className="text-[10px] text-[#CCC]">{formatDate(task.created_at)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Leadni yopish */}
                  {!lead.is_won && !lead.is_lost && (
                    <div className="flex flex-col gap-3">
                      <SectionHeader>Leadni yopish</SectionHeader>
                      {showCloseConfirm ? (
                        <div className="flex flex-col gap-2 bg-[#FBFBFB] rounded-[8px] p-4">
                          <span className="text-[13px] font-medium text-[#141414]">
                            {showCloseConfirm === "won"
                              ? "Leadni yutilgan deb yopishni tasdiqlaysizmi?"
                              : "Leadni yutqazilgan deb yopishni tasdiqlaysizmi?"}
                          </span>
                          <div className="flex items-center gap-2 mt-1">
                            <button
                              onClick={() => handleCloseLead(showCloseConfirm)}
                              disabled={closingSaving}
                              className={`px-4 py-1.5 rounded-[6px] text-[12px] font-bold text-white transition-colors disabled:opacity-50 ${
                                showCloseConfirm === "won" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-red-500 hover:bg-red-600"
                              }`}
                            >
                              {closingSaving ? "..." : "Tasdiqlash"}
                            </button>
                            <button
                              onClick={() => setShowCloseConfirm(null)}
                              className="text-[12px] text-[#999] hover:text-[#666]"
                            >
                              Bekor
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setShowCloseConfirm("won")}
                            className="flex-1 py-2 rounded-[8px] text-[12px] font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                          >
                            Yutildi
                          </button>
                          <button
                            onClick={() => setShowCloseConfirm("lost")}
                            className="flex-1 py-2 rounded-[8px] text-[12px] font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors"
                          >
                            Yutqazildi
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* AmoCRM link placeholder */}
                  {lead.is_won && (
                    <div className="flex items-center gap-2 bg-emerald-50 rounded-[8px] p-3">
                      <Calendar size={16} className="text-emerald-500" weight="bold" />
                      <span className="text-[12px] font-medium text-emerald-700">Bu lead yutilgan</span>
                    </div>
                  )}
                  {lead.is_lost && (
                    <div className="flex items-center gap-2 bg-red-50 rounded-[8px] p-3">
                      <Calendar size={16} className="text-red-500" weight="bold" />
                      <span className="text-[12px] font-medium text-red-700">
                        Bu lead yutqazilgan{lead.loss_reason ? `: ${lead.loss_reason}` : ""}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
