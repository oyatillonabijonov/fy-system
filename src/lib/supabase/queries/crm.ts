import { supabase } from "../client"

// ─── Types ───────────────────────────────────────────────

export interface CrmPipeline {
  id: string
  name: string
  color: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CrmStage {
  id: string
  pipeline_id: string
  name: string
  color: string
  sort_order: number
  is_won: boolean
  is_lost: boolean
  created_at: string
}

export interface CrmContact {
  id: string
  name: string
  phone: string | null
  email: string | null
  company: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CrmLead {
  id: string
  name: string
  pipeline_id: string
  stage_id: string
  contact_id: string | null
  responsible_user_id: number | null
  price: number
  source: string
  tags: string[]
  is_won: boolean
  is_lost: boolean
  loss_reason: string | null
  created_at: string
  updated_at: string
}

export interface CrmLeadWithContact extends CrmLead {
  crm_contacts: CrmContact | null
}

export interface CrmNote {
  id: string
  lead_id: string
  text: string
  created_by: number | null
  created_at: string
}

export interface CrmTask {
  id: string
  lead_id: string
  text: string
  due_date: string | null
  is_done: boolean
  created_by: number | null
  created_at: string
}

export interface CreateCrmLeadInput {
  name: string
  pipeline_id: string
  stage_id: string
  contact_id?: string
  price?: number
  responsible_user_id?: number
  source?: string
}

export interface CreateCrmContactInput {
  name: string
  phone?: string
  email?: string
  company?: string
  notes?: string
}

// ─── Pipelines ───────────────────────────────────────────

export async function getCrmPipelines(): Promise<CrmPipeline[]> {
  const { data, error } = await supabase
    .from("crm_pipelines")
    .select("*")
    .eq("is_active", true)
    .order("sort_order")

  if (error) throw error
  return data as CrmPipeline[]
}

export async function createCrmPipeline(
  name: string,
  color?: string
): Promise<CrmPipeline> {
  const { data, error } = await supabase
    .from("crm_pipelines")
    .insert({ name, color: color ?? "#141414" })
    .select()
    .single()

  if (error) throw error
  return data as CrmPipeline
}

export async function updateCrmPipeline(
  id: string,
  updates: Partial<Pick<CrmPipeline, "name" | "color">>
): Promise<void> {
  const { error } = await supabase
    .from("crm_pipelines")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)

  if (error) throw error
}

export async function deleteCrmPipeline(id: string): Promise<void> {
  const { error } = await supabase
    .from("crm_pipelines")
    .delete()
    .eq("id", id)

  if (error) throw error
}

// ─── Stages ──────────────────────────────────────────────

export async function getCrmStages(pipelineId: string): Promise<CrmStage[]> {
  const { data, error } = await supabase
    .from("crm_stages")
    .select("*")
    .eq("pipeline_id", pipelineId)
    .order("sort_order")

  if (error) throw error
  return data as CrmStage[]
}

export async function createCrmStage(
  pipelineId: string,
  name: string,
  color?: string
): Promise<CrmStage> {
  // Get max sort_order
  const { data: existing } = await supabase
    .from("crm_stages")
    .select("sort_order")
    .eq("pipeline_id", pipelineId)
    .order("sort_order", { ascending: false })
    .limit(1)

  const nextOrder = existing && existing.length > 0
    ? (existing[0] as { sort_order: number }).sort_order + 1
    : 0

  const { data, error } = await supabase
    .from("crm_stages")
    .insert({
      pipeline_id: pipelineId,
      name,
      color: color ?? "#141414",
      sort_order: nextOrder,
    })
    .select()
    .single()

  if (error) throw error
  return data as CrmStage
}

export async function updateCrmStage(
  id: string,
  updates: Partial<Pick<CrmStage, "name" | "color" | "sort_order" | "is_won" | "is_lost">>
): Promise<void> {
  const { error } = await supabase
    .from("crm_stages")
    .update(updates)
    .eq("id", id)

  if (error) throw error
}

export async function deleteCrmStage(id: string): Promise<void> {
  const { error } = await supabase
    .from("crm_stages")
    .delete()
    .eq("id", id)

  if (error) throw error
}

export async function batchCreateCrmStages(
  stages: { pipeline_id: string; name: string; color: string; sort_order: number; is_won?: boolean; is_lost?: boolean }[]
): Promise<void> {
  const { error } = await supabase
    .from("crm_stages")
    .insert(stages)

  if (error) throw error
}

export async function reorderStages(
  stages: { id: string; sort_order: number }[]
): Promise<void> {
  // Upsert each stage's sort_order
  const promises = stages.map((s) =>
    supabase.from("crm_stages").update({ sort_order: s.sort_order }).eq("id", s.id)
  )
  const results = await Promise.all(promises)
  const firstError = results.find((r) => r.error)
  if (firstError?.error) throw firstError.error
}

// ─── Leads ───────────────────────────────────────────────

export async function getCrmLeads(pipelineId: string): Promise<CrmLeadWithContact[]> {
  const { data, error } = await supabase
    .from("crm_leads")
    .select("id, name, pipeline_id, stage_id, contact_id, responsible_user_id, price, source, tags, is_won, is_lost, loss_reason, created_at, updated_at, crm_contacts(id, name, phone, email, company, notes, created_at, updated_at)")
    .eq("pipeline_id", pipelineId)
    .order("updated_at", { ascending: false })

  if (error) throw error
  return data as CrmLeadWithContact[]
}

export async function createCrmLead(input: CreateCrmLeadInput): Promise<CrmLead> {
  const { data, error } = await supabase
    .from("crm_leads")
    .insert({
      name: input.name,
      pipeline_id: input.pipeline_id,
      stage_id: input.stage_id,
      contact_id: input.contact_id ?? null,
      price: input.price ?? 0,
      responsible_user_id: input.responsible_user_id ?? null,
      source: input.source ?? "manual",
    })
    .select()
    .single()

  if (error) throw error
  return data as CrmLead
}

export async function updateCrmLead(
  id: string,
  updates: Partial<Pick<CrmLead, "name" | "price" | "responsible_user_id" | "stage_id" | "tags">>
): Promise<void> {
  const { error } = await supabase
    .from("crm_leads")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)

