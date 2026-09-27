import { useQuery, keepPreviousData } from "@tanstack/react-query"
import {
  getActivityLogs,
  type ActivityFilters,
  type ActivityPage,
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
