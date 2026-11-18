// The Dashboard's top block (103): three tiles in the order of a sale — Lid → Joy → Pul. Each has the
// same build, so the eye compares them row by row: the number, its days as bars, then what it is made of.
//   Lidlar — bitimlar opened, by day; what became of them by now
//   Joylar — seats sold, by day; one dot a seat, by payment
//   Pul    — cash in, by day; how much of what was agreed is paid
// Hovering a day puts that day in the headline (the Funnel's habit). Colour only carries meaning:
// green = money in / won, rose = lost, grey = not yet. Values and labels stay in ink.
import { useState, type CSSProperties, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { ArrowUpRight } from "@phosphor-icons/react"
import type { SalesDashboard } from "@/lib/supabase/queries/salesDashboard"
import { useAuth } from "@/context/AuthContext"
import { formatNumber } from "@/lib/format"
import { shortMoney } from "@/components/sotuv/ui"
import { DeltaBadge, delta } from "./pieces"

type Pair = [string, string]   // [light, dark]
const GREEN: Pair = ["#059669", "#34d399"], MINT: Pair = ["#6ee7b7", "#1f7a5c"], ROSE: Pair = ["#e11d48", "#fb7185"]
const INDIGO: Pair = ["#4f46e5", "#818cf8"], REST: Pair = ["#d4d4d4", "#3f3f3f"]
const sw = (c: Pair) => ({ "--sw-l": c[0], "--sw-d": c[1] }) as CSSProperties
const dm = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`

/** One tile: what the number is (or the hovered day) and a way into the list behind it, the number,
 *  its days, then its parts under a hairline. `days` is null on a phone: bars only speak on hover. */
function Tile({ label, note, to, toLabel, value, unit, badge, days, children }: {
  label: string; note: string; to?: string | null; toLabel?: string
  value: string; unit?: string; badge: ReactNode; days: ReactNode; children: ReactNode
}) {
  return (
    <div className="bg-surface-sunken rounded-surface p-4 sm:p-5 flex flex-col gap-4 min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col min-w-0">
          <span className="text-base font-medium text-ink">{label}</span>
          <span className="text-sm text-ink-muted truncate">{note}</span>
        </div>
        {to && <Link to={to} aria-label={toLabel} title={toLabel} className="size-8 shrink-0 rounded-full bg-surface flex items-center justify-center text-ink hover:bg-mute-ghost-hover transition-colors"><ArrowUpRight size={16} /></Link>}
      </div>
      {/* room for the badge to wrap under a long figure, so the bars of all three tiles start on one line */}
      <div className="flex items-start content-start gap-x-3 gap-y-1.5 flex-wrap lg:min-h-[4.25rem]">
        <span className="text-3xl font-semibold text-ink whitespace-nowrap leading-none">
          {value}{unit && <span className="ml-1.5 text-base font-medium text-ink-muted">{unit}</span>}
        </span>
        {badge}
      </div>
      {days}
      <div className="flex flex-col gap-3 pt-4 border-t border-line">{children}</div>
    </div>
  )
}

/** One thin bar a day; a day with nothing is a tick on the baseline. Hover = that day */
function Bars({ days, values, color, hover, onHover }: { days: string[]; values: number[]; color: Pair; hover: number | null; onHover: (i: number | null) => void }) {
  if (days.length < 2) return null
  const max = Math.max(1, ...values)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-end gap-[2px] h-14" onMouseLeave={() => onHover(null)}>
        {values.map((v, i) => (
          <div key={days[i]} onMouseEnter={() => onHover(i)} className="flex-1 h-full min-w-0 flex items-end justify-center">
            <span className={`chart-swatch block w-full max-w-6 rounded-t-[3px] transition-opacity duration-150 ${hover !== null && hover !== i ? "opacity-35" : ""}`}
              style={{ ...sw(v > 0 ? color : REST), height: v > 0 ? `max(3px, ${(v / max) * 100}%)` : 2 }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-ink-faint tabular-nums"><span>{dm(days[0])}</span><span>{dm(days[days.length - 1])}</span></div>
    </div>
  )
}

/** The line over a tile's parts: what they are, and the one ratio worth reading off them */
function PartsHead({ label, ratio }: { label: string; ratio?: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 flex-wrap">
      <span className="text-sm text-ink-muted">{label}</span>
      {ratio && <span className="text-sm font-medium tabular-nums text-ink">{ratio}</span>}
    </div>
  )
}

type Part = { label: string; value: number; show: string; color: Pair }

function Legend({ parts, round = false }: { parts: Part[]; round?: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {parts.map((p) => (
        <span key={p.label} className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap">
          <span className={`chart-swatch size-2.5 shrink-0 ${round ? "rounded-full" : "rounded-[3px]"}`} style={sw(p.color)} />
          <span className="text-ink-muted">{p.label}</span>
          <span className="font-semibold tabular-nums text-ink">{p.show}</span>
        </span>
      ))}
    </div>
  )
}

/** One whole split into parts: a thin bar, the names and figures under it */
function Split({ parts }: { parts: Part[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex h-2 gap-[2px] rounded-full overflow-hidden bg-surface">
        {parts.filter((p) => p.value > 0).map((p) => <span key={p.label} className="chart-swatch" style={{ ...sw(p.color), flexGrow: p.value, flexBasis: 0 }} />)}
      </div>
      <Legend parts={parts} />
    </div>
  )
}

const MAX_DOTS = 96

/** `compact` (phone): no daily bars — they answer to hover, and a finger has none */
export function Bento({ d, pipelineId, compact = false }: { d: SalesDashboard; pipelineId: string | null; compact?: boolean }) {
  const { hasAccess } = useAuth()
  const [at, setAt] = useState<{ tile: string; i: number } | null>(null)
  const day = (tile: string) => (at?.tile === tile && at.i < d.daily.length ? at.i : null)   // the period may shrink under the pointer
  const days = d.daily.map((r) => r.day)
  const bars = (tile: string, values: number[], color: Pair) =>
    compact ? null : <Bars days={days} values={values} color={color} hover={day(tile)} onHover={(i) => setAt(i === null ? null : { tile, i })} />
  const k = d.kpi, m = d.sales.money, seats = d.sales.seats

  const li = day("leads"), open = Math.max(k.new - k.new_won - k.new_lost, 0)
  const leads = (
    <Tile label="Yangi bitimlar" note={li === null ? "davrda ochilgan" : `${dm(days[li])} kuni ochilgan`}
      to={hasAccess("sotuv-crmn") ? `/sotuv${pipelineId ? `?p=${pipelineId}` : ""}` : null} toLabel="Bitimlarni ochish"
      value={formatNumber(li === null ? k.new : d.daily[li].new)} badge={li === null && <DeltaBadge value={delta(k.new, d.kpi_prev.new)} />}
      days={bars("leads", d.daily.map((r) => r.new), INDIGO)}>
      <PartsHead label="Ular hozir" ratio={k.new > 0 ? `${Math.round((k.new_won / k.new) * 1000) / 10}% sotuvga aylandi` : null} />
      <Split parts={[
        { label: "Yutildi", value: k.new_won, show: formatNumber(k.new_won), color: GREEN },
        { label: "Jarayonda", value: open, show: formatNumber(open), color: REST },
        { label: "Yutqazildi", value: k.new_lost, show: formatNumber(k.new_lost), color: ROSE },
      ]} />
    </Tile>
  )

  const si = day("seats")
  // with the Moliya right a dot says how the seat is paid; without it a dot is just a seat
  const kinds: Part[] = m
    ? [{ label: "To'liq to'lagan", value: m.full, show: formatNumber(m.full), color: GREEN }, { label: "Qisman", value: m.partial, show: formatNumber(m.partial), color: MINT },
       { label: "To'lamagan", value: m.unpaid, show: formatNumber(m.unpaid), color: REST }]
    : [{ label: "Sotilgan", value: seats, show: formatNumber(seats), color: INDIGO }]
  const per = Math.max(1, Math.ceil(seats / MAX_DOTS))   // a big hall: one dot stands for several seats
  const seatsTile = (
    <Tile label="Sotilgan joylar" note={si === null ? "davrda tadbirga yozilgan" : `${dm(days[si])} kuni yozilgan`}
      value={formatNumber(si === null ? seats : d.daily[si].seats)} unit="joy" badge={si === null && <DeltaBadge value={delta(seats, d.sales.p_seats)} />}
      days={bars("seats", d.daily.map((r) => r.seats), INDIGO)}>
      <PartsHead label={m ? "To'lov bo'yicha" : "Har nuqta — bitta joy"} ratio={m && seats > 0 ? `${Math.round((m.full / seats) * 100)}% to'liq to'lagan` : null} />
      {seats === 0 ? <span className="text-sm text-ink-muted">Davrda hech kim yozilmagan</span> : (
        <>
          <div className="flex flex-wrap gap-1.5" role="img" aria-label={kinds.map((g) => `${g.label}: ${g.value}`).join(", ")}>
            {kinds.flatMap((g) => Array.from({ length: Math.round(g.value / per) }, (_, j) => <span key={`${g.label}${j}`} className="chart-swatch size-3 rounded-full" style={sw(g.color)} />))}
          </div>
          {per > 1 && <span className="text-xs text-ink-faint">1 nuqta = {per} joy</span>}
          {m && <Legend parts={kinds} round />}
        </>
      )}
    </Tile>
  )

  if (!m) return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{leads}{seatsTile}</div>

  const mi = day("money")
  // the Moliya list behind the money, narrowed to the chosen voronka's event
  const moliya = `/tadbirlar/moliya${pipelineId && d.plan[0] ? `?event=${d.plan[0].event_id}` : ""}`
  return (
    <div className="@container"><div className="grid grid-cols-1 @3xl:grid-cols-3 gap-3">
      {leads}{seatsTile}
      <Tile label="Tushum" note={mi === null ? "davrda haqiqatda to'langan" : `${dm(days[mi])} kuni to'langan`} to={moliya} toLabel="Moliyada ochish"
        value={formatNumber(mi === null ? m.collected : d.daily[mi].collected ?? 0)} unit="so'm" badge={mi === null && <DeltaBadge value={delta(m.collected, m.p_collected)} />}
        days={bars("money", d.daily.map((r) => r.collected ?? 0), GREEN)}>
        <PartsHead label={`Shartnoma · ${shortMoney(m.agreed)}`} ratio={m.agreed ? `${Math.round((m.paid / m.agreed) * 100)}% to'langan` : null} />
        <Split parts={[
          { label: "To'langan", value: m.paid, show: shortMoney(m.paid), color: GREEN },
          { label: "Qarz", value: m.owed, show: shortMoney(m.owed), color: REST },
        ]} />
        {seats > 0 && <span className="text-sm text-ink-muted">O'rtacha chek {shortMoney(Math.round(m.agreed / seats))} so'm</span>}
      </Tile>
    </div></div>
  )
}
