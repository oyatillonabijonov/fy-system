import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// ── Environment variables ──
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const AMO_SUBDOMAIN = Deno.env.get("VITE_AMO_SUBDOMAIN") ?? "fikryetakchilari"
const AMO_TOKEN = Deno.env.get("VITE_AMO_ACCESS_TOKEN")!
const AMO_CLIENT_ID = Deno.env.get("VITE_AMO_CLIENT_ID") ?? ""
const AMO_CLIENT_SECRET = Deno.env.get("VITE_AMO_CLIENT_SECRET") ?? ""

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const AMO_BASE = `https://${AMO_SUBDOMAIN}.amocrm.ru/api/v4`

// ── Interfaces ──
interface TokenRow {
  id: number
  access_token: string
  refresh_token: string | null
  expires_at: string
}

interface AmoLead {
  id: number
  name: string
  price: number
  pipeline_id: number
  status_id: number
  responsible_user_id: number
  created_at: number
  updated_at: number
  custom_fields_values?: { field_id: number; field_name: string; values: { value: string }[] }[]
  _embedded?: {
    contacts?: { id: number; name: string }[]
    companies?: { id: number; name: string }[]
    tags?: { id: number; name: string }[]
  }
}

interface AmoContact {
  id: number
  name: string
  custom_fields_values?: { field_code: string | null; values: { value: string }[] }[]
}

interface AmoPipeline {
  id: number
  name: string
  _embedded: {
    statuses: { id: number; name: string; color: string; sort: number }[]
  }
}

interface AmoUser {
  id: number
  name: string
}

// ── Token Management ──
async function getValidAmoToken(): Promise<string> {
  const { data } = await supabase
    .from("amocrm_tokens")
    .select("*")
    .eq("id", 1)
    .single()

  if (data) {
    const row = data as unknown as TokenRow
    const expiresAt = new Date(row.expires_at).getTime()
    const bufferMs = 5 * 60 * 1000

    // Token hali yaroqli
    if (Date.now() < expiresAt - bufferMs) {
      return row.access_token
    }

    // Refresh token mavjud — yangilaymiz
    if (row.refresh_token) {
      console.log("[Sync] Token refresh qilinmoqda...")
      const res = await fetch(
        `https://${AMO_SUBDOMAIN}.amocrm.ru/oauth2/access_token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: AMO_CLIENT_ID,
            client_secret: AMO_CLIENT_SECRET,
            grant_type: "refresh_token",
            refresh_token: row.refresh_token,
            redirect_uri: `https://${AMO_SUBDOMAIN}.amocrm.ru`,
          }),
        }
      )

      if (res.ok) {
        const body = await res.json()
        const newExpiresAt = new Date(
          Date.now() + body.expires_in * 1000
        ).toISOString()

        await supabase
          .from("amocrm_tokens")
          .update({
            access_token: body.access_token,
            refresh_token: body.refresh_token,
            expires_at: newExpiresAt,
          })
          .eq("id", 1)

        console.log("[Sync] Token muvaffaqiyatli yangilandi")
        return body.access_token
      }

      console.error("[Sync] Token refresh xatolik:", res.status)
    }

    // Refresh yo'q yoki xatolik — mavjud tokenni qaytaramiz
    return row.access_token
  }

  // Supabase bo'sh — env var dan
  console.warn("[Sync] Supabase da token topilmadi, env var dan olinmoqda")
  return AMO_TOKEN
}

// ── AmoCRM API helpers ──
async function amoFetch<T>(token: string, endpoint: string): Promise<T> {
  const res = await fetch(`${AMO_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  })

  if (res.status === 204) {
    return {} as T
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`[AmoCRM] ${res.status}: ${text}`)
  }

  return res.json() as Promise<T>
}

// ── Fetch All Leads (paginated) ──
async function fetchAmoLeads(
  token: string
): Promise<AmoLead[]> {
  const allLeads: AmoLead[] = []
  let page = 1

  while (true) {
    try {
      const data = await amoFetch<{
        _embedded?: { leads?: AmoLead[] }
      }>(token, `/leads?with=contacts,companies&order[updated_at]=desc&order[id]=desc&limit=250&page=${page}`)

      const batch = data?._embedded?.leads
      if (!batch?.length) break

      allLeads.push(...batch)
      console.log(`[Sync] Leads page ${page}: ${batch.length} ta`)

      if (batch.length < 250) break
      page++
    } catch (err) {
      if (page === 1) throw err
      console.log(`[Sync] Leads pagination to'xtadi page ${page}:`, err)
      break
    }
  }

  return allLeads
}

// ── Batch Fetch Contacts ──
async function batchFetchContacts(
  token: string,
  contactIds: number[]
): Promise<Map<number, AmoContact>> {
  const map = new Map<number, AmoContact>()
  if (contactIds.length === 0) return map

  // 250 tadan chunks
  const chunks: number[][] = []
  for (let i = 0; i < contactIds.length; i += 250) {
    chunks.push(contactIds.slice(i, i + 250))
  }

  for (const chunk of chunks) {
    try {
      const filterParams = chunk.map((id) => `filter[id][]=${id}`).join("&")
      let page = 1

      while (true) {
        const data = await amoFetch<{
          _embedded?: { contacts?: AmoContact[] }
        }>(token, `/contacts?${filterParams}&limit=250&page=${page}`)

        const contacts = data?._embedded?.contacts
        if (!contacts?.length) break

        for (const contact of contacts) {
          map.set(contact.id, contact)
        }

        if (contacts.length < 250) break
        page++
      }
    } catch (err) {
      console.warn("[Sync] Batch contact fetch xatolik:", err)
    }
  }

  return map
}

