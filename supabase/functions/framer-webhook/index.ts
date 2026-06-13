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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const respond = (data: object) =>
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    // Parse body — Framer sends JSON
    const body = await req.json()
    console.log("[Framer] Raw body:", JSON.stringify(body))

    // STEP 1: Save raw to webhook_logs immediately
    const { data: log } = await supabase
      .from("webhook_logs")
      .insert({
        source: "framer",
        raw_body: body,
        processed: false,
      })
      .select("id")
      .single()

    // STEP 2: Extract fields (exact Framer field names)
    const name: string = body.Name || body.name || "Noma'lum"
    const phone: string = body.Phone || body.phone || ""
    const role: string = body.Role || body.role || ""
    const industry: string = body.Industry || body.industry || ""
    const revenue: string = body.Revenue || body.revenue || ""
    const goal: string = body.Goal || body.goal || ""

    // Build notes from extra fields
    const notes = [
      role ? `Lavozim: ${role}` : "",
      industry ? `Soha: ${industry}` : "",
      revenue ? `Yillik aylanma: ${revenue}` : "",
      goal ? `Maqsad: ${goal}` : "",
    ]
      .filter(Boolean)
      .join("\n")

    const leadName = `${name} — Bootcamp`

    // STEP 3: Create contact
    const { data: contact, error: contactError } = await supabase
      .from("crm_contacts")
      .insert({
        name,
        phone: normalizePhone(phone),
        notes: notes || null,
      })
      .select("id")
      .single()

    if (contactError) throw contactError
    console.log("[Framer] Kontakt yaratildi:", contact.id)

    // STEP 4: Create lead
    const { data: lead, error: leadError } = await supabase
      .from("crm_leads")
      .insert({
        name: leadName,
        pipeline_id: Deno.env.get("CRM_DEFAULT_PIPELINE_ID")!,
        stage_id: Deno.env.get("CRM_DEFAULT_STAGE_ID")!,
        contact_id: contact.id,
        source: "framer",
        tags: [
          { name: "Bootcamp" },
          role ? { name: role } : null,
          industry ? { name: industry } : null,
        ].filter(Boolean),
      })
      .select("id")
      .single()

    if (leadError) throw leadError
    console.log(
      `[Framer] Lead saqlandi: ${lead.id} | ${name} | ${phone} | ${role} | ${industry}`
    )

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
    console.error("[Framer] Xatolik:", msg)
    return respond({ ok: false, error: "Internal error, data logged" })
  }
})
