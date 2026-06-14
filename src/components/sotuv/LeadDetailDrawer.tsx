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
  Link as LinkIcon,
  Plus,
  CaretDown,
  PencilSimple,
} from "@phosphor-icons/react"
import type { Lead, StageConfig } from "@/lib/mock-data/sotuv"
import { getStageConfig } from "@/lib/mock-data/sotuv"
import {
  getAmoLeadDetail,
  type AmoLeadDetail,
  type CustomFieldRendered,
} from "@/lib/amocrm/leads"
import {
  updateLeadResponsible,
  updateLeadName,
  updateLeadPrice,
  updateContact,
  closeLead,
  addLeadNote,
  createLeadTask,
} from "@/lib/amocrm/mutations"
import type { CachedUser } from "@/lib/supabase/queries/amocrm"
import { formatDate } from "@/lib/format"

const formatFieldName = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim()
}

interface LeadDetailDrawerProps {
  lead: Lead | null
  isOpen: boolean
  onClose: () => void
  stageConfigs: Record<string, StageConfig>
  pipelineName: string
  pipelineId?: number
  users?: CachedUser[]
  onLeadUpdated?: () => void
}

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
      <span
        className="text-[12px] text-[#999999] font-medium shrink-0"
        style={{ maxWidth: "45%", wordBreak: "break-word" }}
      >
        {label}
      </span>
      <span
        className="text-[13px] text-[#141414] font-medium text-right overflow-hidden"
        style={{ maxWidth: "55%", wordBreak: "break-word" }}
      >
        {children}
      </span>
    </div>
  )
}

const PHONE_LABELS: Record<string, string> = {
  WORK: "Ish",
  WORKDD: "Ish (to'g'ri)",
  MOB: "Mobil",
  FAX: "Faks",
  HOME: "Uy",
  OTHER: "Boshqa",
}

function getPhoneLabel(enumCode: string): string {
  return PHONE_LABELS[enumCode] ?? enumCode ?? ""
}

