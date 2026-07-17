import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

type UserRole = "admin" | "manager" | "xodim"

const VALID_MODULES = new Set([
  "dashboard",
  "sotuv-crmn",
  "mijozlar",
  "tadbirlar",
  "sozlamalar",
])

interface CreateUserRequest {
  email: string
  password: string
  full_name: string
  role: UserRole
  modules: string[]
  phone?: string
  department?: string
  position?: string
  hire_date?: string
  birth_date?: string
  address?: string
  bio?: string
  telegram?: string
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
      console.error("[admin-create-user] Missing required env vars")
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
      return jsonResponse({ error: "Faqat admin foydalanuvchi yarata oladi" }, 403)
    }

    // ── STEP 4: parse and validate body ──────────────────
    let body: CreateUserRequest
    try {
      body = await req.json() as CreateUserRequest
    } catch {
      return jsonResponse({ error: "Yaroqsiz JSON" }, 400)
    }

    if (!body.email || !body.password || !body.full_name) {
      return jsonResponse({ error: "Majburiy maydonlar to'ldirilmagan" }, 400)
    }

    if (typeof body.password !== "string" || body.password.length < 6) {
      return jsonResponse({ error: "Parol kamida 6 ta belgi bo'lishi kerak" }, 400)
    }

    if (!["admin", "manager", "xodim"].includes(body.role)) {
      return jsonResponse({ error: "Yaroqsiz rol" }, 400)
    }

    const requestedModules = Array.isArray(body.modules) ? body.modules : []
    const invalidModule = requestedModules.find((m) => !VALID_MODULES.has(m))
    if (invalidModule) {
      return jsonResponse({ error: `Yaroqsiz modul: ${invalidModule}` }, 400)
    }

    // ── STEP 5: create the auth user ─────────────────────
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: {
        full_name: body.full_name,
        role: body.role,
      },
    })

    if (createError || !created.user) {
      return jsonResponse(
        { error: createError?.message || "Foydalanuvchi yaratilmadi" },
        400,
      )
    }

    const newUserId = created.user.id

    // ── STEP 6: ensure profile reflects role + name + extended fields ──
    // (the auth.users trigger creates the profile from raw_user_meta_data,
    // but we sync explicitly in case the trigger drift or metadata format change)
    const profileUpdate: Record<string, string | null> = {
      role: body.role,
      full_name: body.full_name,
    }
    const extendedFields = [
      "phone",
      "department",
      "position",
      "hire_date",
      "birth_date",
      "address",
      "bio",
      "telegram",
    ] as const
    for (const f of extendedFields) {
      if (body[f] !== undefined) {
        profileUpdate[f] = body[f] ?? null
      }
    }

    const { error: profileUpdateError } = await supabaseAdmin
      .from("profiles")
      .update(profileUpdate)
      .eq("id", newUserId)

    if (profileUpdateError) {
      console.error("[admin-create-user] profile update error:", profileUpdateError)
    }

    // ── STEP 7: insert permissions ───────────────────────
    if (requestedModules.length > 0) {
      const permissions = requestedModules.map((module) => ({
        user_id: newUserId,
        module,
        can_view: true,
        can_edit: body.role === "manager",
        can_delete: false,
      }))

      const { error: permError } = await supabaseAdmin
        .from("user_permissions")
        .insert(permissions)

      if (permError) {
        // User created OK; surfaces as warning rather than hard failure.
        console.error("[admin-create-user] permissions insert error:", permError)
      }
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
    console.error("[admin-create-user] Error:", error)
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Server xatosi" },
      500,
    )
  }
})
