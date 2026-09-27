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
          icon={<TrendUp size={15} />}
          label="Jami tushum"
          value={totals?.total_income}
          loading={isLoading}
          tone="success"
        />
        <KpiCard
          icon={<Wallet size={15} />}
          label="Jami qarzdorlik"
          value={totals?.total_debt}
          loading={isLoading}
          tone="danger"
        />
        <KpiCard
          icon={<Gift size={15} />}
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
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: number | undefined
  loading: boolean
  tone?: "danger" | "success"
}) {
  const isPositive = (value ?? 0) > 0
  const valueColor =
    tone === "danger" ? (isPositive ? "text-danger-text" : "text-ink") : tone === "success" ? "text-success-text" : "text-ink"

  return (
    <div className="bg-surface border border-line rounded-surface p-4 flex flex-col gap-3">
      <span className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
        {icon} {label}
      </span>
      {loading ? (
        <div className="animate-pulse bg-surface-sunken rounded-item h-7 w-32" />
      ) : (
        <span className={`text-lg font-bold leading-none tabular-nums ${valueColor}`}>{formatMoney(value ?? 0)}</span>
      )}
    </div>
  )
}
