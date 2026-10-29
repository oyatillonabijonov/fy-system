import { useEffect, useRef, useState, type ReactNode } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Phone, PhoneIncoming, PhoneOutgoing, Trash, PaperPlaneRight, ArrowsLeftRight, Sparkle, CheckCircle, NotePencil, Tray, ChatCircleText } from "@phosphor-icons/react"
import { useAuth } from "@/context/AuthContext"
import { useUsers } from "@/hooks/useUsers"
import { useLead, useStages, usePipelines, useNotes, useLeadTasks, useUpdateLead, useDeleteLead, useAddNote, useDeleteNote, useAddTask, useLeadCalls, useRenameClient, SOTUV_KEY } from "@/hooks/useSotuv"
import { useQueryClient } from "@tanstack/react-query"
import { SOURCES, TASK_KINDS, kindLabel, toDue, getStages, subscribeLeadCalls, type Call, type FeedNote, type Lead, type SalesTask, type Stage, type TaskKind } from "@/lib/supabase/queries/sotuv"
import { tashkentToday } from "@/lib/period"
import { formatPhone, formatNumber } from "@/lib/format"
import { DuePicker, PersonDot, addDays, dueLabel } from "@/components/vazifalar/pickers"
import { KIND_ICON, TaskChip, NoTaskChip, Recording, CallButton, StageDot, callLabel, secs } from "@/components/sotuv/ui"
import { DoneButton, TaskDone } from "@/components/sotuv/SalesTasks"
import { confirmAction } from "@/lib/confirm"
import { useEvents, useParticipants } from "@/hooks/useEvents"
import { EnrollParticipantModal } from "@/components/events/EnrollParticipantModal"
import { useMedia } from "@/hooks/useMedia"
import { Sheet } from "@/components/ui/Sheet"

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
  const mobile = useMedia("(width < 64rem)")
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

  if (mobile) {
    return <LeadMobile lead={lead} stages={stages} pipelines={pipelines} users={users} today={today} isAdmin={isAdmin} save={save} movePipeline={movePipeline} del={del}
      name={name} setName={setName} price={price} setPrice={setPrice} reason={reason} setReason={setReason}
      clientName={clientName} setClientName={setClientName} saveClientName={saveClientName} />
  }

  return (
    <div className="flex flex-col gap-4">
      <Link to={`/sotuv?p=${lead.pipeline_id}`} className="self-start inline-flex items-center gap-1.5 h-8 px-3 -ml-3 rounded-full text-sm font-medium text-ink-muted hover:text-ink hover:bg-mute-ghost-hover transition-colors">
        <ArrowLeft size={16} />{pipeline?.name ?? "Sotuv bo'limi"}
      </Link>

      <div className="grid gap-4 grid-cols-[minmax(0,1fr)] lg:grid-cols-[360px_minmax(0,1fr)] items-start">
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

          {/* The voronka's event (081): enrol this client straight from the bitim */}
          {pipeline?.event_id && lead.client && <EnrollFromLead eventId={pipeline.event_id} client={lead.client} />}

          {/* The form's answers, like AmoCRM's deal fields — the whole form, name and phone included */}
          {lead.fields.length > 0 && (
            <dl className="flex flex-col gap-2.5" aria-label="Forma javoblari">
              <span className="text-sm font-semibold text-ink">Forma javoblari</span>
              {[{ k: "Ism", v: lead.client?.full_name ?? lead.name }, ...(lead.client?.phone ? [{ k: "Telefon", v: formatPhone(lead.client.phone) }] : []), ...lead.fields].map((f) => (
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

/** The deal's feed: notes, finished tasks and calls oldest → newest, plus the still-open tasks */
function useFeed(lead: Lead, stages: Stage[]) {
  const { user, isAdmin } = useAuth()
  const { data: notes = [] } = useNotes(lead.id)
  const { data: tasks = [] } = useLeadTasks(lead.id)
  const { data: calls = [] } = useLeadCalls(lead.id)
  const qc = useQueryClient()
  useEffect(() => subscribeLeadCalls(lead.id, () => qc.invalidateQueries({ queryKey: SOTUV_KEY })), [lead.id, qc])
  const delNote = useDeleteNote()
  const closed = stages.find((s) => s.id === lead.stage_id)
  const isClosed = !!(closed?.is_won || closed?.is_lost)

  const open = tasks.filter((t) => !t.is_done)
  const items: Item[] = [
    ...notes.map((n) => ({ at: n.created_at, key: n.id, node: <NoteItem note={n} canDelete={n.kind === "note" && (n.created_by === user?.id || isAdmin)} onDelete={() => delNote.mutate(n.id)} /> })),
    ...tasks.filter((t) => t.is_done && t.done_at).map((t) => ({ at: t.done_at!, key: t.id, node: <DoneItem task={t} /> })),
    ...calls.map((c) => ({ at: c.started_at, key: c.uuid, node: <CallItem call={c} /> })),
  ].sort((a, b) => a.at.localeCompare(b.at))
  return { items, open, isClosed }
}

function Feed({ lead, stages, today }: { lead: Lead; stages: Stage[]; today: string }) {
  const { items, open, isClosed } = useFeed(lead, stages)
  const [closing, setClosing] = useState<SalesTask | null>(null)
  const end = useRef<HTMLDivElement>(null)

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
          <div key={t.id} className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1.5 rounded-control bg-surface px-3 py-2.5">
            <DoneButton onClick={() => setClosing(t)} />
            <span className="flex-1 min-w-[10rem] sm:min-w-0 text-base text-ink break-words sm:truncate">{kindLabel(t.kind)}{t.text ? `: ${t.text}` : ""}</span>
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
          <div className="flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
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
      <div className="flex items-center gap-2 max-lg:gap-3 py-1.5 text-sm text-ink-muted">
        <span className="flex w-4 max-lg:w-7 max-lg:bg-surface justify-center shrink-0"><Icon size={16} /></span>
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
          {canDelete && <button onClick={onDelete} aria-label="Izohni o'chirish" className="ml-auto opacity-0 max-lg:opacity-100 group-hover:opacity-100 focus:opacity-100 p-1 max-lg:p-2 max-lg:-m-1 rounded-full hover:text-danger-text transition-opacity"><Trash size={16} /></button>}
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
        <div className="flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
          <span className={missed ? "text-danger-text" : "text-ink"}>{callLabel(call)}</span>
          {!missed && <span className="tabular-nums">{secs(call.talk_time)}</span>}
          {call.staff && <span className="truncate">· {call.staff.full_name}</span>}
          <span className="tabular-nums ml-auto max-lg:ml-0 max-lg:basis-full shrink-0">{when(call.started_at)}</span>
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
        <div className="flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
          <Icon size={16} /><span className="text-ink">{kindLabel(task.kind)}{task.text ? `: ${task.text}` : ""}</span>
          <span className="tabular-nums ml-auto max-lg:ml-0 max-lg:basis-full">{when(task.done_at!)}</span>
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

/** "Tadbirga yozish" for the voronka's event; once enrolled it just says so */
function EnrollFromLead({ eventId, client }: { eventId: string; client: { id: string; full_name: string; phone: string | null; image: string | null } }) {
  const { hasAccess } = useAuth()
  const { data: events = [] } = useEvents()
  const { data: participants = [] } = useParticipants(eventId)
  const [open, setOpen] = useState(false)
  const event = events.find((e) => e.id === eventId)
  if (!event || !hasAccess("tadbirlar")) return null
  const ids = new Set(participants.map((p) => p.contact_id).filter((x): x is string => !!x))
  return (
    <div className="rounded-control bg-surface p-3.5 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <span className="block text-sm text-ink-muted">Tadbir</span>
        <span className="block text-base font-medium text-ink truncate">{event.name}</span>
      </div>
      {ids.has(client.id)
        ? <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-success-soft text-success-dark text-sm font-medium whitespace-nowrap"><CheckCircle size={16} />Yozilgan</span>
        : <button type="button" onClick={() => setOpen(true)} className="h-8 px-3.5 rounded-full bg-accent text-ink-on-accent text-sm font-medium hover:bg-accent-hover transition-colors whitespace-nowrap">Tadbirga yozish</button>}
      {open && (
        <EnrollParticipantModal isOpen eventId={eventId} existingContactIds={ids} initialClient={client}
          onClose={() => setOpen(false)} onAdded={() => {}} />
      )}
    </div>
  )
}

// ─── Phone ───────────────────────────────────────────────────────────────────

type SaveLead = (patch: Parameters<ReturnType<typeof useUpdateLead>["mutate"]>[0]["patch"]) => void
interface MobileProps {
  lead: Lead; stages: Stage[]; pipelines: { id: string; name: string; event_id: string | null }[]; users: ReturnType<typeof useUsers>["data"]
  today: string; isAdmin: boolean; save: SaveLead; movePipeline: (pid: string) => void; del: () => void
  name: string; setName: (v: string) => void; price: string; setPrice: (v: string) => void
  reason: string; setReason: (v: string) => void; clientName: string; setClientName: (v: string) => void; saveClientName: () => void
}

const ROW = "min-h-14 px-4 flex items-center gap-3 border-b border-line last:border-b-0"
const ROW_INPUT = "flex-1 min-w-0 h-14 bg-transparent text-right text-base text-ink focus:outline-none"
const SECTION = "px-1 text-sm font-semibold text-ink-muted"

/** The bitim on a phone: header card, round quick actions, the bosqich chips, then Lenta | Ma'lumotlar with the composer pinned above the tab bar */
function LeadMobile(p: MobileProps) {
  const { lead, stages, pipelines, today, isAdmin, save } = p
  const users = p.users ?? []
  const [tab, setTab] = useState<"feed" | "info">("feed")
  const [taskOpen, setTaskOpen] = useState(false)
  const [closing, setClosing] = useState<SalesTask | null>(null)
  const note = useRef<HTMLTextAreaElement>(null)
  const { items, open: openTasks, isClosed } = useFeed(lead, stages)
  const pipeline = pipelines.find((x) => x.id === lead.pipeline_id)
  const stage = stages.find((s) => s.id === lead.stage_id)
  const openStages = stages.filter((s) => !s.is_won && !s.is_lost)
  const at = stage?.is_won || stage?.is_lost ? openStages.length : openStages.findIndex((s) => s.id === lead.stage_id) + 1
  const phone = lead.client?.phone
  const title = lead.client?.full_name ?? lead.name
  const chips = useRef<HTMLDivElement>(null)
  useEffect(() => { chips.current?.querySelector("[aria-checked=true]")?.scrollIntoView({ inline: "center", block: "nearest" }) }, [lead.stage_id])

  const act = "flex flex-col items-center gap-1.5 text-sm font-medium text-ink active:opacity-70"
  const circle = "size-12 rounded-full flex items-center justify-center"
  const writeNote = () => { setTab("feed"); setTimeout(() => note.current?.focus(), 0) }

  return (
    <div className="flex flex-col gap-4">
      <Link to={`/sotuv?p=${lead.pipeline_id}`} className="self-start inline-flex items-center gap-1.5 h-9 px-3 -ml-3 rounded-full text-sm font-medium text-ink-muted active:bg-mute-ghost-hover">
        <ArrowLeft size={16} />{pipeline?.name ?? "Sotuv bo'limi"}
      </Link>

      {/* Header card */}
      <section className="rounded-surface bg-surface-sunken p-4 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <PersonDot name={title} url={lead.client?.image} size={48} />
          <div className="flex-1 min-w-0">
            {lead.client
              ? <input value={p.clientName} onChange={(e) => p.setClientName(e.target.value)} aria-label="Mijoz ismi" placeholder="Mijoz ismini yozing"
                  onBlur={p.saveClientName} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }}
                  className="block w-full h-8 bg-transparent text-lg font-semibold text-ink rounded-item -mx-1 px-1 focus:bg-surface focus:outline-none" />
              : <span className="block text-lg font-semibold text-ink line-clamp-1">Mijoz biriktirilmagan</span>}
            {phone && <span className="block text-base text-ink-muted tabular-nums">{formatPhone(phone)}</span>}
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          {lead.price > 0
            ? <span className="text-2xl font-semibold text-ink tabular-nums">{formatNumber(lead.price)} <span className="text-base font-medium text-ink-muted">so'm</span></span>
            : <span className="text-base text-ink-muted">Summa kiritilmagan</span>}
          <div className="flex items-center gap-2 text-sm">
            {stage && <StageDot color={stage.color} />}
            <span className="font-medium text-ink">{stage?.name}</span>
            {!stage?.is_won && !stage?.is_lost && <span className="ml-auto text-ink-muted tabular-nums">{at} / {openStages.length}</span>}
          </div>
          <div className="flex gap-1" role="img" aria-label={`Bosqich ${at} / ${openStages.length}`}>
            {openStages.map((s, i) => (
              <span key={s.id} className={`flex-1 h-1.5 rounded-full ${i >= at ? "bg-mute-soft" : stage?.is_lost ? "bg-danger" : ""}`}
                style={i < at && !stage?.is_lost ? { backgroundColor: stage?.color } : undefined} />
            ))}
          </div>
        </div>
      </section>

      {/* Quick actions */}
      <div className="grid grid-flow-col auto-cols-fr gap-2 w-full max-w-md mx-auto">
        {phone && (
          <CallButton phone={phone} className={`${act} w-full`} wrap="flex flex-col items-center gap-1">
            <span className={`${circle} bg-success text-white`}><Phone size={22} weight="fill" /></span>Qo'ng'iroq
          </CallButton>
        )}
        {phone && <a href={`sms:${phone}`} className={act}><span className={`${circle} bg-surface-sunken`}><ChatCircleText size={22} weight="light" /></span>SMS</a>}
        <button type="button" onClick={() => setTaskOpen(true)} className={act}><span className={`${circle} bg-surface-sunken`}><CheckCircle size={22} weight="light" /></span>Vazifa</button>
        <button type="button" onClick={writeNote} className={act}><span className={`${circle} bg-surface-sunken`}><NotePencil size={22} weight="light" /></span>Izoh</button>
      </div>

      {/* Bosqich selector: one tap moves the deal */}
      <section className="flex flex-col gap-2">
        <h2 className={SECTION}>Bosqich</h2>
        <div ref={chips} role="radiogroup" aria-label="Bosqich" className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:-mx-6 sm:px-6">
          {stages.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={s.id === lead.stage_id} onClick={() => { if (s.id !== lead.stage_id) save({ stage_id: s.id }) }}
              className={`shrink-0 h-9 px-3.5 rounded-full text-sm font-medium whitespace-nowrap inline-flex items-center gap-2 transition-colors ${s.id === lead.stage_id ? "bg-accent text-ink-on-accent" : "bg-surface-sunken text-ink"}`}>
              <StageDot color={s.color} />{s.name}
            </button>
          ))}
        </div>
        {stage?.is_lost && (
          <input value={p.reason} onChange={(e) => p.setReason(e.target.value)} placeholder="Yutqazish sababi" aria-label="Yutqazish sababi"
            onBlur={() => { if (p.reason.trim() !== (lead.loss_reason ?? "")) save({ loss_reason: p.reason.trim() || null }) }}
            className="h-12 px-4 rounded-control bg-surface-sunken text-base text-ink placeholder:text-ink-faint focus:outline-none" />
        )}
      </section>

      <div role="radiogroup" aria-label="Bitim" className="grid grid-cols-2 p-1 rounded-full bg-surface-sunken">
        {([["feed", "Lenta"], ["info", "Ma'lumotlar"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="radio" aria-checked={tab === id} onClick={() => setTab(id)}
            className={`h-9 rounded-full text-sm font-medium transition-colors ${tab === id ? "bg-surface text-ink" : "text-ink-muted"}`}>{label}</button>
        ))}
      </div>

      {tab === "feed" ? (
        <>
          {openTasks.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className={SECTION}>Vazifalar · {openTasks.length}</h2>
              <ul className="rounded-surface bg-surface-sunken overflow-hidden">
                {openTasks.map((t) => (
                  <li key={t.id} className="min-h-16 px-4 py-3 flex items-center gap-3 border-b border-line last:border-b-0">
                    <DoneButton size="lg" onClick={() => setClosing(t)} />
                    <span className="flex-1 min-w-0 flex flex-col gap-1.5">
                      <span className="text-base font-medium text-ink line-clamp-2">{kindLabel(t.kind)}{t.text ? `: ${t.text}` : ""}</span>
                      <span className="flex items-center gap-2 min-w-0">
                        <TaskChip kind={t.kind} due={t.due_date} today={today} />
                        {t.assignee && <span className="flex items-center gap-1.5 min-w-0 text-sm text-ink-muted"><PersonDot name={t.assignee.full_name} url={t.assignee.avatar_url} /><span className="line-clamp-1">{t.assignee.full_name.split(" ")[0]}</span></span>}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : !isClosed && (
            <div className="rounded-surface bg-warning-soft p-4 flex items-center gap-3">
              <span className="flex-1 text-base text-warning-dark">Keyingi qadamni belgilang — bitim vazifasiz qolmasin</span>
              <button type="button" onClick={() => setTaskOpen(true)} className="shrink-0 h-10 px-4 rounded-full bg-accent text-ink-on-accent text-sm font-semibold">Vazifa</button>
            </div>
          )}

          <section className="flex flex-col gap-2">
            <h2 className={SECTION}>Lenta</h2>
            {/* Newest first: what just happened is on top, the composer is right below the fold */}
            <div className="relative flex flex-col gap-1 before:absolute before:left-[13.5px] before:top-4 before:bottom-4 before:w-px before:bg-line before:content-['']">
              {[...items].reverse().map((i) => <div key={i.key} className="relative">{i.node}</div>)}
            </div>
          </section>

          <MobileComposer leadId={lead.id} inputRef={note} />
        </>
      ) : (
        <>
          <ul className="rounded-surface bg-surface-sunken overflow-hidden">
            <li className={ROW}>
              <span className="text-base text-ink-muted shrink-0">Bitim</span>
              <input value={p.name} onChange={(e) => p.setName(e.target.value)} aria-label="Bitim nomi"
                onBlur={() => { const v = p.name.trim(); if (v && v !== lead.name) save({ name: v }); else p.setName(lead.name) }}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }} className={ROW_INPUT} />
            </li>
            <li className={ROW}>
              <span className="text-base text-ink-muted shrink-0">Summa</span>
              <input inputMode="numeric" value={p.price} placeholder="0" aria-label="Summa" className={`${ROW_INPUT} tabular-nums`}
                onChange={(e) => { const d = e.target.value.replace(/\D/g, ""); p.setPrice(d ? Number(d).toLocaleString("ru-RU") : "") }}
                onBlur={() => { const n = Number(p.price.replace(/\D/g, "")) || 0; if (n !== lead.price) save({ price: n }) }} />
            </li>
            <li className={ROW}>
              <span className="text-base text-ink-muted shrink-0">Mas'ul</span>
              <select value={lead.responsible_user_id ?? ""} onChange={(e) => save({ responsible_user_id: e.target.value || null })} aria-label="Mas'ul" className={`${ROW_INPUT} [text-align-last:right]`}>
                <option value="">Belgilanmagan</option>
                {users.filter((u) => u.is_active || u.id === lead.responsible_user_id).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </li>
            <li className={ROW}>
              <span className="text-base text-ink-muted shrink-0">Manba</span>
              <select value={lead.source ?? "manual"} onChange={(e) => save({ source: e.target.value })} aria-label="Manba" className={`${ROW_INPUT} [text-align-last:right]`}>
                {!SOURCES.some((s) => s.id === lead.source) && lead.source && <option value={lead.source}>{lead.source}</option>}
                {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </li>
            <li className={ROW}>
              <span className="text-base text-ink-muted shrink-0">Voronka</span>
              <select value={lead.pipeline_id} onChange={(e) => p.movePipeline(e.target.value)} aria-label="Voronka" className={`${ROW_INPUT} [text-align-last:right]`}>
                {pipelines.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </li>
            <li className={ROW}>
              <span className="text-base text-ink-muted shrink-0">Yaratildi</span>
              <span className="flex-1 text-right text-base text-ink tabular-nums">{new Date(lead.created_at).toLocaleDateString("ru-RU")}</span>
            </li>
          </ul>

          {pipeline?.event_id && lead.client && (
            <div className="rounded-surface bg-surface-sunken p-2"><EnrollFromLead eventId={pipeline.event_id} client={lead.client} /></div>
          )}

          {lead.fields.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className={SECTION}>Forma javoblari</h2>
              <dl aria-label="Forma javoblari" className="rounded-surface bg-surface-sunken overflow-hidden">
                {[{ k: "Ism", v: lead.client?.full_name ?? lead.name }, ...(phone ? [{ k: "Telefon", v: formatPhone(phone) }] : []), ...lead.fields].map((f) => (
                  <div key={f.k} className="px-4 py-3 border-b border-line last:border-b-0">
                    <dt className="text-sm text-ink-muted break-words">{f.k}</dt>
                    <dd className="text-base text-ink break-words">{f.v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {isAdmin && (
            <button type="button" onClick={p.del} className="h-12 inline-flex items-center justify-center gap-2 rounded-full bg-danger-soft text-danger-text text-base font-medium">
              <Trash size={18} />Bitimni o'chirish
            </button>
          )}
        </>
      )}

      <MobileTaskSheet open={taskOpen} onClose={() => setTaskOpen(false)} lead={lead} today={today} users={users} onAdded={() => setTab("feed")} />
      {closing && <TaskDone task={closing} onClose={() => setClosing(null)} />}
    </div>
  )
}

/** The note bar, fixed above the tab bar; a spacer as tall as the bar keeps the end of the page from hiding under it */
function MobileComposer({ leadId, inputRef }: { leadId: string; inputRef: React.RefObject<HTMLTextAreaElement | null> }) {
  const addNote = useAddNote()
  const [text, setText] = useState("")
  const [h, setH] = useState(64)
  const bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = bar.current
    if (!el) return
    const ro = new ResizeObserver(() => setH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const send = () => { if (text.trim()) addNote.mutate({ leadId, text }, { onSuccess: () => setText("") }) }
  return (
    <>
      <div aria-hidden style={{ height: h }} />
      <div ref={bar} className="fixed inset-x-0 bottom-[var(--tabbar-h)] z-20 px-4 sm:px-6 pt-2 pb-2.5 bg-surface border-t border-line flex items-end gap-2">
        <textarea ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} rows={1} aria-label="Izoh" placeholder="Izoh yozing…"
          className="flex-1 min-w-0 min-h-11 max-h-32 resize-none rounded-control bg-surface-sunken px-4 py-2.5 text-base text-ink placeholder:text-ink-faint focus:outline-none [field-sizing:content]" />
        <button type="button" onClick={send} disabled={addNote.isPending || !text.trim()} aria-label="Izohni yuborish"
          className="size-11 shrink-0 rounded-full bg-accent text-ink-on-accent flex items-center justify-center disabled:bg-mute-soft disabled:text-ink-muted transition-colors">
          <PaperPlaneRight size={20} />
        </button>
      </div>
    </>
  )
}

const TIMES = [null, "09:00", "10:00", "12:00", "14:00", "16:00", "18:00"] as const

/** "Vazifa" quick action: kind, note, deadline and owner in one bottom sheet */
function MobileTaskSheet({ open, onClose, lead, today, users, onAdded }: {
  open: boolean; onClose: () => void; lead: Lead; today: string; users: NonNullable<ReturnType<typeof useUsers>["data"]>; onAdded: () => void
}) {
  const { user } = useAuth()
  const addTask = useAddTask()
  const [kind, setKind] = useState<TaskKind>("call")
  const [text, setText] = useState("")
  const [date, setDate] = useState<string | null>(addDays(today, 1))
  const [time, setTime] = useState<string | null>(null)
  const [assignee, setAssignee] = useState(lead.responsible_user_id ?? user?.id ?? "")
  const chip = (on: boolean) => `h-10 px-3.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${on ? "bg-accent text-ink-on-accent" : "bg-surface-sunken text-ink"}`
  const field = "w-full h-12 px-4 rounded-control bg-surface-sunken text-base text-ink placeholder:text-ink-faint focus:outline-none"

  function submit() {
    if (!date) return
    addTask.mutate({ lead_id: lead.id, kind, text: text.trim(), due_date: toDue(date, time), assignee_id: assignee || null },
      { onSuccess: () => { setText(""); onClose(); onAdded() } })
  }

  return (
    <Sheet open={open} onClose={onClose} title="Yangi vazifa"
      footer={<button type="button" onClick={submit} disabled={!date || addTask.isPending}
        className="h-12 flex-1 rounded-full bg-accent text-ink-on-accent text-base font-semibold disabled:bg-mute-soft disabled:text-ink-muted">
        {addTask.isPending ? "Saqlanmoqda..." : "Qo'shish"}</button>}>
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-2">
          {TASK_KINDS.map((k) => {
            const Icon = KIND_ICON[k.id]
            return (
              <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}
                className={`h-11 px-3 rounded-full text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors ${kind === k.id ? "bg-accent text-ink-on-accent" : "bg-surface-sunken text-ink"}`}>
                <Icon size={18} />{k.label}
              </button>
            )
          })}
        </div>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Nima qilish kerak (ixtiyoriy)" aria-label="Vazifa matni" className={field} />
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ink-muted">Muddat{date ? ` · ${dueLabel(date, time, today)}` : ""}</span>
          <div className="flex flex-wrap gap-2">
            {([["Bugun", today], ["Ertaga", addDays(today, 1)], ["Haftadan keyin", addDays(today, 7)]] as const).map(([label, day]) => (
              <button key={label} type="button" onClick={() => setDate(day)} className={chip(date === day)}>{label}</button>
            ))}
          </div>
          <input type="date" value={date ?? ""} onChange={(e) => { setDate(e.target.value || null); if (!e.target.value) setTime(null) }} aria-label="Sana" className={field} />
          <div className={`flex flex-wrap gap-2 ${date ? "" : "opacity-40 pointer-events-none"}`}>
            {TIMES.map((t) => <button key={t ?? "day"} type="button" onClick={() => setTime(t)} className={chip(time === t)}>{t ?? "Kun bo'yi"}</button>)}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ink-muted">Mas'ul</span>
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Kimga" className={field}>
            {users.filter((u) => u.is_active).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
        </div>
      </div>
    </Sheet>
  )
}
