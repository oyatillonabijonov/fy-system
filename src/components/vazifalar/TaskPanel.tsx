import { useId, useState } from "react"
import { motion } from "framer-motion"
import { X, Trash, PaperPlaneRight } from "@phosphor-icons/react"
import { useDialog } from "@/hooks/useDialog"
import { useUsers } from "@/hooks/useUsers"
import { useEvents } from "@/hooks/useEvents"
import { useAuth } from "@/context/AuthContext"
import { useUpdateTask, useDeleteTask, useTaskComments, useAddTaskComment } from "@/hooks/useTasks"
import type { Task, TaskDraft } from "@/lib/supabase/queries/tasks"
import { tashkentToday } from "@/lib/period"
import { EventPicker, SectionPicker, OwnerPicker, DuePicker, StatusPicker, PersonDot } from "./pickers"

/** An existing task in a centred modal: every change saves at once; comments below */
export function TaskPanel({ task, sections, onClose }: { task: Task; sections: string[]; onClose: () => void }) {
  const { user } = useAuth()
  const { data: users = [] } = useUsers()
  const { data: events = [] } = useEvents()
  const update = useUpdateTask()
  const remove = useDeleteTask()
  const today = tashkentToday()
  const headingId = useId()
  const panelRef = useDialog<HTMLDivElement>(onClose, true)

  // Local copy so the panel reflects edits at once (the list refetches behind it)
  const [t, setT] = useState(task)
  const [title, setTitle] = useState(task.title)
  const [error, setError] = useState<string | null>(null)
  const canDelete = task.created_by === user?.id || user?.role === "admin"

  function save(patch: Partial<TaskDraft>) {
    setT((cur) => ({ ...cur, ...patch }))
    setError(null)
    update.mutate({ id: task.id, patch })   // a failure shows as a toast (and the change rolls back)
  }
  function saveTitle() {
    const v = title.trim()
    if (!v) return setTitle(t.title)
    if (v !== t.title) save({ title: v })
  }
  function del() {
    if (!window.confirm(`"${t.title}" vazifasi o'chirilsinmi?`)) return
    remove.mutate(task.id, { onSuccess: onClose, onError: (e) => setError(e.message) })
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[8vh]">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} className="absolute inset-0 bg-surface-overlay backdrop-blur-sm" />
      <motion.div
        ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={headingId} tabIndex={-1}
        initial={{ scale: 0.97, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        className="relative w-full max-w-xl bg-surface-raised rounded-overlay flex flex-col max-h-[84vh]"
      >
        <div className="flex items-center justify-between px-5 h-14 border-b border-line shrink-0">
          <span id={headingId} className="text-xs font-medium uppercase tracking-wide text-ink-faint truncate">{t.event?.name ?? "Umumiy vazifalar"}{t.section ? ` › ${t.section}` : ""}</span>
          <span className="flex items-center gap-1">
            {canDelete && (
              <button onClick={del} aria-label="O'chirish" title="O'chirish" className="p-1.5 rounded-item text-ink-muted hover:text-danger-text hover:bg-danger-soft transition-colors">
                <Trash size={18} />
              </button>
            )}
            <button onClick={onClose} aria-label="Yopish" className="p-1.5 rounded-item hover:bg-mute-ghost-hover transition-colors">
              <X size={20} className="text-ink-muted" />
            </button>
          </span>
        </div>

        <div className="flex-1 min-h-0 px-5 py-5 flex flex-col gap-5">
          <textarea value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur() } }}
            rows={2} aria-label="Vazifa nomi"
            className="w-full resize-none bg-transparent text-xl font-semibold text-ink leading-snug focus:outline-none rounded-control -mx-1 px-1 hover:bg-mute-ghost-hover focus:bg-transparent" />

          {error && <div role="alert" className="px-3 py-2 rounded-control text-sm font-medium bg-danger-soft text-danger-dark">{error}</div>}

          {/* Primary: who and by when */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <OwnerPicker tile value={{ assignee_id: t.assignee_id, assignee_name: t.assignee_name }} staff={users.filter((u) => u.is_active)}
              onChange={(o) => { save(o); setT((c) => ({ ...c, assignee: o.assignee_id ? { full_name: users.find((u) => u.id === o.assignee_id)?.full_name ?? "", avatar_url: null } : null })) }} />
            <DuePicker tile date={t.due_date} time={t.due_time?.slice(0, 5) ?? null} today={today} open={t.status === "todo" || t.status === "in_progress"}
              onChange={(d, tm) => save({ due_date: d, due_time: d ? tm : null })} />
          </div>
          {/* Secondary: state and where it belongs */}
          <div className="flex flex-wrap items-center gap-2">
            <StatusPicker value={t.status} onChange={(status) => save({ status })} />
            <EventPicker value={t.event_id} events={events}
              onChange={(id) => { save({ event_id: id, ...(id !== t.event_id ? { section: null } : {}) }); setT((c) => ({ ...c, event: id ? { name: events.find((e) => e.id === id)?.name ?? "" } : null })) }} />
            {t.event_id && <SectionPicker value={t.section} sections={t.event_id === task.event_id ? sections : []} onChange={(section) => save({ section })} />}
          </div>

          <Comments taskId={task.id} />
        </div>
      </motion.div>
    </div>
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
    <section className="flex flex-col gap-3 pt-4 border-t border-line min-h-0 flex-1">
      <h4 className="text-sm font-medium text-ink-muted">Izohlar{comments.length ? ` · ${comments.length}` : ""}</h4>
      {isLoading ? (
        <span className="text-sm text-ink-muted">Yuklanmoqda…</span>
      ) : comments.length === 0 ? (
        <span className="text-sm text-ink-faint">Natija, kelishuv, raqamlarni shu yerga yozing.</span>
      ) : (
        <div className="flex flex-col gap-3 overflow-y-auto min-h-0 max-h-[28vh] pr-1">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2.5">
              <PersonDot name={c.author?.full_name ?? "?"} url={c.author?.avatar_url} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 text-sm">
                  <span className="font-medium text-ink">{c.author?.full_name ?? "—"}</span>
                  <span className="text-ink-faint tabular-nums">{new Date(c.created_at).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <p className="text-base text-ink whitespace-pre-wrap break-words">{c.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 p-2 rounded-control bg-surface-sunken">
        <label htmlFor={inputId} className="sr-only">Izoh yozish</label>
        <textarea id={inputId} value={body} onChange={(e) => setBody(e.target.value)} rows={1}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Izoh yozish…" className="flex-1 resize-none bg-transparent text-base text-ink placeholder:text-ink-faint focus:outline-none py-1.5 px-1" />
        <button onClick={send} disabled={!body.trim() || add.isPending} aria-label="Yuborish"
          className="size-8 shrink-0 flex items-center justify-center rounded-control bg-accent text-ink-on-accent disabled:bg-mute-soft disabled:text-ink-muted transition-colors">
          <PaperPlaneRight size={16} />
        </button>
      </div>
    </section>
  )
}
