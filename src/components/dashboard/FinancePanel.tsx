import { useMemo } from "react"
import { useFinanceSummary } from "@/hooks/useFinance"
import { useEvents, useParticipantCounts } from "@/hooks/useEvents"
import { tashkentToday } from "@/lib/period"
import { formatMoney, formatDate } from "@/lib/format"
import { Card } from "./pieces"
import { DotRing } from "./charts"

/** Moliya at a glance — rendered only with the tadbirlar-moliya module (finance_summary guards it too) */
export function FinancePanel({ from, to, mobile = false }: { from: string; to: string; mobile?: boolean }) {
  const period = useFinanceSummary({ from, to, eventId: null, seller: null, method: null })
  const allTime = useFinanceSummary({ from: null, to: null, eventId: null, seller: null, method: null })
  const { data: events = [] } = useEvents()
  const today = tashkentToday()
  const upcoming = useMemo(() => events.filter((e) => e.date && e.date >= today).sort((a, b) => a.date!.localeCompare(b.date!)).slice(0, 3), [events, today])
  const { data: counts = {} } = useParticipantCounts(upcoming.map((e) => e.id))
  const row = (label: string, value: string, tone = "text-ink") => (
    <div className="flex items-center justify-between gap-3 text-base"><span className="text-ink-muted">{label}</span><span className={`font-medium tabular-nums whitespace-nowrap ${tone}`}>{value}</span></div>
  )
  if (mobile) {
    // The section title ("Moliya") is drawn by the page, outside the card
    const pct = allTime.data?.agreed ? Math.round((allTime.data.collected / allTime.data.agreed) * 100) : null
    const debt = allTime.data?.debt ?? 0
    return (
      <div className="bg-surface-sunken rounded-surface p-4 flex flex-col gap-4 min-w-0">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-ink-muted">Kelishuvdan yig'ildi (jami)</span>
            <span className="text-3xl font-semibold tabular-nums text-ink">{pct === null ? "—" : `${pct}%`}</span>
          </div>
          <div className="h-2 rounded-full bg-fill overflow-hidden"><div className="h-full rounded-full bg-success" style={{ width: `${pct ?? 0}%` }} /></div>
        </div>
        <div className="flex flex-col">
          {[
            { label: "Kirim", value: formatMoney(period.data?.income), tone: "text-success-text" },
            { label: "Xarajat", value: formatMoney(period.data?.expense), tone: "text-ink" },
            { label: "Qarzdorlik (jami)", value: formatMoney(debt), tone: debt ? "text-danger-text" : "text-ink" },
          ].map((r) => (
            <div key={r.label} className="min-h-11 flex items-center justify-between gap-3 border-t border-line text-base">
              <span className="text-ink-muted">{r.label}</span>
              <span className={`font-semibold tabular-nums whitespace-nowrap ${r.tone}`}>{r.value}</span>
            </div>
          ))}
        </div>
        {upcoming.length > 0 && (
          <div className="flex flex-col">
            <span className="pb-1 text-sm font-semibold text-ink-muted">Yaqin tadbirlar</span>
            {upcoming.map((e) => (
              <div key={e.id} className="min-h-12 py-2 border-t border-line flex items-center justify-between gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-medium text-ink truncate">{e.name}</span>
                  <span className="block text-sm text-ink-muted tabular-nums">{formatDate(e.date)}</span>
                </span>
                <span className="shrink-0 text-sm text-ink-muted tabular-nums whitespace-nowrap">{counts[e.id] ?? 0} kishi</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }
  return (
    <Card title="Moliya">
      <DotRing id="collected" value={allTime.data?.agreed ? (allTime.data.collected / allTime.data.agreed) * 100 : null}
        color="#059669" caption="kelishuvdan yig'ildi (jami)" />
      <div className="flex flex-col gap-2">
        {row("Kirim", formatMoney(period.data?.income), "text-success-text")}
        {row("Xarajat", formatMoney(period.data?.expense))}
        {row("Qarzdorlik (jami)", formatMoney(allTime.data?.debt), allTime.data?.debt ? "text-danger-text" : "text-ink")}
      </div>
      <div className="flex flex-col gap-1 pt-1 border-t border-line">
        <span className="text-sm font-semibold text-ink pt-2">Yaqin tadbirlar</span>
        {upcoming.length === 0 ? <p className="text-sm text-ink-muted">Hozircha yo'q</p> : upcoming.map((e) => (
          <div key={e.id} className="flex flex-col gap-0.5 py-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:py-0 text-sm">
            <span className="truncate text-ink">{e.name}</span>
            <span className="text-ink-muted tabular-nums whitespace-nowrap">{formatDate(e.date)} · {counts[e.id] ?? 0} kishi</span>
          </div>
        ))}
      </div>
    </Card>
  )
}