  if (error) throw error
}

export async function updateCrmLeadStage(
  id: string,
  stageId: string
): Promise<void> {
  const { error } = await supabase
    .from("crm_leads")
    .update({ stage_id: stageId, updated_at: new Date().toISOString() })
    .eq("id", id)

  if (error) throw error
}

export async function closeCrmLead(
  id: string,
  type: "won" | "lost",
  reason?: string
): Promise<void> {
  const updates: Record<string, unknown> = {
    is_won: type === "won",
    is_lost: type === "lost",
    updated_at: new Date().toISOString(),
  }
  if (type === "lost" && reason) {
    updates.loss_reason = reason
  }

  const { error } = await supabase
    .from("crm_leads")
    .update(updates)
    .eq("id", id)

  if (error) throw error
}

export async function deleteCrmLead(id: string): Promise<void> {
  const { error } = await supabase
    .from("crm_leads")
    .delete()
    .eq("id", id)

  if (error) throw error
}

// ─── Contacts ────────────────────────────────────────────

export async function createCrmContact(input: CreateCrmContactInput): Promise<CrmContact> {
  const { data, error } = await supabase
    .from("crm_contacts")
    .insert({
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      company: input.company ?? null,
      notes: input.notes ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return data as CrmContact
}

export async function updateCrmContact(
  id: string,
  updates: Partial<Pick<CrmContact, "name" | "phone" | "email" | "company" | "notes">>
): Promise<void> {
  const { error } = await supabase
    .from("crm_contacts")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)

  if (error) throw error
}

// ─── Notes ───────────────────────────────────────────────

export async function getCrmNotes(leadId: string): Promise<CrmNote[]> {
  const { data, error } = await supabase
    .from("crm_notes")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })

  if (error) throw error
  return data as CrmNote[]
}

export async function addCrmNote(leadId: string, text: string): Promise<CrmNote> {
  const { data, error } = await supabase
    .from("crm_notes")
    .insert({ lead_id: leadId, text })
    .select()
    .single()

  if (error) throw error
  return data as CrmNote
}

// ─── Tasks ───────────────────────────────────────────────

export async function getCrmTasks(leadId: string): Promise<CrmTask[]> {
  const { data, error } = await supabase
    .from("crm_tasks")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })

  if (error) throw error
  return data as CrmTask[]
}

export async function addCrmTask(
  leadId: string,
  text: string,
  dueDate?: string
): Promise<CrmTask> {
  const { data, error } = await supabase
    .from("crm_tasks")
    .insert({
      lead_id: leadId,
      text,
      due_date: dueDate ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return data as CrmTask
}

export async function toggleCrmTask(id: string, isDone: boolean): Promise<void> {
  const { error } = await supabase
    .from("crm_tasks")
    .update({ is_done: isDone })
    .eq("id", id)

  if (error) throw error
}

// ─── Realtime ────────────────────────────────────────────

export function subscribeToCrmLeads(
  pipelineId: string,
  onUpdate: () => void
): () => void {
  const channel = supabase
    .channel(`crm_leads_${pipelineId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "crm_leads",
        filter: `pipeline_id=eq.${pipelineId}`,
      },
      () => onUpdate()
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "crm_stages",
        filter: `pipeline_id=eq.${pipelineId}`,
      },
      () => onUpdate()
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
