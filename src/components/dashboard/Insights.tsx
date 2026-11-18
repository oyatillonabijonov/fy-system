// The Dashboard's second batch (104), in the Bento's language: a number or a short list, each with its
// picture; colour only carries meaning (green = sold, rose = lost, grey = the rest), figures stay in ink.
//   QualityCard  — all leads → qualified → sold, then the same per score: is the scoring right?
//   LossCard     — why bitimlar were lost, biggest first
//   CycleCard    — days from a lead to its first payment
//   ActivityCard — leads against calls by day / week / hour: do the calls follow the leads?
//   AdsTable     — which ad brought leads, good leads, sales and money
import { useMemo, useState, type CSSProperties, type ReactNode } from "react"
import type { SalesInsights } from "@/lib/supabase/queries/salesDashboard"
import { sourceLabel } from "@/lib/supabase/queries/sotuv"
import { AD_LEVELS, groupAds, type AdLevel } from "@/lib/adRows"
import { EChartsLineChart, type ChartConfig } from "@/components/evilcharts/charts/echarts-line-chart"
import { tbl } from "@/components/ui/table"
import { Pager, usePaged } from "@/components/ui/Pager"
import { formatNumber } from "@/lib/format"
import { shortMoney } from "@/components/sotuv/ui"
import { Card, Empty } from "./pieces"

type Pair = [string, string]   // [light, dark]
const GREEN: Pair = ["#059669", "#34d399"], ROSE: Pair = ["#e11d48", "#fb7185"], INDIGO: Pair = ["#4f46e5", "#818cf8"], REST: Pair = ["#d4d4d4", "#3f3f3f"]
const sw = (c: Pair) => ({ "--sw-l": c[0], "--sw-d": c[1] }) as CSSProperties
const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "—")
const dec = (n: number) => String(n).replace(".", ",")

/** A name, its figure, and a thin bar under them: `share` of the track, `over` = the part of it that sold */
function Meter({ label, figure, share, color, over }: { label: ReactNode; figure: ReactNode; share: number; color: Pair; over?: number }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-ink-muted truncate">{label}</span>
        <span className="tabular-nums whitespace-nowrap shrink-0">{figure}</span>
      </div>
      <div className="relative h-2 rounded-full bg-surface overflow-hidden">
        <span className="chart-swatch absolute inset-y-0 left-0 rounded-full" style={{ ...sw(color), width: `${Math.min(share, 1) * 100}%` }} />
        {!!over && <span className="chart-swatch absolute inset-y-0 left-0 rounded-full" style={{ ...sw(GREEN), width: `${Math.min(over, 1) * 100}%` }} />}
      </div>
    </div>
  )
}
const Num = ({ n, note }: { n: number | string; note?: string }) => <><span className="font-semibold text-ink">{typeof n === "number" ? formatNumber(n) : n}</span>{note && <span className="ml-1.5 text-ink-muted">{note}</span>}</>
/** A card with its title inside — or, on a phone (`bare`), without: the page draws the title above the card */
function Shell({ bare, title, aside, children }: { bare?: boolean; title: string; aside?: ReactNode; children: ReactNode }) {
  return bare ? <Card>{aside && <div className="text-sm text-ink-muted">{aside}</div>}{children}</Card> : <Card title={title} aside={aside}>{children}</Card>
}
const Sub = ({ children }: { children: ReactNode }) => <span className="pt-4 border-t border-line text-sm text-ink-muted">{children}</span>