// ── Fetch Users ──
async function fetchAmoUsers(
  token: string
): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  let page = 1

  while (true) {
    try {
      const data = await amoFetch<{
        _embedded?: { users?: AmoUser[] }
      }>(token, `/users?limit=250&page=${page}`)

      const users = data?._embedded?.users
      if (!users?.length) break

      for (const user of users) {
        map.set(user.id, user.name)
      }

      if (users.length < 250) break
      page++
    } catch (err) {
      console.warn("[Sync] Users fetch xatolik:", err)
      break
    }
  }

  console.log(`[Sync] ${map.size} ta user olindi`)
  return map
}

// ── Fetch Pipelines ──
async function fetchAmoPipelines(
  token: string
): Promise<AmoPipeline[]> {
  const data = await amoFetch<{
    _embedded?: { pipelines?: AmoPipeline[] }
  }>(token, "/leads/pipelines")

  return data?._embedded?.pipelines ?? []
}

// ── Extract phone from contact ──
function extractPhone(contact: AmoContact): string | null {
  for (const field of contact.custom_fields_values ?? []) {
    if (field.field_code === "PHONE" && field.values[0]?.value) {
      return field.values[0].value
    }
  }
  return null
}

// ── Sync to Supabase ──
async function syncToSupabase(
  leads: AmoLead[],
  pipelines: AmoPipeline[],
  contactMap: Map<number, AmoContact>,
  usersMap: Map<number, string>
): Promise<void> {
  // 1. Pipelines upsert
  const pipelineRows = pipelines.map((p) => ({
    id: p.id,
    name: p.name,
    statuses: p._embedded.statuses,
    synced_at: new Date().toISOString(),
  }))

  if (pipelineRows.length > 0) {
    const { error: pErr } = await supabase
      .from("amocrm_pipelines")
      .upsert(pipelineRows, { onConflict: "id" })

    if (pErr) console.error("[Sync] Pipelines upsert xatolik:", pErr.message)
  }

  // 2. Leads upsert (250 tadan batch)
  const leadRows = leads.map((lead) => {
    const mainContactId = lead._embedded?.contacts?.[0]?.id
    const contact = mainContactId ? contactMap.get(mainContactId) : undefined

    return {
      id: lead.id,
      pipeline_id: lead.pipeline_id,
      status_id: lead.status_id,
      name: lead.name,
      price: lead.price,
      responsible_user_id: lead.responsible_user_id,
      responsible_user_name: usersMap.get(lead.responsible_user_id) ?? null,
      created_at: lead.created_at,
      updated_at: lead.updated_at,
      contact_name: contact?.name ?? null,
      contact_phone: contact ? extractPhone(contact) : null,
      company_name: lead._embedded?.companies?.[0]?.name ?? null,
      tags: lead._embedded?.tags ?? [],
      custom_fields: lead.custom_fields_values ?? [],
      raw: lead,
      synced_at: new Date().toISOString(),
    }
  })

  // Batch upsert 250 tadan
  for (let i = 0; i < leadRows.length; i += 250) {
    const batch = leadRows.slice(i, i + 250)
    const { error: lErr } = await supabase
      .from("amocrm_leads")
      .upsert(batch, { onConflict: "id" })

    if (lErr) console.error(`[Sync] Leads upsert batch ${i / 250 + 1} xatolik:`, lErr.message)
  }

  // 3. Sync log
  const { error: logErr } = await supabase.from("amocrm_sync_log").insert({
    leads_count: leads.length,
    pipelines_count: pipelines.length,
  })

  if (logErr) console.error("[Sync] Log yozishda xatolik:", logErr.message)

  // 4. Users upsert
  const userRows = Array.from(usersMap.entries()).map(([id, name]) => ({
    id,
    name,
    synced_at: new Date().toISOString(),
  }))

  if (userRows.length > 0) {
    const { error: uErr } = await supabase
      .from("amocrm_users")
      .upsert(userRows, { onConflict: "id" })

    if (uErr) console.error("[Sync] Users upsert xatolik:", uErr.message)
  }

  console.log(
    `[Sync] Muvaffaqiyat: ${leads.length} lid, ${pipelines.length} pipeline, ${userRows.length} user sinxronlandi`
  )
}

// ── Main Handler ──
Deno.serve(async () => {
  const startTime = Date.now()

  try {
    const token = await getValidAmoToken()

    const [leads, pipelines, usersMap] = await Promise.all([
      fetchAmoLeads(token),
      fetchAmoPipelines(token),
      fetchAmoUsers(token),
    ])

    // Barcha kontakt ID larni yig'ib, batch fetch qilamiz
    const contactIds = new Set<number>()
    for (const lead of leads) {
      for (const c of lead._embedded?.contacts ?? []) {
        contactIds.add(c.id)
      }
    }
    const contactMap = await batchFetchContacts(token, Array.from(contactIds))

    await syncToSupabase(leads, pipelines, contactMap, usersMap)

    const duration = Date.now() - startTime
    return new Response(
      JSON.stringify({
        ok: true,
        leads: leads.length,
        pipelines: pipelines.length,
        contacts: contactMap.size,
        users: usersMap.size,
        duration_ms: duration,
      }),
      { headers: { "Content-Type": "application/json" } }
    )
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error("[Sync] Xatolik:", errMsg)

    // Xatolikni log ga yozamiz
    await supabase.from("amocrm_sync_log").insert({
      leads_count: 0,
      pipelines_count: 0,
      error: errMsg,
    })

    return new Response(
      JSON.stringify({ ok: false, error: errMsg }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
})
