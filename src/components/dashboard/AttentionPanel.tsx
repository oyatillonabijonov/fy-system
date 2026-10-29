import { useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { CaretDown, CaretRight, CheckCircle, ClockCountdown, Hourglass, PhoneX } from "@phosphor-icons/react"
import type { SalesDashboard } from "@/lib/supabase/queries/salesDashboard"
import { kindLabel } from "@/lib/supabase/queries/sotuv"
import { useAuth } from "@/context/AuthContext"
import { formatPhone } from "@/lib/format"
import { Card } from "./pieces"

const ago = (iso: string) => {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
  return h < 24 ? `${h} soat oldin` : `${Math.floor(h / 24)} kun oldin`
}

function List({ title, empty, items }: { title: string; empty: string; items: { key: string; to: string | null; main: string; sub: string }[] }) {
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-sm font-semibold text-ink px-1">{title} <span className="text-ink-faint tabular-nums">{items.length || ""}</span></h4>
      {items.length === 0 ? <p className="text-sm text-ink-muted px-1 py-1">{empty}</p> : items.map((i) => {
        const body = <><span className="block text-base text-ink truncate">{i.main}</span><span className="block text-sm text-ink-muted truncate">{i.sub}</span></>
        return i.to
          ? <Link key={i.key} to={i.to} className="px-2 py-1.5 rounded-item hover:bg-mute-ghost-hover transition-colors">{body}</Link>
          : <div key={i.key} className="px-2 py-1.5">{body}</div>
      })}
    </div>
  )
}

type Item = { key: string; to: string | null; main: string; sub: string }
type Group = { id: string; title: string; items: Item[] }

function groupsOf(a: SalesDashboard["attention"], link: (id: string | null) => string | null): Group[] {
  return [
    { id: "tasks", title: "Muddati o'tgan vazifalar",
      items: a.overdue_tasks.map((t) => ({ key: t.id, to: link(t.lead_id), main: `${t.text || kindLabel(t.kind)} · ${t.lead_name}`, sub: `${t.assignee ?? "Belgilanmagan"} · ${ago(t.due_date)}` })) },
    { id: "stale", title: "Harakatsiz bitimlar",
      items: a.stale_leads.map((l) => ({ key: l.id, to: link(l.id), main: l.name, sub: `${l.stage} · ${l.days} kun · ${l.responsible ?? "Mas'ulsiz"}` })) },
    { id: "missed", title: "Qayta qo'ng'iroq qilinmagan",
      items: a.missed_unanswered.map((m) => ({ key: m.phone, to: link(m.lead_id), main: m.client_name ?? formatPhone(m.phone), sub: `${m.count} marta · ${ago(m.last_missed_at)}` })) },
  ]
}

// A bitim page needs the Sotuv module; without it the rows are plain text
const useLink = () => (useAuth().hasAccess("sotuv-crmn") ? (id: string | null) => (id ? `/sotuv/bitim/${id}` : null) : () => null)

export function AttentionPanel({ a }: { a: SalesDashboard["attention"] }) {
  const groups = groupsOf(a, useLink())
  return (
    <Card title="E'tibor talab qiladi">
      {groups.map((g) => <List key={g.id} title={g.title} empty="Hozircha yo'q" items={g.items} />)}
    </Card>
  )
}

const ICONS: Record<string, ReactNode> = { tasks: <ClockCountdown size={20} />, stale: <Hourglass size={20} />, missed: <PhoneX size={20} /> }
const SHOWN = 4

/** Phone version: three counted rows, the first with something in it opens by itself; each row
 *  is a tap target that expands its items (bitim links) */
export function AttentionMobile({ a }: { a: SalesDashboard["attention"] }) {
  const groups = groupsOf(a, useLink())
  const [open, setOpen] = useState<string | null>(() => groups.find((g) => g.items.length)?.id ?? null)
  const [all, setAll] = useState<string | null>(null)
  const total = groups.reduce((s, g) => s + g.items.length, 0)
  return (
    <div className="bg-surface-sunken rounded-surface overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
        <h3 className="text-base font-semibold text-ink">E'tibor talab qiladi</h3>
        {total === 0 && <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-success-soft text-success-dark text-xs font-medium"><CheckCircle size={12} weight="bold" />Hammasi joyida</span>}
      </div>
      {groups.map((g) => {
        const n = g.items.length, on = open === g.id && n > 0
        const items = all === g.id ? g.items : g.items.slice(0, SHOWN)
        return (
          <div key={g.id} className="border-t border-line first:border-t-0">
            <button type="button" disabled={n === 0} onClick={() => setOpen(on ? null : g.id)} aria-expanded={on}
              className="w-full min-h-14 px-4 py-2 flex items-center gap-3 text-left active:bg-mute-ghost-hover disabled:active:bg-transparent">
              <span className={`size-10 shrink-0 rounded-full flex items-center justify-center ${n ? "bg-danger-soft text-danger-dark" : "bg-surface text-ink-faint"}`}>{ICONS[g.id]}</span>
              <span className={`flex-1 min-w-0 text-base font-medium truncate ${n ? "text-ink" : "text-ink-muted"}`}>{g.title}</span>
              <span className={`h-7 min-w-7 px-2 inline-flex items-center justify-center rounded-full text-sm font-semibold tabular-nums ${n ? "bg-danger-soft text-danger-dark" : "bg-surface text-ink-faint"}`}>{n}</span>
              <CaretDown size={16} className={`shrink-0 transition-transform ${n === 0 ? "opacity-0" : on ? "rotate-180 text-ink" : "text-ink-faint"}`} />
            </button>
            {on && (
              <div className="px-2 pb-2">
                {items.map((i) => {
                  const body = <><span className="block text-base text-ink truncate">{i.main}</span><span className="block text-sm text-ink-muted truncate">{i.sub}</span></>
                  const cls = "min-h-14 px-2 py-2 rounded-item flex items-center gap-2"
                  return i.to
                    ? <Link key={i.key} to={i.to} className={`${cls} active:bg-mute-ghost-hover`}><span className="flex-1 min-w-0">{body}</span><CaretRight size={16} className="shrink-0 text-ink-faint" /></Link>
                    : <div key={i.key} className={cls}><span className="flex-1 min-w-0">{body}</span></div>
                })}
                {n > SHOWN && (
                  <button type="button" onClick={() => setAll(all === g.id ? null : g.id)}
                    className="mt-1 w-full h-10 rounded-full bg-surface text-sm font-medium text-ink">
                    {all === g.id ? "Kamroq" : `Yana ${n - SHOWN} ta`}
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
