import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

interface RegisterRequest {
  email: string
  password: string
  full_name: string
  phone: string
  company: string
  image_url?: string
}

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[member-self-register] Missing env vars")
    return jsonResponse({ error: "Server konfiguratsiyasi noto'g'ri" }, 500)
  }

  let body: RegisterRequest
  try {
    body = await req.json() as RegisterRequest
  } catch {
    return jsonResponse({ error: "Yaroqsiz JSON" }, 400)
  }

  const { email, password, full_name, phone, company, image_url } = body

  if (!email?.trim() || !password || !full_name?.trim() || !phone?.trim() || !company?.trim()) {
    return jsonResponse({ error: "Barcha majburiy maydonlarni to'ldiring" }, 400)
  }

  if (password.length < 6) {
    return jsonResponse({ error: "Parol kamida 6 ta belgi bo'lishi kerak" }, 400)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Check email is not already taken
  const { data: existing } = await supabase
    .from("clients")
    .select("id")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle()

  if (existing) {
    return jsonResponse({ error: "Bu email allaqachon ro'yxatdan o'tgan" }, 400)
  }

  // Create auth user with user_type: 'member' so handle_new_user skips profiles row
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: {
      user_type: "member",
      full_name: full_name.trim(),
    },
  })

  if (createError || !created.user) {
    const msg = createError?.message ?? ""
    if (msg.includes("already")) {
      return jsonResponse({ error: "Bu email allaqachon ro'yxatdan o'tgan" }, 400)
    }
    return jsonResponse({ error: msg || "Akkaunt yaratilmadi" }, 400)
  }

  const userId = created.user.id

  // Create clients row linked to the new auth user
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .insert({
      full_name: full_name.trim(),
      phone: phone.trim(),
      company: company.trim(),
      email: email.trim().toLowerCase(),
      image: image_url ?? null,
      auth_user_id: userId,
      community_approved: false,
    })
    .select("id")
    .single()

  if (clientError || !client) {
    // Roll back auth user to avoid orphaned accounts
    console.error("[member-self-register] client insert error, rolling back:", clientError)
    await supabase.auth.admin.deleteUser(userId)
    return jsonResponse({ error: "Profil yaratilmadi. Qaytadan urinib ko'ring." }, 500)
  }

  return jsonResponse({ ok: true, user_id: userId, client_id: client.id }, 200)
})
