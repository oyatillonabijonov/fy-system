import { useEffect, useRef, useState, type ReactNode } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Phone, PhoneIncoming, PhoneOutgoing, Trash, PaperPlaneRight, ArrowsLeftRight, Sparkle, CheckCircle, NotePencil, Tray } from "@phosphor-icons/react"
import { usePhone } from "@/context/PhoneContext"
import { useAuth } from "@/context/AuthContext"
import { useUsers } from "@/hooks/useUsers"
import { useLead, useStages, usePipelines, useNotes, useLeadTasks, useUpdateLead, useDeleteLead, useAddNote, useDeleteNote, useAddTask, useLeadCalls, useRenameClient, SOTUV_KEY } from "@/hooks/useSotuv"
import { useQueryClient } from "@tanstack/react-query"
import { SOURCES, TASK_KINDS, kindLabel, toDue, getStages, subscribeLeadCalls, type Call, type FeedNote, type Lead, type SalesTask, type Stage, type TaskKind } from "@/lib/supabase/queries/sotuv"
import { tashkentToday } from "@/lib/period"
import { formatPhone } from "@/lib/format"
import { DuePicker, PersonDot, addDays } from "@/components/vazifalar/pickers"
import { KIND_ICON, TaskChip, NoTaskChip, Recording, callLabel, secs } from "@/components/sotuv/ui"
import { DoneButton, TaskDone } from "@/components/sotuv/SalesTasks"
import { confirmAction } from "@/lib/confirm"

/** One deal on its own page, like AmoCRM's deal card: fields on the left, the feed on the right */
export function SotuvLead() {
  const { id = "" } = useParams()
  const { data: lead, isLoading } = useLead(id)
  if (isLoading) return <Box>Yuklanmoqda…</Box>
  if (!lead) return <Box>Bitim topilmadi. <Link to="/sotuv" className="underline">Sotuv bo'limiga qaytish</Link></Box>
  return <LeadView key={lead.id} lead={lead} />
}

const Box = ({ children }: { children: ReactNode }) => (
  <div className="bg-surface-sunken rounded-surface py-12 px-6 text-center text-base text-ink-muted">{children}</div>
)

const FIELD = "w-full h-control-md px-3 rounded-control bg-surface border border-line text-base text-ink focus:outline-none focus:border-line-focus transition-colors"

