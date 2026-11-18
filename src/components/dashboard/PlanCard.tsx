import type { ReactNode } from "react"
import { WarningCircle } from "@phosphor-icons/react"
import type { SalesPlan } from "@/lib/supabase/queries/salesDashboard"
import { formatDate } from "@/lib/format"
import { shortMoney } from "@/components/sotuv/ui"
import { Card } from "./pieces"

const dec = (n: number) => String(n).replace(".", ",")
type Stat = { label: string; value: string; bad?: boolean }

/** One measure of the plan: fact against plan, a bar (the inner green part = already paid), pace figures */
function Meter({ title, head, pct, inner, note, stats }: { title: string; head: ReactNode; pct: number | null; inner?: number | null; note?: string; stats: Stat[] }) {
  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-ink-muted">{title}</span>
        {pct !== null && <span className="text-sm font-medium tabular-nums text-ink">{Math.round(pct)}%</span>}
      </div>
      <div className="text-2xl font-semibold tabular-nums text-ink whitespace-nowrap">{head}</div>
      {pct !== null && (
        <div className="relative h-2 rounded-full bg-surface overflow-hidden">
          <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${Math.min(pct, 100)}%` }} />
          {inner != null && <div className="absolute inset-y-0 left-0 rounded-full bg-success" style={{ width: `${Math.min(inner, 100)}%` }} />}
        </div>
      )}
      {note && <span className="text-sm text-ink-muted">{note}</span>}
      <div className="grid grid-cols-3 gap-1.5">
        {stats.map((s) => (
          <div key={s.label} className="bg-surface rounded-control px-3 py-2 min-w-0">
            <span className="block text-sm text-ink-muted truncate">{s.label}</span>
            <span className={`text-md font-semibold tabular-nums whitespace-nowrap ${s.bad ? "text-danger-text" : "text-ink"}`}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The event's plan against fact (103): seats for everyone, money with the Moliya right.
 *  Pace = the last 7 days' daily average; forecast = fact + pace × days left. `bare`: no title (the phone draws it outside). */
export function PlanCard({ p, bare = false }: { p: SalesPlan; bare?: boolean }) {
  const days = p.days_left ?? 0
  const seatsBehind = p.seats_plan !== null && p.seats_forecast !== null && p.seats_forecast < p.seats_plan
  const moneyBehind = p.revenue_plan !== null && p.agreed_forecast !== null && p.agreed_forecast < p.revenue_plan
  const when = [formatDate(p.event_date), p.days_left === null ? null : days > 0 ? `${days} kun qoldi` : "sotuv tugadi"].filter(Boolean).join(" · ")
  return (
    <Card title={bare ? undefined : `Tadbir plani · ${p.name}`} aside={bare ? undefined : when}>
      {bare && <span className="text-sm text-ink-muted">{when}</span>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
        <Meter title="Joylar" pct={p.seats_plan ? (p.seats / p.seats_plan) * 100 : null}
          head={<>{p.seats}<span className="text-base font-medium text-ink-muted">{p.seats_plan ? ` / ${p.seats_plan} joy` : " joy sotildi"}</span></>}
          note={p.seats_plan ? undefined : "Joylar plani kiritilmagan: Tadbirlar → tadbirni tahrirlash → Joylar plani"}
          stats={[
            ...(p.seats_plan ? [{ label: "Kuniga kerak", value: p.seats_need_per_day === null ? "—" : `${dec(p.seats_need_per_day)} ta` }] : []),
            { label: "Kunlik tezlik", value: `${dec(p.seats_per_day)} ta` },
            ...(p.seats_forecast !== null ? [{ label: "Prognoz", value: `${p.seats_forecast} ta`, bad: seatsBehind }] : []),
          ]} />
        {p.agreed !== null && (
          <Meter title="Shartnoma summasi" pct={p.revenue_plan ? (p.agreed / p.revenue_plan) * 100 : null}
            inner={p.revenue_plan && p.collected !== null ? (p.collected / p.revenue_plan) * 100 : null}
            head={<>{shortMoney(p.agreed)}<span className="text-base font-medium text-ink-muted">{p.revenue_plan ? ` / ${shortMoney(p.revenue_plan)} so'm` : " so'm"}</span></>}
            note={`Shundan to'langan: ${shortMoney(p.collected ?? 0)} so'm`}
            stats={[
              ...(p.revenue_plan ? [{ label: "Kuniga kerak", value: p.agreed_need_per_day === null ? "—" : shortMoney(p.agreed_need_per_day) }] : []),
              { label: "Kunlik tezlik", value: shortMoney(p.agreed_per_day ?? 0) },
              ...(p.agreed_forecast !== null ? [{ label: "Prognoz", value: shortMoney(p.agreed_forecast), bad: moneyBehind }] : []),
            ]} />
        )}
      </div>
      {days > 0 && (seatsBehind || moneyBehind) && (
        <p className="flex items-start gap-1.5 text-sm text-danger-text"><WarningCircle size={16} className="shrink-0 mt-0.5" />Hozirgi tezlikda plan bajarilmaydi. Tezlik — oxirgi 7 kundagi o'rtacha kunlik sotuv.</p>
      )}
    </Card>
  )
}
