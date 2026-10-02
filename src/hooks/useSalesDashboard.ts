import { useQuery, keepPreviousData } from "@tanstack/react-query"
import { getSalesDashboard, getSellerTasks } from "@/lib/supabase/queries/salesDashboard"

export const SALES_DASHBOARD_KEY = ["sales-dashboard"] as const

export function useSalesDashboard(from: string, to: string, pipelineId: string | null) {
  return useQuery({
    queryKey: [...SALES_DASHBOARD_KEY, from, to, pipelineId],
    queryFn: () => getSalesDashboard(from, to, pipelineId),
    placeholderData: keepPreviousData, // switching period/voronka keeps the old numbers visible
  })
}

export function useSellerTasks(sellerId: string | null, from: string, to: string, pipelineId: string | null) {
  return useQuery({
    queryKey: [...SALES_DASHBOARD_KEY, "seller-tasks", sellerId, from, to, pipelineId],
    queryFn: () => getSellerTasks(sellerId!, from, to, pipelineId),
    enabled: !!sellerId,
  })
}
