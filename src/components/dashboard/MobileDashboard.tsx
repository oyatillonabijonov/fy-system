// Phone/tablet (below lg) layout of the sales Dashboard: the same data as the desktop page, distilled to
// what a staff member acts on — period, the hero sum, four numbers, what needs attention, the funnel,
// sellers, calls, money. The charts that only restate those numbers sit behind one "Batafsil statistika".
import { useState, type ReactNode } from "react"
import { Check, CaretDown, FunnelSimple } from "@phosphor-icons/react"
import { useAuth } from "@/context/AuthContext"
import type { SalesDashboard } from "@/lib/supabase/queries/salesDashboard"
import { sourceLabel } from "@/lib/supabase/queries/sotuv"
import { Sheet } from "@/components/ui/Sheet"   // explicit .tsx: on a case-insensitive disk "Sheet" resolves to sheet.ts
import { formatNumber } from "@/lib/format"
import { Card, DeltaBadge, Funnel, delta } from "./pieces"
import { MixDonut, DailyBars, ScoreGauge } from "./charts"
import { SellerCards } from "./SellersTable"
import { CallsMobile } from "./CallsCard"
import { AttentionMobile } from "./AttentionPanel"
import { FinancePanel } from "./FinancePanel"

type PeriodOption = { id: string; label: string }

export function MobileDashboard({ d, periods, period, onPeriod, pipelineId, onPipeline, from, to }: {
  d: SalesDashboard; periods: readonly PeriodOption[]; period: string; onPeriod: (id: string) => void
  pipelineId: string | null; onPipeline: (id: string | null) => void; from: string; to: string
}) {
  const { hasAccess } = useAuth()
  const [more, setMore] = useState(false)
  const k = d.kpi, p = d.kpi_prev
  const sources = d.by_source.map((r) => ({ key: r.source ?? "none", label: sourceLabel(r.source), value: r.new, hint: r.won ? `${formatNumber(r.won)} yutildi` : undefined }))
  return (
    <div className="flex flex-col gap-6">
      {/* the period governs every number below, so the strip stays under the header while scrolling */}
      <div className="sticky -top-4 sm:-top-6 z-10 -mx-4 sm:-mx-6 py-2 -my-2 bg-ground">
        <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 sm:px-6">
          {periods.map((x) => (
            <button key={x.id} type="button" onClick={() => onPeriod(x.id)} aria-pressed={period === x.id}
              className={`shrink-0 h-9 px-3.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors active:opacity-80 ${period === x.id ? "bg-accent text-ink-on-accent" : "bg-card text-ink"}`}>
              {x.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="bg-surface-sunken rounded-surface p-4 flex flex-col gap-2 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-ink-muted whitespace-nowrap">Yutilgan summa</span>
            <PipelinePick pipelines={d.pipelines} pipelineId={pipelineId} onPipeline={onPipeline} />
          </div>
          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
            <span className="text-3xl font-semibold tabular-nums text-ink whitespace-nowrap">{formatNumber(k.won_sum)}<span className="ml-1.5 text-base font-medium text-ink-muted">so'm</span></span>
            <DeltaBadge value={delta(k.won_sum, p.won_sum)} />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Kpi label="Yangi bitimlar" value={formatNumber(k.new)} d={delta(k.new, p.new)} />
          <Kpi label="Yutilgan" value={formatNumber(k.won)} d={delta(k.won, p.won)} />
          <Kpi label="Yutqazilgan" value={formatNumber(k.lost)} d={delta(k.lost, p.lost)} invert />
          <Kpi label="Konversiya" value={k.conversion === null ? "—" : `${k.conversion}%`} d={null} />
        </div>
      </div>

      <AttentionMobile a={d.attention} />

      <Block title="Voronka"><Card><Funnel rows={d.funnel} compact /></Card></Block>

      <Block title="Sotuvchilar"><SellerCards rows={d.sellers} from={from} to={to} pipelineId={pipelineId} /></Block>

      <Block title="Qo'ng'iroqlar"><CallsMobile calls={d.calls} sellers={d.sellers} /></Block>

      {hasAccess("tadbirlar-moliya") && <Block title="Moliya"><FinancePanel from={from} to={to} mobile /></Block>}

      <section className="flex flex-col gap-6">
        <button type="button" onClick={() => setMore(!more)} aria-expanded={more}
          className="min-h-14 px-4 rounded-surface bg-surface-sunken flex items-center justify-between gap-3 text-base font-medium text-ink active:bg-surface-sunken-hover">
          Batafsil statistika
          <CaretDown size={16} className={`shrink-0 text-ink-faint transition-transform ${more ? "rotate-180" : ""}`} />
        </button>
        {more && (
          <>
            <Block title="Konversiya"><Card><ScoreGauge compact value={k.conversion} caption={`${formatNumber(k.won)} yutilgan · ${formatNumber(k.lost)} yutqazilgan`} /></Card></Block>
            <Block title="Manbalar"><Card><MixDonut compact totalLabel="yangi bitim" rows={sources} /></Card></Block>
            {!pipelineId && (
              <Block title="Voronkalar"><Card><MixDonut compact grey totalLabel="yangi bitim" rows={d.by_pipeline.map((r) => ({ key: r.id, label: r.name, value: r.new, hint: r.won ? `${formatNumber(r.won)} yutildi` : undefined }))} /></Card></Block>
            )}
            <Block title="Kunlik dinamika"><Card><DailyBars rows={d.daily} height={200} /></Card></Block>
          </>
        )}
      </section>
    </div>
  )
}

/** Section: the title stands outside the card, one style for every block of the page */
function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold text-ink px-1">{title}</h2>
      {children}
    </section>
  )
}

function Kpi({ label, value, d, invert }: { label: string; value: string; d: number | null; invert?: boolean }) {
  return (
    <div className="bg-surface-sunken rounded-surface p-4 flex flex-col gap-1 min-w-0">
      <span className="text-sm text-ink-muted truncate">{label}</span>
      <div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
        <span className="text-2xl font-semibold tabular-nums text-ink whitespace-nowrap">{value}</span>
        <DeltaBadge value={d} invert={invert} />
      </div>
    </div>
  )
}

/** The voronka filter: a small pill in the hero card that opens a sheet */
function PipelinePick({ pipelines, pipelineId, onPipeline }: {
  pipelines: SalesDashboard["pipelines"]; pipelineId: string | null; onPipeline: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const current = pipelines.find((x) => x.id === pipelineId)
  const options = [{ id: null, name: "Barcha voronkalar" }, ...pipelines.map((x) => ({ id: x.id as string | null, name: x.name }))]
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label="Voronka"
        className="min-w-0 h-8 pl-2.5 pr-3 rounded-full bg-surface text-sm font-medium text-ink inline-flex items-center gap-1.5 active:opacity-80">
        <FunnelSimple size={16} className="shrink-0 text-ink-muted" />
        <span className="truncate">{current?.name ?? "Barcha voronkalar"}</span>
        <CaretDown size={12} weight="bold" className="shrink-0 text-ink-muted" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Voronka">
        <div className="flex flex-col">
          {options.map((o) => (
            <button key={o.id ?? "all"} type="button" onClick={() => { onPipeline(o.id); setOpen(false) }}
              className="min-h-12 px-1 flex items-center justify-between gap-3 text-left text-base text-ink border-b border-line last:border-0 active:bg-surface-sunken-hover">
              <span className="truncate">{o.name}</span>
              {o.id === pipelineId && <Check size={20} weight="bold" className="shrink-0 text-ink" />}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  )
}
