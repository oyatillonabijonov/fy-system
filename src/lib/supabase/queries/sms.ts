import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase } from "../client"

// ponytail: untyped client until `bun run gen:types` picks up migration 083
const db = supabase as unknown as SupabaseClient

export type SmsKind = "promo" | "reminder"
export type SmsStatus = "queued" | "sent" | "delivered" | "failed" | "cancelled"

export const SMS_STATUS: Record<SmsStatus, { label: string; cls: string }> = {
  queued: { label: "Navbatda", cls: "text-ink-muted" },
  sent: { label: "Yuborildi", cls: "text-info" },
  delivered: { label: "Yetkazildi", cls: "text-success" },
  failed: { label: "Xato", cls: "text-danger" },
  cancelled: { label: "Bekor qilindi", cls: "text-ink-faint" },
}

export interface SmsRecipient { id: string; full_name: string; phone: string | null; sms_opt_out: boolean; is_customer: boolean }
/** 095: a template written here; Eskiz approves it (status, kind come from Eskiz through amo-sync) */
export type TemplateStatus = "draft" | "moderation" | "approved" | "rejected"
export interface SmsTemplate { id: string; title: string; text: string; status: TemplateStatus; kind: SmsKind | null; hidden: boolean; created_at: string }
export const TEMPLATE_STATUS: Record<TemplateStatus, { label: string; cls: string }> = {
  draft: { label: "Qoralama", cls: "bg-mute-soft text-ink-muted" },
  moderation: { label: "Eskiz tekshirmoqda", cls: "bg-warning-soft text-warning-text" },
  approved: { label: "Tasdiqlandi", cls: "bg-success-soft text-success-text" },
  rejected: { label: "Rad etildi", cls: "bg-danger-soft text-danger-text" },
}
export const KIND_LABEL: Record<SmsKind, string> = { reminder: "Eslatma", promo: "Reklama" }
export interface SmsCampaign {
  id: string; kind: SmsKind; text: string; created_at: string; author: string | null; created_by: string | null
  total: number; queued: number; sent: number; delivered: number; failed: number
  send_at: string; cancelled: number; template_title: string | null
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
  const { data, error } = await db.from("sms_templates").select("id, title, text, status, kind, hidden, created_at").order("created_at", { ascending: false })
  if (error) throw error
  return data as SmsTemplate[]
}

/** New or edited template; `submit` = send to Eskiz now (otherwise a draft) */
export async function saveSmsTemplate(t: { id?: string; title: string; text: string; submit: boolean }): Promise<void> {
  const row = { title: t.title, text: t.text, ...(t.submit ? { status: "moderation" } : {}) }
  const { error } = t.id ? await db.from("sms_templates").update(row).eq("id", t.id) : await db.from("sms_templates").insert(row)
  if (error) throw error
}

export async function submitSmsTemplate(id: string): Promise<void> {
  const { error } = await db.from("sms_templates").update({ status: "moderation" }).eq("id", id)
  if (error) throw error
}

export async function hideSmsTemplate(id: string, hidden: boolean): Promise<void> {
  const { error } = await db.from("sms_templates").update({ hidden }).eq("id", id)
  if (error) throw error
}

export async function deleteSmsTemplate(id: string): Promise<void> {
  const { error } = await db.from("sms_templates").delete().eq("id", id)
  if (error) throw error
}

const SEND_ERRORS: Record<string, string> = {
  blank_missing: "Shablondagi bo'sh joylarni to'ldiring",
  not_approved: "Bu shablonni Eskiz hali tasdiqlamagan",
  no_recipients: "Tanlanganlarda raqam yo'q yoki hammasi reklama SMS'ini rad etgan",
  empty_text: "Matn bo'sh",
  forbidden: "SMS yuborishga ruxsat yo'q",
}

/** 095: an approved template to these clients, now or at `sendAt` (amo-sync sends 9:00–21:00 only) */
export async function sendSmsTemplate(v: { templateId: string; values: Record<string, string>; clientIds: string[]; sendAt: string | null }): Promise<{ queued: number; skipped: number }> {
  const { data, error } = await db.rpc("send_sms_template", { p_template: v.templateId, p_values: v.values, p_client_ids: v.clientIds, p_send_at: v.sendAt })
  if (error) {
    const code = Object.keys(SEND_ERRORS).find((k) => error.message.includes(k))
    throw new Error(code ? SEND_ERRORS[code] : error.message)
  }
  return data as { queued: number; skipped: number }
}

export async function cancelSmsCampaign(id: string): Promise<void> {
  const { error } = await db.rpc("cancel_sms_campaign", { p_campaign: id })
  if (error) throw error
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

export interface ClientSmsRow extends SmsMessage { author: string | null; send_at: string; bulk: boolean }

/** A client's SMS for the bitim feed and the card: who sent it, when it goes, whether it was a bulk send */
export async function getClientSms(clientId: string): Promise<ClientSmsRow[]> {
  const { data, error } = await db.from("sms_messages")
    .select("id, campaign_id, client_id, phone, text, status, error, created_at, sent_at, campaign:campaign_id(send_at, author:created_by(full_name))")
    .eq("client_id", clientId).order("id", { ascending: false })
  if (error) throw error
  const rows = data as unknown as (SmsMessage & { campaign: { send_at: string; author: { full_name: string } | null } | null })[]
  const ids = [...new Set(rows.map((r) => r.campaign_id))]
  const { data: stats } = ids.length ? await db.from("sms_campaign_stats").select("id, total").in("id", ids) : { data: [] }
  const total = new Map(((stats ?? []) as { id: string; total: number }[]).map((r) => [r.id, r.total]))
  return rows.map(({ campaign, ...m }) => ({ ...m, author: campaign?.author?.full_name ?? null, send_at: campaign?.send_at ?? m.created_at, bulk: (total.get(m.campaign_id) ?? 1) > 1 }))
}

/** Client ids with a bitim in a voronka (and bosqich) — the bulk page's filter */
export async function getPipelineClientIds(pipelineId: string, stageId: string | null): Promise<string[]> {
  let q = db.from("crm_leads").select("client_id").eq("pipeline_id", pipelineId).not("client_id", "is", null)
  if (stageId) q = q.eq("stage_id", stageId)
  const { data, error } = await q
  if (error) throw error
  return (data as { client_id: string }[]).map((r) => r.client_id)
}

export async function setSmsOptOut(clientId: string, optOut: boolean): Promise<void> {
  const { error } = await db.from("clients").update({ sms_opt_out: optOut }).eq("id", clientId)
  if (error) throw error
}

/** Ask amo-sync to submit new templates and re-read Eskiz's states now (the Eskiz key never reaches the browser) */
export async function syncSmsTemplates(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${(import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, "")}/hooks/sms/templates/sync`, {
    method: "POST", headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
  })
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error === "eskiz_error" ? "Eskiz javob bermadi" : `HTTP ${res.status}`)
}
