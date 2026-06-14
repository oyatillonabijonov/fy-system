import { useState, useEffect, useMemo, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Plus, CalendarBlank, BookmarkSimple } from "@phosphor-icons/react"
import { type Event } from "@/lib/supabase/queries/events"
import { CreateEventDrawer } from "@/components/events/CreateEventDrawer"
import { EventOverview } from "@/components/events/EventOverview"
import { eventTint } from "@/lib/eventTint"
import { useEvents, useDeleteEvent, EVENTS_KEY, EVENT_COUNTS_KEY } from "@/hooks/useEvents"
import { EventCardSkeleton } from "@/components/ui/Skeleton"
import { formatDate } from "@/lib/format"

interface EventsProps {
  onSelectEvent: (eventId: string) => void
}

function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function isActiveEvent(e: Event, today: number): boolean {
  const ref = e.end_date ?? e.date
  if (!ref) return true
  return new Date(ref).getTime() >= today
}

export function Events({ onSelectEvent }: EventsProps) {
  const qc = useQueryClient()
  const { data: events = [], isLoading: loading } = useEvents()
  const deleteEventMutation = useDeleteEvent()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const archiveRef = useRef<HTMLDivElement>(null)

  const today = startOfToday()

  const { active, archive } = useMemo(() => {
    const a: Event[] = []
    const ar: Event[] = []
    for (const e of events) (isActiveEvent(e, today) ? a : ar).push(e)
    // active: nearest upcoming first; archive: most recent first
    a.sort((x, y) => new Date(x.date ?? 0).getTime() - new Date(y.date ?? 0).getTime())
    ar.sort((x, y) => new Date(y.date ?? 0).getTime() - new Date(x.date ?? 0).getTime())
    return { active: a, archive: ar }
  }, [events, today])

  // Close archive dropdown on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (archiveRef.current && !archiveRef.current.contains(e.target as Node)) setArchiveOpen(false)
    }
    if (archiveOpen) document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [archiveOpen])

  // Effective selection computed during render (no effect): keep the user's pick
  // while it's valid, otherwise fall back to the nearest upcoming / latest event.
  const effectiveId =
    selectedId && events.some((e) => e.id === selectedId)
      ? selectedId
      : (active[0] ?? archive[0])?.id ?? null
  const selected = events.find((e) => e.id === effectiveId) ?? null

  // Tabs = active events; if an archive event is selected, surface it as a tab too.
  const tabEvents = useMemo(() => {
    const base = [...active]
    if (selected && !active.some((e) => e.id === selected.id)) base.unshift(selected)
    return base
  }, [active, selected])

  function handleDelete(id: string) {
    if (!window.confirm("Tadbirni o'chirishni tasdiqlaysizmi? Barcha ishtirokchilar ham o'chadi.")) return
    deleteEventMutation.mutate(id, {
      onSettled: () => {
        if (selectedId === id) setSelectedId(null)
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
          {/* Browser-style tab bar */}
          <div className="flex items-end gap-1 border-b border-[#E8E8E8]">
            <div className="flex items-end gap-1 overflow-x-auto no-scrollbar flex-1 pt-1.5">
              {tabEvents.map((e) => {
                const isSel = e.id === effectiveId
                return (
                  <button
                    key={e.id}
                    onClick={() => setSelectedId(e.id)}
                    title={e.name}
                    className={`group relative flex items-center gap-2 h-9 px-3.5 rounded-t-[10px] -mb-px max-w-[210px] whitespace-nowrap transition-colors ${
                      isSel
                        ? "bg-white border border-[#E8E8E8] border-b-white text-[#141414] shadow-[0_-1px_3px_rgba(0,0,0,0.03)]"
                        : "bg-[#F4F4F4] border border-transparent text-[#8A8A8A] hover:bg-[#ECECEC] hover:text-[#141414]"
                    }`}
                  >
                    <span
                      className="w-[14px] h-[14px] rounded-[4px] shrink-0"
                      style={{ backgroundColor: eventTint(e.name) }}
                    />
                    <span className="text-[12.5px] font-semibold truncate">{e.name}</span>
                  </button>
                )
              })}

              {/* + new tab */}
              <button
                onClick={() => setShowCreate(true)}
                title="Yangi tadbir"
                className="flex items-center justify-center w-8 h-8 mb-[3px] ml-0.5 shrink-0 rounded-full text-[#9A9A9A] hover:bg-[#ECECEC] hover:text-[#141414] transition-colors"
              >
                <Plus size={16} weight="bold" />
              </button>
            </div>

            {/* Bookmark → past events dropdown */}
            <div className="relative shrink-0 mb-1.5" ref={archiveRef}>
              <button
                onClick={() => setArchiveOpen((o) => !o)}
                title="O'tgan tadbirlar"
                className={`relative flex items-center justify-center w-8 h-8 rounded-[8px] transition-colors ${
                  archiveOpen ? "bg-[#ECECEC] text-[#141414]" : "text-[#9A9A9A] hover:bg-[#ECECEC] hover:text-[#141414]"
                }`}
              >
                <BookmarkSimple size={17} weight={archiveOpen ? "fill" : "bold"} />
                {archive.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 rounded-full bg-[#141414] text-white text-[9px] font-bold flex items-center justify-center">
                    {archive.length}
                  </span>
                )}
              </button>
              {archiveOpen && (
                <div className="absolute right-0 top-full mt-1.5 bg-white border border-[#F0F0F0] rounded-[10px] shadow-lg z-20 overflow-hidden min-w-[240px] max-h-[300px] overflow-y-auto no-scrollbar">
                  <div className="px-3 py-2 border-b border-[#F0F0F0] text-[11px] font-bold text-[#999]">
                    O'tgan tadbirlar
                  </div>
                  {archive.length === 0 ? (
                    <div className="px-3 py-4 text-[12px] text-[#999]">O'tgan tadbir yo'q</div>
                  ) : (
                    archive.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => {
                          setSelectedId(e.id)
                          setArchiveOpen(false)
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#F5F5F5] transition-colors text-left"
                      >
                        <span
                          className="w-[12px] h-[12px] rounded-[3px] shrink-0"
                          style={{ backgroundColor: eventTint(e.name) }}
                        />
                        <span className="flex flex-col min-w-0">
                          <span className="text-[12px] font-medium text-[#141414] truncate">{e.name}</span>
                          <span className="text-[10px] text-[#999]">{formatDate(e.date)}</span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Selected event view */}
          {selected ? (
            <EventOverview
              key={selected.id}
              event={selected}
              onOpenFull={() => onSelectEvent(selected.id)}
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
