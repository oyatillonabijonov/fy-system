import { useState } from "react"
import { ArrowUUpLeft, Prohibit, Receipt, UserMinus } from "@phosphor-icons/react"
import { usePaymentsList, usePaymentsCount } from "@/hooks/useFinance"
import type { FinanceFilters, PaymentRow } from "@/lib/supabase/queries/finance"
import type { PaymentMethod } from "@/lib/supabase/queries/payments"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { NoShowModal, RefundModal, VoidPaymentModal } from "@/components/moliya/PaymentActionModals"
import { ReceiptCell } from "@/components/moliya/Receipt"
import { tbl } from "@/components/ui/table"
import { Pager, PAGE_SIZE } from "@/components/ui/Pager"
import { Sheet } from "@/components/ui/Sheet"
import { Avatar, BTN_DANGER, BTN_SECONDARY, Empty, GROUP, GroupHeader, KV, Loading, Money, ROW, dayLabel, groupByDay } from "@/components/moliya/mobile"
import { tashkentClock, tashkentToday } from "@/lib/period"
import { formatDate, formatMoney, formatPhone } from "@/lib/format"
import { ThinkingOrb } from "thinking-orbs"

const METHOD_LABEL: Record<PaymentMethod, string> = { naqd: "Naqd", karta: "Karta", transfer: "Transfer" }

