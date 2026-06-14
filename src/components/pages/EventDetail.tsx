import { useState, useEffect, useRef, useMemo } from "react"
import { StatusBadge } from '@/components/ui/StatusBadge'
import { motion, AnimatePresence } from "framer-motion"
import {
  ArrowLeft,
  Plus,
  Trash,
  FileText,
  CalendarBlank,
  MapPin,
  Users,
  PencilSimple,
  Check,
  CurrencyCircleDollar,
  CaretDown,
  CaretUp,
} from "@phosphor-icons/react"
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd"
import { type Participant } from "@/lib/supabase/queries/events"
import { AddParticipantModal } from "@/components/events/AddParticipantModal"
import {
  useEvent,
  useParticipants,
  useDeleteParticipant,
  useReorderParticipants,
  PARTICIPANTS_KEY,
  EVENT_COUNTS_KEY,
} from "@/hooks/useEvents"
import { useSetEventCashbackPercent, useSetParticipantCashbackPercent, useClientCashbackBalance } from "@/hooks/useCashback"
import { useParticipantPayments, useAddPayment, useDeletePayment } from "@/hooks/usePayments"
import type { PaymentMethod } from "@/lib/supabase/queries/payments"
import { ApplyCashbackModal } from "@/components/cashback/ApplyCashbackModal"
import { useQueryClient } from "@tanstack/react-query"
import { formatDate, formatMoney } from "@/lib/format"

interface EventDetailProps {
  eventId: string
  onBack: () => void
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function CashbackPopover({
  onClose,
  currentPercent,
  defaultPercent,
  saving,
  onSave,
  onReset,
}: {
  onClose: () => void
  currentPercent: number | null
  defaultPercent: number
  saving: boolean
  onSave: (percent: number) => void
  onReset: () => void
}) {
  // Initialised once per mount; parent unmounts the popover when closing,
  // so remounting on next open re-reads currentPercent without a setState-in-effect cascade.
  const [value, setValue] = useState<string>(currentPercent !== null ? String(currentPercent) : "")

  return (
    <div
      className="absolute top-9 right-0 z-20 w-[220px] bg-white border border-[#E0E0E0] rounded-[10px] shadow-lg p-3 flex flex-col gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-[11px] font-bold text-[#999] uppercase tracking-wider">Cashback foizi</span>
      <div className="relative">
        <input
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`Standart: ${defaultPercent}`}
          autoFocus
          className="w-full border border-[#E0E0E0] rounded-[6px] px-2.5 py-1.5 pr-7 text-[13px] text-[#141414] focus:outline-none focus:border-[#141414] transition-colors"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-[#999] pointer-events-none">%</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onReset}
          disabled={saving}
          className="flex-1 py-1.5 rounded-[6px] text-[11px] font-bold text-[#999] hover:text-[#666] border border-[#E0E0E0] hover:bg-[#F9F9F9] transition-colors"
        >
          Standart
        </button>
        <button
          onClick={() => {
            const v = Number(value)
            if (Number.isFinite(v) && v >= 0 && v <= 100) onSave(v)
          }}
          disabled={saving || value === ""}
          className={`flex-1 py-1.5 rounded-[6px] text-[11px] font-bold text-white transition-colors ${
            saving || value === "" ? "bg-[#CCC] cursor-not-allowed" : "bg-[#141414] hover:bg-[#333]"
          }`}
        >
          {saving ? "..." : "Saqlash"}
        </button>
      </div>
      <button
        onClick={onClose}
        className="text-[11px] font-medium text-[#999] hover:text-[#666] transition-colors mt-1"
      >
        Yopish
      </button>
    </div>
  )
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  naqd:     "Naqd",
  karta:    "Karta",
  transfer: "Transfer",
}

function PaymentSection({ participantId }: { participantId: string }) {
  const { data: payments = [], isLoading } = useParticipantPayments(participantId)
  const addMutation    = useAddPayment(participantId)
  const deleteMutation = useDeletePayment(participantId)

  const [showForm, setShowForm]       = useState(false)
  const [amount, setAmount]           = useState("")
  const [method, setMethod]           = useState<PaymentMethod>("naqd")
  const [paidAt, setPaidAt]           = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote]               = useState("")
  const [formError, setFormError]     = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  async function handleAdd() {
    const num = Number(amount)
    if (!num || num <= 0) { setFormError("Summa noldan katta bo'lishi kerak"); return }
    setFormError(null)
    try {
      await addMutation.mutateAsync({ participantId, amount: num, method, paidAt, note: note || undefined })
      setAmount("")
      setNote("")
      setShowForm(false)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Xatolik")
    }
  }

