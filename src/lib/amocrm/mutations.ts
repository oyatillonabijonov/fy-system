import { fetchFromAmo } from "./client"
import { supabase } from "../supabase/client"

export async function updateLeadStage(
  leadId: number,
  statusId: number,
  pipelineId: number
): Promise<void> {
  await fetchFromAmo<unknown>(`/leads/${leadId}`, {
    method: "PATCH",
    body: JSON.stringify({ status_id: statusId, pipeline_id: pipelineId }),
  })

  await supabase
    .from("amocrm_leads")
    .update({ status_id: statusId, pipeline_id: pipelineId })
    .eq("id", leadId)
}

export async function updateLeadResponsible(
  leadId: number,
  userId: number
): Promise<void> {
  await fetchFromAmo<unknown>(`/leads/${leadId}`, {
    method: "PATCH",
    body: JSON.stringify({ responsible_user_id: userId }),
  })

  await supabase
    .from("amocrm_leads")
    .update({ responsible_user_id: userId })
    .eq("id", leadId)
}

export async function updateLeadName(
  leadId: number,
  name: string
): Promise<void> {
  await fetchFromAmo<unknown>(`/leads/${leadId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  })

  await supabase
    .from("amocrm_leads")
    .update({ name })
    .eq("id", leadId)
}

export async function updateLeadPrice(
  leadId: number,
  price: number
): Promise<void> {
  await fetchFromAmo<unknown>(`/leads/${leadId}`, {
    method: "PATCH",
    body: JSON.stringify({ price }),
  })

  await supabase
    .from("amocrm_leads")
    .update({ price })
    .eq("id", leadId)
}

export async function closeLead(
  leadId: number,
  type: "won" | "lost",
  pipelineId: number
): Promise<void> {
  const statusId = type === "won" ? 142 : 143
  await fetchFromAmo<unknown>(`/leads/${leadId}`, {
    method: "PATCH",
    body: JSON.stringify({ status_id: statusId }),
  })

  await supabase
    .from("amocrm_leads")
    .update({ status_id: statusId, pipeline_id: pipelineId })
    .eq("id", leadId)
}

export async function updateContact(
  contactId: number,
  fields: { name?: string; phone?: string }
): Promise<void> {
  const body: Record<string, unknown> = {}
  if (fields.name) body.name = fields.name
  if (fields.phone) {
    body.custom_fields_values = [
      {
        field_code: "PHONE",
        values: [{ value: fields.phone, enum_code: "WORK" }],
      },
    ]
  }

  await fetchFromAmo<unknown>(`/contacts/${contactId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  })
}

interface CreateLeadData {
  name: string
  pipelineId: number
  statusId: number
  price?: number
  responsibleUserId?: number
  contactName?: string
  contactPhone?: string
}

interface AmoCreateResponse {
  _embedded: {
    leads?: { id: number }[]
    contacts?: { id: number }[]
  }
}

export async function createLead(data: CreateLeadData): Promise<number> {
  let contactId: number | undefined

  // Step 1: Create contact if needed
  if (data.contactName || data.contactPhone) {
    const contactBody: Record<string, unknown> = {
      name: data.contactName || data.name,
    }
    if (data.contactPhone) {
      contactBody.custom_fields_values = [
        {
          field_code: "PHONE",
          values: [{ value: data.contactPhone, enum_code: "WORK" }],
        },
      ]
    }

    const contactRes = await fetchFromAmo<AmoCreateResponse>("/contacts", {
      method: "POST",
      body: JSON.stringify([contactBody]),
    })
    contactId = contactRes._embedded?.contacts?.[0]?.id
  }

  // Step 2: Create lead
  const leadBody: Record<string, unknown> = {
    name: data.name,
    pipeline_id: data.pipelineId,
    status_id: data.statusId,
    price: data.price ?? 0,
  }
  if (data.responsibleUserId) {
    leadBody.responsible_user_id = data.responsibleUserId
  }
  if (contactId) {
    leadBody._embedded = { contacts: [{ id: contactId }] }
  }

  const leadRes = await fetchFromAmo<AmoCreateResponse>("/leads", {
    method: "POST",
    body: JSON.stringify([leadBody]),
  })

  const newLeadId = leadRes._embedded?.leads?.[0]?.id
  if (!newLeadId) throw new Error("Lead yaratilmadi")

  // Step 3: Upsert to Supabase
  await supabase.from("amocrm_leads").upsert(
    {
      id: newLeadId,
      pipeline_id: data.pipelineId,
      status_id: data.statusId,
      name: data.name,
      price: data.price ?? 0,
      responsible_user_id: data.responsibleUserId ?? 0,
      contact_name: data.contactName ?? null,
      contact_phone: data.contactPhone ?? null,
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
      synced_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  )

  return newLeadId
}

export async function addLeadNote(
  leadId: number,
  text: string
): Promise<void> {
  await fetchFromAmo<unknown>(`/leads/${leadId}/notes`, {
    method: "POST",
    body: JSON.stringify([{ note_type: "common", params: { text } }]),
  })
}

export async function createLeadTask(
  leadId: number,
  text: string,
  dueDate?: number
): Promise<void> {
  await fetchFromAmo<unknown>("/tasks", {
    method: "POST",
    body: JSON.stringify([
      {
        task_type_id: 1,
        text,
        complete_till: dueDate ?? Math.floor(Date.now() / 1000) + 86400,
        entity_id: leadId,
        entity_type: "leads",
      },
    ]),
  })
}