function LeadView({ lead }: { lead: Lead }) {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const { data: pipelines = [] } = usePipelines()
  const { data: stages = [] } = useStages(lead.pipeline_id)
  const { data: users = [] } = useUsers()
  const update = useUpdateLead()
  const remove = useDeleteLead()
  const today = tashkentToday()
  const [name, setName] = useState(lead.name)
  const [price, setPrice] = useState(lead.price ? lead.price.toLocaleString("ru-RU") : "")
  const [reason, setReason] = useState(lead.loss_reason ?? "")
  // A call-created client is named by their phone until the operator types the name
  const rename = useRenameClient()
  const isBareNumber = (v: string) => /^\+?\d[\d\s()-]*$/.test(v)
  const [clientName, setClientName] = useState(lead.client && !isBareNumber(lead.client.full_name) ? lead.client.full_name : "")
  function saveClientName() {
    const v = clientName.trim()
    const old = lead.client?.full_name ?? ""
    if (!lead.client || !v || v === old) { setClientName(lead.client && !isBareNumber(old) ? old : ""); return }
    rename.mutate({ id: lead.client.id, name: v })
    if (lead.name === old) { setName(v); save({ name: v }) }   // a bitim named after its client follows
  }
  const pipeline = pipelines.find((p) => p.id === lead.pipeline_id)
  const stage = stages.find((s) => s.id === lead.stage_id)
  const openStages = stages.filter((s) => !s.is_won && !s.is_lost)
  const save = (patch: Parameters<typeof update.mutate>[0]["patch"]) => update.mutate({ id: lead.id, patch })

  async function movePipeline(pid: string) {
    const first = (await getStages(pid)).find((s) => !s.is_won && !s.is_lost)
    if (first) save({ pipeline_id: pid, stage_id: first.id })
  }
  async function del() {
    if (!(await confirmAction({ title: "Bitimni o'chirish", message: `"${lead.name}" bitimi o'chirilsinmi? Lenta va vazifalar ham o'chadi.` }))) return
    remove.mutate(lead.id, { onSuccess: () => navigate(`/sotuv?p=${lead.pipeline_id}`) })
  }

  return (
    <div className="flex flex-col gap-4">
      <Link to={`/sotuv?p=${lead.pipeline_id}`} className="self-start inline-flex items-center gap-1.5 h-8 px-3 -ml-3 rounded-full text-sm font-medium text-ink-muted hover:text-ink hover:bg-mute-ghost-hover transition-colors">
        <ArrowLeft size={16} />{pipeline?.name ?? "Sotuv bo'limi"}
      </Link>

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)] items-start">
        {/* Left: the deal */}
        <aside className="rounded-surface bg-surface-sunken p-5 flex flex-col gap-5 lg:sticky lg:top-4">
          <div className="flex flex-col gap-3">
            <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Bitim nomi"
              onBlur={() => { const v = name.trim(); if (v && v !== lead.name) save({ name: v }); else setName(lead.name) }}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }}
              className="w-full bg-transparent text-xl font-semibold text-ink focus:outline-none -mx-1 px-1 rounded-item focus:bg-surface" />
            <StageBar stages={stages} current={lead.stage_id} onPick={(s) => save({ stage_id: s.id })} />
            <select value={lead.stage_id} onChange={(e) => save({ stage_id: e.target.value })} aria-label="Bosqich" className={FIELD}>
              {openStages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              <optgroup label="Yakunlash">
                {stages.filter((s) => s.is_won || s.is_lost).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </optgroup>
            </select>
            {stage?.is_lost && (
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Yutqazish sababi"
                onBlur={() => { if (reason.trim() !== (lead.loss_reason ?? "")) save({ loss_reason: reason.trim() || null }) }} className={FIELD} />
            )}
          </div>

          {/* Client */}
          <div className="rounded-control bg-surface p-3.5 flex items-center gap-3">
            <PersonDot name={lead.client?.full_name ?? lead.name} url={lead.client?.image} size={40} />
            <div className="flex-1 min-w-0">
              {lead.client
                ? <input value={clientName} onChange={(e) => setClientName(e.target.value)} aria-label="Mijoz ismi" placeholder="Mijoz ismini yozing"
                    onBlur={saveClientName} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }}
                    className="block w-full bg-transparent text-base font-medium text-ink truncate rounded-item -mx-1 px-1 hover:bg-surface-sunken focus:bg-surface-sunken focus:outline-none" />
                : <span className="block text-base font-medium text-ink truncate">Mijoz biriktirilmagan</span>}
              {lead.client?.phone && <span className="block text-sm text-ink-muted tabular-nums">{formatPhone(lead.client.phone)}</span>}
            </div>
            {lead.client?.phone && <CallButton phone={lead.client.phone} />}
          </div>

          {/* The form's answers, like AmoCRM's deal fields */}
          {lead.fields.length > 0 && (
            <dl className="flex flex-col gap-2.5">
              {lead.fields.map((f) => (
                <div key={f.k} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3">
                  <dt className="text-sm text-ink-muted break-words">{f.k}</dt>
                  <dd className="text-base text-ink break-words">{f.v}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="flex flex-col gap-3">
            <Field label="Summa">
              <input inputMode="numeric" value={price} placeholder="0" className={`${FIELD} tabular-nums`}
                onChange={(e) => { const d = e.target.value.replace(/\D/g, ""); setPrice(d ? Number(d).toLocaleString("ru-RU") : "") }}
                onBlur={() => { const n = Number(price.replace(/\D/g, "")) || 0; if (n !== lead.price) save({ price: n }) }} />
            </Field>
            <Field label="Mas'ul">
              <select value={lead.responsible_user_id ?? ""} onChange={(e) => save({ responsible_user_id: e.target.value || null })} className={FIELD}>
                <option value="">Belgilanmagan</option>
                {users.filter((u) => u.is_active || u.id === lead.responsible_user_id).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </Field>
            <Field label="Manba">
              <select value={lead.source ?? "manual"} onChange={(e) => save({ source: e.target.value })} className={FIELD}>
                {!SOURCES.some((s) => s.id === lead.source) && lead.source && <option value={lead.source}>{lead.source}</option>}
                {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Voronka">
              <select value={lead.pipeline_id} onChange={(e) => movePipeline(e.target.value)} className={FIELD}>
                {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          </div>

          <div className="flex items-center justify-between text-sm text-ink-muted">
            <span>Yaratildi {new Date(lead.created_at).toLocaleDateString("ru-RU")}</span>
            {isAdmin && (
              <button onClick={del} className="inline-flex items-center gap-1.5 h-8 px-3 -mr-3 rounded-full text-danger-text hover:bg-danger-soft transition-colors">
                <Trash size={16} />O'chirish
              </button>
            )}
          </div>
        </aside>

        {/* Right: the feed */}
        <Feed lead={lead} stages={stages} today={today} />
      </div>
    </div>
  )
}

/** Rings from the browser when this staff member's line is up; otherwise the device's own dialer */
function CallButton({ phone }: { phone: string }) {
  const { status, dial, call } = usePhone()
  const [error, setError] = useState<string | null>(null)
  const cls = "w-10 h-10 shrink-0 rounded-full bg-success text-white flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40"
  if (status !== "ready") {
    return <a href={`tel:${phone}`} aria-label="Qo'ng'iroq qilish" title={status === "off" ? "Qo'ng'iroq qilish" : "Brauzer telefoni ulanmagan — qurilma orqali"} className={cls}><Phone size={20} weight="fill" /></a>
  }
  return (
    <span className="flex flex-col items-end gap-1">
      <button type="button" disabled={!!call} aria-label="Brauzerdan qo'ng'iroq qilish" title="Brauzerdan qo'ng'iroq qilish" className={cls}
        onClick={() => { setError(null); dial(phone).catch(() => setError("Mikrofonga ruxsat bering")) }}>
        <Phone size={20} weight="fill" />
      </button>
      {error && <span role="alert" className="text-sm text-danger-text">{error}</span>}
    </span>
  )
}

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="flex flex-col gap-1.5"><span className="text-sm text-ink-muted">{label}</span>{children}</label>
)

/** AmoCRM's stage strip: filled up to the current stage; a click moves the deal */
function StageBar({ stages, current, onPick }: { stages: Stage[]; current: string; onPick: (s: Stage) => void }) {
  const open = stages.filter((s) => !s.is_won && !s.is_lost)
  const cur = stages.find((s) => s.id === current)
  const idx = cur?.is_won || cur?.is_lost ? open.length : open.findIndex((s) => s.id === current)
  return (
    <div className="flex gap-1" role="group" aria-label="Bosqichlar">
      {open.map((s, i) => (
        <button key={s.id} type="button" onClick={() => onPick(s)} title={s.name} aria-label={s.name} aria-current={s.id === current || undefined}
          className={`flex-1 h-2 rounded-full transition-colors hover:opacity-80 ${i > idx ? "bg-mute-soft" : cur?.is_lost ? "bg-danger" : ""}`}
          style={i <= idx && !cur?.is_lost ? { backgroundColor: cur?.color } : undefined} />
      ))}
    </div>
  )
}

// ─── Feed ────────────────────────────────────────────────────────────────────

type Item = { at: string; key: string; node: ReactNode }

function Feed({ lead, stages, today }: { lead: Lead; stages: Stage[]; today: string }) {
  const { user, isAdmin } = useAuth()
  const { data: notes = [] } = useNotes(lead.id)
  const { data: tasks = [] } = useLeadTasks(lead.id)
  const { data: calls = [] } = useLeadCalls(lead.id)
  const qc = useQueryClient()
  useEffect(() => subscribeLeadCalls(lead.id, () => qc.invalidateQueries({ queryKey: SOTUV_KEY })), [lead.id, qc])
  const delNote = useDeleteNote()
  const [closing, setClosing] = useState<SalesTask | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const closed = stages.find((s) => s.id === lead.stage_id)
  const isClosed = !!(closed?.is_won || closed?.is_lost)

  const open = tasks.filter((t) => !t.is_done)
  const items: Item[] = [
    ...notes.map((n) => ({ at: n.created_at, key: n.id, node: <NoteItem note={n} canDelete={n.kind === "note" && (n.created_by === user?.id || isAdmin)} onDelete={() => delNote.mutate(n.id)} /> })),
    ...tasks.filter((t) => t.is_done && t.done_at).map((t) => ({ at: t.done_at!, key: t.id, node: <DoneItem task={t} /> })),
    ...calls.map((c) => ({ at: c.started_at, key: c.uuid, node: <CallItem call={c} /> })),
  ].sort((a, b) => a.at.localeCompare(b.at))

  // Newest at the bottom, next to the composer — keep it in view
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }) }, [items.length])

  return (
    <section className="rounded-surface border border-line flex flex-col min-h-[60vh]">
      <div className="flex-1 flex flex-col gap-1 p-5">
        {items.map((i) => <div key={i.key}>{i.node}</div>)}
        <div ref={end} />
      </div>
      <div className="border-t border-line p-4 flex flex-col gap-3 bg-surface-sunken rounded-b-surface">
        {open.length > 0 ? open.map((t) => (
          <div key={t.id} className="flex items-center gap-3 rounded-control bg-surface px-3 py-2.5">
            <DoneButton onClick={() => setClosing(t)} />
            <span className="flex-1 min-w-0 text-base text-ink truncate">{kindLabel(t.kind)}{t.text ? `: ${t.text}` : ""}</span>
            {t.assignee && <PersonDot name={t.assignee.full_name} url={t.assignee.avatar_url} />}
            <TaskChip kind={t.kind} due={t.due_date} today={today} />
          </div>
        )) : !isClosed && <div className="flex items-center gap-2 text-sm text-warning-text"><NoTaskChip />Keyingi qadamni belgilang — bitim vazifasiz qolmasin</div>}
        <Composer leadId={lead.id} responsible={lead.responsible_user_id} today={today} />
      </div>
      {closing && <TaskDone task={closing} onClose={() => setClosing(null)} />}
    </section>
  )
}

const when = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" })

function NoteItem({ note, canDelete, onDelete }: { note: FeedNote; canDelete: boolean; onDelete: () => void }) {
  if (note.kind === "lead") {
    // "Murojaat · Tilda" + the form's answers, one per line
    const [title, ...lines] = note.text.split("\n")
    return (
      <div className="flex gap-3 py-2">
        <span className="w-7 h-7 rounded-full bg-info-soft text-info-text flex items-center justify-center shrink-0"><Tray size={16} /></span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <span className="font-medium text-ink">{title}</span>
            <span className="tabular-nums ml-auto">{when(note.created_at)}</span>
          </div>
          {lines.length > 0 && <p className="mt-1 rounded-control bg-surface-sunken px-3 py-2 text-base text-ink whitespace-pre-wrap break-words">{lines.join("\n")}</p>}
        </div>
      </div>
    )
  }
  if (note.kind !== "note") {
    const Icon = note.kind === "stage" ? ArrowsLeftRight : Sparkle
    return (
      <div className="flex items-center gap-2 py-1.5 text-sm text-ink-muted">
        <Icon size={16} className="shrink-0" />
        <span className="flex-1 min-w-0">{note.kind === "stage" ? <>Bosqich: <span className="text-ink">{note.text}</span></> : note.text}{note.author ? ` · ${note.author.full_name}` : ""}</span>
        <span className="tabular-nums shrink-0">{when(note.created_at)}</span>
      </div>
    )
  }
  return (
    <div className="group flex gap-3 py-2">
      <PersonDot name={note.author?.full_name ?? "—"} url={note.author?.avatar_url} size={28} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <span className="font-medium text-ink">{note.author?.full_name ?? "—"}</span>
          <span className="tabular-nums">{when(note.created_at)}</span>
          {canDelete && <button onClick={onDelete} aria-label="Izohni o'chirish" className="ml-auto opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded-full hover:text-danger-text transition-opacity"><Trash size={16} /></button>}
        </div>
        <p className="mt-1 rounded-control bg-surface-sunken px-3 py-2 text-base text-ink whitespace-pre-wrap break-words">{note.text}</p>
      </div>
    </div>
  )
}

/** A PBX call in the feed */
function CallItem({ call }: { call: Call }) {
  const missed = call.talk_time === 0
  const Icon = call.direction === "in" ? PhoneIncoming : PhoneOutgoing
  return (
    <div className="flex gap-3 py-2">
      <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${missed ? "bg-danger-soft text-danger-text" : "bg-surface-sunken text-ink-muted"}`}><Icon size={16} /></span>
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <span className={missed ? "text-danger-text" : "text-ink"}>{callLabel(call)}</span>
          {!missed && <span className="tabular-nums">{secs(call.talk_time)}</span>}
          {call.staff && <span className="truncate">· {call.staff.full_name}</span>}
          <span className="tabular-nums ml-auto shrink-0">{when(call.started_at)}</span>
        </div>
        {!missed && <Recording uuid={call.uuid} />}
      </div>
    </div>
  )
}

function DoneItem({ task }: { task: SalesTask }) {
  const Icon = KIND_ICON[task.kind]
  return (
    <div className="flex gap-3 py-2">
      <span className="w-7 h-7 rounded-full bg-success-soft text-success-text flex items-center justify-center shrink-0"><CheckCircle size={16} /></span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Icon size={16} /><span className="text-ink">{kindLabel(task.kind)}{task.text ? `: ${task.text}` : ""}</span>
          <span className="tabular-nums ml-auto">{when(task.done_at!)}</span>
        </div>
        {task.result && <p className="mt-1 text-base text-ink whitespace-pre-wrap break-words">{task.result}</p>}
      </div>
    </div>
  )
}

/** Izoh / Vazifa composer at the bottom of the feed */
function Composer({ leadId, responsible, today }: { leadId: string; responsible: string | null; today: string }) {
  const { user } = useAuth()
  const { data: users = [] } = useUsers()
  const addNote = useAddNote()
  const addTask = useAddTask()
  const [mode, setMode] = useState<"note" | "task">("note")
  const [text, setText] = useState("")
  const [kind, setKind] = useState<TaskKind>("call")
  const [due, setDue] = useState<{ date: string | null; time: string | null }>({ date: addDays(today, 1), time: null })
  const [assignee, setAssignee] = useState(responsible ?? user?.id ?? "")

  function submit() {
    if (mode === "note") {
      if (!text.trim()) return
      addNote.mutate({ leadId, text }, { onSuccess: () => setText("") })
    } else {
      if (!due.date) return
      addTask.mutate({ lead_id: leadId, kind, text: text.trim(), due_date: toDue(due.date, due.time), assignee_id: assignee || null },
        { onSuccess: () => { setText(""); setMode("note") } })
    }
  }
  const pending = addNote.isPending || addTask.isPending

  return (
    <div className="rounded-control bg-surface border border-line focus-within:border-line-focus transition-colors">
      <div className="flex items-center gap-1 px-2 pt-2">
        {([["note", "Izoh", NotePencil], ["task", "Vazifa", CheckCircle]] as const).map(([id, label, Icon]) => (
          <button key={id} type="button" onClick={() => setMode(id)} aria-pressed={mode === id}
            className={`h-7 px-3 inline-flex items-center gap-1.5 rounded-full text-sm font-medium transition-colors ${mode === id ? "bg-accent text-ink-on-accent" : "text-ink-muted hover:text-ink hover:bg-mute-ghost-hover"}`}>
            <Icon size={16} />{label}
          </button>
        ))}
      </div>
      {mode === "task" && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2">
          {TASK_KINDS.map((k) => {
            const Icon = KIND_ICON[k.id]
            return (
              <button key={k.id} type="button" onClick={() => setKind(k.id)} aria-pressed={kind === k.id}
                className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-full text-sm border transition-colors ${kind === k.id ? "border-ink text-ink bg-surface-sunken" : "border-line text-ink-muted hover:text-ink"}`}>
                <Icon size={16} />{k.label}
              </button>
            )
          })}
          <DuePicker date={due.date} time={due.time} today={today} onChange={(date, time) => setDue({ date, time })} />
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Kimga"
            className="h-8 px-3 rounded-full border border-line bg-surface text-sm text-ink focus:outline-none">
            {users.filter((u) => u.is_active).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
        </div>
      )}
      <div className="flex items-end gap-2 p-2">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2}
          placeholder={mode === "note" ? "Izoh yozing…" : "Nima qilish kerak (ixtiyoriy)"}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit() }}
          className="flex-1 resize-none bg-transparent px-1.5 py-1 text-base text-ink placeholder:text-ink-faint focus:outline-none" />
        <button type="button" onClick={submit} disabled={pending || (mode === "note" ? !text.trim() : !due.date)}
          aria-label={mode === "note" ? "Izohni yuborish" : "Vazifa qo'shish"}
          className="h-9 px-4 shrink-0 inline-flex items-center gap-1.5 rounded-full bg-accent text-ink-on-accent text-sm font-medium hover:bg-accent-hover disabled:opacity-40 transition-opacity">
          <PaperPlaneRight size={16} />{mode === "note" ? "Yuborish" : "Qo'shish"}
        </button>
      </div>
    </div>
  )
}

