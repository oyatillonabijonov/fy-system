import { useQuery, keepPreviousData } from "@tanstack/react-query"
import { getAmoDashboard, type AmoDashboard } from "@/lib/supabase/queries/amoDashboard"

export const AMO_DASHBOARD_KEY = ["amo-dashboard"] as const

export function useAmoDashboard(from: string, to: string, pipelineId: number | null) {
  return useQuery<AmoDashboard>({
    queryKey: [...AMO_DASHBOARD_KEY, from, to, pipelineId],
    queryFn: () => getAmoDashboard(from, to, pipelineId),
    staleTime: 1000 * 60 * 2, // the sync runs every 10 min
    placeholderData: keepPreviousData, // switching period/pipeline keeps the old numbers visible
  })
}
