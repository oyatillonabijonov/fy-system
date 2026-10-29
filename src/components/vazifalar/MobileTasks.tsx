import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react"
import type { Icon } from "@phosphor-icons/react"
import { Plus, Copy, Rows, Kanban, CaretDown, CheckCircle, DotsThree, Tray, Paperclip, ChatCircle, Users, Check, CalendarBlank } from "@phosphor-icons/react"
import { Sheet } from "@/components/ui/Sheet"
import { useMedia } from "@/hooks/useMedia"
import { useCopyEventTasks, useUpdateTask } from "@/hooks/useTasks"
import type { Task, TaskStatus } from "@/lib/supabase/queries/tasks"
import { TaskKanban } from "@/components/vazifalar/TaskKanban"
import { StatusSheet, PersonDot, dueLabel } from "@/components/vazifalar/pickers"
import { Avatar, StatusCircle, isOverdue, sectionColor } from "@/components/vazifalar/taskUi"

/** The phone/tablet (below lg) presentation of Vazifalar: same data and mutations, app-style lists */

const NO_SECTION = "Bo'limsiz"
const MONTHS_SHORT = ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sen", "okt", "noy", "dek"]
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))}-${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]}`

export type OwnerOpt = { key: string; name: string; url?: string | null; outside: boolean }
type EventOpt = { id: string; name: string; date: string | null; end_date: string | null }

// ─── Pieces ─────────────────────────────────────────────────────────────────

export function MobileTabs({ tab, setTab }: { tab: "mine" | "event"; setTab: (t: "mine" | "event") => void }) {
  return (
    <div role="tablist" aria-label="Vazifalar" className="grid grid-cols-2 p-1 rounded-full bg-surface-sunken">
      {([["mine", "Mening vazifalarim"], ["event", "Tadbirlar bo'yicha"]] as const).map(([id, label]) => (
        <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
          className={`h-10 rounded-full text-base font-medium whitespace-nowrap transition-colors ${tab === id ? "bg-surface text-ink" : "text-ink-muted"}`}>
          {label}
        </button>
      ))}
    </div>
  )
}

function EmptyState({ icon: Ico, text, children }: { icon: Icon; text: string; children?: ReactNode }) {
  return (
    <div className="rounded-surface bg-surface-sunken py-12 px-6 flex flex-col items-center gap-3 text-center">
      <Ico size={32} weight="thin" className="text-ink-faint" />
      <p className="text-base text-ink-muted">{text}</p>
      {children}
    </div>
  )
}

const pillBtn = "h-11 px-5 rounded-full bg-accent text-ink-on-accent text-base font-medium whitespace-nowrap active:opacity-85"
const ghostBtn = "h-11 px-5 rounded-full bg-surface text-ink text-base font-medium whitespace-nowrap active:bg-mute-ghost-hover"

function Skeleton() {
  return (
    <div className="rounded-surface bg-surface-sunken overflow-hidden" aria-busy="true" aria-label="Yuklanmoqda">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 px-4 min-h-16 border-b border-line last:border-b-0">
          <span className="size-7 rounded-full bg-mute-soft" />
          <span className="flex-1 flex flex-col gap-2"><span className="h-3.5 w-3/4 rounded-full bg-mute-soft" /><span className="h-3 w-1/3 rounded-full bg-mute-soft" /></span>
        </div>
      ))}
    </div>
  )
}

/** Sheet state for one-at-a-time status picking, shared by every row of a list */
function useStatusSheet() {
  const update = useUpdateTask()
  const [target, setTarget] = useState<Task | null>(null)
  const [open, setOpen] = useState(false)
  const setStatus = (t: Task, status: TaskStatus) => update.mutate({ id: t.id, patch: { status } })
  return {
    toggle: (t: Task) => setStatus(t, t.status === "done" ? "todo" : "done"),
    hold: (t: Task) => { setTarget(t); setOpen(true) },
    sheet: <StatusSheet open={open} title={target?.title ?? ""} value={target?.status ?? "todo"}
      onPick={(s) => target && setStatus(target, s)} onClose={() => setOpen(false)} />,
  }
}

type Row = { task: Task; onOpen: (t: Task) => void; toggle: (t: Task) => void; hold: (t: Task) => void }

/**
 * One task: a 28px status circle (tap = done, hold = status sheet), the title (2 lines max) and a meta
 * line. `context` adds "Tadbir · bo'lim" (Mening vazifalarim); `dueTime` shows only the time of day
 * when the group header already says which day it is.
 */
function TaskItem({ task: t, today, context, dueTime, owner, onOpen, toggle, hold }: Row & { today: string; context?: boolean; dueTime?: boolean; owner?: boolean }) {
  const open = t.status === "todo" || t.status === "in_progress"
  const late = isOverdue(t, today)
  const now = open && t.due_date === today
  const due = t.due_date ? (dueTime ? (t.due_time ? t.due_time.slice(0, 5) : null) : dueLabel(t.due_date, t.due_time, today)) : null
  const meta: ReactNode[] = []
  if (context) {
    meta.push(<span key="e">{t.event?.name ?? "Umumiy"}</span>)
    if (t.section) meta.push(<span key="s">{t.section}</span>)
  }
  if (due) meta.push(<span key="d" className={`whitespace-nowrap tabular-nums ${late ? "text-danger-text font-medium" : now ? "text-warning-text font-medium" : ""}`}>{due}</span>)
  if (t.status === "in_progress") meta.push(<span key="p" className="whitespace-nowrap text-info-text font-medium">Jarayonda</span>)
  if (t.status === "failed") meta.push(<span key="f" className="whitespace-nowrap text-danger-text font-medium">Bajarilmadi</span>)
  return (
    <div role="button" tabIndex={0} onClick={() => onOpen(t)} onKeyDown={(e) => { if (e.key === "Enter") onOpen(t) }}
      className="flex items-start gap-3 px-4 py-3 min-h-16 border-b border-line last:border-b-0 cursor-pointer select-none active:bg-mute-ghost-hover transition-colors">
      <StatusCircle status={t.status} label={t.title} onToggle={() => toggle(t)} onHold={() => hold(t)} />
      <div className="flex-1 min-w-0">
        <p className={`text-base font-medium leading-snug line-clamp-2 break-words ${t.status === "done" ? "text-ink-muted line-through" : "text-ink"}`}>{t.title}</p>
        {(meta.length > 0 || t.attachments_count > 0 || t.comments_count > 0) && (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-ink-muted">
            {meta.flatMap((m, i) => (i ? [<span key={`d${i}`} aria-hidden className="text-ink-faint">·</span>, m] : [m]))}
            {t.attachments_count > 0 && <span className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums"><Paperclip size={12} weight="bold" />{t.attachments_count}</span>}
            {t.comments_count > 0 && <span className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums"><ChatCircle size={12} weight="bold" />{t.comments_count}</span>}
          </p>
        )}
      </div>
      {owner && <span className="shrink-0 mt-0.5"><Avatar task={t} size={28} /></span>}
    </div>
  )
}

// ─── Mening vazifalarim ─────────────────────────────────────────────────────

export function MobileMine({ tasks, isLoading, today, onOpen, onCreate }: { tasks: Task[]; isLoading: boolean; today: string; onOpen: (t: Task) => void; onCreate: () => void }) {
  const st = useStatusSheet()
  const tomorrow = useMemo(() => {
    const d = new Date(`${today}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString().slice(0, 10)
  }, [today])
  const buckets = useMemo(() => {
    const b: { title: string; rows: Task[]; time?: boolean }[] = [
      { title: "Muddati o'tgan", rows: [] }, { title: "Bugun", rows: [], time: true }, { title: "Ertaga", rows: [], time: true },
      { title: "Keyinroq", rows: [] }, { title: "Muddatsiz", rows: [] },
    ]
    for (const t of tasks) {
      const i = !t.due_date ? 4 : t.due_date < today ? 0 : t.due_date === today ? 1 : t.due_date === tomorrow ? 2 : 3
      b[i].rows.push(t)
    }
    return b.filter((x) => x.rows.length)
  }, [tasks, today, tomorrow])

  if (isLoading) return <Skeleton />
  if (tasks.length === 0) {
    return (
      <EmptyState icon={CheckCircle} text="Sizda ochiq vazifa yo'q">
        <button type="button" onClick={onCreate} className={pillBtn}>Vazifa qo'shish</button>
      </EmptyState>
    )
  }
  return (
    <div className="flex flex-col gap-5">
      {buckets.map(({ title, rows, time }) => (
        <section key={title}>
          <h2 className={`px-1 mb-2 text-sm font-semibold ${title === "Muddati o'tgan" ? "text-danger-text" : "text-ink-muted"}`}>
            {title} · <span className="tabular-nums">{rows.length}</span>
          </h2>
          <div className="rounded-surface bg-surface-sunken overflow-hidden">
            {rows.map((t) => <TaskItem key={t.id} task={t} today={today} context dueTime={time} onOpen={onOpen} toggle={st.toggle} hold={st.hold} />)}
          </div>
        </section>
      ))}
      {st.sheet}
    </div>
  )
}

