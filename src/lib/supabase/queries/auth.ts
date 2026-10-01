import { supabase } from "../client"
import type { Database } from "../types"
import type { Department } from "@/lib/constants/employee"

export type UserRole = "admin" | "manager" | "xodim"

export type ModuleName =
  | "dashboard"
  | "sotuv-crmn"
  | "mijozlar"
  | "tadbirlar"
  | "tadbirlar-moliya"
  | "sozlamalar"
  | "integratsiyalar"

/** Modules an admin can grant. "sozlamalar" (Profilim is open to everyone) stays a
 *  valid id in the DB but isn't offered. "sotuv-crmn" is Sotuv bo'limi (the id is historical). */
export const MODULES: { id: ModuleName; label: string; desc: string }[] = [
  { id: "dashboard",        label: "Dashboard",  desc: "AmoCRM sotuv analitikasi" },
  { id: "mijozlar",         label: "Mijozlar",   desc: "Mijozlar bazasi" },
  { id: "sotuv-crmn",       label: "Sotuv bo'limi", desc: "Voronkalar, bitimlar, sotuv vazifalari" },
  { id: "tadbirlar",        label: "Tadbirlar",  desc: "Tadbirlar va ishtirokchilar" },
  { id: "tadbirlar-moliya", label: "Moliya",     desc: "To'lovlar, qarzdorlar, xarajatlar" },
  { id: "integratsiyalar",  label: "Integratsiyalar", desc: "Telegram guruhlar: bot qaysi guruhda nima qiladi" },
]

/** The only module whose UI distinguishes view from edit (canEdit) */
export const EDITABLE_MODULE: ModuleName = "tadbirlar-moliya"

/** What an admin grants: module → can_edit */
export type ModuleGrants = Partial<Record<ModuleName, boolean>>

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrator",
  manager: "Menejer",
  xodim: "Xodim",
}

export interface UserProfile {
  id: string
  full_name: string
  email: string
  phone: string | null
  avatar_url: string | null
  role: UserRole
  is_active: boolean
  department: Department | null
  position: string | null
  hire_date: string | null
  birth_date: string | null
  address: string | null
  bio: string | null
  telegram: string | null
  emergency_contact: string | null
  notes: string | null
  /** account made with a temporary password — ask for a new one (migration 056) */
  must_change_password: boolean
  /** OnlinePBX internal number (074) — admin sets it in Integratsiyalar → Telefoniya */
  pbx_ext: string | null
  created_at: string
}

const PROFILE_COLUMNS =
  "id, full_name, email, phone, avatar_url, role, is_active, department, position, hire_date, birth_date, address, bio, telegram, emergency_contact, notes, must_change_password, pbx_ext, created_at"

interface ProfileRow {
  id: string
  full_name: string
  email: string
  phone: string | null
  avatar_url: string | null
  role: string | null
  is_active: boolean | null
  department: Department | null
  position: string | null
  hire_date: string | null
  birth_date: string | null
  address: string | null
  bio: string | null
  telegram: string | null
  emergency_contact: string | null
  notes: string | null
  must_change_password: boolean | null
  pbx_ext?: string | null   // ponytail: not in types.ts until gen:types picks up 074 (hence the casts below)
  created_at: string | null
}

function mapProfileRow(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    avatar_url: row.avatar_url,
    role: (row.role as UserRole) ?? "xodim",
    is_active: row.is_active ?? true,
    department: row.department,
    position: row.position,
    hire_date: row.hire_date,
    birth_date: row.birth_date,
    address: row.address,
    bio: row.bio,
    telegram: row.telegram,
    emergency_contact: row.emergency_contact,
    notes: row.notes,
    must_change_password: row.must_change_password ?? false,
    pbx_ext: row.pbx_ext ?? null,
    created_at: row.created_at ?? new Date().toISOString(),
  }
}

export interface UserPermission {
  module: ModuleName
  can_view: boolean
  can_edit: boolean
  can_delete: boolean
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  // A deactivated account has valid credentials but must not get in
  const { data: profile } = await supabase.from("profiles").select("is_active").eq("id", data.user.id).maybeSingle()
  if (profile && profile.is_active === false) {
    await supabase.auth.signOut()
    throw new Error("Hisobingiz faolsizlantirilgan. Administratorga murojaat qiling")
  }
  return data
}

