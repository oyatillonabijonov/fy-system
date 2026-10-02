import { Link } from "react-router-dom"
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

export function AttentionPanel({ a }: { a: SalesDashboard["attention"] }) {
  // A bitim page needs the Sotuv module; without it the rows are plain text
  const link = useAuth().hasAccess("sotuv-crmn") ? (id: string | null) => (id ? `/sotuv/bitim/${id}` : null) : () => null
  return (
    <Card title="E'tibor talab qiladi">
      <List title="Muddati o'tgan vazifalar" empty="Hozircha yo'q"
        items={a.overdue_tasks.map((t) => ({ key: t.id, to: link(t.lead_id), main: `${t.text || kindLabel(t.kind)} · ${t.lead_name}`, sub: `${t.assignee ?? "Belgilanmagan"} · ${ago(t.due_date)}` }))} />
      <List title="Harakatsiz bitimlar" empty="Hozircha yo'q"
        items={a.stale_leads.map((l) => ({ key: l.id, to: link(l.id), main: l.name, sub: `${l.stage} · ${l.days} kun · ${l.responsible ?? "Mas'ulsiz"}` }))} />
      <List title="Qayta qo'ng'iroq qilinmagan" empty="Hozircha yo'q"
        items={a.missed_unanswered.map((m) => ({ key: m.phone, to: link(m.lead_id), main: m.client_name ?? formatPhone(m.phone), sub: `${m.count} marta · ${ago(m.last_missed_at)}` }))} />
    </Card>
  )
}
