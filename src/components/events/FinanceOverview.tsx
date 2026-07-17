import { TrendUp, Wallet, Gift } from "@phosphor-icons/react"
import { useFinanceTotals } from "@/hooks/usePayments"
import { PaymentsLog } from "@/components/events/PaymentsLog"
import { formatMoney } from "@/lib/format"

export function FinanceOverview() {
  const { data: totals, isLoading } = useFinanceTotals()

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          icon={<TrendUp size={15} weight="bold" />}
          label="Jami tushum"
          value={totals?.total_income}
          loading={isLoading}
        />
        <KpiCard
          icon={<Wallet size={15} weight="bold" />}
          label="Jami qarzdorlik"
          value={totals?.total_debt}
          loading={isLoading}
          danger
        />
        <KpiCard
          icon={<Gift size={15} weight="bold" />}
          label="Keshbek qoldig'i"
          value={totals?.total_cashback_balance}
          loading={isLoading}
        />
      </div>

      <PaymentsLog />
    </div>
  )
}

function KpiCard({
  icon,
  label,
  value,
  loading,
  danger,
}: {
  icon: React.ReactNode
  label: string
  value: number | undefined
  loading: boolean
  danger?: boolean
}) {
  return (
    <div className="bg-white border border-[#F0F0F0] rounded-[12px] p-4 flex flex-col gap-3">
      <span className="flex items-center gap-2 text-[12px] font-bold text-[#999]">
        {icon} {label}
      </span>
      {loading ? (
        <div className="animate-pulse bg-[#F0F0F0] rounded-[6px] h-7 w-32" />
      ) : (
        <span
          className="text-[22px] font-bold leading-none"
          style={{ color: danger && (value ?? 0) > 0 ? "#D13328" : "#141414" }}
        >
          {formatMoney(value ?? 0)}
        </span>
      )}
    </div>
  )
}
