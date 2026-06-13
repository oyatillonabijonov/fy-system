import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

interface CreateMemberRequest {
  client_id: string
  email: string
  password: string
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

  try {
    // ── STEP 1: extract caller token ─────────────────────
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return jsonResponse({ error: "Avtorizatsiya tokeni topilmadi" }, 401)
    }
    const token = authHeader.replace(/^Bearer\s+/i, "")

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[admin-create-member] Missing required env vars")
      return jsonResponse({ error: "Server konfiguratsiyasi noto'g'ri" }, 500)
    }

    // ── STEP 2: verify caller token ──────────────────────
    const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: userData, error: userError } = await supabaseAnon.auth.getUser(token)
    if (userError || !userData.user) {
      return jsonResponse({ error: "Avtorizatsiya yaroqsiz" }, 401)
    }

    // ── STEP 3: verify caller is admin ───────────────────
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: callerProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single()

    if (profileError || !callerProfile || callerProfile.role !== "admin") {
      return jsonResponse({ error: "Faqat admin a'zo akkaunti yarata oladi" }, 403)
    }

    // ── STEP 4: parse and validate body ──────────────────
    let body: CreateMemberRequest
    try {
      body = await req.json() as CreateMemberRequest
    } catch {
      return jsonResponse({ error: "Yaroqsiz JSON" }, 400)
    }

    if (!body.client_id || !body.email || !body.password) {
      return jsonResponse({ error: "Majburiy maydonlar to'ldirilmagan" }, 400)
    }

    if (typeof body.password !== "string" || body.password.length < 6) {
      return jsonResponse({ error: "Parol kamida 6 ta belgi bo'lishi kerak" }, 400)
    }

    // ── STEP 5: validate the client row ──────────────────
    const { data: client, error: clientError } = await supabaseAdmin
      .from("clients")
      .select("id, full_name, auth_user_id")
      .eq("id", body.client_id)
      .single()

    if (clientError || !client) {
      return jsonResponse({ error: "Mijoz topilmadi" }, 404)
    }

    if (client.auth_user_id) {
      return jsonResponse({ error: "Bu mijozda akkaunt allaqachon mavjud" }, 400)
    }

    // ── STEP 6: create the auth user ─────────────────────
    // user_type: 'member' makes handle_new_user skip the profiles row,
    // which is what keeps members out of the staff dashboard.
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: {
        user_type: "member",
        full_name: client.full_name,
      },
    })

    if (createError || !created.user) {
      return jsonResponse(
        { error: createError?.message || "Akkaunt yaratilmadi" },
        400,
      )
    }

    const newUserId = created.user.id

    // ── STEP 7: link the client to the auth user ─────────
    const { error: linkError } = await supabaseAdmin
      .from("clients")
      .update({ auth_user_id: newUserId, email: body.email })
      .eq("id", body.client_id)

    if (linkError) {
      // Roll back: an unlinked member auth user is unreachable garbage.
      console.error("[admin-create-member] link error, rolling back:", linkError)
      await supabaseAdmin.auth.admin.deleteUser(newUserId)
      return jsonResponse({ error: "Mijozni akkauntga bog'lab bo'lmadi" }, 500)
    }

    return jsonResponse(
      {
        ok: true,
        user_id: newUserId,
        email: created.user.email,
      },
      200,
    )
  } catch (error) {
    console.error("[admin-create-member] Error:", error)
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Server xatosi" },
      500,
    )
  }
})
