import { useEventProfit } from "@/hooks/useFinance"
import type { FinanceFilters } from "@/lib/supabase/queries/finance"
import { tbl } from "@/components/ui/table"
import { Pager, usePaged } from "@/components/ui/Pager"
import { ChartBar } from "@phosphor-icons/react"
import { Empty, Loading, Money, Progress } from "@/components/moliya/mobile"
import { formatDate, formatMoney, formatNumber } from "@/lib/format"
import { ThinkingOrb } from "thinking-orbs"

const UNIT = "text-xs font-medium text-ink-muted"

// Per-event breakdown of the KPIs: with the same period/event filter the
// profits add up to "Sof cashflow". The general-expenses row comes last.
export function EventProfitTab({ filters }: { filters: FinanceFilters }) {
  const { data: rows = [], isLoading } = useEventProfit(filters)
  const paged = usePaged(rows)
  const ignoredFilters = !!filters.seller || !!filters.method

  return (
    <div className="flex flex-col gap-3">
      {ignoredFilters && <span className="text-sm text-ink-muted">Sotuvchi va usul filtrlari bu jadvalga taalluqli emas</span>}
      {isLoading ? (
        <>
          <div className="py-10 flex items-center justify-center max-lg:hidden">
            <ThinkingOrb state="searching" size={20} theme="light" />
          </div>
          <div className="lg:hidden"><Loading /></div>
        </>
      ) : rows.length === 0 ? (
        <>
          <div className="py-10 text-center text-base text-ink-muted max-lg:hidden">Bu davrda pul harakati yo'q</div>
          <div className="lg:hidden"><Empty icon={<ChartBar size={32} weight="thin" />} text="Bu davrda pul harakati yo'q" /></div>
        </>
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-2 lg:hidden items-start">
            {paged.pageItems.map((r) => {
              const pct = r.agreed > 0 ? Math.min(100, Math.round((r.collected / r.agreed) * 100)) : 0
              return (
                <div key={r.event_id ?? "general"} className="rounded-surface bg-surface-sunken p-4 flex flex-col gap-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-base font-medium text-ink">{r.event_id ? r.event_name : "Umumiy xarajatlar"}</span>
                    <span className="text-sm text-ink-muted">{r.event_id ? formatDate(r.event_date) : "Tadbirga bog'lanmagan"}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm text-ink-muted">Foyda</span>
                    <Money
                      value={r.profit}
                      sign
                      unitClassName={UNIT}
                      className={`text-2xl leading-8 font-semibold ${r.profit < 0 ? "text-danger-text" : "text-success-text"}`}
                    />
                  </div>
                  {r.event_id && r.agreed > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <Progress pct={pct} />
                      <span className="flex items-baseline justify-between gap-2 text-sm text-ink-muted">
                        <span className="tabular-nums">Yig'ildi · {pct}%</span>
                        <span className="tabular-nums whitespace-nowrap">{formatNumber(r.collected)} / {formatNumber(r.agreed)}</span>
                      </span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-muted border-t border-line pt-3">
                    {r.event_id && (
                      <span>Qarz <Money value={r.debt} unit={false} className={`font-medium ${r.debt > 0 ? "text-danger-text" : "text-ink"}`} /></span>
                    )}
                    <span>Xarajat <Money value={r.expense} unit={false} className="font-medium text-ink" /></span>
                  </div>
                </div>
              )
            })}
          </div>
          <div className={`${tbl.scroll} max-lg:hidden`}>
            <table className={tbl.table}>
              <thead>
                <tr>
                  <th className={tbl.th}>Tadbir</th>
                  <th className={`${tbl.th} text-right`}>Kelishuv</th>
                  <th className={`${tbl.th} text-right`}>Yig'ildi</th>
                  <th className={`${tbl.th} text-right`}>Qarz</th>
                  <th className={`${tbl.th} text-right`}>Xarajat</th>
                  <th className={`${tbl.th} text-right`}>Foyda</th>
                  <th className={`${tbl.th} text-right`}>Reja</th>
                </tr>
              </thead>
              <tbody>
                {paged.pageItems.map((r) => (
                  <tr key={r.event_id ?? "general"} className={tbl.tr}>
                    <td className={`${tbl.td} whitespace-nowrap`}>
                      <div className="font-medium text-ink">{r.event_id ? r.event_name : "Umumiy xarajatlar"}</div>
                      <div className="text-xs text-ink-muted">{r.event_id ? formatDate(r.event_date) : "Tadbirga bog'lanmagan"}</div>
                    </td>
                    <td className={`${tbl.td} text-right tabular-nums whitespace-nowrap text-ink-muted`}>{r.event_id ? formatMoney(r.agreed) : "—"}</td>
                    <td className={`${tbl.td} text-right tabular-nums whitespace-nowrap`}>{r.event_id ? formatMoney(r.collected) : "—"}</td>
                    <td className={`${tbl.td} text-right tabular-nums whitespace-nowrap ${r.debt > 0 ? "text-danger-text" : "text-ink-muted"}`}>
                      {r.event_id ? formatMoney(r.debt) : "—"}
                    </td>
                    <td className={`${tbl.td} text-right tabular-nums whitespace-nowrap text-ink-muted`}>{formatMoney(r.expense)}</td>
                    <td className={`${tbl.td} text-right tabular-nums whitespace-nowrap font-semibold ${r.profit < 0 ? "text-danger-text" : "text-success-text"}`}>
                      {formatMoney(r.profit)}
                    </td>
                    <td className={`${tbl.td} text-right tabular-nums whitespace-nowrap text-ink-muted`} title={r.total_value > 0 ? `Reja: ${formatMoney(r.total_value)}` : undefined}>
                      {r.total_value > 0 ? `${Math.round((r.collected / r.total_value) * 100)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={paged.page} pageCount={paged.pageCount} total={rows.length} onPage={paged.setPage} />
        </>
      )}
    </div>
  )
}