export function PaymentsTab({ filters, canEdit }: { filters: FinanceFilters; canEdit: boolean }) {
  const [page, setPage] = useState(0)
  // `filters` is a fresh object every render (see useFinanceFilters) — key on its
  // values, not identity, and reset to page 0 whenever they actually change.
  const filtersKey = JSON.stringify(filters)
  const [prevFiltersKey, setPrevFiltersKey] = useState(filtersKey)
  if (prevFiltersKey !== filtersKey) {
    setPrevFiltersKey(filtersKey)
    setPage(0)
  }

  const { data: rows = [], isLoading } = usePaymentsList(filters, page)
  const { data: total = 0 } = usePaymentsCount(filters)
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const [voiding, setVoiding] = useState<PaymentRow | null>(null)
  const [refunding, setRefunding] = useState<PaymentRow | null>(null)
  const [noShow, setNoShow] = useState<PaymentRow | null>(null)
  // phone: the tapped row; `open` is separate so the sheet can slide out with its content still there
  const [picked, setPicked] = useState<PaymentRow | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const days = groupByDay(rows, (p) => tashkentToday(new Date(p.paid_at)))

  return (
    <div className="flex flex-col gap-3">
      {isLoading ? (
        <>
          <div className="py-10 flex items-center justify-center max-lg:hidden">
            <ThinkingOrb state="searching" size={20} theme="light" />
          </div>
          <div className="lg:hidden"><Loading /></div>
        </>
      ) : rows.length === 0 ? (
        <>
          <div className="py-10 text-center text-base text-ink-muted max-lg:hidden">Bu filtrlar bo'yicha to'lov yo'q</div>
          <div className="lg:hidden"><Empty icon={<Receipt size={32} weight="thin" />} text="Bu filtrlar bo'yicha to'lov yo'q" /></div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-5 lg:hidden">
            {days.map((g) => (
              <section key={g.day}>
                <GroupHeader>{dayLabel(g.day)}</GroupHeader>
                <div className={GROUP}>
                  {g.items.map((p) => {
                    const voided = !!p.voided_at
                    const refund = p.kind === "refund"
                    return (
                      <button key={p.id} type="button" onClick={() => { setPicked(p); setSheetOpen(true) }} className={`${ROW} ${voided ? "opacity-50" : ""}`}>
                        <Avatar name={p.client_name} icon={refund ? <ArrowUUpLeft size={18} /> : undefined} />
                        <span className="flex-1 min-w-0 flex flex-col">
                          <span className="text-base font-medium text-ink truncate">{p.client_name}</span>
                          <span className="text-sm text-ink-muted truncate">{p.event_name ?? "—"}</span>
                        </span>
                        <span className="shrink-0 flex flex-col items-end">
                          <Money
                            value={p.amount}
                            sign
                            unit={false}
                            className={`text-base font-semibold ${refund ? "text-danger-text" : "text-success-text"} ${voided ? "line-through" : ""}`}
                          />
                          <span className="text-sm text-ink-muted whitespace-nowrap">{voided ? "Bekor qilingan" : refund ? `Qaytarish · ${METHOD_LABEL[p.method]}` : METHOD_LABEL[p.method]}</span>
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
                  <th className={tbl.th}>Mijoz</th>
                  <th className={tbl.th}>Tadbir</th>
                  <th className={tbl.th}>Sotuvchi</th>
                  <th className={`${tbl.th} text-right`}>Summa</th>
                  <th className={tbl.th}>Usul</th>
                  <th className={tbl.th}>Chek</th>
                  <th className={tbl.th}>Kiritgan</th>
                  {canEdit && <th className={`${tbl.th} text-right`}>Amal</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const voided = !!p.voided_at
                  return (
                    <tr key={p.id} className={`${tbl.tr} ${voided ? "opacity-50" : ""}`}>
                      <td className={`${tbl.td} text-sm text-ink-muted whitespace-nowrap`}>{formatDate(p.paid_at)}</td>
                      <td className={`${tbl.td} whitespace-nowrap`}>
                        <div className="font-medium text-ink">{p.client_name}</div>
                        <div className="text-xs text-ink-muted">{formatPhone(p.client_phone)}</div>
                      </td>
                      <td className={`${tbl.td} text-ink-muted whitespace-nowrap`}>{p.event_name ?? "—"}</td>
                      <td className={`${tbl.td} text-ink-muted whitespace-nowrap`}>{p.seller_name ?? "—"}</td>
                      <td
                        className={`${tbl.td} font-medium text-right tabular-nums whitespace-nowrap ${
                          p.amount < 0 ? "text-danger-text" : "text-success-text"
                        } ${voided ? "line-through" : ""}`}
                      >
                        {p.amount < 0 ? "−" : "+"}
                        {formatMoney(Math.abs(p.amount))}
                      </td>
                      <td className={`${tbl.td} whitespace-nowrap`}>
                        {voided ? (
                          <span title={p.void_reason ?? undefined}>
                            <StatusBadge label="Bekor qilingan" variant="warning" />
                          </span>
                        ) : (
                          <StatusBadge label={p.kind === "refund" ? `Qaytarish · ${METHOD_LABEL[p.method]}` : METHOD_LABEL[p.method]} variant="neutral" />
                        )}
                      </td>
                      <td className={`${tbl.td} whitespace-nowrap`}>
                        <ReceiptCell kind="payment" id={p.id} path={p.receipt_path} canAttach={canEdit && !voided} />
                      </td>
                      <td className={`${tbl.td} text-ink-muted whitespace-nowrap`}>{p.recorder_name ?? "—"}</td>
                      {canEdit && (
                        <td className={`${tbl.td} text-right whitespace-nowrap`}>
                          {!voided && (
                            <span className="inline-flex gap-1.5">
                              {p.kind === "payment" && p.participant_cash_paid > 0 && (
                                <RowAction onClick={() => setRefunding(p)} label="Qaytarish" icon={<ArrowUUpLeft size={16} />} />
                              )}
                              {p.kind === "payment" && !p.participant_no_show && (
                                <RowAction onClick={() => setNoShow(p)} label="Qatnashmadi" icon={<UserMinus size={16} />} />
                              )}
                              <RowAction onClick={() => setVoiding(p)} label="Bekor qilish" icon={<Prohibit size={16} />} danger />
                            </span>
                          )}
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
        <PaymentSheet
          p={picked}
          open={sheetOpen}
          canEdit={canEdit}
          onClose={() => setSheetOpen(false)}
          onVoid={() => { setSheetOpen(false); setVoiding(picked) }}
          onRefund={() => { setSheetOpen(false); setRefunding(picked) }}
          onNoShow={() => { setSheetOpen(false); setNoShow(picked) }}
        />
      )}
      {voiding && <VoidPaymentModal payment={voiding} onClose={() => setVoiding(null)} />}
      {refunding && <RefundModal payment={refunding} onClose={() => setRefunding(null)} />}
      {noShow && <NoShowModal payment={noShow} onClose={() => setNoShow(null)} />}
    </div>
  )
}

/** Phone: one payment's details, its receipt and the actions the table has in its last column */
function PaymentSheet({ p, open, canEdit, onClose, onVoid, onRefund, onNoShow }: {
  p: PaymentRow; open: boolean; canEdit: boolean; onClose: () => void; onVoid: () => void; onRefund: () => void; onNoShow: () => void
}) {
  const voided = !!p.voided_at
  const refund = p.kind === "refund"
  return (
    <Sheet open={open} onClose={onClose} title={refund ? "Qaytarish" : "To'lov"}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-1 pt-1 pb-2">
          <Avatar name={p.client_name} />
          <span className="text-md font-semibold text-ink mt-1">{p.client_name}</span>
          <span className="text-base text-ink-muted">{formatPhone(p.client_phone)}</span>
          <Money
            value={p.amount}
            sign
            className={`text-[32px] leading-10 font-semibold mt-2 ${refund ? "text-danger-text" : "text-ink"} ${voided ? "line-through opacity-50" : ""}`}
          />
          {voided && <span className="h-6 px-2 rounded-full bg-warning-soft text-warning-dark text-xs font-medium flex items-center">Bekor qilingan</span>}
        </div>
        <div className={GROUP}>
          <KV label="Tadbir">{p.event_name ?? "—"}</KV>
          <KV label="Sana">{formatDate(p.paid_at)} · {tashkentClock(new Date(p.paid_at))}</KV>
          <KV label="Usul">{METHOD_LABEL[p.method]}</KV>
          <KV label="Sotuvchi">{p.seller_name ?? "—"}</KV>
          <KV label="Kiritgan">{p.recorder_name ?? "—"}</KV>
          {p.note && <KV label="Izoh">{p.note}</KV>}
          {voided && p.void_reason && <KV label="Bekor sababi">{p.void_reason}</KV>}
        </div>
        <ReceiptCell kind="payment" id={p.id} path={p.receipt_path} canAttach={canEdit && !voided} labeled />
        {canEdit && !voided && (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2 empty:hidden">
              {p.kind === "payment" && p.participant_cash_paid > 0 && (
                <button type="button" onClick={onRefund} className={`${BTN_SECONDARY} col-span-full [&:not(:only-child)]:col-span-1`}><ArrowUUpLeft size={18} /> Qaytarish</button>
              )}
              {p.kind === "payment" && !p.participant_no_show && (
                <button type="button" onClick={onNoShow} className={`${BTN_SECONDARY} col-span-full [&:not(:only-child)]:col-span-1`}><UserMinus size={18} /> Qatnashmadi</button>
              )}
            </div>
            <button type="button" onClick={onVoid} className={BTN_DANGER}><Prohibit size={18} /> Bekor qilish</button>
          </div>
        )}
      </div>
    </Sheet>
  )
}

export function RowAction({ onClick, label, icon, danger }: { onClick: () => void; label: string; icon: React.ReactNode; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-tag text-xs font-semibold bg-mute-soft hover:bg-mute-soft-hover transition-colors ${
        danger ? "text-danger-text" : "text-ink"
      }`}
    >
      {icon} {label}
    </button>
  )
}
