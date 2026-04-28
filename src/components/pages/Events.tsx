import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import {
  PlusIcon,
  CalendarDaysIcon,
  MapPinIcon,
  UsersIcon,
  EllipsisVerticalIcon,
  TrashIcon,
  PencilIcon,
} from "@heroicons/react/24/solid"
import { type Event, getParticipants } from "@/lib/supabase/queries/events"
import { PARTICIPANTS_KEY } from "@/hooks/useEvents"
import { CreateEventModal } from "@/components/events/CreateEventModal"
import { useEvents, useParticipantCounts, useDeleteEvent, EVENTS_KEY, EVENT_COUNTS_KEY } from "@/hooks/useEvents"
import { EventCardSkeleton } from "@/components/ui/Skeleton"

interface EventsProps {
  onSelectEvent: (eventId: string) => void
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Sana belgilanmagan"
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const year = d.getFullYear()
  return `${day}.${month}.${year}`
}

export function Events({ onSelectEvent }: EventsProps) {
  const qc = useQueryClient()
  const { data: events = [], isLoading: loading } = useEvents()
  const { data: counts = {} } = useParticipantCounts(events.map((e) => e.id))
  const deleteEventMutation = useDeleteEvent()

  function invalidateEvents() {
    qc.invalidateQueries({ queryKey: EVENTS_KEY })
    qc.invalidateQueries({ queryKey: EVENT_COUNTS_KEY })
  }
  const [showCreate, setShowCreate] = useState(false)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)

  function handleDelete(id: string) {
    deleteEventMutation.mutate(id, {
      onSettled: () => setMenuOpen(null),
    })
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6 h-full">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <div className="animate-pulse bg-[#F0F0F0] rounded-[6px] h-6 w-32" />
            <div className="animate-pulse bg-[#F0F0F0] rounded-[6px] h-4 w-20 mt-1" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <EventCardSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] font-bold text-[#141414]">Tadbirlar</h1>
          <p className="text-[13px] text-[#999]">{events.length} ta tadbir</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#141414] text-white rounded-[8px] text-[13px] font-bold hover:bg-[#333] transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Yangi tadbir
        </button>
      </div>

      {/* Grid */}
      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <CalendarDaysIcon className="w-16 h-16 text-[#E0E0E0]" />
          <p className="text-[14px] text-[#999]">Hozircha tadbirlar yo'q</p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-[#141414] text-white rounded-[8px] text-[13px] font-bold hover:bg-[#333] transition-colors"
          >
            Birinchi tadbirni yarating
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map((event, i) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onMouseEnter={() => {
                qc.prefetchQuery({
                  queryKey: [...PARTICIPANTS_KEY, event.id],
                  queryFn: () => getParticipants(event.id),
                  staleTime: 1000 * 60 * 2,
                })
              }}
              onClick={() => onSelectEvent(event.id)}
              className="bg-white border border-[#F0F0F0] rounded-[12px] overflow-hidden cursor-pointer hover:shadow-md transition-shadow group relative"
            >
              {/* Cover */}
              {event.cover_image ? (
                <div className="h-[140px] overflow-hidden">
                  <img
                    src={event.cover_image}
                    alt={event.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
              ) : (
                <div className="h-[100px] bg-gradient-to-br from-[#F5F5F5] to-[#EBEBEB] flex items-center justify-center">
                  <CalendarDaysIcon className="w-10 h-10 text-[#D0D0D0]" />
                </div>
              )}

              {/* Content */}
              <div className="p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between">
                  <h3 className="text-[15px] font-bold text-[#141414] leading-tight line-clamp-2">
                    {event.name}
                  </h3>
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setMenuOpen(menuOpen === event.id ? null : event.id)
                      }}
                      className="p-1 rounded-[4px] hover:bg-[#F5F5F5] transition-colors"
                    >
                      <EllipsisVerticalIcon className="w-4 h-4 text-[#999]" />
                    </button>
                    {menuOpen === event.id && (
                      <div className="absolute right-0 top-full mt-1 bg-white border border-[#F0F0F0] rounded-[8px] shadow-lg z-10 overflow-hidden min-w-[120px]">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingEvent(event)
                            setMenuOpen(null)
                          }}
                          className="w-full px-3 py-2 text-[12px] text-[#141414] hover:bg-[#F5F5F5] flex items-center gap-2 transition-colors"
                        >
                          <PencilIcon className="w-3.5 h-3.5" />
                          Tahrirlash
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(event.id)
                          }}
                          disabled={deleteEventMutation.isPending}
                          className="w-full px-3 py-2 text-[12px] text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                          {deleteEventMutation.isPending && deleteEventMutation.variables === event.id ? "O'chirilmoqda..." : "O'chirish"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <CalendarDaysIcon className="w-3.5 h-3.5 text-[#999]" />
                    <span className="text-[12px] text-[#999]">{formatDate(event.date)}</span>
                  </div>
                  {event.location && (
                    <div className="flex items-center gap-1.5">
                      <MapPinIcon className="w-3.5 h-3.5 text-[#999]" />
                      <span className="text-[12px] text-[#999] truncate">{event.location}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 mt-1">
                  <UsersIcon className="w-3.5 h-3.5 text-[#141414]" />
                  <span className="text-[12px] font-medium text-[#141414]">
                    {counts[event.id] ?? 0} ishtirokchi
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <CreateEventModal
        isOpen={showCreate || !!editingEvent}
        onClose={() => {
          setShowCreate(false)
          setEditingEvent(null)
        }}
        onCreated={invalidateEvents}
        editEvent={editingEvent}
      />
    </div>
  )
}
