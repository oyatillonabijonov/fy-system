import { TrendUp, Wallet, Warning, ChartPie, Gift } from "@phosphor-icons/react"
import { useFinanceSummary } from "@/hooks/useFinance"
import type { FinanceFilters } from "@/lib/supabase/queries/finance"
import { formatMoney } from "@/lib/format"

export function FinanceKpis({ filters }: { filters: FinanceFilters }) {
  const { data: s, isLoading } = useFinanceSummary(filters)
  const rate = s && s.agreed > 0 ? Math.round((s.collected / s.agreed) * 100) : null

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <Kpi icon={<TrendUp size={15} weight="bold" />} label="Kirim" hint="To'lovlar − qaytarishlar" loading={isLoading} value={s ? formatMoney(s.income) : ""} />
      <Kpi icon={<Wallet size={15} weight="bold" />} label="Qolgan qarz" loading={isLoading} value={s ? formatMoney(s.debt) : ""} danger={(s?.debt ?? 0) > 0} />
      <Kpi icon={<Warning size={15} weight="bold" />} label="Muddati o'tgan" loading={isLoading} value={s ? formatMoney(s.overdue_debt) : ""} danger={(s?.overdue_debt ?? 0) > 0} />
      <Kpi
        icon={<ChartPie size={15} weight="bold" />}
        label="Yig'ish"
        hint={s ? `${formatMoney(s.collected)} / ${formatMoney(s.agreed)}` : undefined}
        loading={isLoading}
        value={rate === null ? "—" : `${rate}%`}
      />
      <Kpi icon={<Gift size={15} weight="bold" />} label="Keshbek qoldig'i" hint="Barcha mijozlar, filtrsiz" loading={isLoading} value={s ? formatMoney(s.cashback_balance) : ""} />
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
    <div className="bg-white border border-[#F0F0F0] rounded-[12px] p-4 flex flex-col gap-2">
      <span className="flex items-center gap-2 text-[12px] font-bold text-[#999]">{icon} {label}</span>
      {loading ? (
        <div className="animate-pulse bg-[#F0F0F0] rounded-[6px] h-7 w-28" />
      ) : (
        <span className="text-[20px] font-bold leading-none" style={{ color: danger ? "#D13328" : "#141414" }}>{value}</span>
      )}
      {hint && <span className="text-[11px] text-[#999]">{hint}</span>}
    </div>
  )
}
