import { fetchFromAmo, type AmoResponse } from "./client"
import type { Lead, LeadSource, CallType } from "@/lib/mock-data/sotuv"

interface AmoContact {
  id: number
  name: string
  first_name: string
  last_name: string
}

interface AmoLead {
  id: number
  name: string
  price: number
  responsible_user_id: number
  status_id: number
  pipeline_id: number
  created_at: number
  updated_at: number
  _embedded?: {
    contacts?: AmoContact[]
    companies?: { id: number; name: string }[]
  }
}

interface AmoUser {
  id: number
  name: string
  email: string
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

const COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#F97316",
]

function getColorForUser(userId: number): string {
  return COLORS[userId % COLORS.length]
}

let userMapCache: Map<number, string> | null = null

async function getUserMap(): Promise<Map<number, string>> {
  if (userMapCache) return userMapCache

  try {
    const data = await fetchFromAmo<AmoResponse<{ users: AmoUser[] }>>(
      "/users"
    )
    console.log("[AmoCRM] Raw users response:", data)

    const map = new Map<number, string>()
    for (const user of data._embedded.users) {
      map.set(user.id, user.name)
    }
    userMapCache = map
    return map
  } catch {
    console.warn("[AmoCRM] Could not fetch users, using fallback names")
    return new Map()
  }
}

export interface CustomFieldRendered {
  name: string
  type: string
  value: string
}

export interface ContactDetailRendered {
  id: number
  name: string
  phones: { value: string; enumCode: string }[]
  emails: { value: string; enumCode: string }[]
  customFields: CustomFieldRendered[]
}

export interface CompanyDetailRendered {
  name: string
  phone: string | null
  customFields: CustomFieldRendered[]
}

export interface AmoLeadDetail {
  id: number
  name: string
  price: number
  pipelineId: number
  statusId: number
  responsibleName: string
  createdAt: string
  updatedAt: string
  contacts: ContactDetailRendered[]
  company: CompanyDetailRendered | null
  customFields: CustomFieldRendered[]
  notes: { text: string; author: string; createdAt: string }[]
  tasks: { text: string; dueDate: string; isCompleted: boolean }[]
}

interface AmoNoteRaw {
  id: number
  note_type: string
  params?: { text?: string }
  text?: string
  created_by: number
  created_at: number
  responsible_user_id: number
}

interface AmoTaskRaw {
  id: number
  text: string
  complete_till: number
  is_completed: boolean
  responsible_user_id: number
}

interface AmoCustomFieldRaw {
  field_id: number
  field_name: string
  field_code: string | null
  field_type: string
  values: { value: string; enum_code?: string; enum_id?: number }[]
}

interface AmoContactDetail {
  id: number
  name: string
  custom_fields_values?: AmoCustomFieldRaw[]
  _embedded?: {
    companies?: { id: number; name: string }[]
  }
  company_id?: number
}

interface AmoCompanyRaw {
  id: number
  name: string
  custom_fields_values?: AmoCustomFieldRaw[]
}

interface AmoLeadRaw extends AmoLead {
  custom_fields_values?: AmoCustomFieldRaw[]
}

