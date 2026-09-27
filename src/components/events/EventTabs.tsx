import { useState, useEffect, useMemo, useRef } from "react"
import { Plus, BookmarkSimple } from "@phosphor-icons/react"
import { type Event } from "@/lib/supabase/queries/events"
import { eventTint } from "@/lib/eventTint"
import { formatDate } from "@/lib/format"

export function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function isActiveEvent(e: Event, today: number): boolean {
  const ref = e.end_date ?? e.date
  if (!ref) return true
  return new Date(ref).getTime() >= today
}

interface EventTabsProps {
  events: Event[]
  selectedId: string
  onSelect: (id: string) => void
  onCreate?: () => void
}

export function EventTabs({ events, selectedId, onSelect, onCreate }: EventTabsProps) {
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

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (archiveRef.current && !archiveRef.current.contains(e.target as Node)) setArchiveOpen(false)
    }
    if (archiveOpen) document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [archiveOpen])

  const selected = events.find((e) => e.id === selectedId) ?? null

  // Tabs = active events; if an archive event is selected, surface it as a tab too.
  const tabEvents = useMemo(() => {
    const base = [...active]
    if (selected && !active.some((e) => e.id === selected.id)) base.unshift(selected)
    return base
  }, [active, selected])

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1">

        {tabEvents.map((e) => {
          const isSel = e.id === selectedId
          return (
            <button
              key={e.id}
              onClick={() => onSelect(e.id)}
              title={e.name}
              aria-current={isSel ? "true" : undefined}
              className={`flex items-center gap-2 h-control-md px-3.5 rounded-full max-w-[220px] shrink-0 whitespace-nowrap text-base font-medium transition-colors ${
                isSel
                  ? "bg-mute-soft text-ink"
                  : "text-ink-muted hover:bg-mute-ghost-hover hover:text-ink"
              }`}
            >
              <span
                className="size-2 rounded-full shrink-0"
                style={{ backgroundColor: eventTint(e.name) }}
              />
              <span className="truncate">{e.name}</span>
            </button>
          )
        })}

        {onCreate && (
          <button
            onClick={onCreate}
            title="Yangi tadbir"
            aria-label="Yangi tadbir"
            className="flex items-center justify-center size-9 shrink-0 rounded-full text-ink-muted hover:bg-mute-ghost-hover hover:text-ink transition-colors"
          >
            <Plus size={16} />
          </button>
        )}
      </div>

      {/* Bookmark → past events dropdown */}
      <div className="relative shrink-0" ref={archiveRef}>
        <button
          onClick={() => setArchiveOpen((o) => !o)}
          title="O'tgan tadbirlar"
          aria-label="O'tgan tadbirlar"
          aria-expanded={archiveOpen}
          className={`relative flex items-center justify-center size-9 rounded-full transition-colors ${
            archiveOpen ? "bg-mute-soft text-ink" : "text-ink-muted hover:bg-mute-ghost-hover hover:text-ink"
          }`}
        >
          <BookmarkSimple size={17} weight={archiveOpen ? "fill" : "regular"} />
          {archive.length > 0 && (
            <span className="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 rounded-full bg-accent text-ink-on-accent text-xs font-medium tabular-nums flex items-center justify-center">
              {archive.length}
            </span>
          )}
        </button>
        {archiveOpen && (
          <div className="absolute right-0 top-full mt-1.5 p-1 bg-surface-raised border border-line rounded-menu z-20 min-w-[240px] max-h-[300px] overflow-y-auto no-scrollbar">
            <div className="px-2.5 pt-1.5 pb-1 text-sm text-ink-muted">
              O'tgan tadbirlar
            </div>
            {archive.length === 0 ? (
              <div className="px-3 py-4 text-sm text-ink-muted">O'tgan tadbir yo'q</div>
            ) : (
              archive.map((e) => (
                <button
                  key={e.id}
                  onClick={() => {
                    onSelect(e.id)
                    setArchiveOpen(false)
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-item hover:bg-mute-ghost-hover transition-colors text-left"
                >
                  <span
                    className="size-2 rounded-full shrink-0"
                    style={{ backgroundColor: eventTint(e.name) }}
                  />
                  <span className="flex flex-col min-w-0">
                    <span className="text-base font-medium text-ink truncate">{e.name}</span>
                    <span className="text-sm text-ink-muted tabular-nums">{formatDate(e.date)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
