import { supabase } from "../client"

// Dashboard analytics over CRM-N (crm_leads). Replaces the old AmoCRM-backed
// analytics: same shape, native source.
//
// Counts are done server-side (head: true) rather than by fetching rows — an
// unbounded select is capped by PostgREST's max_rows and would silently
// undercount once the pipeline grows.

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000

const UZ_MONTHS = [
  "Yan", "Fev", "Mar", "Apr", "May", "Iyn",
  "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek",
]

interface Range {
  from: string
  to: string
}

/** Tashkent (UTC+5) calendar day `daysAgo` back, as a UTC instant range. */
function tashkentDay(daysAgo: number): Range {
  const wall = new Date(Date.now() + TASHKENT_OFFSET_MS)
  const startMs =
    Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() - daysAgo) -
    TASHKENT_OFFSET_MS
  return {
    from: new Date(startMs).toISOString(),
    to: new Date(startMs + 86_400_000).toISOString(),
  }
}

/** Tashkent calendar month `monthsAgo` back, plus its Uzbek short label. */
function tashkentMonth(monthsAgo: number): Range & { label: string } {
  const wall = new Date(Date.now() + TASHKENT_OFFSET_MS)
  const year = wall.getUTCFullYear()
  const month = wall.getUTCMonth() - monthsAgo
  const startMs = Date.UTC(year, month, 1) - TASHKENT_OFFSET_MS
  const endMs = Date.UTC(year, month + 1, 1) - TASHKENT_OFFSET_MS
  return {
    from: new Date(startMs).toISOString(),
    to: new Date(endMs).toISOString(),
    label: UZ_MONTHS[new Date(Date.UTC(year, month, 1)).getUTCMonth()],
  }
}

async function countInRange(column: "created_at" | "updated_at", r: Range): Promise<number> {
  const { count, error } = await supabase
    .from("crm_leads")
    .select("id", { count: "exact", head: true })
    .gte(column, r.from)
    .lt(column, r.to)

  if (error) throw error
  return count ?? 0
}

async function countTotal(): Promise<number> {
  const { count, error } = await supabase
    .from("crm_leads")
    .select("id", { count: "exact", head: true })

  if (error) throw error
  return count ?? 0
}

async function countWon(): Promise<number> {
  const { count, error } = await supabase
    .from("crm_leads")
    .select("id", { count: "exact", head: true })
    .is("is_won", true)

  if (error) throw error
  return count ?? 0
}

/** Neither won nor lost. `not(is.true)` so a NULL flag counts as open. */
async function countActive(): Promise<number> {
  const { count, error } = await supabase
    .from("crm_leads")
    .select("id", { count: "exact", head: true })
    .not("is_won", "is", true)
    .not("is_lost", "is", true)

  if (error) throw error
  return count ?? 0
}

export interface DashboardAnalytics {
  leadsToday: number
  leadsYesterday: number
  activeLeads: number
  conversionRate: number
  processedYesterday: number
  monthlyLeads: { month: string; count: number }[]
}

export async function getDashboardAnalytics(): Promise<DashboardAnalytics> {
  const today = tashkentDay(0)
  const yesterday = tashkentDay(1)
  const months = Array.from({ length: 7 }, (_, i) => tashkentMonth(6 - i))

  const [leadsToday, leadsYesterday, processedYesterday, activeLeads, total, won, ...monthCounts] =
    await Promise.all([
      countInRange("created_at", today),
      countInRange("created_at", yesterday),
      countInRange("updated_at", yesterday),
      countActive(),
      countTotal(),
      countWon(),
      ...months.map((m) => countInRange("created_at", m)),
    ])

  return {
    leadsToday,
    leadsYesterday,
    activeLeads,
    conversionRate: total > 0 ? (won / total) * 100 : 0,
    processedYesterday,
    monthlyLeads: months.map((m, i) => ({ month: m.label, count: monthCounts[i] })),
  }
}
