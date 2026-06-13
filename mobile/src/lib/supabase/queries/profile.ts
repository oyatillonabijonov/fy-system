import { supabase } from "../client"
import type { Database } from "../types"

export type ClientRow = Database["public"]["Tables"]["clients"]["Row"]

/** The signed-in member's own client row (RLS limits to own row). */
export async function getMyClient(): Promise<ClientRow | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle()

  if (error) throw error
  return data
}

export interface UpdateProfileInput {
  full_name?: string
  phone?: string
  company?: string
  activity?: string
  industry?: string
}

/** Members can only edit safe columns, enforced by the SECURITY DEFINER RPC. */
export async function updateMyProfile(input: UpdateProfileInput): Promise<void> {
  const { error } = await supabase.rpc("member_update_profile", {
    p_full_name: input.full_name,
    p_phone: input.phone,
    p_company: input.company,
    p_activity: input.activity,
    p_industry: input.industry,
  })
  if (error) throw error
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}
