import { useState, useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { CalendarBlank } from "@phosphor-icons/react"
import { type Event } from "@/lib/supabase/queries/events"
import { CreateEventDrawer } from "@/components/events/CreateEventDrawer"
import { EventOverview } from "@/components/events/EventOverview"
import { EventTabs, startOfToday, isActiveEvent } from "@/components/events/EventTabs"
import { useEventTab, UMUMIY } from "@/hooks/useEventTab"
import { useEvents, useDeleteEvent, EVENTS_KEY, EVENT_COUNTS_KEY } from "@/hooks/useEvents"
import { EventCardSkeleton } from "@/components/ui/Skeleton"

export function EventsBoshqaruv() {
  const qc = useQueryClient()
  const { data: events = [], isLoading: loading } = useEvents()
  const deleteEventMutation = useDeleteEvent()

  const [selectedId, setSelectedId] = useEventTab()
  const [showCreate, setShowCreate] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)

  // There is no "Umumiy" tab here: when the shared tab holds the sentinel (or a
  // deleted event), fall back to the nearest upcoming event.
  const firstActive = useMemo(() => {
    const today = startOfToday()
    const active = events.filter((e) => isActiveEvent(e, today))
    active.sort((x, y) => new Date(x.date ?? 0).getTime() - new Date(y.date ?? 0).getTime())
    return active[0] ?? events[0] ?? null
  }, [events])

  // `stored` is null whenever selectedId is UMUMIY (no event id equals the sentinel),
  // so this also covers the "shared tab is Umumiy" case without a special branch.
  const stored = events.find((e) => e.id === selectedId) ?? null
  const selected = stored ?? firstActive

  function handleDelete(id: string) {
    if (!window.confirm("Tadbirni o'chirishni tasdiqlaysizmi? Barcha ishtirokchilar ham o'chadi.")) return
    deleteEventMutation.mutate(id, {
      onSettled: () => {
        if (selectedId === id) setSelectedId(UMUMIY)
      },
    })
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6 h-full">
        <div className="animate-pulse bg-[#F0F0F0] rounded-[6px] h-6 w-32" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <EventCardSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 h-full">
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
        <>
          <EventTabs
            events={events}
            selectedId={selected?.id ?? ""}
            onSelect={setSelectedId}
            showUmumiy={false}
            onCreate={() => setShowCreate(true)}
          />

          {selected ? (
            <EventOverview
              key={selected.id}
              event={selected}
              onEdit={() => setEditingEvent(selected)}
              onDelete={() => handleDelete(selected.id)}
            />
          ) : (
            <div className="py-16 text-center text-[13px] text-[#999]">Tadbirni tanlang</div>
          )}
        </>
      )}

      <CreateEventDrawer
        isOpen={showCreate || !!editingEvent}
        onClose={() => {
          setShowCreate(false)
          setEditingEvent(null)
        }}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: EVENTS_KEY })
          qc.invalidateQueries({ queryKey: EVENT_COUNTS_KEY })
        }}
        editEvent={editingEvent}
      />
    </div>
  )
}
