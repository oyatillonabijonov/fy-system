import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import {
  Plus,
  CalendarBlank,
  MapPin,
  Users,
  DotsThreeVertical,
  Trash,
  PencilSimple,
} from "@phosphor-icons/react"
import { type Event, getParticipants } from "@/lib/supabase/queries/events"
import { PARTICIPANTS_KEY } from "@/hooks/useEvents"
import { CreateEventModal } from "@/components/events/CreateEventModal"
import { useEvents, useParticipantCounts, useDeleteEvent, EVENTS_KEY, EVENT_COUNTS_KEY } from "@/hooks/useEvents"
import { EventCardSkeleton } from "@/components/ui/Skeleton"
import { formatDate } from "@/lib/format"

interface EventsProps {
  onSelectEvent: (eventId: string) => void
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
          <Plus size={16} weight="bold" />
          Yangi tadbir
        </button>
      </div>

      {/* Grid */}
      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <CalendarBlank size={64} className="text-[#E0E0E0]" weight="bold" />
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
                <div className="h-[100px] bg-[#EBEBEB] flex items-center justify-center">
                  <CalendarBlank size={40} className="text-[#D0D0D0]" weight="bold" />
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
                      <DotsThreeVertical size={16} className="text-[#999]" weight="bold" />
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
                          <PencilSimple size={14} weight="bold" />
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
                          <Trash size={14} weight="bold" />
                          {deleteEventMutation.isPending && deleteEventMutation.variables === event.id ? "O'chirilmoqda..." : "O'chirish"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <CalendarBlank size={14} className="text-[#999]" weight="bold" />
                    <span className="text-[12px] text-[#999]">{formatDate(event.date)}</span>
                  </div>
                  {event.location && (
                    <div className="flex items-center gap-1.5">
                      <MapPin size={14} className="text-[#999]" weight="bold" />
                      <span className="text-[12px] text-[#999] truncate">{event.location}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 mt-1">
                  <Users size={14} className="text-[#141414]" weight="bold" />
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
