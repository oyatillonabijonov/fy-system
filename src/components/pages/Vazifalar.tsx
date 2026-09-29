import { useId, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Plus, Copy, Rows, Kanban, CheckCircle, CaretDown } from "@phosphor-icons/react"
import { useAuth } from "@/context/AuthContext"
import { useEvents } from "@/hooks/useEvents"
import { useUsers } from "@/hooks/useUsers"
import { useEventTasks, useMyTasks, useUpdateTask, useCopyEventTasks } from "@/hooks/useTasks"
import type { Task, TaskStatus } from "@/lib/supabase/queries/tasks"
import { tashkentToday } from "@/lib/period"
import { TaskModal } from "@/components/vazifalar/TaskModal"
import { TaskKanban } from "@/components/vazifalar/TaskKanban"
import { StatusSelect, StatusMark, Owner, DueChip, CommentCount, SectionChip, sectionColor } from "@/components/vazifalar/taskUi"
import { ModalShell, INPUT, LABEL } from "@/components/moliya/PaymentActionModals"

const GENERAL = "umumiy"
const VIEW_KEY = "fy_tasks_view"
// toolbar selects size to their content (INPUT is full-width for forms)
const PICK = "h-control-md border border-line rounded-control px-3 text-base text-ink bg-surface focus:outline-none focus:border-line-focus transition-colors"
const NO_SECTION = "Bo'limsiz"

type Editing = { task: Task | null; section?: string | null; status?: TaskStatus } | null

