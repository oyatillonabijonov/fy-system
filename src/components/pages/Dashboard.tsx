import { useMemo, useState } from "react"
import { UserPlus, Handshake, XCircle, Percent, Coins } from "@phosphor-icons/react"
import { useAuth } from "@/context/AuthContext"
import { useSalesDashboard } from "@/hooks/useSalesDashboard"
import { periodRange, tashkentToday } from "@/lib/period"
import { sourceLabel } from "@/lib/supabase/queries/sotuv"
import { Skeleton } from "@/components/ui/Skeleton"
import { formatNumber } from "@/lib/format"
import { Section, Card, KpiCard, CountList, Funnel, DailyChart, delta } from "@/components/dashboard/pieces"
import { SellersTable } from "@/components/dashboard/SellersTable"
import { CallsCard } from "@/components/dashboard/CallsCard"
import { AttentionPanel } from "@/components/dashboard/AttentionPanel"
import { FinancePanel } from "@/components/dashboard/FinancePanel"

const PERIODS = [
  { id: "today", label: "Bugun" },
  { id: "7d", label: "7 kun" },
  { id: "30d", label: "30 kun" },
  { id: "month", label: "Bu oy" },
  { id: "prev-month", label: "O'tgan oy" },
] as const
type PeriodId = (typeof PERIODS)[number]["id"]

/** Tashkent days, inclusive (YYYY-MM-DD) */
function range(id: PeriodId): { from: string; to: string } {
  const today = tashkentToday()
  const back = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10)
  switch (id) {
    case "today": return { from: today, to: today }
    case "7d": return { from: back(6), to: today }
    case "30d": return { from: back(29), to: today }
    case "month": return { from: `${today.slice(0, 8)}01`, to: today }
    case "prev-month": { const r = periodRange("last", null, null, today); return { from: r.from!, to: r.to! } }
  }
}

/** Sotuv bo'limi analytics (080): main flow on the left, what needs attention + Moliya on the right */
export function Dashboard() {
  const { hasAccess } = useAuth()
  const [period, setPeriod] = useState<PeriodId>("30d")
  const [pipelineId, setPipelineId] = useState<string | null>(null)
  const { from, to } = useMemo(() => range(period), [period])
  const { data: d, isLoading, error, refetch } = useSalesDashboard(from, to, pipelineId)

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {PERIODS.map((p) => (
            <button key={p.id} type="button" onClick={() => setPeriod(p.id)} aria-pressed={period === p.id}
              className={`px-3.5 h-control-md rounded-full text-base font-medium transition-colors ${period === p.id ? "bg-mute-soft text-ink" : "text-ink-muted hover:bg-mute-ghost-hover hover:text-ink"}`}>
              {p.label}
            </button>
          ))}
        </div>
        <select value={pipelineId ?? ""} onChange={(e) => setPipelineId(e.target.value || null)} aria-label="Voronka"
          className="h-control-md pl-3 pr-8 rounded-control bg-surface-sunken text-base text-ink border border-transparent outline-none focus:border-line-focus">
          <option value="">Barcha voronkalar</option>
          {d?.pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-surface bg-danger-soft text-danger-dark text-base">
          <span>Ma'lumot yuklanmadi: {error.message}</span>
          <button type="button" onClick={() => void refetch()} className="h-control-sm px-3 rounded-full bg-surface text-ink text-sm font-medium">Qayta urinish</button>
        </div>
      )}

      {isLoading || !d ? <Skeleton className="h-[420px] rounded-surface" /> : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
          <div className="flex flex-col gap-8 min-w-0">
            <Section title="Sotuv natijasi" desc="Tanlangan davr, oldingi shuncha davrga nisbatan">
              <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
                <KpiCard label="Yangi bitimlar" icon={<UserPlus size={16} />} value={formatNumber(d.kpi.new)} sub="davrda ochilgan" delta={delta(d.kpi.new, d.kpi_prev.new)} />
                <KpiCard label="Yutilgan" icon={<Handshake size={16} />} value={formatNumber(d.kpi.won)} sub="davrda yopilgan" delta={delta(d.kpi.won, d.kpi_prev.won)} />
                <KpiCard label="Yutqazilgan" icon={<XCircle size={16} />} value={formatNumber(d.kpi.lost)} sub="davrda yopilgan" delta={delta(d.kpi.lost, d.kpi_prev.lost)} invert />
                <KpiCard label="Konversiya" icon={<Percent size={16} />} value={d.kpi.conversion === null ? "—" : `${d.kpi.conversion}%`} sub="yutilgan ÷ yopilgan" delta={null} />
                <KpiCard label="Yutilgan summa" icon={<Coins size={16} />} value={formatNumber(d.kpi.won_sum)} unit="so'm" sub="bitim narxi bo'yicha" delta={delta(d.kpi.won_sum, d.kpi_prev.won_sum)} />
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                <Card title="Voronka" aside="ochiq bitimlar, hozir" className="xl:col-span-2"><Funnel rows={d.funnel} /></Card>
                <div className="flex flex-col gap-3">
                  <Card title="Manbalar"><CountList rows={d.by_source.map((r) => ({ key: r.source ?? "none", label: sourceLabel(r.source), leads: r.new, won: r.won }))} /></Card>
                  {!pipelineId && <Card title="Voronkalar"><CountList rows={d.by_pipeline.map((r) => ({ key: r.id, label: r.name, leads: r.new, won: r.won }))} /></Card>}
                </div>
              </div>
              <Card title="Kunlik dinamika"><DailyChart rows={d.daily} /></Card>
            </Section>
            <Section title="Sotuvchilar" desc="Bitimlar va vazifalar; qatorni bosing — vazifalar ro'yxati">
              <SellersTable rows={d.sellers} from={from} to={to} pipelineId={pipelineId} />
            </Section>
            <Section title="Qo'ng'iroqlar" desc="Tanlangan davr">
              <CallsCard calls={d.calls} sellers={d.sellers} />
            </Section>
          </div>
          <aside className="flex flex-col gap-4 lg:sticky lg:top-0">
            <AttentionPanel a={d.attention} />
            {hasAccess("tadbirlar-moliya") && <FinancePanel from={from} to={to} />}
          </aside>
        </div>
      )}
    </div>
  )
}
