import { supabase } from "../client"
import type { Database } from "../types"
import type { Department } from "@/lib/constants/employee"
import type { StatusVariant } from "@/lib/constants/theme"

export type UserRole = "admin" | "manager" | "xodim"

export type ModuleName =
  | "dashboard"
  | "sotuv-crmn"
  | "mijozlar"
  | "tadbirlar"
  | "pbx"
  | "sozlamalar"

export const MODULES: { id: ModuleName; label: string }[] = [
  { id: "dashboard",    label: "Dashboard" },
  { id: "sotuv-crmn",   label: "Sotuv (CRM-N)" },
  { id: "mijozlar",     label: "Mijozlar" },
  { id: "tadbirlar",    label: "Tadbirlar" },
  { id: "pbx",          label: "PBX" },
  { id: "sozlamalar",   label: "Sozlamalar" },
]

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrator",
  manager: "Menejer",
  xodim: "Xodim",
}

export const ROLE_BADGE_VARIANT: Record<UserRole, StatusVariant> = {
  admin:   'info',
  manager: 'neutral',
  xodim:   'neutral',
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
  created_at: string
}

const PROFILE_COLUMNS =
  "id, full_name, email, phone, avatar_url, role, is_active, department, position, hire_date, birth_date, address, bio, telegram, emergency_contact, notes, created_at"

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
  return mapProfileRow(data as ProfileRow)
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
  return (data ?? []).map((row) => mapProfileRow(row as ProfileRow))
}

// ─── Department aggregates ───────────────────────────────

export interface DepartmentStats {
  department: Department
  total_employees: number
  active_employees: number
  head_user_id: string | null
  head_name: string | null
  members: UserProfile[]
}

export async function getDepartmentStats(): Promise<DepartmentStats[]> {
  const { data: profiles } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .order("full_name")

  const { data: heads } = await supabase
    .from("department_heads")
    .select("department, user_id")

  const headsMap = new Map<Department, string | null>(
    (heads ?? []).map((h) => [h.department as Department, h.user_id]),
  )

  const allDepartments: Department[] = ["marketing", "sotuv", "buxgalteriya", "operatsion", "it", "hr"]
  const allProfiles = (profiles ?? []).map((row) => mapProfileRow(row as ProfileRow))

  return allDepartments.map((dep) => {
    const members = allProfiles.filter((p) => p.department === dep)
    const headId = headsMap.get(dep) ?? null
    const head = headId ? members.find((m) => m.id === headId) ?? null : null

    return {
      department: dep,
      total_employees: members.length,
      active_employees: members.filter((m) => m.is_active).length,
      head_user_id: headId,
      head_name: head?.full_name ?? null,
      members,
    }
  })
}

export async function getUserById(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .single()
  if (error || !data) return null
  return mapProfileRow(data as ProfileRow)
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
  modules: ModuleName[],
): Promise<void> {
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
      can_edit: false,
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
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Tizimga kirilmagan")
  const { error } = await supabase
    .from("profiles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", user.id)
  if (error) throw error
}

export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
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