export function Vazifalar() {
  const [params, setParams] = useSearchParams()
  const tab = params.get("tab") === "mine" ? "mine" : "event"
  const setTab = (t: "mine" | "event") => setParams((p) => { p.set("tab", t); return p }, { replace: true })

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div role="tablist" aria-label="Vazifalar" className="inline-flex self-start gap-1 p-1 rounded-control bg-surface-sunken">
        {([["event", "Tadbirlar bo'yicha"], ["mine", "Mening vazifalarim"]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`h-8 px-4 rounded-item text-base font-medium transition-colors ${tab === id ? "bg-surface text-ink" : "text-ink-muted hover:text-ink"}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "mine" ? <MyTasks /> : <EventTasks />}
    </div>
  )
}

// ─── Tadbirlar bo'yicha ─────────────────────────────────────────────────────

function EventTasks() {
  const [params, setParams] = useSearchParams()
  const { data: events = [] } = useEvents()
  const { data: users = [] } = useUsers()
  const today = tashkentToday()

  // Default: the nearest event still ahead, else the latest one, else "Umumiy"
  const fallback = useMemo(() => {
    const dated = events.filter((e) => e.date).sort((a, b) => a.date!.localeCompare(b.date!))
    return (dated.find((e) => (e.end_date ?? e.date)!.slice(0, 10) >= today) ?? dated[dated.length - 1])?.id ?? GENERAL
  }, [events, today])
  const selected = params.get("event") ?? fallback
  const eventId = selected === GENERAL ? null : selected
  const setEvent = (id: string) => setParams((p) => { p.set("event", id); return p }, { replace: true })

  const [view, setViewState] = useState<"list" | "kanban">(() => {
    try { return localStorage.getItem(VIEW_KEY) === "kanban" ? "kanban" : "list" } catch { return "list" }
  })
  const setView = (v: "list" | "kanban") => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v) } catch { /* private browsing */ } }
  const [ownerFilter, setOwnerFilter] = useState("")
  const [editing, setEditing] = useState<Editing>(null)
  const [copying, setCopying] = useState(false)

  const { data: tasks = [], isLoading } = useEventTasks(eventId)
  const shown = ownerFilter ? tasks.filter((t) => (ownerFilter === "outside" ? !t.assignee_id && t.assignee_name : t.assignee_id === ownerFilter)) : tasks
  const sections = useMemo(() => [...new Set(tasks.map((t) => t.section).filter((s): s is string => !!s))], [tasks])
  const done = tasks.filter((t) => t.status === "done").length
  const nextSort = tasks.reduce((m, t) => Math.max(m, t.sort_order), 0) + 1

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Tadbir" value={selected} onChange={(e) => setEvent(e.target.value)} className={`${PICK} min-w-[220px] max-w-[320px]`}>
          {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          <option value={GENERAL}>Umumiy vazifalar</option>
        </select>
        <select aria-label="Mas'ul" value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} className={PICK}>
          <option value="">Barcha mas'ullar</option>
          {users.filter((u) => u.is_active).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          <option value="outside">Tashqi mas'ullar</option>
        </select>
        <div role="radiogroup" aria-label="Ko'rinish" className="inline-flex gap-1 p-1 rounded-control bg-surface-sunken">
          {([["list", "Ro'yxat", Rows], ["kanban", "Kanban", Kanban]] as const).map(([id, label, Icon]) => (
            <button key={id} role="radio" aria-checked={view === id} onClick={() => setView(id)}
              className={`h-7 px-3 flex items-center gap-1.5 rounded-item text-sm font-medium transition-colors ${view === id ? "bg-surface text-ink" : "text-ink-muted hover:text-ink"}`}>
              <Icon size={16} />{label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {tasks.length > 0 && (
          <span className="flex items-center gap-1.5 text-sm text-ink-muted tabular-nums">
            <CheckCircle size={16} />{done}/{tasks.length} bajarildi
          </span>
        )}
        {eventId && (
          <button onClick={() => setCopying(true)} className="h-control-md px-3 flex items-center gap-1.5 rounded-control text-base font-medium text-ink hover:bg-mute-ghost-hover transition-colors">
            <Copy size={16} />Nusxa olish
          </button>
        )}
        <button onClick={() => setEditing({ task: null })} className="h-control-md px-4 flex items-center gap-1.5 rounded-control bg-accent text-ink-on-accent text-base font-medium hover:bg-accent-hover transition-colors">
          <Plus size={16} />Vazifa
        </button>
      </div>

      {isLoading ? (
        <Empty text="Yuklanmoqda…" />
      ) : tasks.length === 0 ? (
        <Empty text={eventId ? "Bu tadbirda hali vazifa yo'q. Yangi qo'shing yoki oldingi tadbirdan nusxa oling." : "Umumiy vazifalar yo'q"} />
      ) : view === "kanban" ? (
        <TaskKanban tasks={shown} sections={sections} today={today} onOpen={(t) => setEditing({ task: t })} onAdd={(status) => setEditing({ task: null, status })} />
      ) : (
        <SectionList tasks={shown} sections={sections} today={today} onOpen={(t) => setEditing({ task: t })} onAdd={(section) => setEditing({ task: null, section })} />
      )}

      {editing && (
        <TaskModal
          task={editing.task}
          defaults={{ event_id: eventId, section: editing.section, status: editing.status }}
          sections={sections}
          nextSortOrder={nextSort}
          onClose={() => setEditing(null)}
        />
      )}
      {copying && eventId && <CopyModal toEventId={eventId} onClose={() => setCopying(false)} />}
    </div>
  )
}

/** ClickUp-style: one collapsible block per bo'lim (in first-appearance order) with its progress */
function SectionList({ tasks, sections, today, onOpen, onAdd }: {
  tasks: Task[]; sections: string[]; today: string; onOpen: (t: Task) => void; onAdd: (section: string | null) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const groups = useMemo(() => {
    const m = new Map<string, Task[]>()
    for (const t of tasks) {
      const k = t.section ?? NO_SECTION
      m.set(k, [...(m.get(k) ?? []), t])
    }
    return [...m.entries()]
  }, [tasks])
  const toggle = (k: string) => setCollapsed((c) => { const n = new Set(c); if (n.has(k)) n.delete(k); else n.add(k); return n })

  return (
    <div className="flex flex-col gap-4">
      {groups.map(([section, rows]) => {
        const done = rows.filter((t) => t.status === "done").length
        const color = section === NO_SECTION ? "#888780" : sectionColor(section, sections)
        const open = !collapsed.has(section)
        return (
          <section key={section} className="rounded-surface border border-line overflow-hidden">
            <button type="button" onClick={() => toggle(section)} aria-expanded={open}
              className="w-full flex items-center gap-3 px-3 h-11 bg-surface-sunken text-left">
              <CaretDown size={16} className={`text-ink-muted transition-transform ${open ? "" : "-rotate-90"}`} />
              <SectionChip name={section} color={color} />
              <span className="text-sm text-ink-muted tabular-nums">{done}/{rows.length}</span>
              <span className="w-28 h-1.5 rounded-full bg-mute-soft overflow-hidden">
                <span className="block h-full rounded-full" style={{ width: `${(done / rows.length) * 100}%`, backgroundColor: color }} />
              </span>
            </button>
            {open && (
              <div className="flex flex-col">
                {rows.map((t) => <TaskRow key={t.id} task={t} today={today} onOpen={onOpen} />)}
                <button onClick={() => onAdd(section === NO_SECTION ? null : section)}
                  className="flex items-center gap-2 pl-4 h-10 border-t border-line text-sm font-medium text-ink-muted hover:text-ink hover:bg-mute-ghost-hover transition-colors text-left">
                  <Plus size={12} weight="bold" />Vazifa qo'shish
                </button>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

/** One task line: round mark (one click = done), title, owner, due chip, comments, status */
function TaskRow({ task: t, today, onOpen, context }: { task: Task; today: string; onOpen: (t: Task) => void; context?: boolean }) {
  const update = useUpdateTask()
  const setStatus = (status: TaskStatus) => update.mutate({ id: t.id, patch: { status } })
  return (
    <div role="button" tabIndex={0} onClick={() => onOpen(t)} onKeyDown={(e) => { if (e.key === "Enter") onOpen(t) }}
      className="grid grid-cols-[28px_minmax(0,1fr)_auto] md:grid-cols-[28px_minmax(0,1fr)_150px_112px_36px_128px] items-center gap-3 px-3 py-2.5 border-t border-line first:border-t-0 hover:bg-mute-ghost-hover cursor-pointer transition-colors">
      <StatusMark task={t} onChange={setStatus} />
      <span className="flex flex-col min-w-0">
        <span className={`text-base ${t.status === "done" ? "text-ink-muted line-through" : "text-ink"}`}>{t.title}</span>
        {context && <span className="text-sm text-ink-muted truncate">{t.event?.name ?? "Umumiy"}{t.section ? ` · ${t.section}` : ""}</span>}
      </span>
      <span className="hidden md:flex min-w-0"><Owner task={t} /></span>
      <span className="hidden md:block"><DueChip task={t} today={today} /></span>
      <span className="hidden md:block"><CommentCount n={t.comments_count} /></span>
      <span className="justify-self-end">
        <StatusSelect value={t.status} label={`${t.title} holati`} onChange={setStatus} />
      </span>
    </div>
  )
}

function CopyModal({ toEventId, onClose }: { toEventId: string; onClose: () => void }) {
  const { data: events = [] } = useEvents()
  const copy = useCopyEventTasks()
  const [from, setFrom] = useState("")
  const [error, setError] = useState<string | null>(null)
  const fromId = useId()
  return (
    <ModalShell
      title="Oldingi tadbirdan nusxa"
      error={error}
      submitLabel="Nusxa olish"
      canSubmit={!!from}
      pending={copy.isPending}
      onClose={onClose}
      onSubmit={() => copy.mutate({ from, to: toEventId }, {
        onSuccess: (n) => { window.alert(`${n} ta vazifa ko'chirildi`); onClose() },
        onError: (e) => setError(e.message),
      })}
    >
      <p className="text-sm text-ink-muted">Tanlangan tadbirning vazifalari bo'lim va mas'ullari bilan shu tadbirga qo'shiladi. Holat, muddat va izohlar ko'chmaydi.</p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={fromId} className={LABEL}>Qaysi tadbirdan</label>
        <select id={fromId} value={from} onChange={(e) => setFrom(e.target.value)} className={INPUT}>
          <option value="" disabled>Tadbirni tanlang</option>
          {events.filter((e) => e.id !== toEventId).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
    </ModalShell>
  )
}