// ─── Tadbirlar bo'yicha ─────────────────────────────────────────────────────

export function MobileEvent({
  events, selected, onSelect, counts, isPast, today, generalId,
  eventId, tasks, shown, sections, owners, ownerFilter, onOwnerFilter, isLoading,
  view, onView, onOpen, onAdd, onCopy,
}: {
  events: EventOpt[]; selected: string; onSelect: (id: string) => void; counts: Record<string, { open: number }>
  isPast: (e: EventOpt) => boolean; today: string; generalId: string
  eventId: string | null; tasks: Task[]; shown: Task[]; sections: string[]; owners: OwnerOpt[]
  ownerFilter: string; onOwnerFilter: (key: string) => void; isLoading: boolean
  view: "list" | "kanban"; onView: (v: "list" | "kanban") => void
  onOpen: (t: Task) => void; onAdd: (d: { section?: string | null; status?: TaskStatus }) => void; onCopy: () => void
}) {
  const phone = useMedia("(width < 40rem)")
  const st = useStatusSheet()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [ownersOpen, setOwnersOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const kanban = view === "kanban" && !phone

  const done = tasks.filter((t) => t.status === "done").length
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0
  const groups = useMemo(() => {
    const m = new Map<string, Task[]>()
    for (const t of shown) { const k = t.section ?? NO_SECTION; m.set(k, [...(m.get(k) ?? []), t]) }
    return [...m.entries()]
  }, [shown])
  const toggle = (k: string) => setCollapsed((c) => { const n = new Set(c); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const active = owners.find((o) => o.key === ownerFilter)
  const hasMenu = !!eventId || !phone

  return (
    <div className="flex flex-col gap-4">
      <EventStrip events={events} selected={selected} onSelect={onSelect} counts={counts} isPast={isPast} generalId={generalId} />

      {tasks.length > 0 && (
        <section className="rounded-surface bg-surface-sunken p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-ink-muted">Bajarildi</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-ink leading-none">{done}<span className="font-medium text-ink-faint">/{tasks.length}</span></p>
            </div>
            {owners.length > 0 && (
              <button type="button" onClick={() => setOwnersOpen(true)} aria-label="Mas'ul bo'yicha saralash"
                className={`h-10 flex items-center rounded-full ${active ? "gap-2 pl-1.5 pr-3 bg-surface text-ink text-base font-medium" : "pl-1 pr-1"}`}>
                {active ? (
                  <>
                    <PersonDot name={active.name} url={active.url} outside={active.outside} size={28} />
                    <span className="whitespace-nowrap">{active.name.split(" ")[0]}</span>
                  </>
                ) : (
                  <span className="flex -space-x-2">
                    {owners.slice(0, 4).map((o) => (
                      <span key={o.key} className="rounded-full ring-2 ring-surface-sunken"><PersonDot name={o.name} url={o.url} outside={o.outside} size={30} /></span>
                    ))}
                    {owners.length > 4 && (
                      <span className="size-[30px] rounded-full ring-2 ring-surface-sunken bg-mute-soft text-xs font-semibold text-ink-muted tabular-nums flex items-center justify-center">+{owners.length - 4}</span>
                    )}
                  </span>
                )}
              </button>
            )}
            {hasMenu && (
              <button type="button" onClick={() => setMenuOpen(true)} aria-label="Amallar"
                className="size-10 shrink-0 rounded-full bg-surface text-ink flex items-center justify-center active:bg-mute-ghost-hover">
                <DotsThree size={22} weight="bold" />
              </button>
            )}
          </div>
          <div className="mt-3 h-2 rounded-full bg-mute-soft overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Bajarilgan vazifalar">
            <div className={`h-full rounded-full ${pct === 100 ? "bg-success" : "bg-accent"}`} style={{ width: `${pct}%` }} />
          </div>
        </section>
      )}

      {isLoading ? (
        <Skeleton />
      ) : tasks.length === 0 ? (
        <EmptyState icon={Tray} text={eventId ? "Bu tadbirda hali vazifa yo'q" : "Umumiy vazifalar yo'q"}>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => onAdd({})} className={pillBtn}>Vazifa qo'shish</button>
            {eventId && <button type="button" onClick={onCopy} className={ghostBtn}>Nusxa olish</button>}
          </div>
        </EmptyState>
      ) : kanban ? (
        <TaskKanban tasks={shown} sections={sections} today={today} onOpen={onOpen} onAdd={(status) => onAdd({ status })} />
      ) : shown.length === 0 ? (
        <EmptyState icon={CheckCircle} text="Bu mas'ulning vazifasi yo'q" />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([section, rows]) => {
            const secDone = rows.filter((t) => t.status === "done").length
            const color = section === NO_SECTION ? "#888780" : sectionColor(section, sections)
            const open = !collapsed.has(section)
            return (
              <section key={section}>
                <button type="button" onClick={() => toggle(section)} aria-expanded={open} className="w-full flex items-center gap-2 min-h-10 px-1 mb-1 text-left">
                  <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-base font-semibold text-ink leading-tight">{section}</span>
                  <span className="text-sm text-ink-muted tabular-nums whitespace-nowrap">{secDone}/{rows.length}</span>
                  <span className="flex-1" />
                  <CaretDown size={16} className={`shrink-0 text-ink-muted transition-transform ${open ? "" : "-rotate-90"}`} />
                </button>
                {open && (
                  <div className="rounded-surface bg-surface-sunken overflow-hidden">
                    {rows.map((t) => <TaskItem key={t.id} task={t} today={today} owner onOpen={onOpen} toggle={st.toggle} hold={st.hold} />)}
                    <button type="button" onClick={() => onAdd({ section: section === NO_SECTION ? null : section })}
                      className="w-full flex items-center gap-3 px-4 min-h-12 text-base font-medium text-ink-muted active:bg-mute-ghost-hover">
                      <span className="size-7 -ml-0.5 flex items-center justify-center"><Plus size={16} weight="bold" /></span>Vazifa qo'shish
                    </button>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {st.sheet}

      <Sheet open={ownersOpen} onClose={() => setOwnersOpen(false)} title="Mas'ul bo'yicha">
        <div className="flex flex-col gap-1 pb-2">
          <OwnerRow label="Hammasi" count={tasks.length} selected={!ownerFilter} onClick={() => { onOwnerFilter(""); setOwnersOpen(false) }} />
          {owners.map((o) => (
            <OwnerRow key={o.key} label={o.name} count={tasks.filter((t) => (t.assignee_id ?? `x:${t.assignee_name}`) === o.key).length}
              person={<PersonDot name={o.name} url={o.url} outside={o.outside} size={32} />}
              selected={ownerFilter === o.key} onClick={() => { onOwnerFilter(o.key); setOwnersOpen(false) }} />
          ))}
        </div>
      </Sheet>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Amallar">
        <div className="flex flex-col gap-1 pb-2">
          {eventId && (
            <ActionRow icon={Copy} title="Nusxa olish" hint="Oldingi tadbirning vazifalarini ko'chirish" onClick={() => { setMenuOpen(false); onCopy() }} />
          )}
          {!phone && (
            <div className="flex items-center gap-3 min-h-14 px-1">
              <span className="text-base text-ink flex-1">Ko'rinish</span>
              <div role="radiogroup" aria-label="Ko'rinish" className="grid grid-cols-2 p-1 rounded-full bg-surface-sunken">
                {([["list", "Ro'yxat", Rows], ["kanban", "Kanban", Kanban]] as const).map(([id, label, Ico]) => (
                  <button key={id} role="radio" aria-checked={view === id} onClick={() => { onView(id); setMenuOpen(false) }}
                    className={`h-9 px-4 flex items-center justify-center gap-1.5 rounded-full text-base font-medium whitespace-nowrap ${view === id ? "bg-surface text-ink" : "text-ink-muted"}`}>
                    <Ico size={16} />{label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Sheet>
    </div>
  )
}

function OwnerRow({ label, count, person, selected, onClick }: { label: string; count: number; person?: ReactNode; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-3 min-h-14 px-3 rounded-item text-left active:bg-mute-ghost-hover">
      {person ?? <span className="size-8 rounded-full bg-mute-soft flex items-center justify-center text-ink-muted"><Users size={18} /></span>}
      <span className="flex-1 min-w-0 text-base text-ink font-medium">{label}</span>
      <span className="text-base text-ink-muted tabular-nums">{count}</span>
      <span className="size-5 flex items-center justify-center shrink-0">{selected && <Check size={18} className="text-ink" />}</span>
    </button>
  )
}

function ActionRow({ icon: Ico, title, hint, onClick }: { icon: Icon; title: string; hint: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-3 min-h-16 px-1 rounded-item text-left active:bg-mute-ghost-hover">
      <span className="size-10 rounded-full bg-surface-sunken text-ink flex items-center justify-center shrink-0"><Ico size={20} /></span>
      <span className="flex-1 min-w-0">
        <span className="block text-base font-medium text-ink">{title}</span>
        <span className="block text-sm text-ink-muted">{hint}</span>
      </span>
    </button>
  )
}

/** Chip strip: one chip per event (upcoming first), "Umumiy" last; the selected one scrolls into view */
function EventStrip({ events, selected, onSelect, counts, isPast, generalId }: {
  events: EventOpt[]; selected: string; onSelect: (id: string) => void; counts: Record<string, { open: number }>; isPast: (e: EventOpt) => boolean; generalId: string
}) {
  const activeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { activeRef.current?.scrollIntoView({ inline: "center", block: "nearest" }) }, [selected, events.length])
  const chip = (id: string, label: string, count: number | undefined, past?: boolean, icon?: ReactNode) => {
    const on = selected === id
    return (
      <button key={id} ref={on ? activeRef : undefined} type="button" role="tab" aria-selected={on} onClick={() => onSelect(id)}
        className={`shrink-0 h-10 pl-3.5 pr-2.5 rounded-full text-base font-medium whitespace-nowrap flex items-center gap-2 transition-colors ${
          on ? "bg-accent text-ink-on-accent" : `bg-surface-sunken ${past ? "text-ink-muted" : "text-ink"}`}`}>
        {icon}{label}
        <span className={`min-w-6 h-6 px-1.5 rounded-full text-sm tabular-nums flex items-center justify-center ${on ? "bg-ink-on-accent/20" : "bg-surface"}`}>{count ?? 0}</span>
      </button>
    )
  }
  return (
    <div role="tablist" aria-label="Tadbir" className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:-mx-6 sm:px-6">
      {events.map((e) => chip(e.id, e.name, counts[e.id]?.open, isPast(e), undefined))}
      {chip(generalId, "Umumiy", counts[generalId]?.open, false, <Tray size={16} />)}
    </div>
  )
}

// ─── Nusxa olish ────────────────────────────────────────────────────────────

/** "Nusxa olish" as a bottom sheet: pick the event to copy the tasks from */
export function MobileCopy({ toEventId, events, onClose }: { toEventId: string; events: EventOpt[]; onClose: () => void }) {
  const copy = useCopyEventTasks()
  const [from, setFrom] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [shown, setShown] = useState(true)
  const close = () => !copy.isPending && setShown(false)
  // unmount the sheet once its slide-out has finished
  const unmount = useEffectEvent(onClose)
  useEffect(() => {
    if (shown) return
    const id = window.setTimeout(unmount, 260)
    return () => window.clearTimeout(id)
  }, [shown])
  return (
    <Sheet open={shown} onClose={close} title="Oldingi tadbirdan nusxa"
      footer={(
        <>
          <button type="button" onClick={close} className="h-12 px-5 rounded-full bg-surface-sunken text-ink text-base font-medium">Bekor qilish</button>
          <button type="button" disabled={!from || copy.isPending}
            onClick={() => copy.mutate({ from, to: toEventId }, { onSuccess: () => setShown(false), onError: (e) => setError(e.message) })}
            className="h-12 flex-1 rounded-full bg-accent text-ink-on-accent text-base font-semibold disabled:bg-mute-soft disabled:text-ink-muted">
            {copy.isPending ? "Ko'chirilmoqda…" : "Nusxa olish"}
          </button>
        </>
      )}>
      <p className="text-sm text-ink-muted pb-3">Tanlangan tadbirning vazifalari bo'lim va mas'ullari bilan shu tadbirga qo'shiladi. Holat, muddat va izohlar ko'chmaydi.</p>
      {error && <div role="alert" className="mb-3 px-3 py-2 rounded-control text-sm font-medium bg-danger-soft text-danger-dark">{error}</div>}
      <div className="flex flex-col gap-1">
        {events.filter((e) => e.id !== toEventId).map((e) => (
          <button key={e.id} type="button" onClick={() => setFrom(e.id)} role="radio" aria-checked={from === e.id}
            className="w-full flex items-center gap-3 min-h-14 px-3 rounded-item text-left active:bg-mute-ghost-hover">
            <CalendarBlank size={20} className="text-ink-muted shrink-0" />
            <span className="flex-1 min-w-0 text-base text-ink font-medium">{e.name}</span>
            {e.date && <span className="text-sm text-ink-muted whitespace-nowrap">{shortDate(e.date)}</span>}
            <span className="size-5 flex items-center justify-center shrink-0">{from === e.id && <Check size={18} className="text-ink" />}</span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}
