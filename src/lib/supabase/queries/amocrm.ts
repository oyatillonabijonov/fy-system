import { supabase } from "../client"

export interface CachedLead {
  id: number
  pipeline_id: number
  status_id: number
  name: string
  price: number
  responsible_user_id: number
  responsible_user_name: string | null
  contact_name: string | null
  contact_phone: string | null
  company_name: string | null
  tags: { id: number; name: string }[]
  created_at: number
  updated_at: number
  synced_at: string
}

export interface CachedPipeline {
  id: number
  name: string
  statuses: { id: number; name: string; color: string; sort: number }[]
}

export interface CachedUser {
  id: number
  name: string
}

export async function getCachedUsers(): Promise<CachedUser[]> {
  const { data, error } = await supabase
    .from("amocrm_users")
    .select("id,name")
    .order("name")

  if (error) throw error
  return (data ?? []) as CachedUser[]
}

export async function getCachedPipelines(): Promise<CachedPipeline[]> {
  const { data, error } = await supabase
    .from("amocrm_pipelines")
    .select("*")
    .order("id")

  if (error) throw error
  return (data ?? []) as unknown as CachedPipeline[]
}

export async function getCachedLeads(
  pipelineId?: number,
  page = 0,
  limit = 500
): Promise<CachedLead[]> {
  let query = supabase
    .from("amocrm_leads")
    .select("id,pipeline_id,status_id,name,price,responsible_user_id,responsible_user_name,contact_name,contact_phone,company_name,tags,created_at,updated_at,synced_at")
    .order("updated_at", { ascending: false })
    .range(page * limit, (page + 1) * limit - 1)

  if (pipelineId) {
    query = query.eq("pipeline_id", pipelineId)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as CachedLead[]
}

export function subscribeToLeads(
  pipelineId: number | undefined,
  onUpdate: (leads: CachedLead[]) => void,
  onNewLead?: (lead: CachedLead) => void
) {
  const filter = pipelineId ? { filter: `pipeline_id=eq.${pipelineId}` } : {}

  const channel = supabase
    .channel(`amocrm_leads_${pipelineId ?? "all"}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "amocrm_leads", ...filter },
      async (payload) => {
        if (onNewLead) onNewLead(payload.new as CachedLead)
        const leads = await getCachedLeads(pipelineId)
        onUpdate(leads)
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "amocrm_leads", ...filter },
      async () => {
        const leads = await getCachedLeads(pipelineId)
        onUpdate(leads)
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
