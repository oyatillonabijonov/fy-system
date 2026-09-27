import { supabase } from "../client"
import type { Department } from "@/lib/constants/employee"

export interface KpiTarget {
  id: string
  user_id: string
  period_year: number
  period_month: number
  revenue_target: number
  leads_target: number
  events_target: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface KpiActual {
  revenue_actual: number
  leads_closed: number
  events_managed: number
}

export interface KpiSummary {
  target: KpiTarget | null
  actual: KpiActual
  revenue_progress: number   // 0-100+
  leads_progress: number
  events_progress: number
}

interface KpiTargetRow {
  id: string
  user_id: string | null
  period_year: number
  period_month: number
  revenue_target: number | null
  leads_target: number | null
  events_target: number | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

function mapTargetRow(row: KpiTargetRow): KpiTarget {
  return {
    id: row.id,
    user_id: row.user_id ?? "",
    period_year: row.period_year,
    period_month: row.period_month,
    revenue_target: Number(row.revenue_target ?? 0),
    leads_target: row.leads_target ?? 0,
    events_target: row.events_target ?? 0,
    notes: row.notes,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString(),
  }
}

// ─── Targets ────────────────────────────────────────────

export async function getKpiTarget(
  userId: string,
  year: number,
  month: number,
): Promise<KpiTarget | null> {
  const { data } = await supabase
    .from("employee_kpi_targets")
    .select("*")
    .eq("user_id", userId)
    .eq("period_year", year)
    .eq("period_month", month)
    .maybeSingle()
  if (!data) return null
  return mapTargetRow(data as KpiTargetRow)
}

// Actual KPI is computed by a SECURITY DEFINER SQL function
export async function getKpiActual(
  userId: string,
  year: number,
  month: number,
): Promise<KpiActual> {
  const { data, error } = await supabase
    .rpc("calculate_employee_kpi_actual", {
      p_user_id: userId,
      p_year: year,
      p_month: month,
    })
    .single()

  if (error || !data) {
    return { revenue_actual: 0, leads_closed: 0, events_managed: 0 }
  }
  const row = data as { revenue_actual: number | null; leads_closed: number | null; events_managed: number | null }
  return {
    revenue_actual: Number(row.revenue_actual ?? 0),
    leads_closed: row.leads_closed ?? 0,
    events_managed: row.events_managed ?? 0,
  }
}

export async function getKpiSummary(
  userId: string,
  year: number,
  month: number,
): Promise<KpiSummary> {
  const [target, actual] = await Promise.all([
    getKpiTarget(userId, year, month),
    getKpiActual(userId, year, month),
  ])

  // floor, not round: the UI shows "✓ Maqsad bajarildi" at >= 100, and rounding
  // turned 99.5% into a reached goal while the money was still short.
  const calc = (a: number, t: number) => (t > 0 ? Math.floor((a / t) * 100) : 0)

  return {
    target,
    actual,
    revenue_progress: calc(actual.revenue_actual, target?.revenue_target ?? 0),
    leads_progress: calc(actual.leads_closed, target?.leads_target ?? 0),
    events_progress: calc(actual.events_managed, target?.events_target ?? 0),
  }
}

export async function upsertKpiTarget(input: {
  userId: string
  year: number
  month: number
  revenue_target: number
  leads_target: number
  events_target: number
  notes?: string
}): Promise<void> {
  const { error } = await supabase
    .from("employee_kpi_targets")
    .upsert(
      {
        user_id: input.userId,
        period_year: input.year,
        period_month: input.month,
        revenue_target: input.revenue_target,
        leads_target: input.leads_target,
        events_target: input.events_target,
        notes: input.notes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,period_year,period_month" },
    )
  if (error) throw error
}

export async function getKpiHistory(userId: string): Promise<KpiTarget[]> {
  const { data } = await supabase
    .from("employee_kpi_targets")
    .select("*")
    .eq("user_id", userId)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false })
    .limit(12)
  return (data ?? []).map((row) => mapTargetRow(row as KpiTargetRow))
}

// ─── Department heads ───────────────────────────────────

export async function getDepartmentHeads(): Promise<Record<Department, string>> {
  const { data } = await supabase
    .from("department_heads")
    .select("department, user_id")

  const result = {} as Record<Department, string>
  for (const row of data ?? []) {
    if (row.user_id) result[row.department as Department] = row.user_id
  }
  return result
}
