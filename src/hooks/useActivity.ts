import { useQuery, keepPreviousData } from "@tanstack/react-query"
import {
  getActivityLogs,
  getActivityStats,
  type ActivityFilters,
  type ActivityPage,
  type ActivityStats,
} from "@/lib/supabase/queries/activity"

export const ACTIVITY_KEY = ["activity-log"] as const

export function useActivityLogs(filters: ActivityFilters, page: number, limit = 50) {
  return useQuery<ActivityPage>({
    queryKey: [...ACTIVITY_KEY, filters, page, limit],
    queryFn: () => getActivityLogs(filters, page, limit),
    placeholderData: keepPreviousData,
    staleTime: 1000 * 30,
  })
}

export function useActivityStats() {
  return useQuery<ActivityStats>({
    queryKey: [...ACTIVITY_KEY, "stats"],
    queryFn: getActivityStats,
    staleTime: 1000 * 60,
  })
}