export async function signOut() {
  await supabase.auth.signOut()
}

export async function getCurrentProfile(): Promise<UserProfile | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .single()

  if (error || !data) return null
  return mapProfileRow(data as unknown as ProfileRow)
}

export async function getCurrentPermissions(): Promise<UserPermission[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from("user_permissions")
    .select("module, can_view, can_edit, can_delete")
    .eq("user_id", user.id)

  return (data ?? []).map((row) => ({
    module: row.module as ModuleName,
    can_view: row.can_view ?? false,
    can_edit: row.can_edit ?? false,
    can_delete: row.can_delete ?? false,
  }))
}

// ─── Admin functions ─────────────────────────────────────

export async function getAllUsers(): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => mapProfileRow(row as unknown as ProfileRow))
}

export async function getUserById(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .single()
  if (error || !data) return null
  return mapProfileRow(data as unknown as ProfileRow)
}

// ─── User stats ──────────────────────────────────────────

export interface UserStats {
  leads_handled: number
  events_organized: number
  clients_added: number
}

export async function getUserStats(userId: string): Promise<UserStats> {
  // crm_leads.responsible_user_id is the staff profile id directly — it used to
  // hop through amocrm_users by email, which never resolved (those emails were
  // always empty), so this counter always read 0.
  const { count, error } = await supabase
    .from("crm_leads")
    .select("id", { count: "exact", head: true })
    .eq("responsible_user_id", userId)

  if (error) throw error

  return {
    leads_handled: count ?? 0,
    events_organized: 0,
    clients_added: 0,
  }
}

// ─── Profile updates (admin-side, any user) ──────────────

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"]

export async function updateUserProfile(
  userId: string,
  data: Partial<UserProfile>,
): Promise<void> {
  const updateData: ProfileUpdate = { updated_at: new Date().toISOString() }

  // full_name is NOT NULL in DB; only assign when caller provides a string
  if (typeof data.full_name === "string") updateData.full_name = data.full_name

  // Nullable fields — caller may pass null to clear, undefined to leave alone
  if ("phone" in data) updateData.phone = data.phone ?? null
  if ("department" in data) updateData.department = data.department ?? null
  if ("position" in data) updateData.position = data.position ?? null
  if ("hire_date" in data) updateData.hire_date = data.hire_date ?? null
  if ("birth_date" in data) updateData.birth_date = data.birth_date ?? null
  if ("address" in data) updateData.address = data.address ?? null
  if ("bio" in data) updateData.bio = data.bio ?? null
  if ("telegram" in data) updateData.telegram = data.telegram ?? null
  if ("emergency_contact" in data) updateData.emergency_contact = data.emergency_contact ?? null
  if ("notes" in data) updateData.notes = data.notes ?? null

  const { error } = await supabase
    .from("profiles")
    .update(updateData)
    .eq("id", userId)
  if (error) throw error
}

/**
 * Create a new user via the `admin-create-user` Edge Function.
 * The function uses the service_role key on the server; the browser only
 * forwards the caller's JWT and the new user's details. Admin role is
 * re-verified inside the function.
 */
export async function createUser(input: {
  email: string
  password: string
  full_name: string
  role: UserRole
  modules: ModuleName[]
  /** subset of modules with can_edit */
  edit_modules: ModuleName[]
  phone?: string
  department?: Department
  position?: string
  hire_date?: string
  birth_date?: string
  address?: string
  bio?: string
  telegram?: string
}): Promise<{ user_id: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error("Tizimga kirilmagan")

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const functionUrl = `${supabaseUrl}/functions/v1/admin-create-user`

  let response: Response
  try {
    response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(input),
    })
  } catch (err) {
    throw new Error(
      err instanceof Error
        ? `Edge Function'ga ulanishda xatolik: ${err.message}`
        : "Edge Function'ga ulanishda xatolik",
    )
  }

  let payload: { ok?: boolean; user_id?: string; error?: string } = {}
  try {
    payload = await response.json() as { ok?: boolean; user_id?: string; error?: string }
  } catch {
    /* non-JSON response */
  }

  if (!response.ok) {
    throw new Error(payload.error ?? `Xatolik (HTTP ${response.status})`)
  }

  if (!payload.user_id) {
    throw new Error("Edge Function user_id qaytarmadi")
  }

  return { user_id: payload.user_id }
}

