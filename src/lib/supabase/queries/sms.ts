import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase } from "../client"

// ponytail: untyped client until `bun run gen:types` picks up migration 083
const db = supabase as unknown as SupabaseClient

export type SmsKind = "promo" | "reminder"
export type SmsStatus = "queued" | "sent" | "delivered" | "failed"

export const SMS_STATUS: Record<SmsStatus, { label: string; cls: string }> = {
  queued: { label: "Navbatda", cls: "text-ink-muted" },
  sent: { label: "Yuborildi", cls: "text-info" },
  delivered: { label: "Yetkazildi", cls: "text-success" },
  failed: { label: "Xato", cls: "text-danger" },
}

export interface SmsRecipient { id: string; full_name: string; phone: string | null; sms_opt_out: boolean; is_customer: boolean }
export interface SmsTemplate { id: string; title: string; text: string }
/** A text Eskiz approved: `template` with %w/%d holes, `example` = the text it was approved from */
export interface EskizTemplate { id: number; template: string; example: string; kind: SmsKind }
export interface SmsCampaign {
  id: string; kind: SmsKind; text: string; created_at: string; author: string | null
  total: number; queued: number; sent: number; delivered: number; failed: number
}
export interface SmsMessage { id: number; campaign_id: string; client_id: string | null; phone: string; text: string; status: SmsStatus; error: string | null; created_at: string; sent_at: string | null }

/** Everyone SMS can go to: customers and leads (is_customer, 077) */
export async function getSmsRecipients(): Promise<SmsRecipient[]> {
  const { data, error } = await db.from("clients").select("id, full_name, phone, sms_opt_out, is_customer").order("full_name")
  if (error) throw error
  return data as SmsRecipient[]
}

/** Client ids enrolled in an event */
export async function getEventClientIds(eventId: string): Promise<string[]> {
  const { data, error } = await db.from("event_participants").select("contact_id").eq("event_id", eventId).not("contact_id", "is", null)
  if (error) throw error
  return (data as { contact_id: string }[]).map((r) => r.contact_id)
}

export async function getSmsTemplates(): Promise<SmsTemplate[]> {
  const { data, error } = await db.from("sms_templates").select("id, title, text").order("created_at")
  if (error) throw error
  return data as SmsTemplate[]
}

export async function addSmsTemplate(t: { title: string; text: string }): Promise<void> {
  const { error } = await db.from("sms_templates").insert(t)
  if (error) throw error
}

export async function deleteSmsTemplate(id: string): Promise<void> {
  const { error } = await db.from("sms_templates").delete().eq("id", id)
  if (error) throw error
}

const SEND_ERRORS: Record<string, string> = {
  quiet_hours: "SMS faqat 9:00–21:00 oralig'ida yuboriladi",
  no_recipients: "Tanlanganlarda raqam yo'q yoki hammasi reklama SMS'ini rad etgan",
  empty_text: "Matn bo'sh",
  forbidden: "SMS yuborishga ruxsat yo'q",
}

export async function sendSms(v: { kind: SmsKind; text: string; clientIds: string[] }): Promise<{ queued: number; skipped: number }> {
  const { data, error } = await db.rpc("send_sms", { p_kind: v.kind, p_text: v.text, p_client_ids: v.clientIds })
  if (error) {
    const code = Object.keys(SEND_ERRORS).find((k) => error.message.includes(k))
    throw new Error(code ? SEND_ERRORS[code] : error.message)
  }
  return data as { queued: number; skipped: number }
}

export async function getSmsCampaigns(page: number): Promise<{ rows: SmsCampaign[]; total: number }> {
  const { data, error, count } = await db.from("sms_campaign_stats").select("*", { count: "exact" })
    .order("created_at", { ascending: false }).range(page * 20, page * 20 + 19)
  if (error) throw error
  return { rows: data as SmsCampaign[], total: count ?? 0 }
}

export async function getSmsMessages(filter: { campaignId?: string; clientId?: string }): Promise<SmsMessage[]> {
  let q = db.from("sms_messages").select("id, campaign_id, client_id, phone, text, status, error, created_at, sent_at").order("id", { ascending: false })
  if (filter.campaignId) q = q.eq("campaign_id", filter.campaignId)
  if (filter.clientId) q = q.eq("client_id", filter.clientId)
  const { data, error } = await q
  if (error) throw error
  return data as SmsMessage[]
}

export async function setSmsOptOut(clientId: string, optOut: boolean): Promise<void> {
  const { error } = await db.from("clients").update({ sms_opt_out: optOut }).eq("id", clientId)
  if (error) throw error
}

/** Approved templates, read live from Eskiz through amo-sync (the Eskiz key never reaches the browser) */
export async function getEskizTemplates(): Promise<EskizTemplate[]> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${(import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, "")}/hooks/sms/templates`, {
    headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
  })
  const body = (await res.json().catch(() => ({}))) as EskizTemplate[] & { error?: string }
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body
}
