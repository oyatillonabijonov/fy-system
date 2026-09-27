import { supabase } from "../client"

export type ActivityAction = "created" | "updated" | "deleted"
export type ActivityEntityType =
  | "client"
  | "event"
  | "participant"
  | "profile"
  | "permission"
  | "kpi"
  | "cashback"

export interface ActivityLog {
  id: string
  actor_id: string | null
  actor_email: string | null
  actor_name: string | null
  actor_role: string | null
  action: ActivityAction
  entity_type: ActivityEntityType
  entity_id: string
  entity_name: string | null
  changes: Record<string, unknown> | null
  description: string | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

export interface ActivityFilters {
  actor_id?: string
  entity_type?: ActivityEntityType
  action?: ActivityAction
  search?: string
  date_from?: string
  date_to?: string
}

export interface ActivityPage {
  items: ActivityLog[]
  total: number
  has_more: boolean
}

interface ActivityRow {
  id: string
  actor_id: string | null
  actor_email: string | null
  actor_name: string | null
  actor_role: string | null
  action: string
  entity_type: string
  entity_id: string
  entity_name: string | null
  changes: unknown
  description: string | null
  ip_address: string | null
  user_agent: string | null
  created_at: string | null
}

function mapRow(row: ActivityRow): ActivityLog {
  return {
    id: row.id,
    actor_id: row.actor_id,
    actor_email: row.actor_email,
    actor_name: row.actor_name,
    actor_role: row.actor_role,
    action: row.action as ActivityAction,
    entity_type: row.entity_type as ActivityEntityType,
    entity_id: row.entity_id,
    entity_name: row.entity_name,
    changes: (row.changes as Record<string, unknown> | null) ?? null,
    description: row.description,
    ip_address: row.ip_address,
    user_agent: row.user_agent,
    created_at: row.created_at ?? new Date().toISOString(),
  }
}

// Postgrest `or()` filter is comma-separated; reject those + wildcards
// that would break the syntax. ILIKE `%` is allowed.
function sanitizeForOrFilter(s: string): string {
  return s.replace(/[,()\\]/g, "").trim()
}

export async function getActivityLogs(
  filters: ActivityFilters = {},
  page: number = 0,
  limit: number = 50,
): Promise<ActivityPage> {
  let query = supabase
    .from("activity_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })

  if (filters.actor_id) query = query.eq("actor_id", filters.actor_id)
  if (filters.entity_type) query = query.eq("entity_type", filters.entity_type)
  if (filters.action) query = query.eq("action", filters.action)
  if (filters.date_from) query = query.gte("created_at", filters.date_from)
  if (filters.date_to) query = query.lte("created_at", filters.date_to)
  if (filters.search) {
    const s = sanitizeForOrFilter(filters.search)
    if (s) {
      query = query.or(
        `description.ilike.%${s}%,entity_name.ilike.%${s}%,actor_name.ilike.%${s}%`,
      )
    }
  }

  query = query.range(page * limit, (page + 1) * limit - 1)

  const { data, error, count } = await query
  if (error) throw error

  const items = (data ?? []).map((row) => mapRow(row as ActivityRow))
  const total = count ?? 0
  return {
    items,
    total,
    has_more: (page + 1) * limit < total,
  }
}
