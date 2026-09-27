import { useSearchParams } from "react-router-dom"
import type { FinanceFilters } from "@/lib/supabase/queries/finance"
import type { PaymentMethod } from "@/lib/supabase/queries/payments"
import { periodRange, type Period } from "@/lib/period"

export type FilterKey = "period" | "from" | "to" | "event" | "seller" | "method" | "tab" | "status"

const PERIODS: Period[] = ["all", "today", "month", "last", "custom"]
const METHODS: PaymentMethod[] = ["naqd", "karta", "transfer"]

// Filter state lives in the URL: a refresh or a shared link keeps it.
export function useFinanceFilters() {
  const [params, setParams] = useSearchParams()
  const get = (k: FilterKey) => params.get(k)

  const rawPeriod = get("period")
  const period: Period = PERIODS.includes(rawPeriod as Period) ? (rawPeriod as Period) : "all"
  const rawMethod = get("method")
  const { from, to } = periodRange(period, get("from"), get("to"))

  const filters: FinanceFilters = {
    from,
    to,
    eventId: get("event"),
    seller: get("seller"),
    method: METHODS.includes(rawMethod as PaymentMethod) ? (rawMethod as PaymentMethod) : null,
  }

  function set(patch: Partial<Record<FilterKey, string | null>>) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v)
          else next.delete(k)
        }
        return next
      },
      { replace: true },
    )
  }

  return { filters, period, get, set }
}