export function QualityCard({ q, bare }: { q: SalesInsights["quality"]; bare?: boolean }) {
  const scores = [7, 6, 5, 4, 3, 2, 1, 0].map((s) => q.by_score.find((r) => r.score === s) ?? { score: s, leads: 0, won: 0 })
  const blank = q.by_score.find((r) => r.score === null)
  const max = Math.max(1, ...q.by_score.map((r) => r.leads))
  const line = q.threshold   // scores from here up count as qualified (known when one voronka is chosen)
  const row = (r: { score: number | null; leads: number; won: number }) => (
    <div key={r.score ?? "none"} className="flex items-center gap-3 text-sm">
      <span className={`w-12 shrink-0 tabular-nums ${r.leads ? "text-ink" : "text-ink-faint"}`}>{r.score === null ? "Ballsiz" : `${r.score} ball`}</span>
      <div className="relative flex-1 h-2 rounded-full bg-surface overflow-hidden">
        <span className="chart-swatch absolute inset-y-0 left-0 rounded-full" style={{ ...sw(REST), width: `${(r.leads / max) * 100}%` }} />
        <span className="chart-swatch absolute inset-y-0 left-0 rounded-full" style={{ ...sw(GREEN), width: `${(r.won / max) * 100}%` }} />
      </div>
      <span className="w-24 shrink-0 text-right tabular-nums whitespace-nowrap"><Num n={r.leads} note={r.leads ? `${pct(r.won, r.leads)} sotuv` : undefined} /></span>
    </div>
  )
  return (
    <Shell bare={bare} title="Lid sifati" aside="davrda ochilgan">
      {q.leads === 0 ? <Empty text="Davrda lid yo'q" /> : (
        <>
          <div className="flex flex-col gap-3">
            <Meter label="Jami lid" figure={<Num n={q.leads} />} share={1} color={REST} />
            <Meter label="Sifatli lid" figure={<Num n={q.qualified} note={`${pct(q.qualified, q.leads)} lidlardan`} />} share={q.qualified / q.leads} color={INDIGO} />
            <Meter label="Sifatlidan sotuv" figure={<Num n={q.won_qualified} note={`${pct(q.won_qualified, q.qualified)} sifatlilardan`} />} share={q.won_qualified / q.leads} color={GREEN} />
          </div>
          {q.scored === 0 ? <Sub>Davrda ball qo'yilgan lid yo'q: ball sayt formasidagi lavozim va aylanmaga qarab qo'yiladi.</Sub> : (
            <div className="flex flex-col gap-2 pt-4 border-t border-line">
              <span className="text-sm text-ink-muted">Ball bo'yicha: lidlar va ulardan sotuv</span>
              {scores.map((r) => [
                row(r),
                line !== null && line > 0 && r.score === line && <div key="line" className="flex items-center gap-2 text-xs text-ink-faint"><span className="h-px flex-1 bg-line" />{line} balldan sifatli<span className="h-px flex-1 bg-line" /></div>,
              ])}
              {blank && row(blank)}
            </div>
          )}
        </>
      )}
    </Shell>
  )
}

/** Ranked bars in one hue: the reasons compare with each other. "Ko'rsatilmagan" (lost before a reason was asked) goes last, in grey */
export function LossCard({ rows, bare }: { rows: SalesInsights["lost_reasons"]; bare?: boolean }) {
  const total = rows.reduce((s, r) => s + r.count, 0), max = Math.max(1, ...rows.map((r) => r.count))
  const none = (r: { reason: string }) => r.reason === "Ko'rsatilmagan"
  const ranked = [...rows.filter((r) => !none(r)), ...rows.filter(none)]
  return (
    <Shell bare={bare} title="Rad etish sabablari" aside={total ? `${formatNumber(total)} ta yutqazilgan` : undefined}>
      {total === 0 ? <Empty text="Davrda yutqazilgan bitim yo'q" /> : (
        <div className="flex flex-col gap-3">
          {ranked.map((r) => <Meter key={r.reason} label={r.reason} figure={<Num n={r.count} note={pct(r.count, total)} />} share={r.count / max} color={none(r) ? REST : ROSE} />)}
        </div>
      )}
    </Shell>
  )
}

const SPANS = [["lt1", "shu kuni"], ["d1_3", "1–3"], ["d4_7", "4–7"], ["d8_14", "8–14"], ["gt14", "15+"]] as const

