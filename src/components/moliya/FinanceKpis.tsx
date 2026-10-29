import { useState } from "react"
import { CaretDown, TrendUp, TrendDown, Scales, Wallet, Warning, ChartPie, Gift } from "@phosphor-icons/react"
import { useFinanceSummary } from "@/hooks/useFinance"
import type { FinanceFilters } from "@/lib/supabase/queries/finance"
import { formatMoney } from "@/lib/format"
import { Money } from "@/components/moliya/mobile"

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
  const [more, setMore] = useState(false)
  const rate = s && s.agreed > 0 ? Math.round((s.collected / s.agreed) * 100) : null
  // Expenses have no seller or method, so under those filters the hero is the income instead of a wrong net
  const noExpense = !!filters.seller || !!filters.method
  const hero = noExpense ? { label: "Kirim", hint: "To'lovlar − qaytarishlar", value: s?.income ?? 0 } : { label: "Sof cashflow", hint: "Kirim − chiqim", value: s?.net ?? 0 }
  const big = Math.abs(hero.value) >= 1_000_000_000

  return (
    <div className="flex flex-col gap-2 lg:hidden">
      <div className="rounded-surface bg-accent text-ink-on-accent p-5 flex flex-col gap-2">
        <span className="text-sm font-medium opacity-70">{hero.label}</span>
        {isLoading || !s ? (
          <div className="h-9 w-48 rounded-item bg-ink-on-accent opacity-20 animate-pulse" />
        ) : (
          <Money value={hero.value} className={`${big ? "text-[28px]" : "text-[34px]"} leading-none font-semibold`} />
        )}
        <span className="text-sm opacity-60">{hero.hint}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card label="Kirim" loading={isLoading} value={s?.income ?? 0} />
        <Card label="Chiqim" loading={isLoading} value={s?.expense ?? 0} dash={noExpense} />
        <Card label="Qolgan qarz" loading={isLoading} value={s?.debt ?? 0} danger={(s?.debt ?? 0) > 0} />
        <div className="rounded-surface bg-surface-sunken p-4 flex flex-col gap-1.5 min-w-0">
          <span className="text-sm text-ink-muted">Yig'ish</span>
          {isLoading ? (
            <div className="animate-pulse bg-mute-soft rounded-item h-6 w-16" />
          ) : (
            <span className="text-[18px] leading-6 font-semibold tabular-nums text-ink">{rate === null ? "—" : `${rate}%`}</span>
          )}
          <span className="h-1.5 rounded-full bg-mute-soft overflow-hidden mt-0.5">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(rate ?? 0, 100)}%` }} />
          </span>
        </div>
      </div>
      {noExpense && <span className="text-xs text-ink-faint px-1">Chiqim sotuvchi/usul filtrida hisoblanmaydi</span>}

      <button
        type="button"
        onClick={() => setMore((v) => !v)}
        aria-expanded={more}
        className="self-start h-9 px-3 -ml-1 rounded-full text-sm font-medium text-ink-muted flex items-center gap-1.5 active:bg-mute-ghost-hover"
      >
        Batafsil <CaretDown size={12} weight="bold" className={`transition-transform ${more ? "rotate-180" : ""}`} />
      </button>
      {more && s && (
        <div className="rounded-surface bg-surface-sunken overflow-hidden">
          <Line label="Muddati o'tgan qarz" danger={s.overdue_debt > 0}><Money value={s.overdue_debt} /></Line>
          <Line label="Yig'ildi"><Money value={s.collected} /></Line>
          <Line label="Kelishuv"><Money value={s.agreed} /></Line>
          <Line label="Keshbek qoldig'i" hint="Barcha mijozlar, filtrsiz"><Money value={s.cashback_balance} /></Line>
        </div>
      )}
    </div>
  )
}

function Card({ label, value, loading, danger, dash }: { label: string; value: number; loading: boolean; danger?: boolean; dash?: boolean }) {
  return (
    <div className="rounded-surface bg-surface-sunken p-4 flex flex-col gap-1.5 min-w-0">
      <span className="text-sm text-ink-muted">{label}</span>
      {loading ? (
        <div className="animate-pulse bg-mute-soft rounded-item h-6 w-24" />
      ) : dash ? (
        <span className="text-[18px] leading-6 font-semibold text-ink-faint">—</span>
      ) : (
        <Money value={value} className={`text-[18px] leading-6 font-semibold ${danger ? "text-danger-text" : "text-ink"}`} />
      )}
    </div>
  )
}

function Line({ label, hint, danger, children }: { label: string; hint?: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-h-12 px-4 py-2 flex items-center justify-between gap-3 border-b border-line last:border-b-0">
      <span className="flex flex-col">
        <span className="text-base text-ink-muted">{label}</span>
        {hint && <span className="text-xs text-ink-faint">{hint}</span>}
      </span>
      <span className={`text-base font-semibold ${danger ? "text-danger-text" : "text-ink"}`}>{children}</span>
    </div>
  )
}
