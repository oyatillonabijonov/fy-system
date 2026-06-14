import { formatNumber } from "@/lib/format"

interface CashbackBadgeProps {
  balance: number
  size?: "sm" | "md" | "lg"
}

export function CashbackBadge({ balance, size = "md" }: CashbackBadgeProps) {
  if (balance <= 0) return null

  const sizeClasses: Record<NonNullable<CashbackBadgeProps["size"]>, string> = {
    sm: "px-2 py-0.5 text-[10px] gap-1",
    md: "px-2.5 py-1 text-[11px] gap-1.5",
    lg: "px-3 py-1.5 text-[13px] gap-2",
  }

  return (
    <div
      className={`inline-flex items-center rounded-full bg-[#F5F5F5] text-[#141414] font-bold ${sizeClasses[size]}`}
      title={`Cashback balansi: ${formatNumber(balance)} so'm`}
    >
      <span>💰</span>
      <span>{formatNumber(balance)} so'm</span>
    </div>
  )
}
