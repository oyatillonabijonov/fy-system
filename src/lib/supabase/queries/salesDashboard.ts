import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase } from "../client"
import { dayEnd, dayStart } from "@/lib/period"
import type { TaskKind } from "./sotuv"

// ponytail: untyped client until `bun run gen:types` picks up migration 080
const db = supabase as unknown as SupabaseClient

export interface SalesKpi { new: number; won: number; lost: number; conversion: number | null; won_sum: number }
export interface SalesSeller {
  id: string; full_name: string; avatar_url: string | null
  open: number; new: number; won: number; lost: number; conversion: number | null; won_sum: number
  tasks_done: number; tasks_on_time: number; tasks_overdue_open: number
  calls_in: number; calls_out: number; calls_missed: number; talk_sec: number
}
export interface SalesDashboard {
  pipelines: { id: string; name: string }[]
  kpi: SalesKpi
  kpi_prev: SalesKpi
  funnel: { pipeline: string; pipeline_id: string; stage_id: string; name: string; color: string; open: number; open_sum: number }[]
  by_source: { source: string | null; new: number; won: number }[]
  by_pipeline: { id: string; name: string; new: number; won: number }[]
  daily: { day: string; new: number; won: number }[]
  sellers: SalesSeller[]
  calls: { in: number; out: number; missed: number; talk_sec: number; avg_talk_sec: number; missed_called_back: number }
  attention: {
    overdue_tasks: { id: string; lead_id: string; lead_name: string; text: string | null; kind: TaskKind; due_date: string; assignee: string | null }[]
    stale_leads: { id: string; name: string; stage: string; days: number; responsible: string | null }[]
    missed_unanswered: { phone: string; client_name: string | null; lead_id: string | null; last_missed_at: string; count: number }[]
  }
}

/** The whole Dashboard in one call (080). `from`/`to` are Tashkent days, YYYY-MM-DD. */
export async function getSalesDashboard(from: string, to: string, pipelineId: string | null): Promise<SalesDashboard> {
  const { data, error } = await db.rpc("sales_dashboard", { p_from: from, p_to: to, p_pipeline: pipelineId })
  if (error) throw error
  return data as SalesDashboard
}

export interface SellerTask { id: string; lead_id: string; text: string | null; kind: TaskKind; due_date: string; done_at: string | null; is_done: boolean; lead: { name: string } | null }

/** A seller's tasks done in the period plus the ones still overdue, in the chosen voronka (RLS: sotuv-crmn) */
export async function getSellerTasks(sellerId: string, from: string, to: string, pipelineId: string | null): Promise<SellerTask[]> {
  let q = db.from("crm_tasks")
    .select("id, lead_id, text, kind, due_date, done_at, is_done, lead:lead_id!inner(name, pipeline_id)")
    .eq("assignee_id", sellerId)
  if (pipelineId) q = q.eq("lead.pipeline_id", pipelineId)
  const { data, error } = await q
    .or(`and(done_at.gte.${dayStart(from)},done_at.lte.${dayEnd(to)}),and(is_done.eq.false,due_date.lt.${new Date().toISOString()})`)
    .order("due_date")
  if (error) throw error
  return data as unknown as SellerTask[]
}
