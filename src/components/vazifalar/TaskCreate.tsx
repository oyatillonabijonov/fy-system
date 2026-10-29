import { useId, useRef, useState } from "react"
import { motion } from "framer-motion"
import { X } from "@phosphor-icons/react"
import { useDialog } from "@/hooks/useDialog"
import { useMedia } from "@/hooks/useMedia"
import { sheet, sheetMotion } from "@/components/ui/sheetStyles"
import { useUsers } from "@/hooks/useUsers"
import { useEvents } from "@/hooks/useEvents"
import { useCreateTask, useEventSections } from "@/hooks/useTasks"
import type { TaskStatus } from "@/lib/supabase/queries/tasks"
import { tashkentToday } from "@/lib/period"
import { EventPicker, SectionPicker, OwnerPicker, DuePicker, StatusPicker, type Owner } from "./pickers"

/** Quick create: a big title line and property chips; Enter saves, "Yana qo'shish" keeps it open */
export function TaskCreate({ defaults, nextSortOrder, onClose }: {
  defaults: { event_id: string | null; section?: string | null; status?: TaskStatus; assignee_id?: string | null }
  nextSortOrder: number
  onClose: () => void
}) {
  const { data: users = [] } = useUsers()
  const { data: events = [] } = useEvents()
  const create = useCreateTask()
  const today = tashkentToday()
  const titleId = useId()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const phone = useMedia("(width < 40rem)")

  const [title, setTitle] = useState("")
  const [eventId, setEventId] = useState<string | null>(defaults.event_id)
  const [section, setSection] = useState<string | null>(defaults.section ?? null)
  const [owner, setOwner] = useState<Owner>({ assignee_id: defaults.assignee_id ?? null, assignee_name: null })
  const [date, setDate] = useState<string | null>(null)
  const [time, setTime] = useState<string | null>(null)
  const [status, setStatus] = useState<TaskStatus>(defaults.status ?? "todo")
  const [more, setMore] = useState(false)
  const [added, setAdded] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const sort = useRef(nextSortOrder)

  const guardedClose = () => !create.isPending && onClose()
  const panelRef = useDialog<HTMLDivElement>(guardedClose, true)
  const canSave = title.trim().length > 0 && !create.isPending
  // bo'limlar of the chosen event (or Umumiy)
  const sectionList = useEventSections(eventId)

  function save() {
    if (!canSave) return
    setError(null)
    create.mutate(
      { title: title.trim(), event_id: eventId, section, status, due_date: date, due_time: date ? time : null, ...owner, sort_order: sort.current++ },
      {
        onSuccess: () => {
          if (!more) return onClose()
          setTitle("")
          setAdded((n) => n + 1)
          inputRef.current?.focus()
        },
        onError: (e) => setError(e.message),
      },
    )
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 sm:pt-[12vh] max-sm:items-end max-sm:p-0">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} {...(phone ? { exit: { opacity: 0 } } : {})} onClick={guardedClose} className="absolute inset-0 bg-surface-overlay backdrop-blur-sm" />
      <motion.div
        ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        {...(phone ? sheetMotion(true) : { initial: { scale: 0.97, opacity: 0, y: 12 }, animate: { scale: 1, opacity: 1, y: 0 } })}
        className="relative w-full max-w-xl bg-surface-raised rounded-overlay flex flex-col max-h-[calc(100dvh-32px)] max-sm:rounded-t-[20px] max-sm:rounded-b-none max-sm:max-h-[92dvh]"
      >
        <div className={sheet.grabber} />
        <div className="flex items-center justify-between px-5 pt-4 max-sm:px-4 max-sm:pt-1">
          <h3 id={titleId} className="text-sm max-sm:text-lg max-sm:text-ink max-sm:font-semibold font-medium text-ink-muted">
            Yangi vazifa{added > 0 && <span className="text-success-text"> · {added} ta qo'shildi</span>}
          </h3>
          <button onClick={guardedClose} aria-label="Yopish" className="p-2 -m-1 sm:p-1 sm:m-0 max-sm:size-10 max-sm:m-0 max-sm:-mr-2 max-sm:flex max-sm:items-center max-sm:justify-center rounded-full hover:bg-mute-ghost-hover transition-colors">
            <X size={20} className="text-ink-muted" />
          </button>
        </div>

        <div className="px-5 pt-2 pb-4 flex flex-col gap-4 max-sm:px-4 max-sm:overflow-y-auto max-sm:min-h-0 max-sm:overscroll-contain">
          <textarea
            ref={inputRef} autoFocus rows={2} value={title} onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save() } }}
            placeholder="Nima qilish kerak? Masalan: Resort to'lovlarini qilish"
            aria-label="Vazifa nomi"
            className="w-full resize-none bg-transparent text-xl font-medium text-ink placeholder:text-ink-faint focus:outline-none leading-snug"
          />
          {phone ? (
            // One wrapping row of property chips; each opens its picker as a sheet
            <div className="flex flex-wrap items-center gap-2">
              <OwnerPicker value={owner} staff={users.filter((u) => u.is_active)} onChange={setOwner} />
              <DuePicker date={date} time={time} today={today} onChange={(d, t) => { setDate(d); setTime(t) }} />
              <StatusPicker value={status} onChange={setStatus} />
              <EventPicker value={eventId} events={events} onChange={setEventId} />
              <SectionPicker value={section} sections={sectionList} onChange={setSection} />
            </div>
          ) : (
            <>
              {/* Primary: who and by when */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <OwnerPicker tile value={owner} staff={users.filter((u) => u.is_active)} onChange={setOwner} />
                <DuePicker tile date={date} time={time} today={today} onChange={(d, t) => { setDate(d); setTime(t) }} />
              </div>
              {/* Secondary: where it belongs and its state */}
              <div className="flex flex-wrap items-center gap-2">
                <StatusPicker value={status} onChange={setStatus} />
                <EventPicker value={eventId} events={events} onChange={setEventId} />
                <SectionPicker value={section} sections={sectionList} onChange={setSection} />
              </div>
            </>
          )}
          {error && <div role="alert" className="px-3 py-2 rounded-control text-sm font-medium bg-danger-soft text-danger-dark">{error}</div>}
        </div>

        <div className={`flex items-center gap-3 px-5 py-3 border-t border-line max-sm:px-4 max-sm:pt-3 max-sm:pb-[calc(12px+env(safe-area-inset-bottom))]`}>
          <label className="flex items-center gap-2 text-sm text-ink-muted cursor-pointer select-none whitespace-nowrap max-sm:h-12 max-sm:px-4 max-sm:rounded-full max-sm:bg-surface-sunken max-sm:text-base max-sm:text-ink">
            <input type="checkbox" checked={more} onChange={(e) => setMore(e.target.checked)} className="size-4 accent-[var(--ds-color-bg-inverted)]" />
            Yana qo'shish
          </label>
          <span className="hidden sm:inline text-sm text-ink-faint">Enter — saqlash · Shift+Enter — yangi qator</span>
          <div className="flex-1 max-sm:hidden" />
          <button onClick={save} disabled={!canSave}
            className={`h-9 px-5 rounded-full text-base font-medium whitespace-nowrap transition-colors max-sm:h-12 max-sm:flex-1 max-sm:font-semibold ${canSave ? "bg-accent text-ink-on-accent hover:bg-accent-hover" : "bg-mute-soft text-ink-muted cursor-not-allowed"}`}>
            {create.isPending ? "Saqlanmoqda…" : "Qo'shish"}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