/** Parse raw AmoCRM custom field into a rendered field */
function parseCustomField(field: AmoCustomFieldRaw): CustomFieldRendered | null {
  const values = field.values.filter((v) => v.value !== null && v.value !== "")
  if (values.length === 0) return null

  // Skip system fields that are rendered separately
  if (field.field_code === "PHONE" || field.field_code === "EMAIL") return null

  let displayValue: string

  switch (field.field_type) {
    case "checkbox":
      displayValue = values[0].value === "true" || values[0].value === "1" ? "Ha" : "Yo'q"
      break
    case "date":
    case "date_time": {
      const ts = Number(values[0].value)
      if (!isNaN(ts)) {
        displayValue = new Date(ts * 1000).toLocaleDateString("uz-UZ", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      } else {
        displayValue = values[0].value
      }
      break
    }
    case "numeric":
      displayValue = Number(values[0].value).toLocaleString("uz-UZ")
      break
    case "multiselect":
      displayValue = values.map((v) => v.value).join(", ")
      break
    default:
      displayValue = values[0].value
  }

  return {
    name: field.field_name,
    type: field.field_type,
    value: displayValue,
  }
}

export async function getAmoLeadDetail(leadId: string): Promise<AmoLeadDetail> {
  const userMap = await getUserMap()

  const lead = await fetchFromAmo<AmoLeadRaw & {
    _embedded?: AmoLead["_embedded"] & {
      contacts?: { id: number; name: string }[]
    }
  }>(`/leads/${leadId}?with=contacts,companies`)

  console.log("[AmoCRM] Lead detail:", lead)

  // Parse lead custom fields
  const customFields: CustomFieldRendered[] = []
  for (const field of lead.custom_fields_values ?? []) {
    const parsed = parseCustomField(field)
    if (parsed) customFields.push(parsed)
  }

  // Fetch contacts details (with all custom fields)
  const contactIds = lead._embedded?.contacts?.map((c) => c.id) ?? []
  const contacts: ContactDetailRendered[] = []
  let companyId: number | null = lead._embedded?.companies?.[0]?.id ?? null

  for (const contactId of contactIds.slice(0, 5)) {
    try {
      const contact = await fetchFromAmo<AmoContactDetail>(
        `/contacts/${contactId}`
      )

      // Try to get company ID from contact if not found on lead
      if (!companyId) {
        companyId = contact._embedded?.companies?.[0]?.id ?? contact.company_id ?? null
      }

      const phones: { value: string; enumCode: string }[] = []
      const emails: { value: string; enumCode: string }[] = []
      const contactCustomFields: CustomFieldRendered[] = []

      for (const field of contact.custom_fields_values ?? []) {
        if (field.field_code === "PHONE") {
          for (const v of field.values) {
            if (v.value) phones.push({ value: v.value, enumCode: v.enum_code ?? "" })
          }
        } else if (field.field_code === "EMAIL") {
          for (const v of field.values) {
            if (v.value) emails.push({ value: v.value, enumCode: v.enum_code ?? "" })
          }
        } else {
          const parsed = parseCustomField(field)
          if (parsed) contactCustomFields.push(parsed)
        }
      }

      contacts.push({
        id: contactId,
        name: contact.name,
        phones,
        emails,
        customFields: contactCustomFields,
      })
    } catch {
      console.warn(`[AmoCRM] Could not fetch contact ${contactId}`)
    }
  }

  // Fetch company details
  let companyDetail: CompanyDetailRendered | null = null
  if (companyId) {
    try {
      const companyRaw = await fetchFromAmo<AmoCompanyRaw>(
        `/companies/${companyId}`
      )
      console.log("[AmoCRM] Company detail:", companyRaw)

      let companyPhone: string | null = null
      const companyCustomFields: CustomFieldRendered[] = []

      for (const field of companyRaw.custom_fields_values ?? []) {
        if (field.field_code === "PHONE" && field.values[0]?.value) {
          companyPhone = field.values[0].value
        } else {
          const parsed = parseCustomField(field)
          if (parsed) companyCustomFields.push(parsed)
        }
      }

      companyDetail = {
        name: companyRaw.name,
        phone: companyPhone,
        customFields: companyCustomFields,
      }
    } catch {
      console.warn(`[AmoCRM] Could not fetch company ${companyId}`)
    }
  }

  // Fetch notes
  const notes: AmoLeadDetail["notes"] = []
  try {
    const notesData = await fetchFromAmo<{
      _embedded: { notes: AmoNoteRaw[] }
    }>(`/leads/${leadId}/notes?limit=5&order=desc`)

    for (const note of notesData._embedded.notes) {
      const text =
        note.params?.text ?? note.text ?? ""
      if (!text) continue
      notes.push({
        text,
        author: userMap.get(note.created_by) ?? "Noma'lum",
        createdAt: new Date(note.created_at * 1000).toLocaleDateString(
          "uz-UZ",
          { day: "2-digit", month: "short", year: "numeric" }
        ),
      })
    }
  } catch {
    console.warn("[AmoCRM] Could not fetch notes for lead", leadId)
  }

  // Fetch tasks
  const tasks: AmoLeadDetail["tasks"] = []
  try {
    const tasksData = await fetchFromAmo<{
      _embedded: { tasks: AmoTaskRaw[] }
    }>(`/tasks?filter[entity_id]=${leadId}&filter[entity_type]=leads&limit=5`)

    for (const task of tasksData._embedded.tasks) {
      tasks.push({
        text: task.text,
        dueDate: new Date(task.complete_till * 1000).toISOString(),
        isCompleted: task.is_completed,
      })
    }
  } catch {
    console.warn("[AmoCRM] Could not fetch tasks for lead", leadId)
  }

  return {
    id: lead.id,
    name: lead.name,
    price: lead.price,
    pipelineId: lead.pipeline_id,
    statusId: lead.status_id,
    responsibleName:
      userMap.get(lead.responsible_user_id) ?? "Noma'lum",
    createdAt: new Date(lead.created_at * 1000).toLocaleDateString("uz-UZ", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    updatedAt: new Date(lead.updated_at * 1000).toLocaleDateString("uz-UZ", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    contacts,
    company: companyDetail,
    customFields,
    notes,
    tasks,
  }
}

/** Check if lead name is generic (e.g. "Сделка #123", "Lead from Facebook", "Facebook №...") */
function isGenericName(name: string): boolean {
  return (
    /^Сделка\s*#?\d*/i.test(name) ||
    /^Lead from /i.test(name) ||
    /^Facebook\s*[№#]/i.test(name) ||
    /^\d{10,}$/.test(name)
  )
}

/** Batch-fetch contacts by IDs with pagination, returns map of contactId → detail */
async function batchFetchContacts(
  contactIds: number[]
): Promise<Map<number, AmoContactDetail>> {
  if (contactIds.length === 0) return new Map()

  const map = new Map<number, AmoContactDetail>()

  // Split into chunks of 250 (AmoCRM limit per request)
  const chunks: number[][] = []
  for (let i = 0; i < contactIds.length; i += 250) {
    chunks.push(contactIds.slice(i, i + 250))
  }

  for (const chunk of chunks) {
    try {
      const filterParams = chunk.map((id) => `filter[id][]=${id}`).join("&")
      let page = 1

      while (true) {
        const data = await fetchFromAmo<AmoResponse<{ contacts: AmoContactDetail[] }>>(
          `/contacts?${filterParams}&limit=250&page=${page}`
        )

        if (!data?._embedded?.contacts?.length) break

        for (const contact of data._embedded.contacts) {
          map.set(contact.id, contact)
        }

        if (data._embedded.contacts.length < 250) break
        page++
      }
    } catch (err) {
      console.warn("[AmoCRM] Batch contact fetch error:", err)
    }
  }

  console.log(`[AmoCRM] Fetched ${map.size} contacts total`)
  return map
}

/** Extract phone from contact's custom_fields_values */
function extractPhone(contact: AmoContactDetail): string | undefined {
  for (const field of contact.custom_fields_values ?? []) {
    if (field.field_code === "PHONE" && field.values[0]) {
      return field.values[0].value
    }
  }
  return undefined
}

/** Extract email from contact's custom_fields_values */
function extractEmail(contact: AmoContactDetail): string | undefined {
  for (const field of contact.custom_fields_values ?? []) {
    if (field.field_code === "EMAIL" && field.values[0]) {
      return field.values[0].value
    }
  }
  return undefined
}

/** Fetch ALL leads with pagination (250 per page) */
async function fetchAllLeads(pipelineId?: number): Promise<AmoLead[]> {
  const allLeads: AmoLead[] = []
  let page = 1
  const limit = 250

  while (true) {
    try {
      let endpoint = `/leads?with=contacts,companies&limit=${limit}&page=${page}&order[updated_at]=desc`
      if (pipelineId) {
        endpoint += `&filter[pipeline_id][]=${pipelineId}`
      }

      const data = await fetchFromAmo<AmoResponse<{ leads: AmoLead[] }>>(endpoint)

      if (!data?._embedded?.leads?.length) break

      allLeads.push(...data._embedded.leads)
      console.log(`[AmoCRM] Page ${page}: fetched ${data._embedded.leads.length} leads`)

      if (data._embedded.leads.length < limit) break
      page++
    } catch (err) {
      // AmoCRM returns 204 No Content on empty pages — stop pagination
      if (page === 1) throw err // Re-throw if first page fails
      console.log(`[AmoCRM] Pagination stopped at page ${page}:`, err)
      break
    }
  }

  console.log(`[AmoCRM] Total leads fetched: ${allLeads.length}`)
  return allLeads
}

export async function getAmoLeads(pipelineId?: number): Promise<Lead[]> {
  console.log("[AmoCRM] getAmoLeads started, pipelineId:", pipelineId)
  const userMap = await getUserMap()
  console.log("[AmoCRM] User map loaded, size:", userMap.size)

  const allAmoLeads = await fetchAllLeads(pipelineId)
  console.log("[AmoCRM] All leads fetched:", allAmoLeads.length)

  // Collect all unique contact IDs for batch fetching
  const allContactIds = new Set<number>()
  for (const amoLead of allAmoLeads) {
    const contacts = amoLead._embedded?.contacts ?? []
    for (const c of contacts) {
      allContactIds.add(c.id)
    }
  }

  // Batch fetch all contacts at once
  const contactMap = await batchFetchContacts(Array.from(allContactIds))

  return allAmoLeads.map((amoLead) => {
    const responsibleName =
      userMap.get(amoLead.responsible_user_id) ?? "Noma'lum"

    const companyName =
      amoLead._embedded?.companies?.[0]?.name ?? null

    // Get main contact (first one)
    const mainContactRef = amoLead._embedded?.contacts?.[0]
    const mainContact = mainContactRef
      ? contactMap.get(mainContactRef.id)
      : undefined

    // Determine display name: contactName > lead.name > "Lid #ID"
    const contactName = mainContact?.name ?? undefined
    let displayName: string
    if (contactName) {
      displayName = contactName
    } else if (isGenericName(amoLead.name)) {
      displayName = `Lid #${amoLead.id}`
    } else {
      displayName = amoLead.name
    }

    // Extract phone/email from main contact
    const phone = mainContact ? extractPhone(mainContact) : undefined
    const email = mainContact ? extractEmail(mainContact) : undefined

    return {
      id: String(amoLead.id),
      name: displayName,
      company: companyName,
      stage: String(amoLead.status_id),
      responsible: {
        name: responsibleName,
        initials: getInitials(responsibleName),
        color: getColorForUser(amoLead.responsible_user_id),
      },
      amount: amoLead.price,
      lastCall: {
        time: "",
        type: "none" as CallType,
      },
      source: "amocrm" as LeadSource,
      createdAt: new Date(amoLead.created_at * 1000).toISOString(),
      amoId: String(amoLead.id),
      phone,
      email,
      contactName: mainContact?.name,
    }
  })
}
