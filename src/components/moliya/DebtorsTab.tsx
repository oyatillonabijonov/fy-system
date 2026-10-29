import { useState } from "react"
import { Coins, Gift, Users } from "@phosphor-icons/react"
import { useDebtors, useUpdateParticipantFinance } from "@/hooks/useFinance"
import { useFinanceFilters } from "@/hooks/useFinanceFilters"
import { useSetParticipantCashbackPercent } from "@/hooks/useCashback"
import { useUsers } from "@/hooks/useUsers"
import type { DebtorRow, DebtStatus, FinanceFilters, ParticipantFinancePatch } from "@/lib/supabase/queries/finance"
import { ApplyCashbackModal } from "@/components/cashback/ApplyCashbackModal"
import { CashbackPercentCell, PriceCell } from "@/components/moliya/cells"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { tbl } from "@/components/ui/table"
import { Pager, usePaged } from "@/components/ui/Pager"
import { Sheet } from "@/components/ui/Sheet"
import { Avatar, BTN_PRIMARY, BTN_SECONDARY, ChipStrip, Empty, GROUP, Loading, Money } from "@/components/moliya/mobile"
import { tashkentToday } from "@/lib/period"
import { formatDate, formatMoney, formatPhone } from "@/lib/format"
import { ThinkingOrb } from "thinking-orbs"
import { toast, errorDetail } from "@/lib/toast"

const STATUS_LABEL: Record<DebtStatus, string> = {
  debt: "Qarzdorlar",
  overdue: "Muddati o'tganlar",
  paid: "To'liq to'laganlar",
  all: "Hammasi",
}

const STATUS_SHORT: Record<DebtStatus, string> = { debt: "Qarzdorlar", overdue: "Muddati o'tgan", paid: "To'langan", all: "Hammasi" }

const SELECT =
  "h-control-md max-w-full pl-3 pr-8 rounded-control bg-surface-sunken text-base text-ink border border-transparent outline-none focus:border-line-focus"

// Receivables aging, counted from the enrolment day.
function aging(days: number): { label: string; variant: "neutral" | "warning" | "danger" } {
  if (days <= 30) return { label: "0–30 kun", variant: "neutral" }
  if (days <= 60) return { label: "31–60 kun", variant: "warning" }
  return { label: "60+ kun", variant: "danger" }
}

interface SellerOption {
  id: string
  full_name: string
}

