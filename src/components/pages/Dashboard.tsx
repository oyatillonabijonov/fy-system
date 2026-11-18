import { useMemo, useState } from "react"
import { useAuth } from "@/context/AuthContext"
import { useMedia } from "@/hooks/useMedia"
import { useSalesDashboard, useSalesInsights } from "@/hooks/useSalesDashboard"
import { periodRange, tashkentToday } from "@/lib/period"
import { sourceLabel } from "@/lib/supabase/queries/sotuv"
import { Skeleton } from "@/components/ui/Skeleton"
import { formatNumber } from "@/lib/format"
import { convRows } from "@/lib/stageConv"
import { Section, Card, Funnel } from "@/components/dashboard/pieces"
import { MixDonut, DailyBars, ScoreGauge } from "@/components/dashboard/charts"
import { SellersTable } from "@/components/dashboard/SellersTable"
import { CallsCard } from "@/components/dashboard/CallsCard"
import { AttentionPanel } from "@/components/dashboard/AttentionPanel"
import { FinancePanel } from "@/components/dashboard/FinancePanel"
import { PlanCard } from "@/components/dashboard/PlanCard"
import { Bento } from "@/components/dashboard/Bento"
import { QualityCard, LossCard, CycleCard, ActivityCard, AdsTable } from "@/components/dashboard/Insights"
import { TasksCard } from "@/components/dashboard/TasksCard"
import { SpeedCard } from "@/components/dashboard/SpeedCard"
import { MobileDashboard } from "@/components/dashboard/MobileDashboard"

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
  const { data: ins } = useSalesInsights(from, to, pipelineId)   // the lower half (104): the first screen never waits for it
  const mobile = useMedia("(width < 64rem)")   // phone / tablet: its own layout, same data
  const [funnel, setFunnel] = useState<"now" | "conv">("now")
  const conv = useMemo(() => (d ? convRows(d.stage_conv, d.pipelines) : []), [d])

  if (mobile) {
    return (
      <div className="flex flex-col gap-4 pb-6">
        {d ? <MobileDashboard d={d} ins={ins} periods={PERIODS} period={period} onPeriod={(id: string) => setPeriod(id as PeriodId)} pipelineId={pipelineId} onPipeline={setPipelineId} from={from} to={to} />
          : (!error || isLoading) && <Skeleton className="h-[420px] rounded-surface" />}
        {error && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-surface bg-danger-soft text-danger-dark text-base">
            <span>Ma'lumot yuklanmadi: {error.message}</span>
            <button type="button" onClick={() => void refetch()} className="h-10 px-4 rounded-full bg-surface text-ink text-sm font-medium whitespace-nowrap shrink-0">Qayta urinish</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto no-scrollbar">
          {PERIODS.map((p) => (
            <button key={p.id} type="button" onClick={() => setPeriod(p.id)} aria-pressed={period === p.id}
              className={`shrink-0 whitespace-nowrap px-3 sm:px-3.5 h-control-md rounded-full text-base font-medium transition-colors ${period === p.id ? "bg-mute-soft text-ink" : "text-ink-muted hover:bg-mute-ghost-hover hover:text-ink"}`}>
              {p.label}
            </button>
          ))}
        </div>
        <select value={pipelineId ?? ""} onChange={(e) => setPipelineId(e.target.value || null)} aria-label="Voronka"
          className="w-full sm:w-auto h-control-md pl-3 pr-8 rounded-control bg-surface-sunken text-base text-ink border border-transparent outline-none focus:border-line-focus">
          <option value="">Barcha voronkalar</option>
          {d?.pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-surface bg-danger-soft text-danger-dark text-base">
          <span>Ma'lumot yuklanmadi: {error.message}</span>
          <button type="button" onClick={() => void refetch()} className="h-control-sm px-3 rounded-full bg-surface text-ink text-sm font-medium whitespace-nowrap shrink-0">Qayta urinish</button>
        </div>
      )}

      {!d ? (!error || isLoading) && <Skeleton className="h-[420px] rounded-surface" /> : (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
          <div className="flex flex-col gap-8 min-w-0">
            <Section title="Sotuv natijasi" desc="Tanlangan davr, oldingi shuncha davrga nisbatan">
              <Bento d={d} pipelineId={pipelineId} />
              {!d.sales.linked && <p className="px-1 text-sm text-ink-muted">Bu voronka tadbirga bog'lanmagan, shuning uchun joylar va pul ko'rsatkichlari yo'q. Bog'lash: Sotuv bo'limi → Voronka sozlamalari → Tadbir.</p>}
              {d.plan.map((p) => <PlanCard key={p.event_id} p={p} />)}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                <div className="flex flex-col gap-3 xl:col-span-2">
                  <Card title="Voronka" className="flex-1" aside={
                    <span role="tablist" aria-label="Voronka ko'rinishi" className="inline-flex gap-1 p-1 rounded-control bg-surface">
                      {([["now", "Hozir"], ["conv", "Konversiya"]] as const).map(([id, label]) => (
                        <button key={id} type="button" role="tab" aria-selected={funnel === id} onClick={() => setFunnel(id)}
                          className={`h-7 px-3 shrink-0 whitespace-nowrap rounded-item text-sm font-medium transition-colors ${funnel === id ? "bg-surface-sunken text-ink" : "text-ink-muted hover:text-ink"}`}>{label}</button>
                      ))}
                    </span>}>
                    {funnel === "now" ? <Funnel rows={d.funnel} /> : <Funnel key="conv" rows={conv} conv />}
                    <p className="text-sm text-ink-muted">{funnel === "now"
                      ? "Ochiq bitimlar hozir qaysi bosqichda turibdi; foiz — ochiq bitimlardagi ulushi."
                      : "Davrda ochilgan bitimlar qaysi bosqichgacha yetdi. Foiz — keyingi bosqichga o'tganlar (eng pasti qizil), kun — bosqichda o'rtacha turish."}</p>
                  </Card>
                  <Card title="Kunlik dinamika"><DailyBars rows={d.daily} /></Card>
                </div>
                <div className="flex flex-col gap-3">
                  <Card title="Konversiya" aside="yutilgan ÷ yopilgan"><ScoreGauge value={d.kpi.conversion} caption={`${formatNumber(d.kpi.won)} yutilgan · ${formatNumber(d.kpi.lost)} yutqazilgan`} /></Card>
                  <Card title="Manbalar"><MixDonut totalLabel="yangi bitim" rows={d.by_source.map((r) => ({ key: r.source ?? "none", label: sourceLabel(r.source), value: r.new, hint: r.won ? `${formatNumber(r.won)} yutildi` : undefined }))} /></Card>
                  {!pipelineId && <Card title="Voronkalar"><MixDonut grey totalLabel="yangi bitim" rows={d.by_pipeline.map((r) => ({ key: r.id, label: r.name, value: r.new, hint: r.won ? `${formatNumber(r.won)} yutildi` : undefined }))} /></Card>}
                </div>
              </div>
            </Section>
            {ins && (
              <Section title="Lid sifati va yo'qotishlar" desc="Ball tizimi to'g'ri saralayaptimi, bitimlar nega yutqazilyapti, sotuv necha kunda yopilyapti">
                <div className="@container"><div className="grid grid-cols-1 @3xl:grid-cols-3 gap-3">
                  <QualityCard q={ins.quality} /><LossCard rows={ins.lost_reasons} /><CycleCard c={ins.cycle} />
                </div></div>
              </Section>
            )}
            {ins && (
              <Section title="Reklama kesimi" desc="Davrda ochilgan bitimlar qaysi reklamadan kelgani va ulardan nechta sotuv chiqqani. Joy va summa — bitim egasining o'z joyi bo'yicha">
                <AdsTable rows={ins.by_ad} />
              </Section>
            )}
            <Section title="Sotuvchilar" desc="Bitimlar, sotilgan joylar (Moliyadan) va vazifalar; qatorni bosing — vazifalar ro'yxati">
              <SellersTable rows={d.sellers} from={from} to={to} pipelineId={pipelineId} />
            </Section>
            <Section title="Vazifalar holati" desc="Ochiq bitimlar eng yaqin ochiq vazifasi bo'yicha, hozir. Vazifasiz — birorta ochiq vazifasi yo'q bitimlar">
              <TasksCard tasks={d.tasks} pipelineId={pipelineId} />
            </Section>
            {ins && (
              <Section title="Faollik" desc="Lid oqimi va qo'ng'iroqlar vaqti mos kelyaptimi">
                <ActivityCard a={ins.activity} />
              </Section>
            )}
            <Section title="Aloqaga chiqish tezligi" desc="Formadan kelgan lid → birinchi chiquvchi qo'ng'iroq. Ish vaqti: 09:00–18:00, Du–Sha (tungi lid 09:00 dan sanaladi)">
              <SpeedCard speed={d.speed} />
            </Section>
            <Section title="Qo'ng'iroqlar" desc="Tanlangan davr">
              <CallsCard calls={d.calls} sellers={d.sellers} />
            </Section>
          </div>
          <aside className="flex flex-col gap-4 xl:sticky xl:top-0">
            {/* same height as the Section heading on the left, so the first cards' tops line up */}
            <div aria-hidden className="hidden xl:flex flex-col gap-0.5 px-1 invisible"><h2 className="text-md font-semibold">&nbsp;</h2><p className="text-sm">&nbsp;</p></div>
            <AttentionPanel a={d.attention} />
            {hasAccess("tadbirlar-moliya") && <FinancePanel from={from} to={to} />}
          </aside>
        </div>
      )}
    </div>
  )
}
