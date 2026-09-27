import { supabase } from "../client"

// Dashboard analytics over the AmoCRM copy (migration 049). The amo-sync service
// fills the amo_* tables; every number comes from the amo_dashboard() SQL
// function in one round trip — nothing is summed in the browser, and the
// browser never talks to AmoCRM.

export interface AmoKpi {
  won: number
  lost: number
  bulk_closed: number
  prev_won: number
  prev_lost: number
  new_leads: number
  prev_new_leads: number
  active: number
  stale: number
  cycle_days: number | null
  prev_cycle_days: number | null
  /** Real money from this system's payments (AmoCRM deal amounts are not kept) */
  revenue: number
  prev_revenue: number
  payers: number
  prev_payers: number
}

export interface AmoFunnelRow {
  id: number
  name: string
  color: string | null
  kind: "open" | "won" | "lost"
  count: number
  entered: number
}

export interface AmoPipelineRow { id: number; name: string; won: number; lost: number; new_leads: number }
export interface AmoDayRow { day: string; new_leads: number; won: number }
export interface AmoManagerRow { id: number | null; name: string; new_leads: number; active: number; won: number; lost: number; stale: number }
export interface AmoLossRow { reason: string; count: number }
export interface AmoRiskyRow { id: number; name: string | null; stage: string; manager: string; idle_days: number; has_task: boolean }

export interface AmoDashboard {
  kpi: AmoKpi
  tasks: { overdue: number; no_task: number }
  funnel: AmoFunnelRow[]
  by_pipeline: AmoPipelineRow[]
  daily: AmoDayRow[]
  managers: AmoManagerRow[]
  losses: AmoLossRow[]
  risky: AmoRiskyRow[]
  synced_at: string | null
  sync_error: string | null
  amo_base_url: string | null
  pipelines: { id: number; name: string }[]
  /** Minutes since the last successful sync, measured when the data was fetched (null = never) */
  synced_minutes_ago: number | null
}

// amo_dashboard isn't in the generated types.ts yet (stale types
// workaround, CLAUDE.md §6) — remove the casts after `bun run gen:types`.
type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>

export async function getAmoDashboard(from: string, to: string, pipelineId: number | null): Promise<AmoDashboard> {
  const { data, error } = await (supabase.rpc.bind(supabase) as unknown as Rpc)("amo_dashboard", {
    p_from: from,
    p_to: to,
    p_pipeline: pipelineId,
  })
  if (error) throw error
  const d = data as Omit<AmoDashboard, "synced_minutes_ago">
  return {
    ...d,
    synced_minutes_ago: d.synced_at ? Math.max(0, Math.round((Date.now() - new Date(d.synced_at).getTime()) / 60000)) : null,
  }
}