// ─── Avatar (profile-avatars bucket) ─────────────────────

export async function uploadUserAvatar(blob: Blob, userId: string): Promise<string> {
  const fileName = `${userId}_${Date.now()}.jpg`
  const file = new File([blob], fileName, { type: "image/jpeg" })

  const { error } = await supabase.storage
    .from("profile-avatars")
    .upload(fileName, file, { upsert: true, contentType: "image/jpeg" })
  if (error) throw error

  const { data } = supabase.storage
    .from("profile-avatars")
    .getPublicUrl(fileName)
  return data.publicUrl
}

export async function updateUserAvatar(userId: string, url: string): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: url, updated_at: new Date().toISOString() })
    .eq("id", userId)
  if (error) throw error
}

export async function deleteUserAvatar(
  userId: string,
  currentUrl: string | null,
): Promise<void> {
  // Try removing the underlying object (best-effort; ignore failures)
  if (currentUrl) {
    const fileName = currentUrl.split("/").pop()?.split("?")[0]
    if (fileName) {
      await supabase.storage.from("profile-avatars").remove([fileName]).catch(() => {})
    }
  }
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: null, updated_at: new Date().toISOString() })
    .eq("id", userId)
  if (error) throw error
}

export async function updateUserPermissions(
  userId: string,
  grants: ModuleGrants,
): Promise<void> {
  const modules = Object.keys(grants) as ModuleName[]
  const { error: delErr } = await supabase
    .from("user_permissions")
    .delete()
    .eq("user_id", userId)
  if (delErr) throw delErr

  if (modules.length > 0) {
    const permissions = modules.map((module) => ({
      user_id: userId,
      module,
      can_view: true,
      can_edit: grants[module] === true,
      can_delete: false,
    }))
    const { error } = await supabase.from("user_permissions").insert(permissions)
    if (error) throw error
  }
}

export async function updateUserRole(userId: string, role: UserRole): Promise<void> {
  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId)
  if (error) throw error
}

export async function deactivateUser(userId: string): Promise<void> {
  const { error } = await supabase.from("profiles").update({ is_active: false }).eq("id", userId)
  if (error) throw error
}

/** Admin only (068): login + profile go; payments, sales, tasks keep their rows with "who" emptied */
export async function deleteUser(userId: string): Promise<void> {
  // ponytail: rpc not in the generated types yet — regenerate after 068
  const { error } = await (supabase.rpc as unknown as (fn: string, args: object) => Promise<{ error: Error | null }>)("admin_delete_user", { p_user: userId })
  if (error) throw error
}

export async function activateUser(userId: string): Promise<void> {
  const { error } = await supabase.from("profiles").update({ is_active: true }).eq("id", userId)
  if (error) throw error
}

export async function getUserPermissions(userId: string): Promise<UserPermission[]> {
  const { data, error } = await supabase
    .from("user_permissions")
    .select("module, can_view, can_edit, can_delete")
    .eq("user_id", userId)
  if (error) throw error
  return (data ?? []).map((row) => ({
    module: row.module as ModuleName,
    can_view: row.can_view ?? false,
    can_edit: row.can_edit ?? false,
    can_delete: row.can_delete ?? false,
  }))
}

// ─── Profile self-update ─────────────────────────────────

export async function updateMyProfile(updates: {
  full_name?: string
  phone?: string | null
  avatar_url?: string | null
  telegram?: string | null   // for task reminder @mentions (066)
  must_change_password?: false
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Tizimga kirilmagan")
  const { error } = await supabase
    .from("profiles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", user.id)
  if (error) throw error
}

/** Changes the signed-in user's password and clears the first-login reminder */
export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
  await updateMyProfile({ must_change_password: false })
}

export async function uploadAvatar(file: Blob, userId: string): Promise<string> {
  const path = `avatars/${userId}.jpg`
  const { error } = await supabase.storage
    .from("client-images")
    .upload(path, file, { upsert: true, contentType: "image/jpeg" })
  if (error) throw error
  const { data } = supabase.storage.from("client-images").getPublicUrl(path)
  return `${data.publicUrl}?t=${Date.now()}`
}
