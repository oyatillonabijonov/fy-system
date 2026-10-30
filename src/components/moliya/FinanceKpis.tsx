import { useState } from "react"
import { CaretDown, TrendUp, TrendDown, Scales, Wallet, Warning, ChartPie, Gift } from "@phosphor-icons/react"
import { useFinanceSummary } from "@/hooks/useFinance"
import type { FinanceFilters } from "@/lib/supabase/queries/finance"
import { formatMoney } from "@/lib/format"
import { useFinanceFilters } from "@/hooks/useFinanceFilters"
import { PERIOD_LABELS } from "@/lib/period"
import { Money, Progress } from "@/components/moliya/mobile"

export function FinanceKpis({ filters }: { filters: FinanceFilters }) {
  const { data: s, isLoading } = useFinanceSummary(filters)
  const rate = s && s.agreed > 0 ? Math.round((s.collected / s.agreed) * 100) : null
  // Expenses have no seller or method — under those filters Chiqim / Sof would mix
  // one seller's income with every expense, so show a dash instead of a wrong number.
  const noExpense = !!filters.seller || !!filters.method
  const expenseHint = noExpense ? "Sotuvchi/usul filtrida hisoblanmaydi" : undefined

  return (
    <>
    <MobileSummary filters={filters} />
    <div className="flex flex-col gap-4 max-lg:hidden">
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
    </>
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
    <div className="bg-surface border border-line rounded-surface p-3.5 sm:p-4 flex flex-col gap-2 min-w-0">
      <span className="flex items-center gap-2 text-sm font-semibold text-ink-muted [&>svg]:shrink-0">{icon} {label}</span>
      {loading ? (
        <div className="animate-pulse bg-surface-sunken rounded-item h-7 w-28" />
      ) : (
        <span className={`text-base sm:text-lg font-bold leading-none tabular-nums whitespace-nowrap ${danger ? "text-danger-text" : "text-ink"}`}>{value}</span>
      )}
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </div>
  )
}

/** Phone: one hero number (the period's net cash flow), four small cards, the rest behind "Batafsil" */
function MobileSummary({ filters }: { filters: FinanceFilters }) {
  const { data: s, isLoading } = useFinanceSummary(filters)
  const { period } = useFinanceFilters()
  const [more, setMore] = useState(false)
  const rate = s && s.agreed > 0 ? Math.round((s.collected / s.agreed) * 100) : null
  // Expenses have no seller or method, so under those filters the hero is the income instead of a wrong net
  const noExpense = !!filters.seller || !!filters.method
  const hero = noExpense ? { label: "Kirim", value: s?.income ?? 0 } : { label: "Sof cashflow", value: s?.net ?? 0 }
  const abs = Math.abs(hero.value)
  const size = abs >= 1_000_000_000 ? "text-[28px]" : abs >= 100_000_000 ? "text-[34px]" : "text-[40px]"

  return (
    <div className="flex flex-col gap-2 lg:hidden">
      <div className="rounded-surface bg-accent text-ink-on-accent p-5 flex flex-col gap-3">
        <span className="flex items-baseline justify-between gap-3 text-sm font-medium">
          <span className="opacity-70">{hero.label}</span>
          <span className="opacity-50">{PERIOD_LABELS[period]}</span>
        </span>
        {isLoading || !s ? (
          <div className="h-10 w-48 rounded-item bg-ink-on-accent opacity-20 animate-pulse" />
        ) : (
          <Money value={hero.value} className={`${size} leading-none font-semibold`} />
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card label="Kirim" loading={isLoading} value={s?.income ?? 0} />
        <Card label="Chiqim" loading={isLoading} value={s?.expense ?? 0} dash={noExpense} />
        <Card label="Qolgan qarz" loading={isLoading} value={s?.debt ?? 0} danger={(s?.debt ?? 0) > 0} />
        <div className="rounded-surface bg-surface-sunken p-4 flex flex-col gap-1.5 min-w-0">
          <span className="text-sm text-ink-muted">Yig'ish</span>
          {isLoading ? (
            <div className="animate-pulse bg-surface rounded-item h-7 w-16" />
          ) : (
            <span className="text-[18px] leading-7 font-semibold tabular-nums text-ink">{rate === null ? "—" : `${rate}%`}</span>
          )}
          <span className="mt-1.5"><Progress pct={Math.min(rate ?? 0, 100)} /></span>
        </div>
      </div>
      {noExpense && <span className="text-sm text-ink-muted px-1">Chiqim sotuvchi/usul filtrida hisoblanmaydi</span>}

      <button
        type="button"
        onClick={() => setMore((v) => !v)}
        aria-expanded={more}
        className="h-11 w-full rounded-full text-sm font-medium text-ink-muted flex items-center justify-center gap-1.5 active:opacity-80"
      >
        Batafsil <CaretDown size={12} weight="bold" className={`transition-transform ${more ? "rotate-180" : ""}`} />
      </button>
      {more && s && (
        <div className="rounded-surface bg-surface-sunken overflow-hidden">
          <Line label="Muddati o'tgan qarz" danger={s.overdue_debt > 0}><Money value={s.overdue_debt} unitClassName={UNIT} /></Line>
          <Line label="Yig'ildi"><Money value={s.collected} unitClassName={UNIT} /></Line>
          <Line label="Kelishuv"><Money value={s.agreed} unitClassName={UNIT} /></Line>
          <Line label="Keshbek qoldig'i" hint="Barcha mijozlar, filtrsiz"><Money value={s.cashback_balance} unitClassName={UNIT} /></Line>
        </div>
      )}
    </div>
  )
}

const UNIT = "text-xs font-medium text-ink-muted"

function Card({ label, value, loading, danger, dash }: { label: string; value: number; loading: boolean; danger?: boolean; dash?: boolean }) {
  return (
    <div className="rounded-surface bg-surface-sunken p-4 flex flex-col gap-1.5 min-w-0">
      <span className="text-sm text-ink-muted">{label}</span>
      {loading ? (
        <div className="animate-pulse bg-surface rounded-item h-7 w-24" />
      ) : dash ? (
        <span className="text-[18px] leading-7 font-semibold text-ink-muted">—</span>
      ) : (
        <Money value={value} unitClassName={UNIT} className={`${Math.abs(value) >= 1_000_000_000 ? "text-[15px]" : "text-[18px]"} leading-7 font-semibold ${danger ? "text-danger-text" : "text-ink"}`} />
      )}
    </div>
  )
}

function Line({ label, hint, danger, children }: { label: string; hint?: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-h-12 px-4 py-2 flex items-center justify-between gap-3 border-b border-line last:border-b-0">
      <span className="flex flex-col">
        <span className="text-base text-ink-muted">{label}</span>
        {hint && <span className="text-sm text-ink-muted">{hint}</span>}
      </span>
      <span className={`text-base font-semibold ${danger ? "text-danger-text" : "text-ink"}`}>{children}</span>
    </div>
  )
}
