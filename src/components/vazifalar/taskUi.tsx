/* eslint-disable react-refresh/only-export-components -- small shared pieces of the Vazifalar page */
import { ChatCircle } from "@phosphor-icons/react"
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

/** Status pill that is also a native select — one click to change */
export function StatusSelect({ value, onChange, label }: { value: TaskStatus; onChange: (s: TaskStatus) => void; label: string }) {
  const v = STATUS_VARIANTS[STATUS_VARIANT[value]]
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as TaskStatus)}
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
      className="h-7 pl-2.5 rounded-tag text-sm font-medium border-0 cursor-pointer focus:outline-none"
      style={{ backgroundColor: v.bg, color: v.text }}
    >
      {TASK_STATUSES.map((s) => (
        <option key={s.id} value={s.id}>{s.label}</option>
      ))}
    </select>
  )
}

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("")

export function Owner({ task, compact }: { task: Task; compact?: boolean }) {
  const name = ownerName(task)
  if (!name) return <span className="text-sm text-ink-faint">Belgilanmagan</span>
  const outside = !task.assignee_id
  return (
    <span className="flex items-center gap-2 min-w-0">
      {task.assignee?.avatar_url ? (
        <img src={task.assignee.avatar_url} alt="" className="size-6 rounded-full object-cover shrink-0" />
      ) : (
        <span className={`size-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-semibold ${outside ? "border border-dashed border-line text-ink-muted" : "bg-mute-soft text-ink-muted"}`}>
          {initials(name)}
        </span>
      )}
      {!compact && <span className="text-sm text-ink truncate">{name}</span>}
    </span>
  )
}

export function DueDate({ task, today }: { task: Task; today: string }) {
  if (!task.due_date) return <span className="text-sm text-ink-faint">—</span>
  const late = isOverdue(task, today)
  return (
    <span className={`text-sm tabular-nums whitespace-nowrap ${late ? "text-danger-text font-medium" : task.due_date === today && isOpen(task) ? "text-warning-text font-medium" : "text-ink-muted"}`}>
      {task.due_date === today ? "Bugun" : formatDate(task.due_date)}
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
