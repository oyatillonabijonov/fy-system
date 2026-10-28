// EvilCharts (ECharts) blocks adapted to our data: the "Revenue Mix" donut + value list, the
// "Progress Rings" dot ring and the bar chart. The vendored components live in components/evilcharts.
// They paint sector gaps in --background (the page); our charts sit on bg-surface-sunken cards, so
// ON_CARD points it at the card colour or dark mode gets a black outline round every sector.
const ON_CARD = "[--background:var(--ds-color-surface-sunken)]"
import type { CSSProperties } from "react"
import { EChartsPieChart, type ChartConfig } from "@/components/evilcharts/charts/echarts-pie-chart"
import { EChartsBarChart } from "@/components/evilcharts/charts/echarts-bar-chart"
import { formatNumber } from "@/lib/format"
import { Empty } from "./pieces"

type Pair = [string, string]   // [light, dark]
// Revenue Mix colours, then a few more for longer lists
const COLORS: Pair[] = [["#7c3aed", "#a78bfa"], ["#4f46e5", "#818cf8"], ["#0284c7", "#38bdf8"], ["#059669", "#34d399"],
  ["#d97706", "#fbbf24"], ["#e11d48", "#fb7185"], ["#0d9488", "#2dd4bf"], ["#64748b", "#94a3b8"]]
// Market Share greys
const GREYS: Pair[] = [["#0a0a0a", "#ffffff"], ["#262626", "#dedede"], ["#3d3d3d", "#bebebe"], ["#545454", "#a0a0a0"],
  ["#6b6b6b", "#868686"], ["#7d7d7d", "#6f6f6f"], ["#8f8f8f", "#5c5c5c"], ["#a3a3a3", "#4a4a4a"]]

export type MixRow = { key: string; label: string; value: number; hint?: string }

/** Donut with the total in a dashed centre circle and the value list under it ("Revenue Mix", stacked for narrow cards) */
export function MixDonut({ rows, totalLabel, grey = false }: { rows: MixRow[]; totalLabel: string; grey?: boolean }) {
  const shown = rows.filter((r) => r.value > 0)
  if (shown.length === 0) return <Empty text="Davrda harakat yo'q" />
  const palette = grey ? GREYS : COLORS
  const color = (i: number) => palette[i % palette.length]
  const config: ChartConfig = Object.fromEntries(shown.map((r, i) => [r.key, { label: r.label, colors: { light: [color(i)[0]], dark: [color(i)[1]] } }]))
  const total = shown.reduce((s, r) => s + r.value, 0)
  return (
    <div className="flex flex-col gap-3">
      <div className={`relative aspect-square w-full max-w-48 mx-auto ${ON_CARD}`}>
        <EChartsPieChart data={shown} config={config} dataKey="value" nameKey="key" className="h-full w-full">
          <EChartsPieChart.Tooltip />
          <EChartsPieChart.Pie innerRadius="62%" outerRadius="92%" paddingAngle={shown.length > 1 ? 6 : 0} cornerRadius={10} startAngle={90} endAngle={-270} />
        </EChartsPieChart>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="border-line flex aspect-square w-[56%] flex-col items-center justify-center rounded-full border border-dashed">
            <span className="text-2xl leading-none font-semibold tabular-nums text-ink">{formatNumber(total)}</span>
            <span className="mt-1 text-xs text-ink-muted">{totalLabel}</span>
          </div>
        </div>
      </div>
      <div className="flex min-w-0 flex-col">
        {shown.map((r, i) => (
          <div key={r.key} className="flex items-center gap-2 py-1.5">
            <span className="chart-swatch size-2.5 shrink-0 rounded-[3px]" style={{ "--sw-l": color(i)[0], "--sw-d": color(i)[1] } as CSSProperties} />
            <span className="truncate text-sm text-ink-muted">{r.label}</span>
            <span className="ml-auto flex items-baseline gap-1.5 text-sm tabular-nums">
              <span className="font-semibold text-ink">{formatNumber(r.value)}</span>
              {r.hint && <span className="text-xs text-ink-faint">{r.hint}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const DOTS = 40
const FILLED = { light: ["#E43861"], dark: ["#E43861"] }
const TRACK = { light: ["#d4d4d4"], dark: ["#3f3f3f"] }
const GAP = { light: ["transparent"], dark: ["transparent"] }

/** A ring of dots filled up to `value` %, the number and a caption in the middle ("Progress Rings") */
export function DotRing({ id, value, caption, color }: { id: string; value: number | null; caption: string; color?: string }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value))
  const filled = Math.round((DOTS * pct) / 100)
  const fill = color ? { light: [color], dark: [color] } : FILLED
  const key = id.replace(/[^a-zA-Z0-9_-]/g, "")   // sector names become CSS variable names
  const data = Array.from({ length: DOTS * 2 }, (_, i) => ({ dot: `${key}-${i}`, value: 1 }))
  const config: ChartConfig = Object.fromEntries(data.map((d, i) => [d.dot, { label: "", colors: i % 2 ? GAP : i / 2 < filled ? fill : TRACK }]))
  return (
    <div className={`relative aspect-square w-full max-w-48 mx-auto ${ON_CARD}`}>
      <EChartsPieChart data={data} config={config} dataKey="value" nameKey="dot" className="h-full w-full">
        <EChartsPieChart.Pie innerRadius="85%" outerRadius="92%" paddingAngle={0} cornerRadius={6} startAngle={90} endAngle={-270} />
      </EChartsPieChart>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 px-[22%] text-center bg-[radial-gradient(circle_closest-side,var(--ds-color-mute-ghost-hover)_0_79%,transparent_79%)]">
        <span className="text-3xl leading-none font-medium tabular-nums text-ink">{value === null ? "—" : `${Math.round(value)}%`}</span>
        <span className="text-xs leading-snug text-ink-muted text-balance">{caption}</span>
      </div>
    </div>
  )
}

/** New vs won bitimlar per day */
export function DailyBars({ rows }: { rows: { day: string; new: number; won: number }[] }) {
  const data = rows.map((r) => ({ day: `${r.day.slice(8, 10)}.${r.day.slice(5, 7)}`, new: r.new, won: r.won }))
  const config: ChartConfig = {
    new: { label: "Yangi bitimlar", colors: { light: ["#4f46e5"], dark: ["#818cf8"] } },
    won: { label: "Yutilgan", colors: { light: ["#059669"], dark: ["#34d399"] } },
  }
  return (
    <div className="h-[280px]">
      <EChartsBarChart data={data} config={config} xDataKey="day" barRadius={4} className="h-full w-full">
        <EChartsBarChart.Grid />
        <EChartsBarChart.XAxis />
        <EChartsBarChart.YAxis />
        <EChartsBarChart.Tooltip />
        <EChartsBarChart.Legend align="left" verticalAlign="top" />
        <EChartsBarChart.Bar dataKey="new" />
        <EChartsBarChart.Bar dataKey="won" />
      </EChartsBarChart>
    </div>
  )
}
