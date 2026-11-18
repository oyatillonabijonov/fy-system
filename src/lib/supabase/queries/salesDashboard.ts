import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase } from "../client"
import { dayEnd, dayStart } from "@/lib/period"
import type { TaskKind } from "./sotuv"

// ponytail: untyped client until `bun run gen:types` picks up migration 080
const db = supabase as unknown as SupabaseClient

/** `new_won` / `new_lost`: of the bitimlar opened in the period, how many are won / lost by now */
export interface SalesKpi { new: number; won: number; lost: number; conversion: number | null; won_sum: number; new_won: number; new_lost: number }
export interface SalesSeller {
  id: string; full_name: string; avatar_url: string | null
  open: number; new: number; won: number; lost: number; conversion: number | null; won_sum: number
  /** Moliya (103): seats enrolled in the period with this seller; money is null without the Moliya right */
  seats: number; agreed: number | null; collected: number | null
  tasks_done: number; tasks_on_time: number; tasks_overdue_open: number
  calls_in: number; calls_out: number; calls_missed: number; talk_sec: number
}
/** One event's plan against fact (103). Money fields are null without the Moliya right. */
export interface SalesPlan {
  event_id: string; name: string; event_date: string | null; days_left: number | null
  seats_plan: number | null; seats: number; seats_7d: number
  seats_need_per_day: number | null; seats_per_day: number; seats_forecast: number | null
  revenue_plan: number | null; agreed: number | null; collected: number | null
  agreed_need_per_day: number | null; agreed_per_day: number | null; agreed_forecast: number | null
}
/** Open bitimlar by their nearest open task; idle = no open task at all */
export interface TaskBuckets { overdue: number; today: number; this_week: number; next_week: number; later: number; idle: number }
export interface SalesDashboard {
  pipelines: { id: string; name: string }[]
  kpi: SalesKpi
  kpi_prev: SalesKpi
  /** From Moliya, for the chosen voronka's event (`linked` false = that voronka has none) or every event */
  sales: {
    linked: boolean; seats: number; p_seats: number
    /** agreed = paid + owed (the period's participants); full + partial + unpaid = seats; debt = owed by everyone in scope, now */
    money: { agreed: number; p_agreed: number; collected: number; p_collected: number; paid: number; owed: number; full: number; partial: number; unpaid: number; debt: number } | null
  }
  plan: SalesPlan[]
  /** Bitimlar opened in the period: how many got to each stage or past it; the `won` row closes each voronka */
  stage_conv: { pipeline_id: string; stage_id: string; name: string; color: string; won: boolean; reached: number; avg_days: number | null }[]
  tasks: { total: TaskBuckets; by_seller: (TaskBuckets & { id: string | null; full_name: string | null; avatar_url: string | null })[] }
  /** Form lead → first outgoing call, minutes; `biz` = working time only (09:00–18:00, Mon–Sat) */
  speed: {
    leads: number; called: number; waiting: number
    avg_min: number | null; median_min: number | null; avg_biz_min: number | null; median_biz_min: number | null
    lt15: number; lt60: number; lt240: number; gt240: number
    by_seller: { id: string | null; full_name: string | null; leads: number; called: number; waiting: number; median_biz_min: number | null }[]
  }
  funnel: { pipeline: string; pipeline_id: string; stage_id: string; name: string; color: string; open: number; open_sum: number }[]
  by_source: { source: string | null; new: number; won: number }[]
  by_pipeline: { id: string; name: string; new: number; won: number }[]
  daily: { day: string; new: number; won: number; seats: number; collected: number | null }[]
  sellers: SalesSeller[]
  calls: { in: number; out: number; missed: number; talk_sec: number; avg_talk_sec: number; missed_called_back: number }
  attention: {
    /** real counts; the lists below hold the newest 50 */
    totals: { overdue_tasks: number; stale_leads: number; idle_leads: number; missed_unanswered: number }
    idle_leads: { id: string; name: string; stage: string; days: number; responsible: string | null }[]
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

type Activity = { leads: number; out: number; connected: number; in: number }
/** One ad of the period: who it brought, what they bought. Names are null where the lead carried none. */
export interface AdRow {
  source: string | null; campaign: string | null; adset: string | null; creative: string | null
  leads: number; qualified: number; won: number; seats: number
  /** null without the Moliya right */
  agreed: number | null; paid: number | null
}
/** The Dashboard's second call (104). Bitimlar opened in the period unless a field says otherwise. */
export interface SalesInsights {
  /** all → qualified → won; `by_score` has a row for each score seen, `score` null = came without a scored form */
  quality: { leads: number; scored: number; qualified: number; won: number; won_qualified: number; threshold: number | null; by_score: { score: number | null; leads: number; won: number }[] }
  /** bitimlar lost in the period */
  lost_reasons: { reason: string; count: number }[]
  /** `connected` = an outgoing call that was answered; by_hour adds every day of the period up, Tashkent hours */
  activity: { by_day: (Activity & { day: string })[]; by_hour: (Activity & { hour: number })[] }
  by_ad: AdRow[]
  /** bitimlar won in the period: days from the bitim to its first payment (none = the day it was won) */
  cycle: {
    count: number; avg_days: number | null; median_days: number | null
    lt1: number; d1_3: number; d4_7: number; d8_14: number; gt14: number
    by_seller: { id: string | null; full_name: string | null; count: number; median_days: number }[]
    by_source: { source: string | null; count: number; median_days: number }[]
  }
}

export async function getSalesInsights(from: string, to: string, pipelineId: string | null): Promise<SalesInsights> {
  const { data, error } = await db.rpc("sales_insights", { p_from: from, p_to: to, p_pipeline: pipelineId })
  if (error) throw error
  return data as SalesInsights
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