export function DebtorsTab({ filters, canEdit, onPay }: { filters: FinanceFilters; canEdit: boolean; onPay: (row: DebtorRow) => void }) {
  const { get, set } = useFinanceFilters()
  const raw = get("status")
  const status: DebtStatus = raw === "overdue" || raw === "paid" || raw === "all" ? raw : "debt"
  const { data: rows = [], isLoading } = useDebtors(filters, status)
  const paged = usePaged(rows)
  const { data: users = [] } = useUsers()
  const sellers: SellerOption[] = users
    .filter((u) => u.is_active && u.department === "sotuv")
    .map((u) => ({ id: u.id, full_name: u.full_name }))
  const [spending, setSpending] = useState<DebtorRow | null>(null)
  const today = tashkentToday()
  // phone: the opened debtor (by id, so the sheet follows edits) and whether its sheet is up
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const picked = rows.find((r) => r.participant_id === pickedId) ?? null

  return (
    <div className="flex flex-col gap-3">
      <div className="lg:hidden flex flex-col gap-3">
        <ChipStrip
          label="Holat"
          options={(Object.keys(STATUS_SHORT) as DebtStatus[]).map((id) => ({ id, label: STATUS_SHORT[id] }))}
          value={status}
          onChange={(id) => set({ status: id === "debt" ? null : id })}
        />
        {!isLoading && rows.length > 0 && <span className="text-sm font-semibold text-ink-muted px-1 -mb-1 tabular-nums">{rows.length} ta</span>}
      </div>
      <div className="flex items-center gap-2 max-lg:hidden">
        <select
          aria-label="Holat"
          value={status}
          onChange={(e) => set({ status: e.target.value === "debt" ? null : e.target.value })}
          className={SELECT}
        >
          {(Object.keys(STATUS_LABEL) as DebtStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
        {!isLoading && <span className="text-sm text-ink-muted tabular-nums whitespace-nowrap">{rows.length} ta</span>}
      </div>

      {isLoading ? (
        <>
          <div className="py-10 flex items-center justify-center max-lg:hidden">
            <ThinkingOrb state="searching" size={20} theme="light" />
          </div>
          <div className="lg:hidden"><Loading /></div>
        </>
      ) : rows.length === 0 ? (
        <>
          <div className="py-10 text-center text-base text-ink-muted max-lg:hidden">Bu filtrlar bo'yicha ishtirokchi yo'q</div>
          <div className="lg:hidden"><Empty icon={<Users size={32} weight="thin" />} text="Bu filtrlar bo'yicha ishtirokchi yo'q" /></div>
        </>
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-2 lg:hidden items-start">
            {paged.pageItems.map((r) => (
              <DebtorCard key={r.participant_id} r={r} today={today} canEdit={canEdit} onPay={onPay} onOpen={() => { setPickedId(r.participant_id); setSheetOpen(true) }} />
            ))}
          </div>
          <div className={`${tbl.scroll} max-lg:hidden`}>
            <table className={tbl.table}>
              <thead>
                <tr>
                  <th className={tbl.th}>Mijoz</th>
                  <th className={tbl.th}>Tadbir</th>
                  <th className={tbl.th}>Sotuvchi</th>
                  <th className={`${tbl.th} text-right`}>Kelishuv</th>
                  <th className={`${tbl.th} text-right`}>To'langan</th>
                  <th className={`${tbl.th} text-right`}>Qoldiq</th>
                  <th className={tbl.th}>Keyingi to'lov</th>
                  <th className={`${tbl.th} text-right`}>Keshbek</th>
                  {canEdit && <th className={`${tbl.th} text-right`}>Amal</th>}
                </tr>
              </thead>
              <tbody>
                {paged.pageItems.map((r) => (
                  <DebtorTableRow key={r.participant_id} r={r} sellers={sellers} today={today} canEdit={canEdit} onPay={onPay} onSpend={setSpending} />
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={paged.page} pageCount={paged.pageCount} total={rows.length} onPage={paged.setPage} />
        </>
      )}

      {picked && (
        <DebtorSheet
          r={picked}
          sellers={sellers}
          today={today}
          canEdit={canEdit}
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onPay={() => { setSheetOpen(false); onPay(picked) }}
          onSpend={() => { setSheetOpen(false); setSpending(picked) }}
        />
      )}

      {spending && (
        <ApplyCashbackModal
          isOpen
          onClose={() => setSpending(null)}
          participant={{
            id: spending.participant_id,
            contact_id: spending.client_id,
            event_id: spending.event_id,
            full_name: spending.full_name,
            price: spending.price,
            paid: spending.paid,
          }}
          balance={spending.cashback_balance}
        />
      )}
    </div>
  )
}

/** Phone: one debtor — the debt as the big number, the next due date and a "To'lov" button */
function DebtorCard({ r, today, canEdit, onPay, onOpen }: { r: DebtorRow; today: string; canEdit: boolean; onPay: (row: DebtorRow) => void; onOpen: () => void }) {
  const inDebt = r.debt > 0
  const overdue = inDebt && !!r.next_due_date && r.next_due_date < today
  const pct = r.price > 0 ? Math.min(100, Math.round((r.paid / r.price) * 100)) : 100
  return (
    <div className="rounded-surface bg-surface-sunken overflow-hidden">
      <button type="button" onClick={onOpen} className="w-full p-4 flex flex-col gap-3 text-left active:bg-mute-ghost-hover transition-colors">
        <span className="flex items-center gap-3">
          <Avatar name={r.full_name} />
          <span className="flex-1 min-w-0 flex flex-col">
            <span className="text-base font-medium text-ink truncate">{r.full_name}</span>
            <span className="text-sm text-ink-muted truncate">{r.event_name}</span>
          </span>
        </span>
        <span className="flex items-end justify-between gap-3">
          <span className="flex flex-col gap-0.5">
            <span className="text-sm text-ink-muted">{inDebt ? "Qoldiq" : "Holat"}</span>
            {inDebt ? (
              <Money value={r.debt} className={`text-2xl leading-8 font-semibold ${overdue ? "text-danger-text" : "text-ink"}`} />
            ) : (
              <span className="h-6 px-2 rounded-full bg-success-soft text-success-dark text-xs font-medium flex items-center self-start">To'langan</span>
            )}
          </span>
          <span className="text-sm text-ink-muted tabular-nums whitespace-nowrap pb-1">{pct}% to'langan</span>
        </span>
        <span className="h-1.5 rounded-full bg-mute-soft overflow-hidden">
          <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </span>
      </button>
      {inDebt && (
        <div className="px-4 pb-4 flex items-center justify-between gap-3">
          <span className="flex flex-col min-w-0">
            <span className="text-sm text-ink-muted">Keyingi to'lov</span>
            <span className={`text-base font-medium tabular-nums ${overdue ? "text-danger-text" : "text-ink"}`}>
              {r.next_due_date ? formatDate(r.next_due_date) : "Belgilanmagan"}
              {overdue && <span className="text-sm font-normal"> · muddati o'tgan</span>}
            </span>
          </span>
          {canEdit && (
            <button
              type="button"
              onClick={() => onPay(r)}
              disabled={!r.client_id}
              className="h-11 px-5 shrink-0 rounded-full bg-accent text-ink-on-accent text-base font-semibold flex items-center gap-2 disabled:opacity-40 active:opacity-85"
            >
              <Coins size={18} /> To'lov
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Phone: the debtor's detail — the numbers, plus the editors the table has inline (price, seller, due date, cashback %) */
function DebtorSheet({ r, sellers, today, canEdit, open, onClose, onPay, onSpend }: {
  r: DebtorRow; sellers: SellerOption[]; today: string; canEdit: boolean; open: boolean
  onClose: () => void; onPay: () => void; onSpend: () => void
}) {
  const update = useUpdateParticipantFinance()
  const setPercent = useSetParticipantCashbackPercent(r.event_id)
  const inDebt = r.debt > 0
  const overdue = inDebt && !!r.next_due_date && r.next_due_date < today
  const age = aging(r.age_days)
  const sellerOptions =
    r.seller_id && !sellers.some((s) => s.id === r.seller_id)
      ? [...sellers, { id: r.seller_id, full_name: r.seller_name ?? "—" }]
      : sellers

  function patch(p: ParticipantFinancePatch) {
    update.mutate({ id: r.participant_id, patch: p }, { onError: (e) => toast.error("Saqlanmadi", errorDetail(e)) })
  }

  const payable = canEdit && inDebt
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={r.full_name}
      footer={payable ? (
        <button type="button" onClick={onPay} disabled={!r.client_id} className={BTN_PRIMARY}>
          <span className="flex items-center justify-center gap-2"><Coins size={18} /> To'lov qo'shish</span>
        </button>
      ) : undefined}
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-surface bg-surface-sunken p-4 flex flex-col gap-1">
          <span className="text-sm text-ink-muted">{r.event_name}{r.tariff_name ? ` · ${r.tariff_name}` : ""}</span>
          {inDebt ? (
            <Money value={r.debt} className={`text-[32px] leading-10 font-semibold ${overdue ? "text-danger-text" : "text-ink"}`} />
          ) : (
            <span className="h-6 px-2 rounded-full bg-success-soft text-success-dark text-xs font-medium flex items-center self-start my-2">To'langan</span>
          )}
          <span className="text-sm text-ink-muted">{inDebt ? "qoldiq" : "qarz yo'q"} · {formatPhone(r.phone)}</span>
          <div className="flex gap-6 mt-3">
            <span className="flex flex-col"><span className="text-sm text-ink-muted">Kelishuv</span><Money value={r.price} className="text-base font-semibold text-ink" /></span>
            <span className="flex flex-col"><span className="text-sm text-ink-muted">To'langan</span><Money value={r.paid} className="text-base font-semibold text-ink" /></span>
          </div>
          {inDebt && <span className={`mt-3 self-start h-6 px-2 rounded-full text-xs font-medium flex items-center ${age.variant === "danger" ? "bg-danger-soft text-danger-dark" : age.variant === "warning" ? "bg-warning-soft text-warning-dark" : "bg-mute-soft text-ink-muted"}`}>{age.label}</span>}
        </div>

        <div className={GROUP}>
          <Field label="Kelishuv summasi">
            {canEdit ? <PriceCell large value={r.price} onSave={(price) => patch({ price })} /> : <Money value={r.price} />}
          </Field>
          <Field label="Sotuvchi">
            {canEdit ? (
              <select
                aria-label={`${r.full_name} sotuvchisi`}
                value={r.seller_id ?? ""}
                onChange={(e) => patch({ seller_id: e.target.value || null })}
                className="h-11 max-w-[11rem] rounded-full bg-mute-soft px-4 text-base text-ink outline-none"
              >
                <option value="">Belgilanmagan</option>
                {sellerOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            ) : (
              r.seller_name ?? "Belgilanmagan"
            )}
          </Field>
          {inDebt && (
            <Field label="Keyingi to'lov">
              {canEdit ? (
                <input
                  type="date"
                  aria-label={`${r.full_name} keyingi to'lov sanasi`}
                  value={r.next_due_date ?? ""}
                  onChange={(e) => patch({ next_due_date: e.target.value || null })}
                  className={`h-11 rounded-full bg-mute-soft px-4 text-base outline-none ${overdue ? "text-danger-text" : "text-ink"}`}
                />
              ) : (
                <span className={overdue ? "text-danger-text" : undefined}>{r.next_due_date ? formatDate(r.next_due_date) : "—"}</span>
              )}
            </Field>
          )}
          <Field label="Keshbek foizi">
            {canEdit ? (
              <CashbackPercentCell
                large
                percent={r.cashback_percent}
                earned={r.cashback_earned}
                defaultPercent={r.event_cashback_percent}
                onSet={(percent) => setPercent.mutate({ participantId: r.participant_id, percent })}
              />
            ) : (
              `${r.cashback_percent ?? r.event_cashback_percent}%`
            )}
          </Field>
        </div>

        {canEdit && r.client_id && r.cashback_balance > 0 && inDebt && (
          <button type="button" onClick={onSpend} className={BTN_SECONDARY}>
            <Gift size={18} /> Keshbekdan ishlatish · <Money value={r.cashback_balance} />
          </button>
        )}
      </div>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-h-14 px-4 py-1.5 flex items-center justify-between gap-3 border-b border-line last:border-b-0">
      <span className="text-base text-ink-muted shrink-0">{label}</span>
      <span className="text-base text-ink text-right min-w-0 flex justify-end">{children}</span>
    </div>
  )
}

// One row per component: the cashback-% hook is keyed by the row's event.
function DebtorTableRow({
  r,
  sellers,
  today,
  canEdit,
  onPay,
  onSpend,
}: {
  r: DebtorRow
  sellers: SellerOption[]
  today: string
  canEdit: boolean
  onPay: (row: DebtorRow) => void
  onSpend: (row: DebtorRow) => void
}) {
  const update = useUpdateParticipantFinance()
  const setPercent = useSetParticipantCashbackPercent(r.event_id)
  const inDebt = r.debt > 0
  const overdue = inDebt && !!r.next_due_date && r.next_due_date < today
  const age = aging(r.age_days)
  // A seller who has since left Sotuv still shows on their old sales.
  const sellerOptions =
    r.seller_id && !sellers.some((s) => s.id === r.seller_id)
      ? [...sellers, { id: r.seller_id, full_name: r.seller_name ?? "—" }]
      : sellers

  function patch(p: ParticipantFinancePatch) {
    update.mutate({ id: r.participant_id, patch: p }, { onError: (e) => toast.error("Saqlanmadi", errorDetail(e)) })
  }

  return (
    <tr className={tbl.tr}>
      <td className={`${tbl.td} whitespace-nowrap`}>
        <div className="font-medium text-ink">{r.full_name}</div>
        <div className="text-xs text-ink-muted">{formatPhone(r.phone)}</div>
      </td>
      <td className={`${tbl.td} whitespace-nowrap`}>
        <div className="text-ink-muted">{r.event_name}</div>
        <div className="text-xs text-ink-faint">{r.tariff_name ?? "Individual"}</div>
      </td>
      <td className={`${tbl.td} whitespace-nowrap`}>
        {canEdit ? (
          <select
            aria-label={`${r.full_name} sotuvchisi`}
            value={r.seller_id ?? ""}
            onChange={(e) => patch({ seller_id: e.target.value || null })}
            className="border border-transparent hover:border-line rounded-item px-1.5 py-1 text-base text-ink-muted bg-transparent focus:outline-none focus:border-line-focus"
          >
            <option value="">Belgilanmagan</option>
            {sellerOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
        ) : (
          <span className="text-ink-muted">{r.seller_name ?? "Belgilanmagan"}</span>
        )}
      </td>
      <td className={`${tbl.td} text-right whitespace-nowrap`}>
        {canEdit ? <PriceCell value={r.price} onSave={(price) => patch({ price })} /> : <span className="text-ink">{formatMoney(r.price)}</span>}
      </td>
      <td className={`${tbl.td} text-ink text-right tabular-nums whitespace-nowrap`}>{formatMoney(r.paid)}</td>
      <td className={`${tbl.td} text-right whitespace-nowrap`}>
        {inDebt ? (
          <span className="inline-flex flex-col items-end gap-1">
            <span className="font-bold text-danger-text tabular-nums">{formatMoney(r.debt)}</span>
            <StatusBadge label={age.label} variant={age.variant} />
          </span>
        ) : (
          <span className="inline-flex justify-end"><StatusBadge label="To'langan" variant="success" dot /></span>
        )}
      </td>
      <td className={`${tbl.td} whitespace-nowrap`}>
        {canEdit && inDebt ? (
          <input
            type="date"
            aria-label={`${r.full_name} keyingi to'lov sanasi`}
            value={r.next_due_date ?? ""}
            onChange={(e) => patch({ next_due_date: e.target.value || null })}
            className={`border rounded-item px-2 py-1 text-sm bg-surface focus:outline-none focus:border-line-focus ${
              overdue ? "border-danger-text text-danger-text" : "border-line text-ink"
            }`}
          />
        ) : (
          <span className={`text-sm ${overdue ? "text-danger-text" : "text-ink-muted"}`}>{r.next_due_date ? formatDate(r.next_due_date) : "—"}</span>
        )}
      </td>
      <td className={`${tbl.td} text-right whitespace-nowrap`}>
        {canEdit ? (
          <CashbackPercentCell
            percent={r.cashback_percent}
            earned={r.cashback_earned}
            defaultPercent={r.event_cashback_percent}
            onSet={(percent) =>
              setPercent.mutate({ participantId: r.participant_id, percent })
            }
          />
        ) : (
          <StatusBadge label={`${r.cashback_percent ?? r.event_cashback_percent}%`} variant="neutral" />
        )}
      </td>
      {canEdit && (
        <td className={`${tbl.td} text-right whitespace-nowrap`}>
          <span className="inline-flex items-center gap-1.5 justify-end">
            {r.client_id && r.cashback_balance > 0 && inDebt && (
              <button
                onClick={() => onSpend(r)}
                title={`Keshbek balansi: ${formatMoney(r.cashback_balance)}`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-tag text-xs font-semibold text-ink bg-mute-soft hover:bg-mute-soft-hover transition-colors"
              >
                Keshbek
              </button>
            )}
            {inDebt && (
              <button
                onClick={() => onPay(r)}
                disabled={!r.client_id}
                title={r.client_id ? "To'lov qo'shish" : "Mijoz kartasi bog'lanmagan — to'lovni kiritib bo'lmaydi"}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-tag text-xs font-semibold text-ink bg-mute-soft hover:bg-mute-soft-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Coins size={16} /> To'lov
              </button>
            )}
          </span>
        </td>
      )}
    </tr>
  )
}
