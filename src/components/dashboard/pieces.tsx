/* eslint-disable react-refresh/only-export-components -- small shared bits of the Dashboard (delta() next to its cards) */
// Shared Dashboard pieces (cards, KPI tiles, lists, charts) — moved from pages/Dashboard.tsx in 080.
import type { ReactNode } from "react"
import { ArrowUp, ArrowDown } from "@phosphor-icons/react"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts"
import type { SalesDashboard } from "@/lib/supabase/queries/salesDashboard"
import { formatNumber } from "@/lib/format"

// A % change from a tiny base is noise ("3 → 30 = +900%"), so small bases show no delta.
export function delta(cur: number, prev: number): number | null {
    return prev >= 5 ? ((cur - prev) / prev) * 100 : null
}

export function Section({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-0.5 px-1">
                <h2 className="text-md font-semibold text-ink">{title}</h2>
                <p className="text-sm text-ink-muted">{desc}</p>
            </div>
            {children}
        </section>
    )
}

export function Card({ title, aside, className = "", children }: { title?: string; aside?: string; className?: string; children: ReactNode }) {
    return (
        <div className={`bg-surface-sunken rounded-surface p-5 flex flex-col gap-4 min-w-0 ${className}`}>
            {title && (
                <div className="flex items-center justify-between gap-3">
                    <h3 className="text-base font-semibold text-ink">{title}</h3>
                    {aside && <span className="text-sm text-ink-muted">{aside}</span>}
                </div>
            )}
            {children}
        </div>
    )
}

export function Empty({ text }: { text: string }) {
    return <div className="py-8 text-center text-base text-ink-muted">{text}</div>
}

export function DeltaBadge({ value, invert = false }: { value: number | null; invert?: boolean }) {
    if (value === null || !Number.isFinite(value)) return null
    const flat = Math.abs(value) < 0.5
    return (
        <span className={`inline-flex items-center gap-0.5 px-1.5 h-6 rounded-tag text-sm font-medium tabular-nums ${flat ? "bg-mute-soft text-mute-dark" : value > 0 !== invert ? "bg-success-soft text-success-dark" : "bg-danger-soft text-danger-dark"}`}>
            {!flat && (value > 0 ? <ArrowUp size={12} weight="bold" /> : <ArrowDown size={12} weight="bold" />)}
            {Math.abs(value).toFixed(0)}%
        </span>
    )
}

/** `invert`: growth is bad news (e.g. Yutqazilgan) — the badge turns red on ↑ */
export function KpiCard({ label, icon, value, unit, sub, delta: d, invert }: { label: string; icon: ReactNode; value: string; unit?: string; sub: string; delta: number | null; invert?: boolean }) {
    return (
        <div className="bg-surface-sunken rounded-surface p-5 flex flex-col gap-3 min-w-0">
            <div className="flex items-center justify-between">
                <span className="text-base font-medium text-ink-muted">{label}</span>
                <span className="size-8 rounded-control-sm bg-surface flex items-center justify-center text-ink">{icon}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-2xl font-semibold tabular-nums text-ink">{value}</span>
                {unit && <span className="text-base text-ink-muted">{unit}</span>}
                <DeltaBadge value={d} invert={invert} />
            </div>
            <span className="text-sm text-ink-muted">{sub}</span>
        </div>
    )
}

export function CountList({ rows }: { rows: { key: string; label: string; leads: number; won: number }[] }) {
    if (rows.length === 0) return <Empty text="Davrda harakat yo'q" />
    return (
        <div className="flex flex-col">
            {rows.map((r) => (
                <div key={r.key} className="flex items-center justify-between gap-3 py-2.5 border-b border-line last:border-0">
                    <span className="text-base text-ink truncate">{r.label}</span>
                    <span className="flex items-center gap-3 text-sm tabular-nums shrink-0">
                        <span className="text-ink-muted">{formatNumber(r.leads)} bitim</span>
                        <span className="text-success-text">{formatNumber(r.won)} yutildi</span>
                    </span>
                </div>
            ))}
        </div>
    )
}

/** Open bitimlar by stage (the voronka's current state); "Hammasi" groups stages under their voronka */
export function Funnel({ rows }: { rows: SalesDashboard["funnel"] }) {
  if (rows.length === 0) return <Empty text="Bosqich yo'q" />
  const max = Math.max(1, ...rows.map((r) => r.open))
  const groups = [...new Set(rows.map((r) => r.pipeline))]
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g} className="flex flex-col gap-2">
          {groups.length > 1 && <span className="text-sm font-medium text-ink-muted">{g}</span>}
          {rows.filter((r) => r.pipeline === g).map((r) => (
            <div key={r.stage_id} className="grid grid-cols-[minmax(0,160px)_1fr_auto] items-center gap-3">
              <span className="text-base text-ink truncate flex items-center gap-2">
                <span className="size-2 rounded-full shrink-0" style={{ background: r.color }} />{r.name}
              </span>
              <div className="h-6 rounded-item bg-surface overflow-hidden">
                <div className="h-full rounded-item bg-accent opacity-85" style={{ width: `${r.open ? Math.max(2, (r.open / max) * 100) : 0}%` }} />
              </div>
              <span className="text-base font-medium tabular-nums text-ink w-28 text-right">
                {formatNumber(r.open)}{r.open_sum > 0 && <span className="text-sm font-normal text-ink-muted"> · {formatNumber(r.open_sum)}</span>}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export function DailyChart({ rows }: { rows: SalesDashboard["daily"] }) {
    const data = rows.map((r) => ({ ...r, label: `${r.day.slice(8, 10)}.${r.day.slice(5, 7)}` }))
    const tick = { fontSize: 12, fill: "var(--ds-color-text-muted)", fontFamily: "var(--ds-font-body)" }
    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4 text-sm text-ink-muted">
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-mute-soft-hover" />Yangi bitimlar</span>
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-success" />Yutilgan</span>
            </div>
            <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barGap={2}>
                        <CartesianGrid vertical={false} stroke="var(--ds-color-border-default)" />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={tick} minTickGap={16} />
                        <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={tick} />
                        <Tooltip
                            cursor={{ fill: "var(--ds-color-mute-ghost-hover)" }}
                            contentStyle={{
                                borderRadius: "var(--ds-radius-menu)",
                                background: "var(--ds-color-surface-raised)",
                                color: "var(--ds-color-text-default)",
                                border: "1px solid var(--ds-color-border-default)",
                                fontFamily: "var(--ds-font-body)",
                                fontSize: 12,
                            }}
                        />
                        <Bar dataKey="new" name="Yangi bitimlar" fill="var(--ds-color-mute-soft-hover)" radius={[3, 3, 0, 0]} maxBarSize={18} />
                        <Bar dataKey="won" name="Yutilgan" fill="var(--ds-color-success-default)" radius={[3, 3, 0, 0]} maxBarSize={18} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}
