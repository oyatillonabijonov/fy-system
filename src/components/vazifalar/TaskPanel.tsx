import { useId, useRef, useState } from "react"
import { motion } from "framer-motion"
import { X, Trash, PaperPlaneRight, LinkSimple, FilePdf, FileImage, File as FileIcon, YoutubeLogo, Paperclip, Plus } from "@phosphor-icons/react"
import { useDialog } from "@/hooks/useDialog"
import { useUsers } from "@/hooks/useUsers"
import { useEvents } from "@/hooks/useEvents"
import { useAuth } from "@/context/AuthContext"
import { useEventSections, useUpdateTask, useDeleteTask, useTaskComments, useAddTaskComment, useTaskAttachments, useAddTaskLink, useAddTaskFile, useDeleteTaskAttachment } from "@/hooks/useTasks"
import { ATTACH_ACCEPT, taskFileUrl, type TaskAttachment } from "@/lib/supabase/queries/tasks"
import type { Task, TaskDraft } from "@/lib/supabase/queries/tasks"
import { tashkentToday } from "@/lib/period"
import { EventPicker, SectionPicker, OwnerPicker, DuePicker, StatusPicker, PersonDot } from "./pickers"

/** An existing task in a centred modal: every change saves at once; comments below */
export function TaskPanel({ task, onClose }: { task: Task; onClose: () => void }) {
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
  // bo'limlar of wherever the task sits now — follows a move to another event
  const sections = useEventSections(t.event_id)
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
              onChange={(id) => { save({ event_id: id });   // the bo'lim (vazifa turi) moves with the task
                setT((c) => ({ ...c, event: id ? { name: events.find((e) => e.id === id)?.name ?? "" } : null })) }} />
            <SectionPicker value={t.section} sections={sections} onChange={(section) => save({ section })} />
          </div>

          <Instructions taskId={task.id} />
          <Comments taskId={task.id} />
        </div>
      </motion.div>
    </div>
  )
}

const fmtSize = (b: number | null) => (b == null ? "" : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`)

function AttachIcon({ a }: { a: TaskAttachment }) {
  if (a.url) return /youtu\.?be/i.test(a.url) ? <YoutubeLogo size={20} className="text-danger-text" /> : <LinkSimple size={20} className="text-info-text" />
  if (/\.pdf$/i.test(a.file_path ?? "")) return <FilePdf size={20} className="text-danger-text" />
  if (/\.(jpe?g|png|webp)$/i.test(a.file_path ?? "")) return <FileImage size={20} className="text-success-text" />
  return <FileIcon size={20} className="text-ink-muted" />
}

/** Yo'riqnoma: links (video, Drive…) and files anyone on the team can add (071) */
function Instructions({ taskId }: { taskId: string }) {
  const { user } = useAuth()
  const { data: items = [] } = useTaskAttachments(taskId)
  const addLink = useAddTaskLink()
  const addFile = useAddTaskFile()
  const remove = useDeleteTaskAttachment()
  const [linking, setLinking] = useState(false)
  const [url, setUrl] = useState("")
  const [title, setTitle] = useState("")
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const busy = addLink.isPending || addFile.isPending

  async function open(a: TaskAttachment) {
    if (a.url) return void window.open(a.url, "_blank", "noopener")
    // open the tab first (a popup opened after an await is blocked), then point it at the signed URL
    const w = window.open("", "_blank")
    try { const u = await taskFileUrl(a.file_path!); if (w) w.location.href = u } catch (e) { w?.close(); setError(e instanceof Error ? e.message : "Faylni ochib bo'lmadi") }
  }
  function saveLink() {
    if (!url.trim()) return
    setError(null)
    addLink.mutate({ taskId, url, title }, { onSuccess: () => { setUrl(""); setTitle(""); setLinking(false) }, onError: (e) => setError(e.message) })
  }
  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ""
    if (!f) return
    setError(null)
    addFile.mutate({ taskId, file: f }, { onError: (err) => setError(err.message) })
  }

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-medium text-ink-muted flex items-center gap-1.5"><Paperclip size={16} /> Yo'riqnoma{items.length ? ` · ${items.length}` : ""}</h4>
        <div className="flex-1" />
        <button type="button" onClick={() => setLinking((v) => !v)} className="flex items-center gap-1 h-7 px-2.5 rounded-full text-sm font-medium text-ink bg-mute-soft hover:bg-mute-soft-hover transition-colors">
          <Plus size={12} weight="bold" /> Havola
        </button>
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="flex items-center gap-1 h-7 px-2.5 rounded-full text-sm font-medium text-ink bg-mute-soft hover:bg-mute-soft-hover transition-colors disabled:opacity-50">
          <Plus size={12} weight="bold" /> {addFile.isPending ? "Yuklanmoqda…" : "Fayl"}
        </button>
        <input ref={fileRef} type="file" accept={ATTACH_ACCEPT} onChange={pick} className="hidden" />
      </div>

      {linking && (
        <div className="flex flex-col sm:flex-row gap-2 p-2 rounded-control bg-surface-sunken">
          <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtube.com/… yoki Drive havola"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveLink() } if (e.key === "Escape") { e.preventDefault(); setLinking(false) } }}
            className="flex-1 min-w-0 h-9 px-2.5 rounded-item bg-surface text-base text-ink placeholder:text-ink-faint focus:outline-none" />
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nomi (ixtiyoriy)"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveLink() } }}
            className="sm:w-44 h-9 px-2.5 rounded-item bg-surface text-base text-ink placeholder:text-ink-faint focus:outline-none" />
          <button type="button" onClick={saveLink} disabled={!url.trim() || busy}
            className="h-9 px-4 rounded-item bg-accent text-ink-on-accent text-base font-medium disabled:opacity-40">Qo'shish</button>
        </div>
      )}
      {error && <p role="alert" className="text-sm font-medium text-danger-text">{error}</p>}

      {items.length === 0 && !linking ? (
        <span className="text-sm text-ink-faint">Video, PDF yoki havola — yangi hodim shu vazifani qanday bajarishni bilishi uchun.</span>
      ) : (
        <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
          {items.map((a) => (
            <div key={a.id} className="group flex items-center gap-3 px-3 py-2 rounded-control bg-surface-sunken">
              <AttachIcon a={a} />
              <button type="button" onClick={() => open(a)} className="min-w-0 flex-1 flex flex-col text-left">
                <span className="text-base font-medium text-ink truncate hover:underline">{a.title}</span>
                <span className="text-sm text-ink-muted truncate">{a.url ? a.url.replace(/^https?:\/\/(www\.)?/, "") : fmtSize(a.file_size)}</span>
              </button>
              {(a.created_by === user?.id || user?.role === "admin") && (
                <button type="button" aria-label="O'chirish" title="O'chirish" onClick={() => window.confirm(`"${a.title}" o'chirilsinmi?`) && remove.mutate(a.id)}
                  className="p-1.5 rounded-item text-ink-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-danger-text hover:bg-danger-soft transition">
                  <Trash size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
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
          className="size-8 shrink-0 flex items-center justify-center rounded-full bg-accent text-ink-on-accent disabled:bg-mute-soft disabled:text-ink-muted transition-colors">
          <PaperPlaneRight size={16} />
        </button>
      </div>
    </section>
  )
}
