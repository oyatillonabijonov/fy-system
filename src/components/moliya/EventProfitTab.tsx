import { useEventProfit } from "@/hooks/useFinance"
import type { FinanceFilters } from "@/lib/supabase/queries/finance"
import { tbl } from "@/components/ui/table"
import { Pager, usePaged } from "@/components/ui/Pager"
import { formatDate, formatMoney } from "@/lib/format"
import { ThinkingOrb } from "thinking-orbs"

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
        <div className="py-10 flex items-center justify-center">
          <ThinkingOrb state="searching" size={20} theme="light" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-base text-ink-muted">Bu davrda pul harakati yo'q</div>
      ) : (
        <>
          <div className={tbl.scroll}>
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
