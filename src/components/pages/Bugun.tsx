import { useMemo, useState, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { PhoneIncoming, CheckCircle, Sparkle, CaretRight } from "@phosphor-icons/react"
import { useAuth } from "@/context/AuthContext"
import { useCallbacks, useMyNewLeads, useOpenTasks } from "@/hooks/useSotuv"
import { canonPhone, kindLabel, sourceLabel, fromDue, type SalesTask } from "@/lib/supabase/queries/sotuv"
import { tashkentToday } from "@/lib/period"
import { formatPhone } from "@/lib/format"
import { DoneButton, TaskDone } from "@/components/sotuv/SalesTasks"
import { DueText, EmptyNote, KIND_ICON, ROW_BTN, RowCall, SECTION } from "@/components/sotuv/ui"

const clock = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
const when = (iso: string, today: string) => {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date(iso))
  return day === today ? clock(iso) : `${Number(day.slice(8))}.${day.slice(5, 7)} ${clock(iso)}`
}

/** The seller's home on a phone (variant A, chosen by the user): who to call back, today's tasks, new bitimlar */
export function Bugun() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const today = tashkentToday()
  const [now] = useState(() => Date.now())
  const [closing, setClosing] = useState<SalesTask | null>(null)
  const { data: callbacks = [], isLoading: l1 } = useCallbacks()
  const { data: tasks = [], isLoading: l2 } = useOpenTasks()
  const { data: fresh = [], isLoading: l3 } = useMyNewLeads(user?.id)

  // Mine, or nobody's yet: someone else's client is theirs to call
  const calls = callbacks.filter((c) => !c.ownerId || c.ownerId === user?.id)
  const due = useMemo(() => tasks.filter((t) => t.assignee_id === user?.id && (fromDue(t.due_date).date <= today || new Date(t.due_date).getTime() < now)), [tasks, user?.id, today, now])
  const open = (id: string | null) => { if (id) navigate(`/sotuv/bitim/${id}`) }

  if (l1 || l2 || l3) return <EmptyNote icon={CheckCircle} text="Yuklanmoqda…" />

  return (
    <div className="flex flex-col gap-6 pb-6">
      {calls.length + due.length + fresh.length === 0 && <EmptyNote icon={CheckCircle} text="Bugungi ishlar bajarilgan" />}

      {calls.length > 0 && (
        <Section title="Qayta qo'ng'iroq" n={calls.length} danger>
          {calls.map((c) => {
            const phone = canonPhone(c.phone)
            const name = c.name && c.name.replace(/\D/g, "") !== phone.replace(/\D/g, "") ? c.name : null
            return (
              <Row key={c.phone} onClick={c.leadId ? () => open(c.leadId) : undefined}
                lead={<span className={`${ROW_BTN} text-danger`}><PhoneIncoming size={20} /></span>}
                title={name ?? formatPhone(phone)}
                meta={<>{name && <span className="tabular-nums">{formatPhone(phone)} · </span>}<span className="tabular-nums">{when(c.last, today)}</span>{c.calls > 1 && <span className="text-danger-text"> · {c.calls} marta</span>}</>}
                trail={<RowCall phone={phone} />} />
            )
          })}
        </Section>
      )}

      {due.length > 0 && (
        <Section title="Bugungi vazifalar" n={due.length}>
          {due.map((t) => {
            const Icon = KIND_ICON[t.kind]
            const client = t.lead?.client?.full_name ?? t.lead?.name
            return (
              <Row key={t.id} onClick={() => open(t.lead_id)}
                lead={<DoneButton size="lg" onClick={() => setClosing(t)} />}
                title={t.text || kindLabel(t.kind)}
                meta={<span className="flex items-center gap-1.5 min-w-0"><Icon size={16} className="shrink-0" /><DueText due={t.due_date} today={today} />{client && <span className="truncate">· {client}</span>}</span>}
                trail={t.lead?.client?.phone ? <RowCall phone={t.lead.client.phone} /> : undefined} />
            )
          })}
        </Section>
      )}

      {fresh.length > 0 && (
        <Section title="Yangi bitimlar" n={fresh.length}>
          {fresh.map((l) => (
            <Row key={l.id} onClick={() => open(l.id)}
              lead={<span className={`${ROW_BTN} text-ink-muted`}><Sparkle size={20} /></span>}
              title={l.client?.full_name ?? l.name}
              meta={<>{sourceLabel(l.source)} · <span className="tabular-nums">{when(l.created_at, today)}</span></>}
              trail={l.client?.phone ? <RowCall phone={l.client.phone} /> : undefined} />
          ))}
        </Section>
      )}

      {closing && <TaskDone task={closing} onClose={() => setClosing(null)} />}
    </div>
  )
}

function Section({ title, n, danger, children }: { title: string; n: number; danger?: boolean; children: ReactNode }) {
  return (
    <section>
      <h2 className={`${SECTION} flex items-baseline gap-2`}>
        <span className={danger ? "text-danger-text" : undefined}>{title}</span>
        <span className="text-sm font-normal text-ink-muted tabular-nums">{n}</span>
      </h2>
      <ul className="rounded-surface bg-surface-sunken overflow-hidden">{children}</ul>
    </section>
  )
}

function Row({ lead, title, meta, trail, onClick }: { lead: ReactNode; title: string; meta: ReactNode; trail?: ReactNode; onClick?: () => void }) {
  return (
    <li className="border-b border-line last:border-b-0">
      <div role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick}
        onKeyDown={(e) => { if (onClick && e.key === "Enter") onClick() }}
        className={`min-h-16 px-4 py-3 flex items-center gap-3 transition-colors ${onClick ? "cursor-pointer active:bg-surface-sunken-hover" : ""}`}>
        <span onClick={(e) => e.stopPropagation()} className="flex">{lead}</span>
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="text-base font-medium text-ink line-clamp-1">{title}</span>
          <span className="text-sm text-ink-muted line-clamp-1">{meta}</span>
        </span>
        {trail ? <span onClick={(e) => e.stopPropagation()} className="flex items-center">{trail}</span> : <CaretRight size={16} className="text-ink-faint shrink-0" />}
      </div>
    </li>
  )
}
