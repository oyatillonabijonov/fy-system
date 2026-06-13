import { supabase } from "../client"

export interface Channel {
  id: string
  name: string
  description: string | null
  created_by: string | null
  created_at: string
}

export interface Message {
  id: string
  channel_id: string | null
  sender_id: string
  recipient_id: string | null
  content: string | null
  image_url: string | null
  created_at: string
  sender_name?: string
  sender_avatar?: string
}

export interface DmThread {
  other_user_id: string
  other_user_name: string
  other_user_avatar: string | null
  last_message: string | null
  last_message_at: string | null
}

export const CHANNELS_KEY = ["channels"] as const
export const MESSAGES_KEY = ["messages"] as const

// ─── Channels ────────────────────────────────────────────

export async function getChannels(): Promise<Channel[]> {
  const { data, error } = await supabase
    .from("channels")
    .select("id, name, description, created_by, created_at")
    .order("created_at", { ascending: true })
  if (error) throw error
  return (data ?? []) as Channel[]
}

export async function createChannel(name: string, description?: string): Promise<Channel> {
  const { data, error } = await supabase
    .from("channels")
    .insert({ name: name.trim(), description: description?.trim() ?? null })
    .select("id, name, description, created_by, created_at")
    .single()
  if (error) throw error
  return data as Channel
}

export async function deleteChannel(id: string): Promise<void> {
  const { error } = await supabase.from("channels").delete().eq("id", id)
  if (error) throw error
}

// ─── Messages ────────────────────────────────────────────

export async function getChannelMessages(channelId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select(`
      id, channel_id, sender_id, recipient_id, content, image_url, created_at,
      sender:sender_id(full_name:raw_user_meta_data->>full_name, email)
    `)
    .eq("channel_id", channelId)
    .order("created_at", { ascending: true })
    .limit(200)
  if (error) throw error
  return ((data ?? []) as unknown[]).map((row) => {
    const r = row as Record<string, unknown>
    const sender = r.sender as Record<string, string> | null
    return {
      id: r.id as string,
      channel_id: r.channel_id as string | null,
      sender_id: r.sender_id as string,
      recipient_id: r.recipient_id as string | null,
      content: r.content as string | null,
      image_url: r.image_url as string | null,
      created_at: r.created_at as string,
      sender_name: sender?.full_name ?? sender?.email ?? "A'zo",
      sender_avatar: undefined,
    }
  })
}

export async function getDmMessages(otherUserId: string): Promise<Message[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from("messages")
    .select("id, channel_id, sender_id, recipient_id, content, image_url, created_at")
    .is("channel_id", null)
    .or(`and(sender_id.eq.${user.id},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${user.id})`)
    .order("created_at", { ascending: true })
    .limit(200)
  if (error) throw error
  return (data ?? []) as Message[]
}

export async function sendChannelMessage(channelId: string, content: string, imageUrl?: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Tizimga kirilmagan")

  const { error } = await supabase.from("messages").insert({
    channel_id: channelId,
    sender_id: user.id,
    content: content.trim() || null,
    image_url: imageUrl ?? null,
  })
  if (error) throw error
}

export async function sendDmMessage(recipientId: string, content: string, imageUrl?: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Tizimga kirilmagan")

  const { error } = await supabase.from("messages").insert({
    recipient_id: recipientId,
    sender_id: user.id,
    content: content.trim() || null,
    image_url: imageUrl ?? null,
  })
  if (error) throw error
}

// ─── Community members list (for DM) ─────────────────────

export interface CommunityMember {
  id: string
  auth_user_id: string
  full_name: string
  company: string | null
  image: string | null
}

export async function getCommunityMembers(): Promise<CommunityMember[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from("clients")
    .select("id, auth_user_id, full_name, company, image")
    .eq("community_approved", true)
    .not("auth_user_id", "is", null)
    .neq("auth_user_id", user.id)
    .order("full_name")
  if (error) throw error
  return (data ?? []) as CommunityMember[]
}

// ─── Admin: community_approved toggle ────────────────────

export async function setCommunityApproved(clientId: string, approved: boolean): Promise<void> {
  const { error } = await supabase
    .from("clients")
    .update({ community_approved: approved } as Record<string, unknown>)
    .eq("id", clientId)
  if (error) throw error
}

// ─── Admin: pending community members count ───────────────

export async function getCommunityPendingCount(): Promise<number> {
  const { count, error } = await supabase
    .from("clients")
    .select("id", { count: "exact", head: true })
    .not("auth_user_id", "is", null)
    .eq("community_approved", false)
  if (error) return 0
  return count ?? 0
}
