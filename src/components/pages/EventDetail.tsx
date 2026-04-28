import { useState } from "react"
import { motion } from "framer-motion"
import {
  ArrowLeftIcon,
  PlusIcon,
  TrashIcon,
  DocumentTextIcon,
  CalendarDaysIcon,
  MapPinIcon,
  UsersIcon,
} from "@heroicons/react/24/solid"
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
import { useQueryClient } from "@tanstack/react-query"

interface EventDetailProps {
  eventId: string
  onBack: () => void
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const year = d.getFullYear()
  const hours = String(d.getHours()).padStart(2, "0")
  const mins = String(d.getMinutes()).padStart(2, "0")
  return `${day}.${month}.${year} ${hours}:${mins}`
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

function ParticipantCard({
  participant,
  deleting,
  onDelete,
}: {
  participant: Participant
  deleting: boolean
  onDelete: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #FFE7D0 221.79%)" }}
      className="group border border-[#F0F0F0] rounded-[12px] w-full max-w-[685px] min-h-[218px] p-6 flex items-stretch gap-6 hover:shadow-sm transition-all relative"
    >
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
        {participant.phone && (
          <span className="text-[16px] text-[#999]">{participant.phone}</span>
        )}
      </div>

      {/* Delete button — visible on hover */}
      <button
        onClick={onDelete}
        disabled={deleting}
        className="absolute top-3 right-3 p-1.5 rounded-[6px] hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
      >
        <TrashIcon
          className={`w-3.5 h-3.5 ${deleting ? "text-[#CCC]" : "text-red-400"}`}
        />
      </button>
    </motion.div>
  )
}

export function EventDetail({ eventId, onBack }: EventDetailProps) {
  const qc = useQueryClient()
  const { data: event, isLoading: eventLoading } = useEvent(eventId)
  const { data: participants = [], isLoading: participantsLoading } = useParticipants(eventId)
  const deleteParticipantMutation = useDeleteParticipant(eventId)
  const reorderMutation = useReorderParticipants(eventId)

  const loading = eventLoading || participantsLoading

  const [showAddModal, setShowAddModal] = useState(false)
  const [exporting, setExporting] = useState(false)

  function handleDeleteParticipant(id: string) {
    deleteParticipantMutation.mutate(id)
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
          <ArrowLeftIcon className="w-4 h-4" />
          Tadbirlar
        </button>

        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="text-[22px] font-bold text-[#141414]">{event.name}</h1>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <CalendarDaysIcon className="w-4 h-4 text-[#999]" />
                <span className="text-[13px] text-[#999]">{formatDate(event.date)}</span>
              </div>
              {event.location && (
                <div className="flex items-center gap-1.5">
                  <MapPinIcon className="w-4 h-4 text-[#999]" />
                  <span className="text-[13px] text-[#999]">{event.location}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <UsersIcon className="w-4 h-4 text-[#999]" />
                <span className="text-[13px] text-[#999]">{participants.length} ishtirokchi</span>
              </div>
            </div>
            {event.description && (
              <p className="text-[13px] text-[#666] max-w-[600px]">{event.description}</p>
            )}
          </div>
        </div>
      </div>

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
              <DocumentTextIcon className="w-4 h-4" />
              {exporting ? "Tayyorlanmoqda..." : "Booklet export"}
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#141414] text-white rounded-[8px] text-[13px] font-bold hover:bg-[#333] transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              Ishtirokchi qo'shish
            </button>
          </div>
        </div>

        {participants.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3">
            <UsersIcon className="w-12 h-12 text-[#E0E0E0]" />
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
                            deleting={deleteParticipantMutation.isPending && deleteParticipantMutation.variables === p.id}
                            onDelete={() => handleDeleteParticipant(p.id)}
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
        onClose={() => setShowAddModal(false)}
        onAdded={invalidateParticipants}
      />
    </div>
  )
}
