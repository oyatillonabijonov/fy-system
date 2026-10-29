// Phone/tablet (below lg) layout of the sales Dashboard: the same data as the desktop page, a
// different order and presentation — the summary first, what needs attention right after it.
import { useState, type ReactNode } from "react"
import { Check, CaretDown, FunnelSimple, Coins } from "@phosphor-icons/react"
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
  const k = d.kpi, p = d.kpi_prev
  const sources = d.by_source.map((r) => ({ key: r.source ?? "none", label: sourceLabel(r.source), value: r.new, hint: r.won ? `${formatNumber(r.won)} yutildi` : undefined }))
  return (
    <div className="flex flex-col gap-5">
      <Controls periods={periods} period={period} onPeriod={onPeriod} pipelines={d.pipelines} pipelineId={pipelineId} onPipeline={onPipeline} />

      <div className="flex flex-col gap-2">
        <div className="bg-surface-sunken rounded-surface p-4 flex flex-col gap-2 min-w-0">
          <span className="flex items-center gap-1.5 text-sm text-ink-muted"><Coins size={16} />Yutilgan summa</span>
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
        <p className="px-1 text-xs text-ink-faint">O'zgarish: oldingi shuncha davrga nisbatan</p>
      </div>

      <AttentionMobile a={d.attention} />

      <Card title="Voronka" aside="ochiq bitimlar, hozir"><Funnel rows={d.funnel} compact /></Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
        <Card title="Konversiya"><ScoreGauge compact value={k.conversion} caption={`${formatNumber(k.won)} yutilgan · ${formatNumber(k.lost)} yutqazilgan`} /></Card>
        <Card title="Manbalar"><MixDonut compact totalLabel="yangi bitim" rows={sources} /></Card>
      </div>

      <Card title="Kunlik dinamika"><DailyBars rows={d.daily} height={200} /></Card>

      <Block title="Sotuvchilar" desc="Bitimlar va vazifalar; kartani bosing — batafsil">
        <SellerCards rows={d.sellers} from={from} to={to} pipelineId={pipelineId} />
      </Block>

      <Block title="Qo'ng'iroqlar" desc="Tanlangan davr">
        <CallsMobile calls={d.calls} sellers={d.sellers} />
      </Block>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
        {hasAccess("tadbirlar-moliya") && <FinancePanel from={from} to={to} mobile />}
        {!pipelineId && <Card title="Voronkalar"><MixDonut compact grey totalLabel="yangi bitim" rows={d.by_pipeline.map((r) => ({ key: r.id, label: r.name, value: r.new, hint: r.won ? `${formatNumber(r.won)} yutildi` : undefined }))} /></Card>}
      </div>
    </div>
  )
}

function Block({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="px-1">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <p className="hidden sm:block text-sm text-ink-muted">{desc}</p>
      </div>
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

/** Period chips (one swipeable row) and the voronka as a chip that opens a sheet */
function Controls({ periods, period, onPeriod, pipelines, pipelineId, onPipeline }: {
  periods: readonly PeriodOption[]; period: string; onPeriod: (id: string) => void
  pipelines: SalesDashboard["pipelines"]; pipelineId: string | null; onPipeline: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const current = pipelines.find((x) => x.id === pipelineId)
  const options = [{ id: null, name: "Barcha voronkalar" }, ...pipelines.map((x) => ({ id: x.id as string | null, name: x.name }))]
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 sm:-mx-6 sm:px-6">
        {periods.map((x) => (
          <button key={x.id} type="button" onClick={() => onPeriod(x.id)} aria-pressed={period === x.id}
            className={`shrink-0 h-9 px-3 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${period === x.id ? "bg-accent text-ink-on-accent" : "bg-surface-sunken text-ink"}`}>
            {x.label}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
        className="self-start max-w-full h-9 pl-3 pr-3.5 rounded-full bg-surface-sunken text-sm font-medium text-ink inline-flex items-center gap-2">
        <FunnelSimple size={16} className="shrink-0 text-ink-muted" />
        <span className="truncate">{current?.name ?? "Barcha voronkalar"}</span>
        <CaretDown size={12} weight="bold" className="shrink-0 text-ink-muted" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Voronka">
        <div className="flex flex-col">
          {options.map((o) => (
            <button key={o.id ?? "all"} type="button" onClick={() => { onPipeline(o.id); setOpen(false) }}
              className="min-h-12 px-1 flex items-center justify-between gap-3 text-left text-base text-ink border-b border-line last:border-0 active:bg-mute-ghost-hover">
              <span className="truncate">{o.name}</span>
              {o.id === pipelineId && <Check size={20} weight="bold" className="shrink-0 text-ink" />}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}
