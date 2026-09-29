/* eslint-disable react-refresh/only-export-components -- small shared pieces of the Vazifalar page */
import { CaretDown, ChatCircle, CheckCircle, Circle, CircleHalf, XCircle, CalendarBlank } from "@phosphor-icons/react"
import { STATUS_VARIANTS, type StatusVariant } from "@/lib/constants/theme"
import { TASK_STATUSES, type Task, type TaskStatus } from "@/lib/supabase/queries/tasks"
import { formatDate } from "@/lib/format"

export const STATUS_VARIANT: Record<TaskStatus, StatusVariant> = {
  todo: "neutral",
  in_progress: "info",
  done: "success",
  failed: "danger",
}

export const statusLabel = (s: TaskStatus) => TASK_STATUSES.find((x) => x.id === s)!.label

const isOpen = (t: Pick<Task, "status">) => t.status === "todo" || t.status === "in_progress"
/** Past its date and still open — shown red; never stored */
export const isOverdue = (t: Pick<Task, "status" | "due_date">, today: string) => isOpen(t) && !!t.due_date && t.due_date < today

export const ownerName = (t: Pick<Task, "assignee" | "assignee_name">) => t.assignee?.full_name ?? t.assignee_name ?? null

// Data colours (like eventTint): mid tones that read on light and dark grounds.
// Chips use them as a translucent wash under normal ink text, bars as solid.
const PALETTE = ["#7F77DD", "#1D9E75", "#D85A30", "#D4537E", "#378ADD", "#BA7517", "#639922", "#888780"]
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0) >>> 0
/** A section's colour: its position among the event's sections, so neighbours never clash */
export const sectionColor = (section: string, sections: string[]) => {
  const i = sections.indexOf(section)
  return PALETTE[(i >= 0 ? i : hash(section)) % PALETTE.length]
}
const personColor = (name: string) => PALETTE[hash(name) % (PALETTE.length - 1)]

export function SectionChip({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-sm font-medium text-ink whitespace-nowrap" style={{ backgroundColor: `${color}26` }}>
      <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </span>
  )
}

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("")

export function Avatar({ task, size = 24 }: { task: Task; size?: number }) {
  const name = ownerName(task)
  if (!name) return null
  if (task.assignee?.avatar_url) {
    return <img src={task.assignee.avatar_url} alt={name} title={name} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
  }
  const c = personColor(name)
  return (
    <span title={name} className={`rounded-full shrink-0 inline-flex items-center justify-center font-semibold text-ink ${task.assignee_id ? "" : "border border-dashed"}`}
      style={{ width: size, height: size, fontSize: size * 0.4, backgroundColor: `${c}33`, borderColor: c }}>
      {initials(name)}
    </span>
  )
}

export function Owner({ task }: { task: Task }) {
  const name = ownerName(task)
  if (!name) return <span className="text-sm text-ink-faint">—</span>
  return (
    <span className="flex items-center gap-2 min-w-0">
      <Avatar task={task} />
      <span className="text-sm text-ink truncate">{name.split(" ")[0]}</span>
    </span>
  )
}

/** Due date as a chip: red when overdue, amber today, quiet otherwise */
export function DueChip({ task, today }: { task: Task; today: string }) {
  if (!task.due_date) return null
  const late = isOverdue(task, today)
  const now = task.due_date === today && isOpen(task)
  const cls = late ? "bg-danger-soft text-danger-text" : now ? "bg-warning-soft text-warning-text" : "bg-surface-sunken text-ink-muted"
  return (
    <span className={`inline-flex items-center gap-1 h-6 px-2 rounded-full text-sm tabular-nums whitespace-nowrap ${cls}`}>
      <CalendarBlank size={12} weight="bold" />
      {now ? "Bugun" : formatDate(task.due_date)}
    </span>
  )
}

export function CommentCount({ n }: { n: number }) {
  if (!n) return null
  return (
    <span className="flex items-center gap-1 text-sm text-ink-muted tabular-nums">
      <ChatCircle size={16} />{n}
    </span>
  )
}

const STATUS_ICON = { todo: Circle, in_progress: CircleHalf, done: CheckCircle, failed: XCircle } as const

/** The round mark in front of a task: one click completes it (or reopens a done one) */
export function StatusMark({ task, onChange }: { task: Task; onChange: (s: TaskStatus) => void }) {
  const Icon = STATUS_ICON[task.status]
  const v = STATUS_VARIANTS[STATUS_VARIANT[task.status]]
  const next: TaskStatus = task.status === "done" ? "todo" : "done"
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onChange(next) }}
      aria-label={task.status === "done" ? "Qayta ochish" : "Bajarildi deb belgilash"} title={task.status === "done" ? "Qayta ochish" : "Bajarildi"}
      className="size-7 -m-1 shrink-0 flex items-center justify-center rounded-full hover:bg-mute-ghost-hover transition-colors"
      style={{ color: task.status === "todo" ? "var(--ds-color-text-faint)" : v.text }}>
      <Icon size={20} weight={task.status === "todo" ? "regular" : "fill"} />
    </button>
  )
}

/** Status pill that is also a native select — one click to change */
export function StatusSelect({ value, onChange, label }: { value: TaskStatus; onChange: (s: TaskStatus) => void; label: string }) {
  const v = STATUS_VARIANTS[STATUS_VARIANT[value]]
  return (
    <span className="relative inline-flex items-center" onClick={(e) => e.stopPropagation()}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as TaskStatus)}
        aria-label={label}
        className="appearance-none h-6 pl-2.5 pr-6 rounded-full text-sm font-medium border-0 cursor-pointer focus:outline-none"
        style={{ backgroundColor: v.bg, color: v.text }}
      >
        {TASK_STATUSES.map((s) => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>
      <CaretDown size={12} weight="bold" className="absolute right-2 pointer-events-none" style={{ color: v.text }} />
    </span>
  )
}
