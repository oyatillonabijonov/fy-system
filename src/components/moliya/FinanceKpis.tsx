import { TrendUp, TrendDown, Scales, Wallet, Warning, ChartPie, Gift } from "@phosphor-icons/react"
import { useFinanceSummary } from "@/hooks/useFinance"
import type { FinanceFilters } from "@/lib/supabase/queries/finance"
import { formatMoney } from "@/lib/format"

export function FinanceKpis({ filters }: { filters: FinanceFilters }) {
  const { data: s, isLoading } = useFinanceSummary(filters)
  const rate = s && s.agreed > 0 ? Math.round((s.collected / s.agreed) * 100) : null
  // Expenses have no seller or method — under those filters Chiqim / Sof would mix
  // one seller's income with every expense, so show a dash instead of a wrong number.
  const noExpense = !!filters.seller || !!filters.method
  const expenseHint = noExpense ? "Sotuvchi/usul filtrida hisoblanmaydi" : undefined

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Kpi icon={<TrendUp size={16} />} label="Kirim" hint="To'lovlar − qaytarishlar" loading={isLoading} value={s ? formatMoney(s.income) : ""} />
        <Kpi icon={<TrendDown size={16} />} label="Chiqim" hint={expenseHint ?? "Xarajatlar"} loading={isLoading} value={noExpense ? "—" : s ? formatMoney(s.expense) : ""} />
        <Kpi
          icon={<Scales size={16} />}
          label="Sof cashflow"
          hint={expenseHint ?? "Kirim − chiqim"}
          loading={isLoading}
          value={noExpense ? "—" : s ? formatMoney(s.net) : ""}
          danger={!noExpense && (s?.net ?? 0) < 0}
        />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={<Wallet size={16} />} label="Qolgan qarz" loading={isLoading} value={s ? formatMoney(s.debt) : ""} danger={(s?.debt ?? 0) > 0} />
        <Kpi icon={<Warning size={16} />} label="Muddati o'tgan" loading={isLoading} value={s ? formatMoney(s.overdue_debt) : ""} danger={(s?.overdue_debt ?? 0) > 0} />
        <Kpi
          icon={<ChartPie size={16} />}
          label="Yig'ish"
          hint={s ? `${formatMoney(s.collected)} / ${formatMoney(s.agreed)}` : undefined}
          loading={isLoading}
          value={rate === null ? "—" : `${rate}%`}
        />
        <Kpi icon={<Gift size={16} />} label="Keshbek qoldig'i" hint="Barcha mijozlar, filtrsiz" loading={isLoading} value={s ? formatMoney(s.cashback_balance) : ""} />
      </div>
    </div>
  )
}

function Kpi({
  icon,
  label,
  value,
  hint,
  loading,
  danger,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  loading: boolean
  danger?: boolean
}) {
  return (
    <div className="bg-surface border border-line rounded-surface p-4 flex flex-col gap-2">
      <span className="flex items-center gap-2 text-sm font-semibold text-ink-muted">{icon} {label}</span>
      {loading ? (
        <div className="animate-pulse bg-surface-sunken rounded-item h-7 w-28" />
      ) : (
        <span className={`text-lg font-bold leading-none tabular-nums ${danger ? "text-danger-text" : "text-ink"}`}>{value}</span>
      )}
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </div>
  )
}
