import { useState } from "react"
import { Buildings, Coffee, DotsThree, Megaphone, Microphone, Prohibit, Receipt, UserCircle, Wallet } from "@phosphor-icons/react"
import type { ReactNode } from "react"
import { useExpensesList, useExpensesCount } from "@/hooks/useFinance"
import { EXPENSE_CATEGORY_LABEL, type ExpenseRow, type FinanceFilters } from "@/lib/supabase/queries/finance"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { RowAction } from "@/components/moliya/PaymentsTab"
import { VoidExpenseModal } from "@/components/moliya/ExpenseModals"
import { ReceiptCell } from "@/components/moliya/Receipt"
import { tbl } from "@/components/ui/table"
import { Pager, PAGE_SIZE } from "@/components/ui/Pager"
import { Sheet } from "@/components/ui/Sheet"
import { Avatar, BTN_DANGER, Empty, GROUP, GroupHeader, KV, Loading, Money, ROW, dayLabel, groupByDay } from "@/components/moliya/mobile"
import { formatDate, formatMoney } from "@/lib/format"
import { ThinkingOrb } from "thinking-orbs"

const CATEGORY_ICON: Record<ExpenseRow["category"], ReactNode> = {
  zal: <Buildings size={18} />,
  spiker: <Microphone size={18} />,
  kofe_brek: <Coffee size={18} />,
  reklama: <Megaphone size={18} />,
  maosh: <Wallet size={18} />,
  ofis: <UserCircle size={18} />,
  boshqa: <DotsThree size={18} />,
}

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
  const [picked, setPicked] = useState<ExpenseRow | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const days = groupByDay(rows, (x) => x.spent_at)

  return (
    <div className="flex flex-col gap-3">
      {ignoredFilters && <span className="text-sm text-ink-muted">Sotuvchi va usul filtrlari xarajatlarga taalluqli emas</span>}

      {isLoading ? (
        <>
          <div className="py-10 flex items-center justify-center max-lg:hidden">
            <ThinkingOrb state="searching" size={20} theme="light" />
          </div>
          <div className="lg:hidden"><Loading /></div>
        </>
      ) : rows.length === 0 ? (
        <>
          <div className="py-10 text-center text-base text-ink-muted max-lg:hidden">Bu filtrlar bo'yicha xarajat yo'q</div>
          <div className="lg:hidden"><Empty icon={<Receipt size={32} weight="thin" />} text="Bu filtrlar bo'yicha xarajat yo'q" /></div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-5 lg:hidden">
            {days.map((g) => (
              <section key={g.day}>
                <GroupHeader>{dayLabel(g.day)}</GroupHeader>
                <div className={GROUP}>
                  {g.items.map((x) => {
                    const voided = !!x.voided_at
                    return (
                      <button key={x.id} type="button" onClick={() => { setPicked(x); setSheetOpen(true) }} className={`${ROW} ${voided ? "opacity-50" : ""}`}>
                        <Avatar icon={CATEGORY_ICON[x.category]} />
                        <span className="flex-1 min-w-0 flex flex-col">
                          <span className="text-base font-medium text-ink truncate">{EXPENSE_CATEGORY_LABEL[x.category]}</span>
                          <span className="text-sm text-ink-muted truncate">{x.event_name ?? "Umumiy"}</span>
                        </span>
                        <span className="shrink-0 flex flex-col items-end">
                          <Money value={-x.amount} unit={false} className={`text-base font-semibold text-ink ${voided ? "line-through" : ""}`} />
                          {voided && <span className="text-sm text-ink-muted whitespace-nowrap">Bekor qilingan</span>}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
          <div className={`${tbl.scroll} max-lg:hidden`}>
            <table className={tbl.table}>
              <thead>
                <tr>
                  <th className={tbl.th}>Sana</th>
                  <th className={tbl.th}>Kategoriya</th>
                  <th className={tbl.th}>Tadbir</th>
                  <th className={`${tbl.th} text-right`}>Summa</th>
                  <th className={tbl.th}>Izoh</th>
                  <th className={tbl.th}>Chek</th>
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
                      <td className={`${tbl.td} whitespace-nowrap`}>
                        <ReceiptCell kind="expense" id={x.id} path={x.receipt_path} canAttach={canEdit && !voided} />
                      </td>
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

      {picked && (
        <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Xarajat">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-1 pt-1 pb-2">
              <Avatar icon={CATEGORY_ICON[picked.category]} />
              <span className="text-md font-semibold text-ink mt-1">{EXPENSE_CATEGORY_LABEL[picked.category]}</span>
              <Money value={-picked.amount} className={`text-[32px] leading-10 font-semibold text-ink mt-2 ${picked.voided_at ? "line-through opacity-50" : ""}`} />
              {picked.voided_at && <span className="h-6 px-2 rounded-full bg-warning-soft text-warning-dark text-xs font-medium flex items-center">Bekor qilingan</span>}
            </div>
            <div className={GROUP}>
              <KV label="Tadbir">{picked.event_name ?? "Umumiy"}</KV>
              <KV label="Sana">{formatDate(picked.spent_at)}</KV>
              <KV label="Kiritgan">{picked.recorder_name ?? "—"}</KV>
              {picked.note && <KV label="Izoh">{picked.note}</KV>}
              {picked.voided_at && picked.void_reason && <KV label="Bekor sababi">{picked.void_reason}</KV>}
            </div>
            <ReceiptCell kind="expense" id={picked.id} path={picked.receipt_path} canAttach={canEdit && !picked.voided_at} labeled />
            {canEdit && !picked.voided_at && (
              <button type="button" onClick={() => { setSheetOpen(false); setVoiding(picked) }} className={BTN_DANGER}><Prohibit size={18} /> Bekor qilish</button>
            )}
          </div>
        </Sheet>
      )}
      {voiding && <VoidExpenseModal expense={voiding} onClose={() => setVoiding(null)} />}
    </div>
  )
}
