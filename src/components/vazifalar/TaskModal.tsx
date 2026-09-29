import { useId, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Trash, PaperPlaneRight } from "@phosphor-icons/react"
import { useDialog } from "@/hooks/useDialog"
import { useUsers } from "@/hooks/useUsers"
import { useEvents } from "@/hooks/useEvents"
import { useAuth } from "@/context/AuthContext"
import { useCreateTask, useUpdateTask, useDeleteTask, useTaskComments, useAddTaskComment } from "@/hooks/useTasks"
import { TASK_STATUSES, type Task, type TaskStatus } from "@/lib/supabase/queries/tasks"
import { INPUT, LABEL } from "@/components/moliya/PaymentActionModals"
import { STATUS_VARIANT } from "./taskUi"
import { STATUS_VARIANTS } from "@/lib/constants/theme"

const OUTSIDE = "__outside__"

/** Create (task = null) or edit a task; comments only once it exists. Mounted only while open. */
export function TaskModal({
  task,
  defaults,
  sections,
  nextSortOrder,
  onClose,
}: {
  task: Task | null
  defaults?: { event_id: string | null; section?: string | null; status?: TaskStatus }
  sections: string[]
  nextSortOrder: number
  onClose: () => void
}) {
  const { user } = useAuth()
  const { data: users = [] } = useUsers()
  const { data: events = [] } = useEvents()
  const create = useCreateTask()
  const update = useUpdateTask()
  const remove = useDeleteTask()
  const staff = users.filter((u) => u.is_active)

  const [title, setTitle] = useState(task?.title ?? "")
  const [eventId, setEventId] = useState<string>(task ? (task.event_id ?? "") : (defaults?.event_id ?? ""))
  const [section, setSection] = useState(task?.section ?? defaults?.section ?? "")
  const [owner, setOwner] = useState(task?.assignee_id ?? (task?.assignee_name ? OUTSIDE : ""))
  const [outsideName, setOutsideName] = useState(task?.assignee_name ?? "")
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? defaults?.status ?? "todo")
  const [due, setDue] = useState(task?.due_date ?? "")
  const [error, setError] = useState<string | null>(null)

  const pending = create.isPending || update.isPending || remove.isPending
  const guardedClose = () => !pending && onClose()
  const panelRef = useDialog<HTMLDivElement>(guardedClose, true)
  const ids = { title: useId(), heading: useId(), event: useId(), section: useId(), sections: useId(), owner: useId(), outside: useId(), due: useId() }
  const canSave = title.trim().length > 0 && (owner !== OUTSIDE || outsideName.trim().length > 0) && !pending
  const canDelete = !!task && (task.created_by === user?.id || user?.role === "admin")

  function save() {
    if (!canSave) return
    const draft = {
      title: title.trim(),
      event_id: eventId || null,
      section: section.trim() || null,
      status,
      assignee_id: owner && owner !== OUTSIDE ? owner : null,
      assignee_name: owner === OUTSIDE ? outsideName.trim() : null,
      due_date: due || null,
    }
    const done = { onSuccess: onClose, onError: (e: Error) => setError(e.message) }
    if (task) update.mutate({ id: task.id, patch: draft }, done)
    else create.mutate({ ...draft, sort_order: nextSortOrder }, done)
  }

  function del() {
    if (!task || !window.confirm(`"${task.title}" vazifasi o'chirilsinmi?`)) return
    remove.mutate(task.id, { onSuccess: onClose, onError: (e) => setError(e.message) })
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={guardedClose} className="absolute inset-0 bg-surface-overlay backdrop-blur-sm" />
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={ids.heading}
          tabIndex={-1}
          initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }}
          className="bg-surface-raised rounded-overlay w-full max-w-lg relative flex flex-col max-h-[90vh]"
        >
          <div className="p-5 border-b border-line flex items-center justify-between">
            <h3 id={ids.heading} className="text-md font-semibold text-ink">{task ? "Vazifa" : "Yangi vazifa"}</h3>
            <button onClick={guardedClose} aria-label="Yopish" className="p-1 hover:bg-mute-ghost-hover rounded-full transition-all">
              <X size={20} className="text-ink-muted" />
            </button>
          </div>

          <div className="p-5 flex flex-col gap-4 overflow-y-auto">
            {error && <div role="alert" className="px-3 py-2 rounded-control text-sm font-medium bg-danger-soft text-danger-dark">{error}</div>}

            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.title} className={LABEL}>Vazifa *</label>
              <textarea id={ids.title} value={title} onChange={(e) => setTitle(e.target.value)} rows={2} autoFocus={!task} className={`${INPUT} resize-none`} placeholder="Masalan: Resort shortlistini tuzish" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor={ids.event} className={LABEL}>Tadbir</label>
                <select id={ids.event} value={eventId} onChange={(e) => setEventId(e.target.value)} className={INPUT}>
                  <option value="">Umumiy</option>
                  {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={ids.section} className={LABEL}>Bo'lim</label>
                <input id={ids.section} list={ids.sections} value={section} onChange={(e) => setSection(e.target.value)} className={INPUT} placeholder="Masalan: Marketing" />
                <datalist id={ids.sections}>{sections.map((s) => <option key={s} value={s} />)}</datalist>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor={ids.owner} className={LABEL}>Mas'ul</label>
                <select id={ids.owner} value={owner} onChange={(e) => setOwner(e.target.value)} className={INPUT}>
                  <option value="">Belgilanmagan</option>
                  {staff.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  <option value={OUTSIDE}>Tashqi odam…</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={ids.due} className={LABEL}>Muddat</label>
                <input id={ids.due} type="date" value={due} onChange={(e) => setDue(e.target.value)} className={INPUT} />
              </div>
            </div>

            {owner === OUTSIDE && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={ids.outside} className={LABEL}>Tashqi mas'ul ismi *</label>
                <input id={ids.outside} value={outsideName} onChange={(e) => setOutsideName(e.target.value)} className={INPUT} placeholder="Masalan: Hikmat aka" />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <span className={LABEL}>Holat</span>
              <div role="radiogroup" aria-label="Holat" className="grid grid-cols-4 gap-1 p-1 rounded-control bg-surface-sunken">
                {TASK_STATUSES.map((s) => {
                  const on = status === s.id
                  const v = STATUS_VARIANTS[STATUS_VARIANT[s.id]]
                  return (
                    <button key={s.id} type="button" role="radio" aria-checked={on} onClick={() => setStatus(s.id)}
                      className={`h-8 rounded-item text-sm font-medium transition-colors ${on ? "" : "text-ink-muted hover:text-ink"}`}
                      style={on ? { backgroundColor: v.bg, color: v.text } : undefined}>
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {task && <Comments taskId={task.id} />}
          </div>

          <div className="p-5 pt-0 flex items-center gap-3">
            {canDelete && (
              <button onClick={del} disabled={pending} aria-label="O'chirish" title="O'chirish"
                className="size-10 flex items-center justify-center rounded-control text-danger-text hover:bg-danger-soft transition-colors disabled:opacity-50">
                <Trash size={18} />
              </button>
            )}
            <button onClick={onClose} disabled={pending} className="flex-1 px-4 py-2.5 bg-mute-soft text-ink rounded-control text-base font-bold hover:bg-mute-soft-hover transition-all disabled:opacity-50">
              Yopish
            </button>
            <button onClick={save} disabled={!canSave}
              className={`flex-1 px-4 py-2.5 rounded-control text-base font-bold transition-all ${canSave ? "bg-accent text-ink-on-accent hover:bg-accent-hover" : "bg-mute-soft text-ink-muted cursor-not-allowed"}`}>
              {pending ? "Saqlanmoqda..." : task ? "Saqlash" : "Qo'shish"}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

function Comments({ taskId }: { taskId: string }) {
  const { data: comments = [], isLoading } = useTaskComments(taskId)
  const add = useAddTaskComment()
  const [body, setBody] = useState("")
  const inputId = useId()

  function send() {
    if (!body.trim() || add.isPending) return
    add.mutate({ taskId, body }, { onSuccess: () => setBody("") })
  }

  return (
    <div className="flex flex-col gap-2 pt-2 border-t border-line">
      <span className={LABEL}>Izohlar</span>
      {isLoading ? (
        <span className="text-sm text-ink-muted">Yuklanmoqda…</span>
      ) : comments.length === 0 ? (
        <span className="text-sm text-ink-faint">Hali izoh yo'q. Natija, kelishuv, raqamlarni shu yerga yozing.</span>
      ) : (
        <div className="flex flex-col gap-2">
          {comments.map((c) => (
            <div key={c.id} className="px-3 py-2 rounded-control bg-surface-sunken">
              <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
                <span className="font-medium">{c.author?.full_name ?? "—"}</span>
                <span className="tabular-nums">{new Date(c.created_at).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <p className="text-base text-ink whitespace-pre-wrap break-words">{c.body}</p>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <label htmlFor={inputId} className="sr-only">Izoh yozish</label>
        <input id={inputId} value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send() }}
          placeholder="Izoh yozish…" className={INPUT} />
        <button onClick={send} disabled={!body.trim() || add.isPending} aria-label="Yuborish"
          className="size-10 shrink-0 flex items-center justify-center rounded-control bg-accent text-ink-on-accent disabled:bg-mute-soft disabled:text-ink-muted transition-colors">
          <PaperPlaneRight size={18} />
        </button>
      </div>
    </div>
  )
}
