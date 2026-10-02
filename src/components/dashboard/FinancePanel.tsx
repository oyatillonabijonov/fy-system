import { useMemo } from "react"
import { useFinanceSummary } from "@/hooks/useFinance"
import { useEvents, useParticipantCounts } from "@/hooks/useEvents"
import { tashkentToday } from "@/lib/period"
import { formatMoney, formatDate } from "@/lib/format"
import { Card } from "./pieces"

/** Moliya at a glance — rendered only with the tadbirlar-moliya module (finance_summary guards it too) */
export function FinancePanel({ from, to }: { from: string; to: string }) {
  const period = useFinanceSummary({ from, to, eventId: null, seller: null, method: null })
  const allTime = useFinanceSummary({ from: null, to: null, eventId: null, seller: null, method: null })
  const { data: events = [] } = useEvents()
  const today = tashkentToday()
  const upcoming = useMemo(() => events.filter((e) => e.date && e.date >= today).sort((a, b) => a.date!.localeCompare(b.date!)).slice(0, 3), [events, today])
  const { data: counts = {} } = useParticipantCounts(upcoming.map((e) => e.id))
  const row = (label: string, value: string, tone = "text-ink") => (
    <div className="flex items-center justify-between gap-3 text-base"><span className="text-ink-muted">{label}</span><span className={`font-medium tabular-nums ${tone}`}>{value}</span></div>
  )
  return (
    <Card title="Moliya">
      <div className="flex flex-col gap-2">
        {row("Kirim", formatMoney(period.data?.income), "text-success-text")}
        {row("Xarajat", formatMoney(period.data?.expense))}
        {row("Qarzdorlik (jami)", formatMoney(allTime.data?.debt), allTime.data?.debt ? "text-danger-text" : "text-ink")}
      </div>
      <div className="flex flex-col gap-1 pt-1 border-t border-line">
        <span className="text-sm font-semibold text-ink pt-2">Yaqin tadbirlar</span>
        {upcoming.length === 0 ? <p className="text-sm text-ink-muted">Hozircha yo'q</p> : upcoming.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-ink">{e.name}</span>
            <span className="text-ink-muted tabular-nums whitespace-nowrap">{formatDate(e.date)} · {counts[e.id] ?? 0} kishi</span>
          </div>
        ))}
      </div>
    </Card>
  )
}
