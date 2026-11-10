// AI analysis of sales calls (migration 090). amo-sync writes crm_call_analyses; the web only reads:
// a seller their own calls' rows, admins and managers all (RLS).
import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase } from "../client"

// ponytail: untyped client until `bun run gen:types` picks up migration 090 (as in sotuv.ts)
const db = supabase as unknown as SupabaseClient

export type AnalysisStatus = "pending" | "done" | "failed" | "skipped"

export interface CallAnalysis {
  call_uuid: string
  status: AnalysisStatus
  error: string | null
  language: string | null
  transcript: { t: string; who: "seller" | "client"; text: string }[] | null
  summary: string | null
  outcome: string | null
  score: number | null
  criteria: { name: string; score: number | null; comment: string }[] | null
  good: string[] | null
  mistakes: { t: string | null; quote: string; why: string; better: string; tag: string }[] | null
  words: { word: string; count: number | null; why: string }[] | null
  advice: string[] | null
  script_missed: string[] | null
  analysed_at: string | null
}

export interface SellerStats {
  staff_id: string
  name: string
  calls: number
  avg_score: number | null
  weeks: { week: string; avg: number | null; calls: number }[]
  tags: { tag: string; count: number }[]
}

/** Mistake tags (amo-sync TAGS) → what the manager reads */
export const TAG_LABEL: Record<string, string> = {
  tanishtirmadi: "O'zini tanishtirmadi",
  ehtiyoj_soramadi: "Ehtiyojni so'ramadi",
  foyda_aytmadi: "Foydani aytmadi",
  etirozga_javob_yoq: "E'tirozga javob bermadi",
  keyingi_qadam: "Keyingi qadam yo'q",
  sovutadigan_gap: "Mijozni sovutadigan gap",
  ortiqcha_soz: "Ortiqcha so'zlar",
  tinglamadi: "Mijozni tinglamadi",
  boshqa: "Boshqa",
}

export async function getCallAnalysis(uuid: string): Promise<CallAnalysis | null> {
  const { data, error } = await db.from("crm_call_analyses")
    .select("call_uuid, status, error, language, transcript, summary, outcome, score, criteria, good, mistakes, words, advice, script_missed, analysed_at")
    .eq("call_uuid", uuid).maybeSingle()
  if (error) throw error
  return data as CallAnalysis | null
}

/** Per seller for a period (Tashkent days, YYYY-MM-DD); a seller gets only their own row */
export async function getCallStats(from: string, to: string): Promise<SellerStats[]> {
  const { data, error } = await db.rpc("call_analysis_stats", { p_from: from, p_to: to })
  if (error) throw error
  return (data as { sellers: SellerStats[] }).sellers
}

export async function getSalesScript(): Promise<string> {
  const { data, error } = await db.from("sales_script").select("body").maybeSingle()
  if (error) throw error
  return (data as { body: string } | null)?.body ?? ""
}

export async function saveSalesScript(body: string, userId: string | null): Promise<void> {
  const { error } = await db.from("sales_script").update({ body, updated_at: new Date().toISOString(), updated_by: userId }).eq("id", true)
  if (error) throw error
}

export async function requeueCallAnalysis(uuid: string): Promise<void> {
  const { error } = await db.rpc("requeue_call_analysis", { p_call: uuid })
  if (error) throw error
}
