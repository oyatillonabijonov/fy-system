import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// ── Environment variables ──
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const META_VERIFY_TOKEN = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") ?? ""
const META_PAGE_TOKEN = Deno.env.get("META_PAGE_ACCESS_TOKEN") ?? ""
const DEFAULT_PIPELINE_ID = Deno.env.get("CRM_DEFAULT_PIPELINE_ID") ?? ""
const DEFAULT_STAGE_ID = Deno.env.get("CRM_DEFAULT_STAGE_ID") ?? ""

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const GRAPH_API = "https://graph.facebook.com/v19.0"

// ── Types ──
interface MetaWebhookBody {
  object: string
  entry: {
    id: string
    changes: {
      value: {
        form_id?: string
        leadgen_id: string
        page_id: string
        ad_id?: string
        ad_name?: string
        adset_name?: string
        campaign_name?: string
      }
      field: string
    }[]
  }[]
}

interface MetaFieldData {
  name: string
  values: string[]
}

interface MetaLeadResponse {
  id: string
  field_data: MetaFieldData[]
}

interface WebsiteFormBody {
  name: string
  phone?: string
  message?: string
  source?: string
}

// ── Helpers ──
function getFieldValue(fields: MetaFieldData[], ...names: string[]): string {
  for (const name of names) {
    const field = fields.find(
      (f) => f.name.toLowerCase() === name.toLowerCase()
    )
    if (field?.values[0]) return field.values[0]
  }
  return ""
}

function parseName(fields: MetaFieldData[]): string {
  const fullName = getFieldValue(fields, "full_name", "Full Name", "nome_completo")
  if (fullName) return fullName

  const first = getFieldValue(fields, "first_name", "First Name")
  const last = getFieldValue(fields, "last_name", "Last Name")
  if (first || last) return `${first} ${last}`.trim()

  return "Noma'lum"
}

async function fetchMetaLead(leadgenId: string): Promise<MetaLeadResponse> {
  const url = `${GRAPH_API}/${leadgenId}?access_token=${META_PAGE_TOKEN}`
  console.log(`[Meta] Lead ma'lumotlari olinmoqda: ${leadgenId}`)

  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Meta Graph API xatolik ${res.status}: ${text}`)
  }

  return res.json() as Promise<MetaLeadResponse>
}

async function saveLeadToDb(
  name: string,
  phone: string,
  email: string,
  source: string,
  adName: string
): Promise<void> {
  // 1. Create contact
  const { data: contact, error: contactErr } = await supabase
    .from("crm_contacts")
    .insert({
      name,
      phone: phone || null,
      email: email || null,
    })
    .select("id")
    .single()

  if (contactErr) {
    console.error("[Meta] Kontakt yaratishda xatolik:", contactErr.message)
    throw contactErr
  }

  console.log(`[Meta] Kontakt yaratildi: ${contact.id}`)

  // 2. Create lead
  const { error: leadErr } = await supabase
    .from("crm_leads")
    .insert({
      name: `${name} — ${source === "website" ? "Sayt" : "Instagram/Facebook"}`,
      pipeline_id: DEFAULT_PIPELINE_ID,
      stage_id: DEFAULT_STAGE_ID,
      contact_id: contact.id,
      source,
      tags: [{ name: adName || (source === "website" ? "Sayt forma" : "Meta Ads") }],
    })

  if (leadErr) {
    console.error("[Meta] Lead yaratishda xatolik:", leadErr.message)
    throw leadErr
  }

  console.log(`[Meta] Lead saqlandi: ${name} (${source})`)
}

// ── Handle Meta webhook POST ──
async function handleMetaPost(body: MetaWebhookBody): Promise<void> {
  for (const entry of body.entry) {
    for (const change of entry.changes) {
      if (change.field !== "leadgen") continue

      const { leadgen_id, ad_name } = change.value
      console.log(`[Meta] Yangi lead: leadgen_id=${leadgen_id}`)

      try {
        // Fetch full lead data from Meta
        const metaLead = await fetchMetaLead(leadgen_id)
        const fields = metaLead.field_data

        const name = parseName(fields)
        const phone = getFieldValue(fields, "phone_number", "phone", "telefon")
        const email = getFieldValue(fields, "email", "e-mail")

        console.log(`[Meta] Parsed: name=${name}, phone=${phone}, email=${email}`)

        await saveLeadToDb(name, phone, email, "meta_ads", ad_name ?? "")
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[Meta] Lead ${leadgen_id} xatolik:`, msg)
        // Davom etamiz — boshqa leadlar ham bor bo'lishi mumkin
      }
    }
  }
}

// ── Handle website form POST ──
async function handleWebsitePost(body: WebsiteFormBody): Promise<void> {
  const name = body.name?.trim() || "Noma'lum"
  const phone = body.phone?.trim() || ""
  const source = body.source?.trim() || "website"

  console.log(`[Website] Yangi forma: name=${name}, phone=${phone}`)

  await saveLeadToDb(name, phone, "", source, "Sayt forma")

  console.log(`[Website] Lead saqlandi: ${name}`)
}

// ── Main Handler ──
Deno.serve(async (req) => {
  const url = new URL(req.url)

  // ── CORS headers ──
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Source",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  // ── GET: Meta webhook verification ──
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode")
    const token = url.searchParams.get("hub.verify_token")
    const challenge = url.searchParams.get("hub.challenge")

    console.log(`[Meta] Verification: mode=${mode}, token=${token}`)

    if (mode === "subscribe" && token === META_VERIFY_TOKEN) {
      console.log("[Meta] Webhook tasdiqlandi!")
      return new Response(challenge ?? "", {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      })
    }

    return new Response("Forbidden", {
      status: 403,
      headers: corsHeaders,
    })
  }

  // ── POST: New lead ──
  if (req.method === "POST") {
    try {
      const source = req.headers.get("X-Source")?.toLowerCase()

      if (source === "website") {
        // Website form
        const body = (await req.json()) as WebsiteFormBody
        await handleWebsitePost(body)
      } else {
        // Meta webhook
        const body = (await req.json()) as MetaWebhookBody

        if (body.object !== "page") {
          console.log(`[Meta] Noma'lum object: ${body.object}`)
          return new Response("OK", { status: 200, headers: corsHeaders })
        }

        await handleMetaPost(body)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[Webhook] POST xatolik:", msg)
      // Meta uchun doim 200 qaytaramiz
    }

    return new Response(
      JSON.stringify({ ok: true }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  }

  return new Response("Method not allowed", {
    status: 405,
    headers: corsHeaders,
  })
})