// ─── Mening vazifalarim ─────────────────────────────────────────────────────

function MyTasks() {
  const { user } = useAuth()
  const { data: tasks = [], isLoading } = useMyTasks(user?.id)
  const [editing, setEditing] = useState<Task | null>(null)
  const today = tashkentToday()
  const weekEnd = addDays(today, 7)

  const buckets = useMemo(() => {
    const b: [string, Task[]][] = [["Muddati o'tgan", []], ["Bugun", []], ["Shu hafta", []], ["Keyinroq", []], ["Muddatsiz", []]]
    for (const t of tasks) {
      const i = !t.due_date ? 4 : t.due_date < today ? 0 : t.due_date === today ? 1 : t.due_date <= weekEnd ? 2 : 3
      b[i][1].push(t)
    }
    return b.filter(([, rows]) => rows.length)
  }, [tasks, today, weekEnd])

  if (isLoading) return <Empty text="Yuklanmoqda…" />
  if (tasks.length === 0) return <Empty text="Sizda ochiq vazifa yo'q" />

  return (
    <div className="flex flex-col gap-4">
      {buckets.map(([title, rows]) => (
        <section key={title} className="rounded-surface border border-line overflow-hidden">
          <div className="flex items-center gap-2 px-4 h-11 bg-surface-sunken">
            <h2 className={`text-base font-semibold ${title === "Muddati o'tgan" ? "text-danger-text" : "text-ink"}`}>{title}</h2>
            <span className="text-sm text-ink-muted tabular-nums">{rows.length}</span>
          </div>
          {rows.map((t) => <TaskRow key={t.id} task={t} today={today} onOpen={setEditing} context />)}
        </section>
      ))}
      {editing && <TaskModal task={editing} sections={[]} nextSortOrder={0} onClose={() => setEditing(null)} />}
    </div>
  )
}

/** "YYYY-MM-DD" + n days, calendar arithmetic (no clock, no timezone) */
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function Empty({ text }: { text: string }) {
  return <div className="bg-surface-sunken rounded-surface py-12 px-6 text-center text-base text-ink-muted">{text}</div>
}
