import { useQuery } from "@tanstack/react-query"
import {
  getDashboardAnalytics,
  type DashboardAnalytics,
} from "@/lib/supabase/queries/dashboard"

export const DASHBOARD_KEY = ["dashboard-analytics"] as const

export function useDashboardAnalytics() {
  return useQuery<DashboardAnalytics>({
    queryKey: DASHBOARD_KEY,
    queryFn: getDashboardAnalytics,
    staleTime: 1000 * 60 * 3, // 3 min — analytics don't change that fast
  })
}
