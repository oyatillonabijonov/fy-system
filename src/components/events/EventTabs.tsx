import { useState, useEffect, useMemo, useRef } from "react"
import { Plus, BookmarkSimple, SquaresFour } from "@phosphor-icons/react"
import { type Event } from "@/lib/supabase/queries/events"
import { UMUMIY } from "@/hooks/useEventTab"
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
  showUmumiy: boolean
  onCreate?: () => void
}

export function EventTabs({ events, selectedId, onSelect, showUmumiy, onCreate }: EventTabsProps) {
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
    <div className="flex items-end gap-1 border-b border-line">
      <div className="flex items-end gap-1 overflow-x-auto no-scrollbar flex-1 pt-1.5">
        {showUmumiy && (
          <button
            onClick={() => onSelect(UMUMIY)}
            title="Umumiy"
            aria-current={selectedId === UMUMIY ? "true" : undefined}
            className={`relative flex items-center gap-2 h-9 px-3.5 rounded-t-[10px] -mb-px shrink-0 whitespace-nowrap bg-accent transition-colors ${
              selectedId === UMUMIY
                ? "text-ink-on-accent border border-accent "
                : "text-ink-on-accent/55 border border-transparent hover:text-ink-on-accent"
            }`}
          >
            <SquaresFour size={15} />
            <span className="text-sm font-semibold">Umumiy</span>
          </button>
        )}

        {tabEvents.map((e) => {
          const isSel = e.id === selectedId
          return (
            <button
              key={e.id}
              onClick={() => onSelect(e.id)}
              title={e.name}
              aria-current={isSel ? "true" : undefined}
              className={`group relative flex items-center gap-2 h-9 px-3.5 rounded-t-[10px] -mb-px max-w-[210px] whitespace-nowrap transition-colors ${
                isSel
                  ? "bg-surface border border-line border-b-surface text-ink "
                  : "bg-surface-sunken border border-transparent text-ink-muted hover:bg-surface-sunken-hover hover:text-ink"
              }`}
            >
              <span
                className="w-[14px] h-[14px] rounded-checkbox shrink-0"
                style={{ backgroundColor: eventTint(e.name) }}
              />
              <span className="text-sm font-semibold truncate">{e.name}</span>
            </button>
          )
        })}

        {onCreate && (
          <button
            onClick={onCreate}
            title="Yangi tadbir"
            aria-label="Yangi tadbir"
            className="flex items-center justify-center w-8 h-8 mb-[3px] ml-0.5 shrink-0 rounded-full text-ink-muted hover:bg-surface-sunken-hover hover:text-ink transition-colors"
          >
            <Plus size={16} />
          </button>
        )}
      </div>

      {/* Bookmark → past events dropdown */}
      <div className="relative shrink-0 mb-1.5" ref={archiveRef}>
        <button
          onClick={() => setArchiveOpen((o) => !o)}
          title="O'tgan tadbirlar"
          aria-label="O'tgan tadbirlar"
          aria-expanded={archiveOpen}
          className={`relative flex items-center justify-center w-8 h-8 rounded-control transition-colors ${
            archiveOpen ? "bg-surface-sunken-hover text-ink" : "text-ink-muted hover:bg-surface-sunken-hover hover:text-ink"
          }`}
        >
          <BookmarkSimple size={17} weight={archiveOpen ? "fill" : "regular"} />
          {archive.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 rounded-full bg-accent text-ink-on-accent text-xs font-bold flex items-center justify-center">
              {archive.length}
            </span>
          )}
        </button>
        {archiveOpen && (
          <div className="absolute right-0 top-full mt-1.5 bg-surface-raised border border-line rounded-menu z-20 overflow-hidden min-w-[240px] max-h-[300px] overflow-y-auto no-scrollbar">
            <div className="px-3 py-2 border-b border-line text-xs font-bold text-ink-muted">
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
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-mute-ghost-hover transition-colors text-left"
                >
                  <span
                    className="w-[12px] h-[12px] rounded-checkbox shrink-0"
                    style={{ backgroundColor: eventTint(e.name) }}
                  />
                  <span className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-ink truncate">{e.name}</span>
                    <span className="text-xs text-ink-muted">{formatDate(e.date)}</span>
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
