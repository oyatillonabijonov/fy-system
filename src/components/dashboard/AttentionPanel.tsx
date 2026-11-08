import { useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { CaretDown, CaretRight, CheckCircle, ClockCountdown, Hourglass, PhoneX } from "@phosphor-icons/react"
import type { SalesDashboard } from "@/lib/supabase/queries/salesDashboard"
import { kindLabel } from "@/lib/supabase/queries/sotuv"
import { useAuth } from "@/context/AuthContext"
import { formatPhone } from "@/lib/format"

const ago = (iso: string) => {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
  return h < 24 ? `${h} soat` : `${Math.floor(h / 24)} kun`
}

type Item = { key: string; to: string | null; main: string; sub: string; side: string }
type Group = { id: string; title: string; items: Item[] }

// Row = who (client) first, what and whose below, how long on the right
function groupsOf(a: SalesDashboard["attention"], link: (id: string | null) => string | null): Group[] {
  return [
    { id: "tasks", title: "Muddati o'tgan vazifalar",
      items: a.overdue_tasks.map((t) => ({ key: t.id, to: link(t.lead_id), main: t.lead_name, sub: `${t.text || kindLabel(t.kind)} · ${t.assignee ?? "Belgilanmagan"}`, side: ago(t.due_date) })) },
    { id: "stale", title: "Harakatsiz bitimlar",
      items: a.stale_leads.map((l) => ({ key: l.id, to: link(l.id), main: l.name, sub: `${l.stage} · ${l.responsible ?? "Mas'ulsiz"}`, side: `${l.days} kun` })) },
    { id: "missed", title: "Qayta qo'ng'iroq qilinmagan",
      items: a.missed_unanswered.map((m) => ({ key: m.phone, to: link(m.lead_id), main: m.client_name ?? formatPhone(m.phone), sub: `${m.count} marta qo'ng'iroq qilgan`, side: ago(m.last_missed_at) })) },
  ]
}

// A bitim page needs the Sotuv module; without it the rows are plain text
const useLink = () => (useAuth().hasAccess("sotuv-crmn") ? (id: string | null) => (id ? `/sotuv/bitim/${id}` : null) : () => null)

const ICONS: Record<string, ReactNode> = { tasks: <ClockCountdown size={20} />, stale: <Hourglass size={20} />, missed: <PhoneX size={20} /> }
const SHOWN = 4

/** Three counted rows, one open at a time (the first with something in it opens by itself); each
 *  expands its items (bitim links), four shown, the rest behind "Yana N ta". Only the overdue tasks
 *  use the danger tint — the other two groups are neutral. Same on desktop and phone. */
function Groups({ a }: { a: SalesDashboard["attention"] }) {
  const groups = groupsOf(a, useLink())
  const [open, setOpen] = useState<string | null>(() => groups.find((g) => g.items.length)?.id ?? null)
  const [all, setAll] = useState<string | null>(null)
  const hover = "lg:hover:bg-mute-ghost-hover active:bg-surface-sunken-hover transition-colors"
  return groups.map((g) => {
    const n = g.items.length, on = open === g.id && n > 0
    const danger = g.id === "tasks" && n > 0
    const items = all === g.id ? g.items : g.items.slice(0, SHOWN)
    return (
      <div key={g.id} className="border-t border-line first:border-t-0">
        <button type="button" disabled={n === 0} onClick={() => setOpen(on ? null : g.id)} aria-expanded={on}
          className={`w-full min-h-14 px-4 lg:px-2 py-2 lg:rounded-item flex items-center gap-3 text-left disabled:bg-transparent ${hover}`}>
          <span className={`size-10 shrink-0 rounded-full flex items-center justify-center ${danger ? "bg-danger-soft text-danger-dark" : n ? "bg-surface text-ink" : "bg-surface text-ink-faint"}`}>{ICONS[g.id]}</span>
          <span className={`flex-1 min-w-0 text-base font-medium truncate ${n ? "text-ink" : "text-ink-muted"}`}>{g.title}</span>
          <span className={`h-6 min-w-6 px-2 inline-flex items-center justify-center rounded-full text-xs font-semibold tabular-nums ${danger ? "bg-danger-soft text-danger-dark" : "bg-surface text-ink-muted"}`}>{n}</span>
          <CaretDown size={16} className={`shrink-0 text-ink-faint transition-transform ${n === 0 ? "opacity-0" : on ? "rotate-180" : ""}`} />
        </button>
        {on && (
          <div className="px-2 lg:px-0 lg:pl-[52px] pb-2">
            {items.map((i) => {
              const body = <>
                <span className="flex-1 min-w-0"><span className="block text-base font-medium text-ink truncate">{i.main}</span><span className="block text-sm text-ink-muted truncate">{i.sub}</span></span>
                <span className={`shrink-0 text-sm tabular-nums ${danger ? "text-danger-text" : "text-ink-muted"}`}>{i.side}</span>
              </>
              const cls = "min-h-14 px-2 py-2 rounded-item flex items-center gap-3"
              return i.to
                ? <Link key={i.key} to={i.to} className={`${cls} ${hover}`}>{body}<CaretRight size={16} className="shrink-0 text-ink-faint lg:hidden" /></Link>
                : <div key={i.key} className={cls}>{body}</div>
            })}
            {n > SHOWN && (
              <button type="button" onClick={() => setAll(all === g.id ? null : g.id)}
                className="mt-1 w-full h-10 rounded-full bg-surface text-sm font-medium text-ink hover:bg-mute-ghost-hover active:opacity-80 transition-colors">
                {all === g.id ? "Kamroq" : `Yana ${n - SHOWN} ta`}
              </button>
            )}
          </div>
        )}
      </div>
    )
  })
}

const allClear = (a: SalesDashboard["attention"]) => a.overdue_tasks.length + a.stale_leads.length + a.missed_unanswered.length === 0
const AllClear = () => <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-success-soft text-success-dark text-xs font-medium"><CheckCircle size={12} weight="bold" />Hammasi joyida</span>

export function AttentionPanel({ a }: { a: SalesDashboard["attention"] }) {
  return (
    <div className="bg-surface-sunken rounded-surface p-4 sm:p-5 flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h3 className="text-base font-semibold text-ink">E'tibor talab qiladi</h3>
        {allClear(a) && <AllClear />}
      </div>
      <div><Groups a={a} /></div>
    </div>
  )
}

/** Phone version: its own section, title outside the card */
export function AttentionMobile({ a }: { a: SalesDashboard["attention"] }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="text-base font-semibold text-ink">E'tibor talab qiladi</h2>
        {allClear(a) && <AllClear />}
      </div>
      <div className="bg-surface-sunken rounded-surface overflow-hidden"><Groups a={a} /></div>
    </section>
  )
}
