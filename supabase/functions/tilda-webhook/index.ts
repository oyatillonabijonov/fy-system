import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

function normalizePhone(p: string): string | null {
  if (!p) return null
  const c = p.replace(/[^+\d]/g, "")
  if (/^\+998\d{9}$/.test(c)) return c
  if (/^998\d{9}$/.test(c)) return "+" + c
  if (/^\d{9}$/.test(c)) return "+998" + c
  return c || null
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

// Tilda field nomlarini topish (case-insensitive)
function findField(body: Record<string, string>, ...keys: string[]): string {
  // Avval aniq nomlarni tekshir
  for (const key of keys) {
    if (body[key]) return body[key]
  }
  // Keyin case-insensitive qidir
  const bodyLower = Object.fromEntries(
    Object.entries(body).map(([k, v]) => [k.toLowerCase(), v])
  )
  for (const key of keys) {
    if (bodyLower[key.toLowerCase()]) return bodyLower[key.toLowerCase()]
  }
  return ""
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const respond = (data: object) =>
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders })
  }

  try {
    // Parse body — Tilda sends JSON or form-urlencoded
    const contentType = req.headers.get("content-type") ?? ""
    let body: Record<string, string>

    if (contentType.includes("application/json")) {
      body = await req.json()
    } else {
      const text = await req.text()
      const params = new URLSearchParams(text)
      body = Object.fromEntries(params.entries())
    }

    console.log("[Tilda] Raw body:", JSON.stringify(body))

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    // STEP 1: Save raw to webhook_logs immediately
    const { data: log } = await supabase
      .from("webhook_logs")
      .insert({
        source: "tilda",
        raw_body: body,
        processed: false,
      })
      .select("id")
      .single()

    // STEP 2: Extract fields (Tilda field nomlari har xil bo'lishi mumkin)
    const name = findField(body,
      "name", "Name", "INPUTNAME", "Ism", "ism", "Ismingiz",
      "full_name", "firstname", "first_name"
    ) || "Noma'lum"

    const phone = findField(body,
      "phone", "Phone", "INPUTPHONE", "Telefon", "telefon",
      "phone_number", "tel", "Telefon raqamingiz"
    )

    const email = findField(body,
      "email", "Email", "INPUTEMAIL", "e-mail"
    )

    const soha = findField(body,
      "soha", "Soha", "company", "Company", "kompaniya",
      "Kompaniyangiz nomi va yo'nalishi?", "industry"
    )

    const message = findField(body,
      "message", "Message", "comment", "Xabar", "xabar"
    )

    // Build notes from extra fields
    const notes = [
      soha ? `Soha: ${soha}` : "",
      message ? `Izoh: ${message}` : "",
    ].filter(Boolean).join("\n")

    const leadName = `${name} — Sayt`

    // STEP 3: Create contact
    const { data: contact, error: contactError } = await supabase
      .from("crm_contacts")
      .insert({
        name,
        phone: normalizePhone(phone),
        email: email || null,
        company: soha || null,
        notes: notes || null,
      })
      .select("id")
      .single()

    if (contactError) throw contactError
    console.log("[Tilda] Kontakt yaratildi:", contact.id)

    // STEP 4: Create lead
    const { data: lead, error: leadError } = await supabase
      .from("crm_leads")
      .insert({
        name: leadName,
        pipeline_id: Deno.env.get("CRM_DEFAULT_PIPELINE_ID")!,
        stage_id: Deno.env.get("CRM_DEFAULT_STAGE_ID")!,
        contact_id: contact.id,
        source: "tilda",
        tags: [{ name: "Sayt" }],
      })
      .select("id")
      .single()

    if (leadError) throw leadError
    console.log(`[Tilda] Lead saqlandi: ${lead.id} | ${name} | ${phone}`)

    // STEP 5: Mark log as processed
    if (log) {
      await supabase
        .from("webhook_logs")
        .update({ processed: true, lead_id: lead.id })
        .eq("id", log.id)
    }

    return respond({ ok: true, lead_id: lead.id })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("[Tilda] Xatolik:", msg)
    return respond({ ok: false, error: "Internal error, data logged" })
  }
})