function CustomFieldsList({ fields }: { fields: CustomFieldRendered[] }) {
  if (fields.length === 0) return null

  return (
    <>
      {fields.map((field, i) => (
        <InfoRow key={i} label={formatFieldName(field.name)}>
          {field.type === "url" ? (
            <a
              href={field.value}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#141414] hover:underline"
            >
              <LinkIcon size={12} className="shrink-0" weight="bold" />
              <span className="truncate">
                {field.value.length > 30 ? field.value.slice(0, 30) + "..." : field.value}
              </span>
            </a>
          ) : (
            <span className="line-clamp-2">{field.value}</span>
          )}
        </InfoRow>
      ))}
    </>
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
          ? "bg-[#F5F5F5] text-[#141414] border border-[#E0E0E0]"
          : "bg-red-50 text-red-700 border border-red-200"
      }`}
    >
      {message}
    </motion.div>
  )
}

// Inline editable text component
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
          if (e.key === "Escape") {
            setEditValue(value)
            setEditing(false)
          }
        }}
        disabled={saving}
        className={`border border-[#E0E0E0] rounded-[4px] px-1.5 py-0.5 focus:outline-none focus:border-[#141414] ${saving ? "opacity-50" : ""} ${inputClassName ?? ""}`}
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

export function LeadDetailDrawer({
  lead,
  isOpen,
  onClose,
  stageConfigs,
  pipelineName,
  pipelineId,
  users,
  onLeadUpdated,
}: LeadDetailDrawerProps) {
  const [detail, setDetail] = useState<AmoLeadDetail | null>(null)
  const [loading, setLoading] = useState(false)

  // Responsible change
  const [responsibleSaving, setResponsibleSaving] = useState(false)

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
  const [editingContactId, setEditingContactId] = useState<number | null>(null)
  const [contactEditName, setContactEditName] = useState("")
  const [contactEditPhone, setContactEditPhone] = useState("")
  const [contactSaving, setContactSaving] = useState(false)

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    if (!lead?.amoId || !isOpen) {
      setDetail(null)
      setNoteText("")
      setTaskText("")
      setTaskDueDate("")
      setShowTaskForm(false)
      setShowCloseConfirm(null)
      setEditingContactId(null)
      return
    }

    let cancelled = false
    async function fetchDetail() {
      setLoading(true)
      try {
        const data = await getAmoLeadDetail(lead!.amoId!)
        if (cancelled) return
        setDetail(data)
      } catch (err) {
        if (!cancelled) console.error("[AmoCRM] Lead detail fetch error:", err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchDetail()
    return () => { cancelled = true }
    // We intentionally depend on lead.amoId (not the whole lead object) to only refetch when the AmoCRM ID changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.amoId, isOpen])

  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showCloseConfirm) {
          setShowCloseConfirm(null)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen, onClose, showCloseConfirm])

  const stageConfig = lead ? getStageConfig(stageConfigs, lead.stage) : null

  const sourceLabel =
    lead?.source === "amocrm"
      ? "AmoCRM"
      : lead?.source === "telegram"
        ? "Telegram bot"
        : "Qo'lda"

  async function handleResponsibleChange(userId: number) {
    if (!lead?.amoId) return
    setResponsibleSaving(true)
    try {
      await updateLeadResponsible(Number(lead.amoId), userId)
      showToast("Mas'ul o'zgartirildi", "success")
      onLeadUpdated?.()
    } catch {
      showToast("Xatolik yuz berdi, qayta urinib ko'ring", "error")
    } finally {
      setResponsibleSaving(false)
    }
  }

  async function handleNameSave(newName: string) {
    if (!lead?.amoId) return
    try {
      await updateLeadName(Number(lead.amoId), newName)
      showToast("Nom o'zgartirildi", "success")
      onLeadUpdated?.()
    } catch {
      showToast("Xatolik yuz berdi, qayta urinib ko'ring", "error")
      throw new Error("failed")
    }
  }

  async function handlePriceSave(newPrice: string) {
    if (!lead?.amoId) return
    const price = Number(newPrice)
    if (isNaN(price)) return
    try {
      await updateLeadPrice(Number(lead.amoId), price)
      showToast("Summa o'zgartirildi", "success")
      onLeadUpdated?.()
    } catch {
      showToast("Xatolik yuz berdi, qayta urinib ko'ring", "error")
      throw new Error("failed")
    }
  }

  async function handleCloseLead(type: "won" | "lost") {
    if (!lead?.amoId || !pipelineId) return
    setClosingSaving(true)
    try {
      await closeLead(Number(lead.amoId), type, pipelineId)
      setShowCloseConfirm(null)
      showToast(
        type === "won" ? "Lead yopildi — Yutildi!" : "Lead yopildi — Yutqazildi",
        "success"
      )
      onLeadUpdated?.()
      setTimeout(onClose, 500)
    } catch {
      showToast("Xatolik yuz berdi, qayta urinib ko'ring", "error")
    } finally {
      setClosingSaving(false)
    }
  }

  async function handleContactSave(contactId: number) {
    setContactSaving(true)
    try {
      const fields: { name?: string; phone?: string } = {}
      if (contactEditName.trim()) fields.name = contactEditName.trim()
      if (contactEditPhone.trim()) fields.phone = contactEditPhone.trim()
      await updateContact(contactId, fields)
      setEditingContactId(null)
      showToast("Kontakt yangilandi", "success")
      // Refetch detail
      if (lead?.amoId) {
        const data = await getAmoLeadDetail(lead.amoId)
        setDetail(data)
      }
    } catch {
      showToast("Xatolik yuz berdi, qayta urinib ko'ring", "error")
    } finally {
      setContactSaving(false)
    }
  }

  async function handleAddNote() {
    if (!lead?.amoId || !noteText.trim()) return
    setNoteSaving(true)
    try {
      await addLeadNote(Number(lead.amoId), noteText.trim())
      setNoteText("")
      showToast("Izoh qo'shildi", "success")
      const data = await getAmoLeadDetail(lead.amoId)
      setDetail(data)
    } catch {
      showToast("Xatolik yuz berdi, qayta urinib ko'ring", "error")
    } finally {
      setNoteSaving(false)
    }
  }

  async function handleCreateTask() {
    if (!lead?.amoId || !taskText.trim()) return
    setTaskSaving(true)
    try {
      const dueTimestamp = taskDueDate
        ? Math.floor(new Date(taskDueDate).getTime() / 1000)
        : Math.floor(Date.now() / 1000) + 86400
      await createLeadTask(Number(lead.amoId), taskText.trim(), dueTimestamp)
      setTaskText("")
      setTaskDueDate("")
      setShowTaskForm(false)
      showToast("Vazifa yaratildi", "success")
      const data = await getAmoLeadDetail(lead.amoId)
      setDetail(data)
    } catch {
      showToast("Xatolik yuz berdi, qayta urinib ko'ring", "error")
    } finally {
      setTaskSaving(false)
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
            {/* SECTION 1 — Header (editable name) */}
            <div className="flex items-start justify-between p-5 pb-4 border-b border-[#F0F0F0]">
              <div className="flex flex-col gap-2 flex-1 min-w-0">
                <InlineEdit
                  value={lead.name}
                  onSave={handleNameSave}
                  className="text-[18px] font-bold text-[#141414] leading-tight truncate"
                  inputClassName="text-[18px] font-bold text-[#141414] w-full"
                />
                {stageConfig && (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[11px] font-bold w-fit ${stageConfig.bg} ${stageConfig.color}`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${stageConfig.dot}`}
                    />
                    {stageConfig.label}
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
                  {/* SECTION 2 — Asosiy ma'lumotlar */}
                  <div className="flex flex-col gap-3">
                    <SectionHeader>Asosiy ma'lumotlar</SectionHeader>
                    <div className="flex flex-col gap-2.5 bg-[#FBFBFB] rounded-[8px] p-4">
                      <InfoRow label="Summa">
                        <InlineEdit
                          value={String(lead.amount)}
                          onSave={handlePriceSave}
                          type="number"
                          className="font-bold"
                          inputClassName="font-bold text-[13px] w-24 text-right"
                        />
                        <span className="text-[#999999] font-medium text-[11px] ml-1">
                          so'm
                        </span>
                      </InfoRow>
                      <InfoRow label="Mas'ul">
                        {users && users.length > 0 ? (
                          <div className="flex items-center gap-2">
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                              style={{ backgroundColor: lead.responsible.color }}
                            >
                              {lead.responsible.initials}
                            </div>
                            <div className="relative">
                              <select
                                value=""
                                onChange={(e) => {
                                  if (e.target.value) handleResponsibleChange(Number(e.target.value))
                                }}
                                disabled={responsibleSaving}
                                className={`appearance-none bg-transparent text-[13px] font-medium text-[#141414] pr-5 cursor-pointer focus:outline-none ${
                                  responsibleSaving ? "opacity-50 cursor-not-allowed" : ""
                                }`}
                              >
                                <option value="">{lead.responsible.name}</option>
                                {users
                                  .filter((u) => u.name !== lead.responsible.name)
                                  .map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.name}
                                    </option>
                                  ))}
                              </select>
                              <CaretDown size={12} className="absolute right-0 top-1/2 -translate-y-1/2 text-[#999] pointer-events-none" weight="bold" />
                            </div>
                            {responsibleSaving && (
                              <div className="w-3 h-3 border border-[#141414] border-t-transparent rounded-full animate-spin" />
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                              style={{ backgroundColor: lead.responsible.color }}
                            >
                              {lead.responsible.initials}
                            </div>
                            {lead.responsible.name}
                          </div>
                        )}
                      </InfoRow>
                      <InfoRow label="Pipeline">{pipelineName}</InfoRow>
                      <InfoRow label="Yaratilgan">{formatDate(lead.createdAt)}</InfoRow>
                      {detail?.updatedAt && (
                        <InfoRow label="Yangilangan">
                          {formatDate(detail.updatedAt)}
                        </InfoRow>
                      )}
                      <InfoRow label="Manba">
                        {lead.source === "amocrm" ? (
                          <span className="inline-flex px-1.5 py-0.5 rounded-[4px] text-[10px] font-bold bg-[#F0F0F0] text-[#141414]">
                            AmoCRM
                          </span>
                        ) : (
                          sourceLabel
                        )}
                      </InfoRow>
                    </div>
                  </div>

                  {/* SECTION 3 — Lead custom fields */}
                  {detail && detail.customFields.length > 0 && (
                    <div className="flex flex-col gap-3">
                      <SectionHeader>Qo'shimcha maydonlar</SectionHeader>
                      <div className="flex flex-col gap-2.5 bg-[#FBFBFB] rounded-[8px] p-4">
                        <CustomFieldsList fields={detail.customFields} />
                      </div>
                    </div>
                  )}

                  {/* SECTION 4 — Kontakt ma'lumotlari */}
                  <div className="flex flex-col gap-3">
                    <SectionHeader>Kontakt ma'lumotlari</SectionHeader>
                    <div className="flex flex-col gap-3 bg-[#FBFBFB] rounded-[8px] p-4">
                      {/* Quick contact (before detail loads) */}
                      {(lead.phone || lead.email) && !detail && (
                        <div className="flex flex-col gap-1.5">
                          {lead.contactName && (
                            <span className="text-[13px] font-bold text-[#141414]">
                              {lead.contactName}
                            </span>
                          )}
                          {lead.phone && (
                            <div className="flex items-center gap-2">
                              <Phone size={14} className="text-[#999999]" weight="bold" />
                              <a
                                href={`tel:${lead.phone}`}
                                className="text-[12px] text-[#141414] hover:underline"
                              >
                                {lead.phone}
                              </a>
                            </div>
                          )}
                          {lead.email && (
                            <div className="flex items-center gap-2">
                              <Envelope size={14} className="text-[#999999]" weight="bold" />
                              <a
                                href={`mailto:${lead.email}`}
                                className="text-[12px] text-[#141414] hover:underline"
                              >
                                {lead.email}
                              </a>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Full contacts from detail */}
                      {detail?.contacts.map((contact, i) => {
                        const isEditing = editingContactId === contact.id
                        return (
                          <div
                            key={contact.id}
                            className={`flex flex-col gap-2 ${i > 0 ? "pt-2.5 border-t border-[#EBEBEB]" : ""}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[13px] font-bold text-[#141414]">
                                {contact.name}
                              </span>
                              {!isEditing && (
                                <button
                                  onClick={() => {
                                    setEditingContactId(contact.id)
                                    setContactEditName(contact.name)
                                    setContactEditPhone(contact.phones[0]?.value ?? "")
                                  }}
                                  className="p-1 rounded-[4px] hover:bg-[#EBEBEB] transition-colors"
                                  title="Tahrirlash"
                                >
                                  <PencilSimple size={12} className="text-[#999999]" weight="bold" />
                                </button>
                              )}
                            </div>

                            {isEditing ? (
                              <div className="flex flex-col gap-2 border border-[#F0F0F0] rounded-[8px] p-2.5">
                                <input
                                  type="text"
                                  value={contactEditName}
                                  onChange={(e) => setContactEditName(e.target.value)}
                                  placeholder="Ism"
                                  className="w-full border border-[#F0F0F0] rounded-[6px] px-2.5 py-1.5 text-[12px] text-[#141414] focus:outline-none focus:border-[#141414] transition-colors"
                                />
                                <input
                                  type="tel"
                                  value={contactEditPhone}
                                  onChange={(e) => setContactEditPhone(e.target.value)}
                                  placeholder="Telefon"
                                  className="w-full border border-[#F0F0F0] rounded-[6px] px-2.5 py-1.5 text-[12px] text-[#141414] focus:outline-none focus:border-[#141414] transition-colors"
                                />
                                <div className="flex items-center gap-2 justify-end">
                                  <button
                                    onClick={() => setEditingContactId(null)}
                                    className="px-2.5 py-1 rounded-[6px] text-[11px] font-medium text-[#999] hover:text-[#666]"
                                  >
                                    Bekor
                                  </button>
                                  <button
                                    onClick={() => handleContactSave(contact.id)}
                                    disabled={contactSaving}
                                    className={`px-3 py-1 rounded-[6px] text-[11px] font-bold text-white ${
                                      contactSaving ? "bg-[#CCCCCC] cursor-not-allowed" : "bg-[#141414] hover:bg-[#333]"
                                    }`}
                                  >
                                    {contactSaving ? "..." : "Saqlash"}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                {contact.phones.map((phone, pi) => (
                                  <div key={`p-${pi}`} className="flex items-center gap-2">
                                    <Phone size={14} className="text-[#999999] shrink-0" weight="bold" />
                                    <a
                                      href={`tel:${phone.value}`}
                                      className="text-[12px] text-[#141414] hover:underline"
                                    >
                                      {phone.value}
                                    </a>
                                    {phone.enumCode && (
                                      <span className="text-[10px] text-[#999999] font-medium">
                                        {getPhoneLabel(phone.enumCode)}
                                      </span>
                                    )}
                                  </div>
                                ))}

                                {contact.emails.map((email, ei) => (
                                  <div key={`e-${ei}`} className="flex items-center gap-2">
                                    <Envelope size={14} className="text-[#999999] shrink-0" weight="bold" />
                                    <a
                                      href={`mailto:${email.value}`}
                                      className="text-[12px] text-[#141414] hover:underline"
                                    >
                                      {email.value}
                                    </a>
                                  </div>
                                ))}

                                {contact.customFields.length > 0 && (
                                  <div className="flex flex-col gap-1.5 mt-1">
                                    <CustomFieldsList fields={contact.customFields} />
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )
                      })}

                      {/* Empty state */}
                      {!lead.phone &&
                        !lead.email &&
                        (!detail || detail.contacts.length === 0) && (
                          <span className="text-[12px] text-[#999999]">
                            Kontakt ma'lumotlari topilmadi
                          </span>
                        )}
                    </div>
                  </div>

                  {/* SECTION 5 — Kompaniya */}
                  {detail?.company && (
                    <div className="flex flex-col gap-3">
                      <SectionHeader>Kompaniya</SectionHeader>
                      <div className="flex flex-col gap-2.5 bg-[#FBFBFB] rounded-[8px] p-4">
                        <div className="flex items-center gap-2.5">
                          <Buildings size={16} className="text-[#999999] shrink-0" weight="bold" />
                          <span className="text-[13px] font-bold text-[#141414]">
                            {detail.company.name}
                          </span>
                        </div>
                        {detail.company.phone && (
                          <div className="flex items-center gap-2">
                            <Phone size={14} className="text-[#999999] shrink-0" weight="bold" />
                            <a
                              href={`tel:${detail.company.phone}`}
                              className="text-[12px] text-[#141414] hover:underline"
                            >
                              {detail.company.phone}
                            </a>
                          </div>
                        )}
                        {detail.company.customFields.length > 0 && (
                          <CustomFieldsList fields={detail.company.customFields} />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Company name fallback (before detail loads) */}
                  {!detail && lead.company && (
                    <div className="flex flex-col gap-3">
                      <SectionHeader>Kompaniya</SectionHeader>
                      <div className="flex flex-col gap-2.5 bg-[#FBFBFB] rounded-[8px] p-4">
                        <div className="flex items-center gap-2.5">
                          <Buildings size={16} className="text-[#999999] shrink-0" weight="bold" />
                          <span className="text-[13px] font-bold text-[#141414]">
                            {lead.company}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SECTION 6 — Eslatmalar + Izoh qo'shish */}
                  <div className="flex flex-col gap-3">
                    <SectionHeader>Eslatmalar</SectionHeader>
                    {detail && detail.notes.length > 0 && (
                      <div className="flex flex-col gap-2">
                        {detail.notes.map((note, i) => (
                          <div
                            key={i}
                            className="bg-[#FBFBFB] rounded-[8px] p-3 flex flex-col gap-1.5"
                          >
                            <p className="text-[12px] text-[#141414] leading-relaxed whitespace-pre-wrap">
                              {note.text}
                            </p>
                            <div className="flex items-center gap-2 text-[10px] text-[#999999]">
                              <span className="font-medium">
                                {note.author}
                              </span>
                              <span>·</span>
                              <span>{formatDate(note.createdAt)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add note form */}
                    <div className="flex flex-col gap-2">
                      <textarea
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Izoh yozing..."
                        rows={2}
                        className="w-full border border-[#F0F0F0] rounded-[8px] px-3 py-2 text-[12px] text-[#141414] placeholder:text-[#CCCCCC] focus:outline-none focus:border-[#141414] transition-colors resize-none"
                      />
                      <button
                        onClick={handleAddNote}
                        disabled={noteSaving || !noteText.trim()}
                        className={`self-end px-4 py-1.5 rounded-[8px] text-[12px] font-bold text-white transition-colors ${
                          noteSaving || !noteText.trim()
                            ? "bg-[#CCCCCC] cursor-not-allowed"
                            : "bg-[#141414] hover:bg-[#333333]"
                        }`}
                      >
                        {noteSaving ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                            Saqlanmoqda...
                          </div>
                        ) : (
                          "Qo'shish"
                        )}
                      </button>
                    </div>
                  </div>

                  {/* SECTION 7 — Vazifalar + Vazifa yaratish */}
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <SectionHeader>Vazifalar</SectionHeader>
                      {!showTaskForm && (
                        <button
                          onClick={() => setShowTaskForm(true)}
                          className="flex items-center gap-1 text-[11px] font-bold text-[#141414] hover:text-[#666] transition-colors"
                        >
                          <Plus size={12} weight="bold" />
                          Qo'shish
                        </button>
                      )}
                    </div>

                    {detail && detail.tasks.length > 0 && (
                      <div className="flex flex-col gap-2">
                        {detail.tasks.map((task, i) => (
                          <div
                            key={i}
                            className="bg-[#FBFBFB] rounded-[8px] p-3 flex items-start gap-2.5"
                          >
                            {task.isCompleted ? (
                              <CheckCircle size={16} className="text-[#141414] shrink-0 mt-0.5" weight="bold" />
                            ) : (
                              <Clock size={16} className="text-orange-500 shrink-0 mt-0.5" weight="bold" />
                            )}
                            <div className="flex flex-col gap-0.5">
                              <span
                                className={`text-[12px] font-medium ${task.isCompleted ? "text-[#999999] line-through" : "text-[#141414]"}`}
                              >
                                {task.text}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <Calendar size={12} className="text-[#999999]" weight="bold" />
                                <span className="text-[10px] text-[#999999]">
                                  {formatDate(task.dueDate)}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add task form */}
                    <AnimatePresence>
                      {showTaskForm && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden"
                        >
                          <div className="flex flex-col gap-2 border border-[#F0F0F0] rounded-[8px] p-3">
                            <input
                              type="text"
                              value={taskText}
                              onChange={(e) => setTaskText(e.target.value)}
                              placeholder="Vazifa matni..."
                              className="w-full border border-[#F0F0F0] rounded-[8px] px-3 py-2 text-[12px] text-[#141414] placeholder:text-[#CCCCCC] focus:outline-none focus:border-[#141414] transition-colors"
                            />
                            <div className="flex items-center gap-2">
                              <Calendar size={14} className="text-[#999999] shrink-0" weight="bold" />
                              <input
                                type="date"
                                value={taskDueDate}
                                onChange={(e) => setTaskDueDate(e.target.value)}
                                className="flex-1 border border-[#F0F0F0] rounded-[8px] px-3 py-1.5 text-[12px] text-[#141414] focus:outline-none focus:border-[#141414] transition-colors"
                              />
                            </div>
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                onClick={() => {
                                  setShowTaskForm(false)
                                  setTaskText("")
                                  setTaskDueDate("")
                                }}
                                className="px-3 py-1.5 rounded-[8px] text-[12px] font-medium text-[#999] hover:text-[#666] transition-colors"
                              >
                                Bekor qilish
                              </button>
                              <button
                                onClick={handleCreateTask}
                                disabled={taskSaving || !taskText.trim()}
                                className={`px-4 py-1.5 rounded-[8px] text-[12px] font-bold text-white transition-colors ${
                                  taskSaving || !taskText.trim()
                                    ? "bg-[#CCCCCC] cursor-not-allowed"
                                    : "bg-[#141414] hover:bg-[#333333]"
                                }`}
                              >
                                {taskSaving ? (
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                                    Saqlanmoqda...
                                  </div>
                                ) : (
                                  "Saqlash"
                                )}
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* SECTION 8 — Lid yopish */}
                  <div className="flex flex-col gap-3 pt-2 border-t border-[#F0F0F0]">
                    <SectionHeader>Lidni yopish</SectionHeader>
                    <AnimatePresence mode="wait">
                      {showCloseConfirm ? (
                        <motion.div
                          key="confirm"
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 5 }}
                          className="flex flex-col gap-3 border border-[#F0F0F0] rounded-[8px] p-4"
                        >
                          <p className="text-[13px] text-[#141414] font-medium">
                            {showCloseConfirm === "won"
                              ? "Lidni yutildi deb belgilaysizmi?"
                              : "Lidni yutqazildi deb belgilaysizmi?"}
                          </p>
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              onClick={() => setShowCloseConfirm(null)}
                              disabled={closingSaving}
                              className="px-3 py-1.5 rounded-[8px] text-[12px] font-medium text-[#999] hover:text-[#666]"
                            >
                              Bekor qilish
                            </button>
                            <button
                              onClick={() => handleCloseLead(showCloseConfirm)}
                              disabled={closingSaving}
                              className={`px-4 py-1.5 rounded-[8px] text-[12px] font-bold text-white transition-colors ${
                                closingSaving
                                  ? "bg-[#CCCCCC] cursor-not-allowed"
                                  : showCloseConfirm === "won"
                                    ? "bg-[#141414] hover:bg-[#141414]"
                                    : "bg-red-600 hover:bg-red-700"
                              }`}
                            >
                              {closingSaving ? (
                                <div className="flex items-center gap-1.5">
                                  <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                                  Saqlanmoqda...
                                </div>
                              ) : (
                                "Tasdiqlash"
                              )}
                            </button>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="buttons"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex items-center gap-2"
                        >
                          <button
                            onClick={() => setShowCloseConfirm("won")}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[8px] text-[12px] font-bold text-[#141414] bg-[#F5F5F5] border border-[#E0E0E0] hover:bg-[#EBEBEB] transition-colors"
                          >
                            <CheckCircle size={14} weight="bold" />
                            Yutildi
                          </button>
                          <button
                            onClick={() => setShowCloseConfirm("lost")}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[8px] text-[12px] font-bold text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors"
                          >
                            <X size={14} weight="bold" />
                            Yutqazildi
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
