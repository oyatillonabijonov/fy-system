import { useState } from "react"
import { Prohibit } from "@phosphor-icons/react"
import { useExpensesList, useExpensesCount } from "@/hooks/useFinance"
import { EXPENSE_CATEGORY_LABEL, type ExpenseRow, type FinanceFilters } from "@/lib/supabase/queries/finance"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { RowAction } from "@/components/moliya/PaymentsTab"
import { VoidExpenseModal } from "@/components/moliya/ExpenseModals"
import { tbl } from "@/components/ui/table"
import { Pager, PAGE_SIZE } from "@/components/ui/Pager"
import { formatDate, formatMoney } from "@/lib/format"
import { ThinkingOrb } from "thinking-orbs"

export function ExpensesTab({ filters, canEdit }: { filters: FinanceFilters; canEdit: boolean }) {
  const [page, setPage] = useState(0)
  // Same page-reset-on-filter-change pattern as PaymentsTab.
  const filtersKey = JSON.stringify(filters)
  const [prevFiltersKey, setPrevFiltersKey] = useState(filtersKey)
  if (prevFiltersKey !== filtersKey) {
    setPrevFiltersKey(filtersKey)
    setPage(0)
  }

  const { data: rows = [], isLoading } = useExpensesList(filters, page)
  const { data: total = 0 } = useExpensesCount(filters)
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const [voiding, setVoiding] = useState<ExpenseRow | null>(null)
  const ignoredFilters = !!filters.seller || !!filters.method

  return (
    <div className="flex flex-col gap-3">
      {ignoredFilters && <span className="text-sm text-ink-muted">Sotuvchi va usul filtrlari xarajatlarga taalluqli emas</span>}

      {isLoading ? (
        <div className="py-10 flex items-center justify-center">
          <ThinkingOrb state="searching" size={20} theme="light" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-base text-ink-muted">Bu filtrlar bo'yicha xarajat yo'q</div>
      ) : (
        <>
          <div className={tbl.scroll}>
            <table className={tbl.table}>
              <thead>
                <tr>
                  <th className={tbl.th}>Sana</th>
                  <th className={tbl.th}>Kategoriya</th>
                  <th className={tbl.th}>Tadbir</th>
                  <th className={`${tbl.th} text-right`}>Summa</th>
                  <th className={tbl.th}>Izoh</th>
                  <th className={tbl.th}>Kiritgan</th>
                  {canEdit && <th className={`${tbl.th} text-right`}>Amal</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => {
                  const voided = !!x.voided_at
                  return (
                    <tr key={x.id} className={`${tbl.tr} ${voided ? "opacity-50" : ""}`}>
                      <td className={`${tbl.td} text-sm text-ink-muted whitespace-nowrap`}>{formatDate(x.spent_at)}</td>
                      <td className={`${tbl.td} whitespace-nowrap`}>
                        {voided ? (
                          <span title={x.void_reason ?? undefined}>
                            <StatusBadge label="Bekor qilingan" variant="warning" />
                          </span>
                        ) : (
                          <StatusBadge label={EXPENSE_CATEGORY_LABEL[x.category]} variant="neutral" />
                        )}
                      </td>
                      <td className={`${tbl.td} text-ink-muted whitespace-nowrap`}>{x.event_name ?? "Umumiy"}</td>
                      <td className={`${tbl.td} font-medium text-right tabular-nums whitespace-nowrap text-danger-text ${voided ? "line-through" : ""}`}>
                        −{formatMoney(x.amount)}
                      </td>
                      <td className={`${tbl.td} text-ink-muted max-w-[280px] truncate`} title={x.note ?? undefined}>{x.note ?? "—"}</td>
                      <td className={`${tbl.td} text-ink-muted whitespace-nowrap`}>{x.recorder_name ?? "—"}</td>
                      {canEdit && (
                        <td className={`${tbl.td} text-right whitespace-nowrap`}>
                          {!voided && <RowAction onClick={() => setVoiding(x)} label="Bekor qilish" icon={<Prohibit size={16} />} danger />}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} pageCount={pageCount} total={total} onPage={setPage} />
        </>
      )}

      {voiding && <VoidExpenseModal expense={voiding} onClose={() => setVoiding(null)} />}
    </div>
  )
}