export function CycleCard({ c, bare }: { c: SalesInsights["cycle"]; bare?: boolean }) {
  const max = Math.max(1, ...SPANS.map(([k]) => c[k]))
  return (
    <Shell bare={bare} title="Sotuv sikli" aside="liddan birinchi to'lovgacha">
      {c.count === 0 ? <Empty text="Davrda yutilgan bitim yo'q" /> : (
        <>
          <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap">
            <span className="text-3xl font-semibold text-ink whitespace-nowrap leading-none">{dec(c.median_days ?? 0)}<span className="ml-1.5 text-base font-medium text-ink-muted">kun</span></span>
            <span className="text-sm text-ink-muted">median · o'rtacha {dec(c.avg_days ?? 0)} kun · {formatNumber(c.count)} ta sotuv</span>
          </div>
          {/* five spans of days: few enough to write the count on each */}
          <div className="grid grid-cols-5 gap-1.5">
            {SPANS.map(([k, label]) => (
              <div key={k} className="flex flex-col items-center gap-1.5 min-w-0">
                <span className={`text-sm font-semibold tabular-nums ${c[k] ? "text-ink" : "text-ink-faint"}`}>{c[k]}</span>
                <div className="h-14 w-full flex items-end justify-center">
                  <span className="chart-swatch block w-full max-w-9 rounded-t-[4px]" style={{ ...sw(c[k] ? GREEN : REST), height: c[k] ? `max(3px, ${(c[k] / max) * 100}%)` : 2 }} />
                </div>
                <span className="text-xs text-ink-faint whitespace-nowrap">{label}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 pt-4 border-t border-line">
            <span className="text-sm text-ink-muted">Manba bo'yicha, median</span>
            {c.by_source.map((r) => (
              <div key={r.source ?? "none"} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-ink truncate">{sourceLabel(r.source)}</span>
                <span className="tabular-nums whitespace-nowrap"><Num n={`${dec(r.median_days)} kun`} note={`${r.count} ta`} /></span>
              </div>
            ))}
          </div>
        </>
      )}
    </Shell>
  )
}

// The four series, in the validated order of the dataviz palette (blue, orange, aqua, yellow)
const SERIES: ChartConfig = {
  leads: { label: "Lid tushishi", colors: { light: ["#2a78d6"], dark: ["#3987e5"] } },
  out: { label: "Chiquvchi qo'ng'iroq", colors: { light: ["#eb6834"], dark: ["#d95926"] } },
  connected: { label: "Bog'langan", colors: { light: ["#1baf7a"], dark: ["#199e70"] } },
  in: { label: "Kiruvchi qo'ng'iroq", colors: { light: ["#eda100"], dark: ["#c98500"] } },
}
const MODES = [["day", "Kun"], ["week", "Hafta"], ["hour", "Soat"]] as const
type Mode = (typeof MODES)[number][0]
const ddmm = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`

/** Leads and calls on one time line. Soat adds every day of the period up by the hour: when leads come, when we call */
export function ActivityCard({ a, height = 300, bare }: { a: SalesInsights["activity"]; height?: number; bare?: boolean }) {
  const [mode, setMode] = useState<Mode>("day")
  const data = useMemo(() => {
    if (mode === "hour") return a.by_hour.map((r) => ({ ...r, x: String(r.hour).padStart(2, "0") }))
    if (mode === "day") return a.by_day.map((r) => ({ ...r, x: ddmm(r.day) }))
    // weeks start on Monday; a week is named by its first day inside the period
    const weeks = new Map<string, { x: string; leads: number; out: number; connected: number; in: number }>()
    for (const r of a.by_day) {
      const d = new Date(`${r.day}T00:00:00Z`), monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10)
      const w = weeks.get(monday) ?? { x: ddmm(r.day), leads: 0, out: 0, connected: 0, in: 0 }
      w.leads += r.leads; w.out += r.out; w.connected += r.connected; w.in += r.in
      weeks.set(monday, w)
    }
    return [...weeks.values()]
  }, [a, mode])
  const empty = a.by_day.every((r) => r.leads + r.out + r.in === 0)
  return (
    <Shell bare={bare} title="Lidlar va qo'ng'iroqlar" aside={
      <span role="tablist" aria-label="Guruhlash" className="inline-flex gap-1 p-1 rounded-control bg-surface">
        {MODES.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => setMode(id)}
            className={`h-7 px-3 shrink-0 whitespace-nowrap rounded-item text-sm font-medium transition-colors ${mode === id ? "bg-surface-sunken text-ink" : "text-ink-muted hover:text-ink"}`}>{label}</button>
        ))}
      </span>}>
      {empty ? <Empty text="Davrda lid ham, qo'ng'iroq ham yo'q" /> : (
        <>
          <div style={{ height }} className="[--background:var(--ds-color-surface-sunken)]">
            <EChartsLineChart key={mode} data={data} config={SERIES} xDataKey="x" curveType="linear" className="h-full w-full">
              <EChartsLineChart.Grid />
              <EChartsLineChart.XAxis />
              <EChartsLineChart.YAxis />
              <EChartsLineChart.Tooltip />
              <EChartsLineChart.Legend align="left" verticalAlign="top" />
              <EChartsLineChart.Line dataKey="leads" />
              <EChartsLineChart.Line dataKey="out" />
              <EChartsLineChart.Line dataKey="connected" />
              <EChartsLineChart.Line dataKey="in" />
            </EChartsLineChart>
          </div>
          <p className="text-sm text-ink-muted">{mode === "hour"
            ? "Davrdagi barcha kunlar soat bo'yicha qo'shilgan (Toshkent vaqti): lid ko'p tushadigan soatda qo'ng'iroq bormi?"
            : "Bog'langan — javob berilgan chiquvchi qo'ng'iroq."}</p>
        </>
      )}
    </Shell>
  )
}

/** Sales by ad at one of four depths. `compact` (phone): a list instead of the table */
export function AdsTable({ rows, compact = false }: { rows: SalesInsights["by_ad"]; compact?: boolean }) {
  const [level, setLevel] = useState<AdLevel>("creative")
  const groups = useMemo(() => groupAds(rows, level), [rows, level])
  const { page, setPage, pageCount, pageItems } = usePaged(groups)
  const money = rows.some((r) => r.agreed !== null)   // null without the Moliya right
  const max = Math.max(1, ...groups.map((g) => g.leads))
  const levels = (
    <div role="tablist" aria-label="Kesim" className={`inline-flex self-start gap-1 p-1 rounded-control ${compact ? "bg-fill" : "bg-surface-sunken"}`}>
      {AD_LEVELS.map((l) => (
        <button key={l.id} type="button" role="tab" aria-selected={level === l.id} onClick={() => setLevel(l.id)}
          className={`h-7 px-3 shrink-0 whitespace-nowrap rounded-item text-sm font-medium transition-colors ${level === l.id ? (compact ? "bg-card text-ink" : "bg-surface text-ink") : "text-ink-muted hover:text-ink"}`}>{l.label}</button>
      ))}
    </div>
  )
  // a row with no name at this depth is titled by the deepest name it does have ("Sayt · kreativ ko'rsatilmagan")
  const name = (g: (typeof groups)[number]) => {
    const path = g.path.map((n, i) => (i === 0 ? sourceLabel(n) : n))
    const own = g.name ? (level === "source" ? sourceLabel(g.name) : g.name) : null
    const title = own ?? path.pop() ?? "Noma'lum"
    const sub = [...path, ...(own ? [] : [`${AD_LEVELS.find((l) => l.id === level)!.label.toLowerCase()} ko'rsatilmagan`])].join(" › ")
    return (
      <span className="flex flex-col min-w-0">
        <span className="truncate text-ink">{title}</span>
        {sub && <span className="text-xs text-ink-faint truncate">{sub}</span>}
      </span>
    )
  }
  if (rows.length === 0) return <div className="bg-surface-sunken rounded-surface"><Empty text="Davrda lid yo'q" /></div>
  return (
    <div className="flex flex-col gap-3">
      {levels}
      {compact ? (
        <div className="bg-surface-sunken rounded-surface overflow-hidden">
          {pageItems.map((g) => (
            <div key={g.key} className="min-h-14 px-4 py-3 flex items-center gap-3 border-b border-line last:border-0">
              <span className="flex-1 min-w-0 flex flex-col text-base">
                {name(g)}
                <span className="text-sm text-ink-muted tabular-nums truncate">{g.leads} lid · {g.qualified} sifatli · {g.won} sotuv</span>
              </span>
              {g.agreed !== null && <span className="shrink-0 text-base font-semibold tabular-nums text-ink whitespace-nowrap">{shortMoney(g.agreed)}</span>}
            </div>
          ))}
        </div>
      ) : (
        <div className={tbl.scroll}>
          <table className={tbl.table}>
            <thead>
              <tr>
                <th className={tbl.th}>{AD_LEVELS.find((l) => l.id === level)!.label}</th>
                <th className={tbl.th}>Lid</th><th className={`${tbl.th} text-right`}>Sifatli</th><th className={`${tbl.th} text-right`}>Sotuv</th>
                <th className={`${tbl.th} text-right`}>Joy</th>
                {money && <><th className={`${tbl.th} text-right`}>Shartnoma</th><th className={`${tbl.th} text-right`}>To'langan</th></>}
              </tr>
            </thead>
            <tbody>
              {pageItems.map((g) => (
                <tr key={g.key} className={tbl.tr}>
                  <td className={`${tbl.td} max-w-56`}>{name(g)}</td>
                  <td className={tbl.td}>
                    <span className="flex items-center gap-2.5">
                      <span className="w-8 shrink-0 tabular-nums font-medium">{formatNumber(g.leads)}</span>
                      <span className="relative h-2 w-16 rounded-full bg-surface-sunken overflow-hidden">
                        <span className="chart-swatch absolute inset-y-0 left-0 rounded-full" style={{ ...sw(REST), width: `${(g.leads / max) * 100}%` }} />
                        <span className="chart-swatch absolute inset-y-0 left-0 rounded-full" style={{ ...sw(GREEN), width: `${(g.won / max) * 100}%` }} />
                      </span>
                    </span>
                  </td>
                  <td className={`${tbl.td} text-right tabular-nums whitespace-nowrap`}>{formatNumber(g.qualified)}<span className="ml-1.5 text-ink-muted">{pct(g.qualified, g.leads)}</span></td>
                  <td className={`${tbl.td} text-right tabular-nums whitespace-nowrap`}>{formatNumber(g.won)}<span className="ml-1.5 text-ink-muted">{pct(g.won, g.leads)}</span></td>
                  <td className={`${tbl.td} text-right tabular-nums`}>{formatNumber(g.seats)}</td>
                  {money && <><td className={`${tbl.td} text-right tabular-nums whitespace-nowrap`}>{shortMoney(g.agreed ?? 0)}</td><td className={`${tbl.td} text-right tabular-nums whitespace-nowrap`}>{shortMoney(g.paid ?? 0)}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} pageCount={pageCount} total={groups.length} onPage={setPage} />
    </div>
  )
}
