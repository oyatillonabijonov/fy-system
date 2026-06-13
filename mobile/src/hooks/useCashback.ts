import { useQuery } from "@tanstack/react-query"
import { getMyCashbackHistory } from "@/lib/supabase/queries/cashback"

export const CASHBACK_KEY = ["my-cashback"] as const

export function useMyCashbackHistory() {
  return useQuery({ queryKey: CASHBACK_KEY, queryFn: getMyCashbackHistory })
}
