/* eslint-disable react-refresh/only-export-components -- small shared bits of the Dashboard (delta() next to its cards) */
// Shared Dashboard pieces (cards, KPI tiles, lists, charts) — moved from pages/Dashboard.tsx in 080.
import { useState, type CSSProperties, type ReactNode } from "react"
import { ArrowUp, ArrowDown } from "@phosphor-icons/react"
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
        <div className={`bg-surface-sunken rounded-surface p-4 sm:p-5 flex flex-col gap-4 min-w-0 ${className}`}>
            {title && (
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
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
export function KpiCard({ className = "", label, icon, value, unit, sub, delta: d, invert }: { className?: string; label: string; icon: ReactNode; value: string; unit?: string; sub: string; delta: number | null; invert?: boolean }) {
    return (
        <div className={`@container bg-surface-sunken rounded-surface p-4 sm:p-5 flex flex-col gap-3 min-w-0 ${className}`}>
            <div className="flex items-center justify-between gap-2">
                <span className="text-base font-medium text-ink-muted">{label}</span>
                <span className="size-8 shrink-0 rounded-control-sm bg-surface flex items-center justify-center text-ink">{icon}</span>
            </div>
            <div className="flex items-center gap-x-2 gap-y-1 sm:gap-y-2 flex-wrap">
                {/* a long figure shrinks to the card's width instead of spilling out (~0.6em per character) */}
                <span className="text-xl sm:text-2xl font-semibold tabular-nums text-ink whitespace-nowrap">
                    <span style={{ fontSize: `min(1em, ${(100 / (0.6 * value.length)).toFixed(1)}cqi)` }}>{value}</span>
                </span>
                {unit && <span className="text-base text-ink-muted">{unit}</span>}
                <DeltaBadge value={d} invert={invert} />
            </div>
            <span className="text-sm text-ink-muted">{sub}</span>
        </div>
    )
}

/** Open bitimlar by stage as a horizontal flow funnel (after BoardUI's Funnel Chart Card): each stage
 *  is a column sized to its count that tapers into the next, a share pill in the middle and a
 *  name/value footer; hovering a stage dims the rest and puts it in the headline. "Hammasi" shows
 *  one voronka at a time behind tabs. */
export function Funnel({ rows, compact = false }: { rows: SalesDashboard["funnel"]; compact?: boolean }) {
  // By id: two voronkalar may share a name
  const pipelines = [...new Map(rows.map((r) => [r.pipeline_id, r.pipeline])).entries()]
  const [picked, setPicked] = useState<string | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  if (rows.length === 0) return <Empty text="Bosqich yo'q" />
  const pid = pipelines.some(([id]) => id === picked) ? picked! : pipelines[0][0]
  const stages = rows.filter((r) => r.pipeline_id === pid)
  const total = stages.reduce((s, r) => s + r.open, 0)
  const max = Math.max(1, ...stages.map((r) => r.open))

  // Geometry in a 1000 × 200 box, stretched to the card width
  const W = 1000, H = 200, GAP = 6, MIN = 14, HALO = 14
  const colW = W / stages.length
  const height = (v: number) => MIN + (H - 2 * HALO - MIN) * (v / max)
  const band = (i: number, extra: number) => {
    const x0 = i * colW, x1 = x0 + colW - GAP, xa = x0 + (x1 - x0) * 0.45, xm = (xa + x1) / 2
    const h = height(stages[i].open) + extra, hn = (i < stages.length - 1 ? height(stages[i + 1].open) : height(stages[i].open)) + extra
    const t = H / 2 - h / 2, b = H / 2 + h / 2, tn = H / 2 - hn / 2, bn = H / 2 + hn / 2
    return `M${x0},${t} L${xa},${t} C${xm},${t} ${xm},${tn} ${x1},${tn} L${x1},${bn} C${xm},${bn} ${xm},${b} ${xa},${b} L${x0},${b} Z`
  }
  const share = (v: number) => (total ? Math.round((v / total) * 100) : 0)
  const head = hover === null ? null : stages[hover]

  return (
    <div className="flex flex-1 flex-col gap-4">
      {pipelines.length > 1 && (compact ? (
        <div role="tablist" aria-label="Voronka" className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4">
          {pipelines.map(([id, name]) => (
            <button key={id} role="tab" aria-selected={id === pid} onClick={() => { setPicked(id); setHover(null) }}
              className={`h-9 px-3.5 shrink-0 whitespace-nowrap rounded-full text-sm font-medium transition-colors active:opacity-80 ${id === pid ? "bg-accent text-ink-on-accent" : "bg-surface text-ink"}`}>{name}</button>
          ))}
        </div>
      ) : (
        <div role="tablist" aria-label="Voronka" className="inline-flex self-start gap-1 p-1 rounded-control bg-surface flex-wrap">
          {pipelines.map(([id, name]) => (
            <button key={id} role="tab" aria-selected={id === pid} onClick={() => { setPicked(id); setHover(null) }}
              className={`h-7 px-3 shrink-0 whitespace-nowrap rounded-item text-sm font-medium transition-colors ${id === pid ? "bg-surface-sunken text-ink" : "text-ink-muted hover:text-ink"}`}>{name}</button>
          ))}
        </div>
      ))}

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-2xl font-semibold tabular-nums text-ink">{formatNumber(head ? head.open : total)}</span>
        <span className="text-base text-ink-muted">{head ? `${head.name} · ${share(head.open)}%` : "ochiq bitim"}</span>
        {(head ? head.open_sum : stages.reduce((s, r) => s + r.open_sum, 0)) > 0 && (
          <span className={`text-sm tabular-nums ${compact ? "text-ink-muted" : "text-ink-faint"}`}>· {formatNumber(head ? head.open_sum : stages.reduce((s, r) => s + r.open_sum, 0))} so'm</span>
        )}
      </div>

      {/* the row stretches the card to the right-hand column's height: keep the funnel's own
          proportions and sit it (with its footer) in the middle of whatever space is left */}
      <div className="my-auto flex flex-col gap-4">
      <div className={`relative ${compact ? "h-40" : "h-60"}`} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full block" aria-hidden>
          {stages.map((r, i) => (
            <g key={r.stage_id} onMouseEnter={() => setHover(i)} className="transition-opacity duration-200"
              style={{ opacity: hover === null || hover === i ? 1 : 0.3 }}>
              <path d={band(i, HALO)} fill={r.color} opacity={0.18} />
              <path d={band(i, 0)} fill={r.color} />
            </g>
          ))}
        </svg>
        {/* share pills, one per column centre */}
        {stages.map((r, i) => (
          <span key={r.stage_id} className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 px-2 h-6 inline-flex items-center rounded-full bg-surface text-sm font-medium tabular-nums text-ink transition-opacity duration-200"
            style={{ left: `${((i + 0.5) / stages.length) * 100}%`, opacity: hover === null || hover === i ? 1 : 0.4 }}>
            {share(r.open)}%
          </span>
        ))}
      </div>

      {/* phone: a plain 2-column value/label grid split by hairlines, no tiles inside the card */}
      {compact ? (
        <div className="grid grid-cols-2 gap-x-4">
          {stages.map((r, i) => (
            <div key={r.stage_id} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              className="min-w-0 py-3 border-t border-line transition-opacity duration-200" style={{ opacity: hover === null || hover === i ? 1 : 0.5 }}>
              <span className="block text-xl font-semibold tabular-nums text-ink">{formatNumber(r.open)}</span>
              <span className="flex items-center gap-1.5 text-sm text-ink-muted min-w-0">
                <span className="size-2.5 rounded-[3px] shrink-0" style={{ background: r.color }} />
                <span className="truncate">{r.name}</span>
              </span>
            </div>
          ))}
        </div>
      ) : (
      /* all stages in one row only when the card is wide enough for their names, else two per row */
      <div className="@container"><div className="grid grid-cols-2 gap-1.5 @lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": stages.length } as CSSProperties}>
        {stages.map((r, i) => (
          <div key={r.stage_id} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            className="bg-surface rounded-control px-3 py-2 min-w-0 transition-opacity duration-200" style={{ opacity: hover === null || hover === i ? 1 : 0.5 }}>
            <span className="flex items-center gap-1.5 text-sm text-ink-muted min-w-0">
              <span className="size-2.5 rounded-[3px] shrink-0" style={{ background: r.color }} />
              <span className="truncate">{r.name}</span>
            </span>
            <span className="text-md font-semibold tabular-nums text-ink">{formatNumber(r.open)}</span>
          </div>
        ))}
      </div></div>
      )}
      </div>
    </div>
  )
}
