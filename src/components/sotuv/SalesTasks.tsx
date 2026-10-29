import { useId, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Check, CheckCircle } from "@phosphor-icons/react"
import { useAuth } from "@/context/AuthContext"
import { useOpenTasks, useUpdateTask } from "@/hooks/useSotuv"
import { fromDue, kindLabel, type SalesTask } from "@/lib/supabase/queries/sotuv"
import { addDays, PersonDot } from "@/components/vazifalar/pickers"
import { INPUT, LABEL } from "@/components/moliya/PaymentActionModals"
import { useMedia } from "@/hooks/useMedia"
import { FormSheet } from "./FormSheet"
import { KIND_ICON, TaskChip, EmptyNote, shortDate } from "./ui"

/** Every open sales task, bucketed like AmoCRM's "Vazifalar": overdue / today / tomorrow / later */
export function SalesTasks({ today }: { today: string }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: tasks = [], isLoading } = useOpenTasks()
  const [mine, setMine] = useState(true)
  const [closing, setClosing] = useState<SalesTask | null>(null)
  const [now] = useState(() => Date.now())
  const mobile = useMedia("(width < 64rem)")

  const buckets = useMemo(() => {
    const b: [string, SalesTask[]][] = [["Muddati o'tgan", []], ["Bugun", []], ["Ertaga", []], ["Keyinroq", []]]
    for (const t of tasks) {
      if (mine && t.assignee_id !== user?.id) continue
      const d = fromDue(t.due_date).date
      const i = new Date(t.due_date).getTime() < now ? 0 : d === today ? 1 : d === addDays(today, 1) ? 2 : 3
      b[i][1].push(t)
    }
    return b.filter(([, rows]) => rows.length)
  }, [tasks, mine, user?.id, today, now])

  if (mobile) {
    return (
      <div className="flex flex-col gap-4">
        <div role="radiogroup" aria-label="Kimniki" className="grid grid-cols-2 p-1 rounded-full bg-surface-sunken">
          {([[true, "Mening"], [false, "Hammasi"]] as const).map(([v, label]) => (
            <button key={label} role="radio" aria-checked={mine === v} onClick={() => setMine(v)}
              className={`h-9 rounded-full text-sm font-medium transition-colors ${mine === v ? "bg-surface text-ink" : "text-ink-muted"}`}>{label}</button>
          ))}
        </div>
        {isLoading ? <EmptyNote icon={CheckCircle} text="Yuklanmoqda…" />
          : buckets.length === 0 ? <EmptyNote icon={CheckCircle} text={mine ? "Sizda ochiq vazifa yo'q" : "Ochiq vazifa yo'q"} />
          : buckets.map(([title, rows]) => {
            const late = title === "Muddati o'tgan"
            const showDate = late || title === "Keyinroq"
            return (
              <section key={title} className="flex flex-col gap-2">
                <h2 className={`px-1 text-sm font-semibold ${late ? "text-danger-text" : "text-ink-muted"}`}>{title} · {rows.length}</h2>
                <ul className="rounded-surface bg-surface-sunken overflow-hidden">
                  {rows.map((t) => {
                    const Icon = KIND_ICON[t.kind]
                    const { date, time } = fromDue(t.due_date)
                    const client = t.lead?.client?.full_name ?? t.lead?.name
                    const bitim = t.lead && t.lead.client && t.lead.name !== t.lead.client.full_name ? t.lead.name : null
                    return (
                      <li key={t.id} role="button" tabIndex={0} onClick={() => navigate(`/sotuv/bitim/${t.lead_id}`)}
                        onKeyDown={(e) => { if (e.key === "Enter") navigate(`/sotuv/bitim/${t.lead_id}`) }}
                        className="border-b border-line last:border-b-0 cursor-pointer active:bg-mute-ghost-hover">
                        <div className="min-h-16 px-4 py-3 flex items-center gap-3">
                          <DoneButton size="lg" onClick={() => setClosing(t)} />
                          <span className="flex-1 min-w-0 flex flex-col">
                            <span className="text-base font-medium text-ink flex items-start gap-1.5">
                              <Icon size={16} className="text-ink-muted shrink-0 mt-1" /><span className="line-clamp-2">{t.text || kindLabel(t.kind)}</span>
                            </span>
                            <span className="text-sm text-ink-muted line-clamp-1">{[client, bitim].filter(Boolean).join(" · ")}</span>
                          </span>
                          <span className={`shrink-0 flex flex-col items-end text-sm tabular-nums ${late ? "text-danger-text" : "text-ink"}`}>
                            <span className="font-medium whitespace-nowrap">{time ? time.slice(0, 5) : "Kun bo'yi"}</span>
                            {showDate && <span className={`whitespace-nowrap ${late ? "" : "text-ink-muted"}`}>{shortDate(date)}</span>}
                          </span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        {closing && <TaskDone task={closing} onClose={() => setClosing(null)} />}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Kimniki" className="self-start inline-flex gap-1 p-1 rounded-control bg-surface-sunken">
        {([[true, "Mening"], [false, "Hammasi"]] as const).map(([v, label]) => (
          <button key={label} role="radio" aria-checked={mine === v} onClick={() => setMine(v)}
            className={`h-7 px-3 rounded-item text-sm font-medium transition-colors ${mine === v ? "bg-surface text-ink" : "text-ink-muted hover:text-ink"}`}>{label}</button>
        ))}
      </div>
      {isLoading ? (
        <Empty text="Yuklanmoqda…" />
      ) : buckets.length === 0 ? (
        <Empty text={mine ? "Sizda ochiq vazifa yo'q" : "Ochiq vazifa yo'q"} />
      ) : buckets.map(([title, rows]) => (
        <section key={title} className="rounded-surface border border-line overflow-hidden">
          <div className="flex items-center gap-2 px-4 h-11 bg-surface-sunken">
            <h2 className={`text-base font-semibold ${title === "Muddati o'tgan" ? "text-danger-text" : "text-ink"}`}>{title}</h2>
            <span className="text-sm text-ink-muted tabular-nums">{rows.length}</span>
          </div>
          {rows.map((t) => {
            const Icon = KIND_ICON[t.kind]
            return (
              <div key={t.id} role="button" tabIndex={0} onClick={() => navigate(`/sotuv/bitim/${t.lead_id}`)}
                onKeyDown={(e) => { if (e.key === "Enter") navigate(`/sotuv/bitim/${t.lead_id}`) }}
                className="grid grid-cols-[28px_minmax(0,1fr)_auto] md:grid-cols-[28px_minmax(0,1fr)_160px_150px] items-center gap-3 px-3 py-2.5 border-t border-line first:border-t-0 hover:bg-mute-ghost-hover cursor-pointer transition-colors">
                <DoneButton onClick={() => setClosing(t)} />
                <span className="flex flex-col min-w-0">
                  <span className="text-base text-ink flex items-center gap-1.5"><Icon size={16} className="text-ink-muted shrink-0" /><span className="truncate">{t.text || kindLabel(t.kind)}</span></span>
                  <span className="text-sm text-ink-muted truncate">{t.lead?.client?.full_name ?? t.lead?.name}{t.lead?.client?.phone ? ` · ${t.lead.client.phone}` : ""}</span>
                </span>
                <span className="hidden md:flex items-center gap-2 min-w-0 text-sm text-ink">
                  {t.assignee && <><PersonDot name={t.assignee.full_name} url={t.assignee.avatar_url} /><span className="truncate">{t.assignee.full_name}</span></>}
                </span>
                <span className="justify-self-end"><TaskChip kind={t.kind} due={t.due_date} today={today} /></span>
              </div>
            )
          })}
        </section>
      ))}
      {closing && <TaskDone task={closing} onClose={() => setClosing(null)} />}
    </div>
  )
}

export function DoneButton({ onClick, size }: { onClick: () => void; size?: "lg" }) {
  return (
    <button type="button" aria-label="Bajarildi" title="Bajarildi" onClick={(e) => { e.stopPropagation(); onClick() }}
      className={`relative rounded-full border border-line flex items-center justify-center text-transparent before:absolute before:-inset-2.5 before:content-[''] hover:text-success-text hover:border-success-text transition-colors ${size === "lg" ? "size-7 border-ink-faint active:text-success-text active:border-success-text" : "w-6 h-6"}`}>
      <Check size={12} weight="bold" />
    </button>
  )
}

/** AmoCRM asks for the result when a task is closed; it lands in the deal's feed */
export function TaskDone({ task, onClose }: { task: SalesTask; onClose: () => void }) {
  const update = useUpdateTask()
  const [result, setResult] = useState("")
  const [error, setError] = useState<string | null>(null)
  const id = useId()
  return (
    <FormSheet title="Vazifani yakunlash" error={error} submitLabel="Bajarildi" canSubmit pending={update.isPending} onClose={onClose}
      onSubmit={() => update.mutate({ id: task.id, patch: { is_done: true, result: result.trim() || null } }, { onSuccess: onClose, onError: (e) => setError(e.message) })}>
      <p className="text-sm text-ink-muted">{kindLabel(task.kind)}{task.text ? `: ${task.text}` : ""}</p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className={LABEL}>Natija <span className="text-ink-faint">(ixtiyoriy)</span></label>
        <textarea id={id} rows={3} autoFocus value={result} onChange={(e) => setResult(e.target.value)} placeholder="Gaplashildi, ertaga to'lov qiladi" className={`${INPUT} resize-none`} />
      </div>
    </FormSheet>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="bg-surface-sunken rounded-surface py-12 px-6 text-center text-base text-ink-muted">{text}</div>
}