  return (
    <div className="mt-3 border-t border-[#F0F0F0] pt-3 flex flex-col gap-2">
      {/* Add payment button */}
      <button
        type="button"
        onClick={() => setShowForm((v) => !v)}
        className="flex items-center gap-1.5 text-[12px] font-semibold text-[#141414] hover:text-orange-600 transition-colors self-start"
      >
        <CurrencyCircleDollar size={15} weight="bold" />
        To'lov qo'shish
        {showForm ? <CaretUp size={11} weight="bold" /> : <CaretDown size={11} weight="bold" />}
      </button>

      {/* Inline form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 bg-[#FAFAFA] border border-[#F0F0F0] rounded-[8px] p-3">
              <div className="flex gap-2 flex-wrap">
                <input
                  type="number"
                  min={1}
                  placeholder="Summa (so'm)"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="flex-1 min-w-[110px] border border-[#E0E0E0] rounded-[6px] px-2.5 py-1.5 text-[13px] text-[#141414] focus:outline-none focus:border-[#141414] transition-colors"
                />
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                  className="border border-[#E0E0E0] rounded-[6px] px-2 py-1.5 text-[13px] text-[#141414] focus:outline-none focus:border-[#141414] bg-white transition-colors"
                >
                  <option value="naqd">Naqd</option>
                  <option value="karta">Karta</option>
                  <option value="transfer">Transfer</option>
                </select>
                <input
                  type="date"
                  value={paidAt}
                  onChange={(e) => setPaidAt(e.target.value)}
                  className="border border-[#E0E0E0] rounded-[6px] px-2 py-1.5 text-[13px] text-[#141414] focus:outline-none focus:border-[#141414] transition-colors"
                />
              </div>
              <input
                type="text"
                placeholder="Izoh (ixtiyoriy)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="border border-[#E0E0E0] rounded-[6px] px-2.5 py-1.5 text-[13px] text-[#141414] focus:outline-none focus:border-[#141414] transition-colors"
              />
              {formError && <p className="text-[11px] text-red-500">{formError}</p>}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowForm(false); setFormError(null) }}
                  className="px-3 py-1.5 rounded-[6px] text-[12px] font-semibold text-[#999] hover:bg-[#EFEFEF] transition-colors"
                >
                  Bekor
                </button>
                <button
                  onClick={handleAdd}
                  disabled={addMutation.isPending}
                  className={`px-3 py-1.5 rounded-[6px] text-[12px] font-semibold text-white transition-colors ${
                    addMutation.isPending ? "bg-[#CCC]" : "bg-[#141414] hover:bg-[#333]"
                  }`}
                >
                  {addMutation.isPending ? "Saqlanmoqda..." : "Saqlash"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Payment history */}
      {isLoading ? (
        <p className="text-[11px] text-[#999]">Yuklanmoqda...</p>
      ) : payments.length > 0 ? (
        <div className="flex flex-col gap-1">
          {payments.map((p) => (
            <div key={p.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 group/row">
                <div className="flex items-center gap-2 min-w-0">
                  <StatusBadge label={METHOD_LABELS[p.method]} variant="neutral" />
                  <span className="text-[12px] font-semibold text-[#141414]">{formatMoney(p.amount)}</span>
                  <span className="text-[11px] text-[#999]">{formatDate(p.paid_at)}</span>
                  {p.recorder_name && <span className="text-[10px] text-[#B0B0B0] truncate max-w-[80px]" title={p.recorder_name}>{p.recorder_name}</span>}
                  {p.note && <span className="text-[11px] text-[#999] truncate max-w-[80px]" title={p.note}>{p.note}</span>}
                </div>
                <button
                  onClick={() => setConfirmDeleteId(p.id)}
                  disabled={deleteMutation.isPending}
                  className="p-0.5 rounded-[4px] hover:bg-red-50 opacity-0 group-hover/row:opacity-100 transition-all flex-shrink-0"
                  title="O'chirish"
                >
                  <Trash size={11} weight="bold" className="text-red-400" />
                </button>
              </div>
              {confirmDeleteId === p.id && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-[6px] px-2.5 py-1.5 text-[11px]">
                  <span className="text-red-700 font-medium flex-1">To'lovni o'chirasizmi?</span>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-[#999] hover:text-[#666] font-semibold"
                  >Yo'q</button>
                  <button
                    onClick={() => {
                      deleteMutation.mutate(p.id, { onSettled: () => setConfirmDeleteId(null) })
                    }}
                    disabled={deleteMutation.isPending}
                    className="text-red-600 hover:text-red-700 font-bold disabled:opacity-50"
                  >Ha, o'chir</button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ParticipantCard({
  participant,
  defaultCashbackPercent,
  deleting,
  cashbackSaving,
  onDelete,
  onSaveCashback,
  onResetCashback,
}: {
  participant: Participant
  defaultCashbackPercent: number
  deleting: boolean
  cashbackSaving: boolean
  onDelete: () => void
  onSaveCashback: (percent: number) => void
  onResetCashback: () => void
}) {
  const [popoverOpen, setPopoverOpen] = useState(false)

  const effectivePercent = participant.cashback_percent ?? defaultCashbackPercent
  const isCustom = participant.cashback_percent !== null

  const price = Number(participant.price)
  const paid  = Number(participant.paid)
  const diff  = price - paid  // positive = debt, negative = overpayment

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ background: "#FFF5EE" }}
      className="group border border-[#F0F0F0] rounded-[12px] w-full max-w-[685px] p-6 flex flex-col gap-0 hover:shadow-sm transition-all relative"
    >
      <div className="flex items-stretch gap-6 min-h-[170px]">
        {/* Photo placeholder */}
        <div className="w-[143px] h-[161px] rounded-[12px] bg-[#F0F0F0] flex items-center justify-center overflow-hidden flex-shrink-0 self-center">
          {participant.photo_url ? (
            <img
              src={participant.photo_url}
              alt={participant.full_name}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-[14px] font-bold text-[#999]">
              {getInitials(participant.full_name)}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
          <div className="flex flex-col gap-1">
            <span className="text-[20px] font-semibold text-[#141414] truncate">
              {participant.full_name}
            </span>
            {participant.activity && (
              <span className="text-[16px] text-[#999] leading-tight">
                {participant.activity}
              </span>
            )}
          </div>

          {/* Price / Paid / Debt row */}
          {price > 0 && (
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="text-[12px] text-[#999]">
                Narx: <strong className="text-[#141414]">{formatMoney(price)}</strong>
              </span>
              <span className="text-[12px] text-[#999]">
                To'langan: <strong className={paid >= price ? "text-green-600" : "text-[#141414]"}>{formatMoney(paid)}</strong>
              </span>
              {diff > 0 && <StatusBadge label={`Qarz: ${formatMoney(diff)}`} variant="danger" />}
              {diff < 0 && <StatusBadge label={`Ortiqcha: ${formatMoney(-diff)}`} variant="info" />}
              {diff === 0 && price > 0 && <StatusBadge label="To'liq" variant="success" />}
            </div>
          )}

          {/* Cashback row + edit */}
          <div className="flex items-center gap-2 flex-wrap mt-2 relative">
            <StatusBadge
              label={`${effectivePercent}%`}
              variant={isCustom ? "warning" : "neutral"}
            />
            {participant.cashback_earned > 0 && (
              <span className="text-[11px] text-[#666]">
                Cashback: <strong className="text-green-600">{formatMoney(participant.cashback_earned)}</strong>
              </span>
            )}
            <ApplyCashbackButton participant={participant} />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setPopoverOpen((v) => !v) }}
              className="p-1 rounded-[4px] hover:bg-[#EFEFEF] transition-colors text-[#999] hover:text-[#141414] opacity-0 group-hover:opacity-100"
              title="Cashback foizini tahrirlash"
            >
              <PencilSimple size={12} weight="bold" />
            </button>
            {popoverOpen && (
              <CashbackPopover
                onClose={() => setPopoverOpen(false)}
                currentPercent={participant.cashback_percent}
                defaultPercent={defaultCashbackPercent}
                saving={cashbackSaving}
                onSave={(p) => { onSaveCashback(p); setPopoverOpen(false) }}
                onReset={() => { onResetCashback(); setPopoverOpen(false) }}
              />
            )}
          </div>

          {participant.phone && (
            <span className="text-[16px] text-[#999] mt-1">{participant.phone}</span>
          )}
        </div>
      </div>

      {/* Payment section */}
      <PaymentSection participantId={participant.id} />

      {/* Delete button — visible on hover */}
      <button
        onClick={onDelete}
        disabled={deleting}
        className="absolute top-3 right-3 p-1.5 rounded-[6px] hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
      >
        <Trash
          size={14}
          weight="bold"
          className={deleting ? "text-[#CCC]" : "text-red-400"}
        />
      </button>
    </motion.div>
  )
}

function EventCashbackInlineEditor({
  initialPercent,
  saving,
  onSave,
  onCancel,
}: {
  initialPercent: number
  saving: boolean
  onSave: (percent: number) => Promise<void>
  onCancel: () => void
}) {
  const [value, setValue] = useState<string>(String(initialPercent))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  async function handleSave() {
    const v = Number(value)
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      onCancel()
      return
    }
    if (v === initialPercent) { onCancel(); return }
    await onSave(Math.round(v * 100) / 100)
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        ref={inputRef}
        type="number"
        min={0}
        max={100}
        step={0.5}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave()
          if (e.key === "Escape") onCancel()
        }}
        className="w-16 border border-[#141414] rounded-[6px] px-1.5 py-0.5 text-[16px] font-bold text-[#141414] focus:outline-none"
      />
      <span className="text-[14px] font-bold text-[#141414]">%</span>
      <button
        onClick={handleSave}
        disabled={saving}
        className="p-0.5 rounded-[4px] hover:bg-green-50 transition-colors"
      >
        <Check size={16} className="text-green-600" weight="bold" />
      </button>
    </div>
  )
}

function EventCashbackStats({
  defaultPercent,
  totalEarned,
  totalUsed,
  saving,
  onSavePercent,
}: {
  defaultPercent: number
  totalEarned: number
  totalUsed: number
  saving: boolean
  onSavePercent: (percent: number) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)

  async function handleSave(percent: number) {
    await onSavePercent(percent)
    setEditing(false)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div className="border border-[#F0F0F0] rounded-[10px] p-4 flex items-center justify-between gap-3 bg-white">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[11px] font-bold text-[#999] uppercase tracking-wider">Cashback foizi (default)</span>
          {editing ? (
            <EventCashbackInlineEditor
              initialPercent={defaultPercent}
              saving={saving}
              onSave={handleSave}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <span className="text-[18px] font-bold text-[#141414]">{defaultPercent}%</span>
          )}
        </div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="p-1.5 rounded-[6px] hover:bg-[#F5F5F5] transition-colors"
            title="Tahrirlash"
          >
            <PencilSimple size={14} className="text-[#999]" weight="bold" />
          </button>
        )}
      </div>

      <div className="border border-[#F0F0F0] rounded-[10px] p-4 flex flex-col gap-0.5 bg-white">
        <span className="text-[11px] font-bold text-[#999] uppercase tracking-wider">Jami berildi</span>
        <span className="text-[18px] font-bold text-green-600">{formatMoney(totalEarned)}</span>
      </div>

      <div className="border border-[#F0F0F0] rounded-[10px] p-4 flex flex-col gap-0.5 bg-white">
        <span className="text-[11px] font-bold text-[#999] uppercase tracking-wider">Jami ishlatildi</span>
        <span className="text-[18px] font-bold text-orange-600">{formatMoney(totalUsed)}</span>
      </div>
    </div>
  )
}

function Toast({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`fixed top-6 right-6 z-[200] px-4 py-2.5 rounded-[8px] text-[12px] font-bold shadow-lg ${
        type === "success"
          ? "bg-green-50 text-green-700 border border-green-200"
          : "bg-red-50 text-red-700 border border-red-200"
      }`}
    >
      {message}
    </motion.div>
  )
}

export function EventDetail({ eventId, onBack }: EventDetailProps) {
  const qc = useQueryClient()
  const { data: event, isLoading: eventLoading } = useEvent(eventId)
  const { data: participants = [], isLoading: participantsLoading } = useParticipants(eventId)
  const deleteParticipantMutation = useDeleteParticipant(eventId)
  const reorderMutation = useReorderParticipants(eventId)
  const setEventCashbackMutation = useSetEventCashbackPercent()
  const setParticipantCashbackMutation = useSetParticipantCashbackPercent(eventId)

  const loading = eventLoading || participantsLoading

  const [showAddModal, setShowAddModal] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(message: string, type: "success" | "error") {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ message, type })
    toastTimerRef.current = setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
  }, [])

  const defaultCashbackPercent = event?.cashback_percent ?? 5
  const totalEarned = participants.reduce((s, p) => s + (p.cashback_earned ?? 0), 0)
  const totalUsed = participants.reduce((s, p) => s + (p.cashback_used ?? 0), 0)
  const existingContactIds = useMemo(
    () => new Set(participants.map((p) => p.contact_id).filter((id): id is string => !!id)),
    [participants],
  )

  async function handleSaveEventCashback(percent: number) {
    try {
      await setEventCashbackMutation.mutateAsync({ eventId, percent })
      showToast(`Cashback foizi yangilandi: ${percent}%`, "success")
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Xatolik", "error")
    }
  }

  function handleSaveParticipantCashback(participantId: string, percent: number | null) {
    setParticipantCashbackMutation.mutate(
      { participantId, percent },
      {
        onSuccess: () => showToast(
          percent === null ? "Standart foizga qaytarildi" : `Foiz yangilandi: ${percent}%`,
          "success",
        ),
        onError: (err) => showToast(err instanceof Error ? err.message : "Xatolik", "error"),
      },
    )
  }

  function handleDeleteParticipant(id: string) {
    deleteParticipantMutation.mutate(id, {
      onSuccess: () => showToast("Ishtirokchi o'chirildi", "success"),
      onError: (err) => showToast(err instanceof Error ? err.message : "Xatolik", "error"),
    })
  }

  async function handleExportBooklet() {
    if (!event || participants.length === 0) return
    setExporting(true)
    try {
      const { generateBooklet } = await import("@/lib/booklet/generateBooklet")
      await generateBooklet(event, participants)
    } catch (err) {
      console.error("Booklet export xatolik:", err)
    } finally {
      setExporting(false)
    }
  }

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return
    if (result.destination.index === result.source.index) return

    const reordered = Array.from(participants)
    const [removed] = reordered.splice(result.source.index, 1)
    reordered.splice(result.destination.index, 0, removed)

    const withOrder = reordered.map((p, i) => ({ id: p.id, sort_order: i }))
    reorderMutation.mutate(withOrder)
  }

  function invalidateParticipants() {
    qc.invalidateQueries({ queryKey: [...PARTICIPANTS_KEY, eventId] })
    qc.invalidateQueries({ queryKey: EVENT_COUNTS_KEY })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-[#141414] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!event) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-[14px] text-[#999]">Tadbir topilmadi</p>
        <button onClick={onBack} className="text-[13px] text-[#141414] underline">
          Orqaga
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Back + Event info */}
      <div className="flex flex-col gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[13px] text-[#999] hover:text-[#141414] transition-colors w-fit"
        >
          <ArrowLeft size={16} weight="bold" />
          Tadbirlar
        </button>

        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="text-[22px] font-bold text-[#141414]">{event.name}</h1>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <CalendarBlank size={16} className="text-[#999]" weight="bold" />
                <span className="text-[13px] text-[#999]">{formatDate(event.date)}</span>
              </div>
              {event.location && (
                <div className="flex items-center gap-1.5">
                  <MapPin size={16} className="text-[#999]" weight="bold" />
                  <span className="text-[13px] text-[#999]">{event.location}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Users size={16} className="text-[#999]" weight="bold" />
                <span className="text-[13px] text-[#999]">{participants.length} ishtirokchi</span>
              </div>
            </div>
            {event.description && (
              <p className="text-[13px] text-[#666] max-w-[600px]">{event.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Cashback stats */}
      <EventCashbackStats
        defaultPercent={defaultCashbackPercent}
        totalEarned={totalEarned}
        totalUsed={totalUsed}
        saving={setEventCashbackMutation.isPending}
        onSavePercent={handleSaveEventCashback}
      />

      {/* Participants section */}
      <div className="flex flex-col gap-4 flex-1 min-h-0">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[16px] font-bold text-[#141414]">
              Ishtirokchilar · {participants.length} ta
            </h2>
            {participants.length > 1 && (
              <span className="text-[11px] text-[#CCCCCC]">
                Tartibni o'zgartirish uchun sudrang
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportBooklet}
              disabled={exporting || participants.length === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-[8px] text-[13px] font-bold transition-colors ${
                exporting || participants.length === 0
                  ? "bg-[#F5F5F5] text-[#CCCCCC] cursor-not-allowed"
                  : "bg-[#141414] text-white hover:bg-[#333]"
              }`}
            >
              <FileText size={16} weight="bold" />
              {exporting ? "Tayyorlanmoqda..." : "Booklet export"}
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#141414] text-white rounded-[8px] text-[13px] font-bold hover:bg-[#333] transition-colors"
            >
              <Plus size={16} weight="bold" />
              Ishtirokchi qo'shish
            </button>
          </div>
        </div>

        {participants.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3">
            <Users size={48} className="text-[#E0E0E0]" weight="bold" />
            <p className="text-[13px] text-[#999]">Hozircha ishtirokchilar yo'q</p>
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="participants" direction="horizontal">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                >
                  {participants.map((p, index) => (
                    <Draggable key={p.id} draggableId={p.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          style={{
                            ...provided.draggableProps.style,
                            opacity: snapshot.isDragging ? 0.8 : 1,
                          }}
                        >
                          <ParticipantCard
                            participant={p}
                            defaultCashbackPercent={defaultCashbackPercent}
                            deleting={deleteParticipantMutation.isPending && deleteParticipantMutation.variables === p.id}
                            cashbackSaving={setParticipantCashbackMutation.isPending && setParticipantCashbackMutation.variables?.participantId === p.id}
                            onDelete={() => handleDeleteParticipant(p.id)}
                            onSaveCashback={(percent) => handleSaveParticipantCashback(p.id, percent)}
                            onResetCashback={() => handleSaveParticipantCashback(p.id, null)}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </div>

      <AddParticipantModal
        isOpen={showAddModal}
        eventId={eventId}
        existingContactIds={existingContactIds}
        onClose={() => setShowAddModal(false)}
        onAdded={invalidateParticipants}
      />

      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} />}
      </AnimatePresence>
    </div>
  )
}

// ─── Apply cashback button (per participant) ────────────

function ApplyCashbackButton({ participant }: { participant: Participant }) {
  const { data: balance = 0 } = useClientCashbackBalance(participant.contact_id)
  const [open, setOpen] = useState(false)

  const debt = Math.max(0, Number(participant.price) - Number(participant.paid))
  const eligible = !!participant.contact_id && balance > 0 && debt > 0

  if (!eligible) return null

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
        title={`Cashback balansi: ${formatMoney(balance)}`}
      >
        💰 Cashback ishlatish
      </button>
      <ApplyCashbackModal
        isOpen={open}
        participant={participant}
        balance={balance}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
