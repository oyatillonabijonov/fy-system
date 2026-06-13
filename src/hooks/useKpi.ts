import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getKpiSummary,
  getKpiHistory,
  getDepartmentKpi,
  upsertKpiTarget,
  getDepartmentHeads,
  setDepartmentHead,
  type KpiSummary,
  type KpiTarget,
  type DepartmentKpi,
} from "@/lib/supabase/queries/kpi"
import type { Department } from "@/lib/constants/employee"

export const KPI_KEY = ["kpi"] as const
export const KPI_HISTORY_KEY = ["kpi-history"] as const
export const DEPARTMENT_HEADS_KEY = ["department-heads"] as const
export const DEPARTMENT_KPI_KEY = ["department-kpi"] as const

export function useDepartmentKpi(department: Department, year: number, month: number) {
  return useQuery<DepartmentKpi>({
    queryKey: [...DEPARTMENT_KPI_KEY, department, year, month],
    queryFn: () => getDepartmentKpi(department, year, month),
    enabled: !!department,
    staleTime: 1000 * 60 * 2,
  })
}

export function useKpiSummary(userId: string | null | undefined, year: number, month: number) {
  return useQuery<KpiSummary>({
    queryKey: [...KPI_KEY, userId, year, month],
    queryFn: () => getKpiSummary(userId!, year, month),
    enabled: !!userId,
    staleTime: 1000 * 60 * 2,
  })
}

export function useKpiHistory(userId: string | null | undefined) {
  return useQuery<KpiTarget[]>({
    queryKey: [...KPI_HISTORY_KEY, userId],
    queryFn: () => getKpiHistory(userId!),
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
  })
}

export function useUpsertKpiTarget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: upsertKpiTarget,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [...KPI_KEY, vars.userId] })
      qc.invalidateQueries({ queryKey: [...KPI_HISTORY_KEY, vars.userId] })
    },
  })
}

export function useDepartmentHeads() {
  return useQuery<Record<Department, string>>({
    queryKey: DEPARTMENT_HEADS_KEY,
    queryFn: getDepartmentHeads,
    staleTime: 1000 * 60 * 5,
  })
}

export function useSetDepartmentHead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { department: Department; userId: string | null }) =>
      setDepartmentHead(vars.department, vars.userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEPARTMENT_HEADS_KEY }),
  })
}
