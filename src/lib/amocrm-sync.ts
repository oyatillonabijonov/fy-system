// Replace mock with real AmoCRM API calls in Phase 2

import type { Lead, LeadSource } from "./mock-data/sotuv"
import type { LeadStage } from "./supabase/types"
import { formatDate } from "@/lib/format"

/** AmoCRM API lead response structure */
export interface AmoCrmLead {
  id: number
  name: string
  price: number
  status_id: number
  pipeline_id: number
  responsible_user_id: number
  company_name: string | null
  created_at: number // unix timestamp
  updated_at: number
  custom_fields_values: AmoCrmCustomField[]
  _embedded: {
    contacts: AmoCrmContact[]
  }
}

export interface AmoCrmContact {
  id: number
  name: string
  custom_fields_values: AmoCrmCustomField[]
}

export interface AmoCrmCustomField {
  field_id: number
  field_name: string
  values: { value: string; enum_id?: number }[]
}

/** Webhook payload for incoming AmoCRM events */
export interface AmoCrmWebhookPayload {
  leads: {
    add?: AmoCrmWebhookLead[]
    update?: AmoCrmWebhookLead[]
    delete?: AmoCrmWebhookLead[]
    status?: AmoCrmWebhookLead[]
  }
  account: {
    id: number
    subdomain: string
  }
}

export interface AmoCrmWebhookLead {
  id: string
  name: string
  price: string
  status_id: string
  pipeline_id: string
  responsible_user_id: string
  modified_user_id: string
  date_create: string
  last_modified: string
}

/** Sync result from AmoCRM fetch */
export interface SyncResult {
  success: boolean
  leadsImported: number
  leadsUpdated: number
  errors: string[]
  syncedAt: string
}

/** Status ID to internal stage mapping */
const STATUS_MAP: Record<number, LeadStage> = {
  142: "yangi_lid",
  143: "boglanildi",
  144: "taklif_yuborildi",
  145: "muzokara",
  146: "yutildi",
  147: "yutqazildi",
}

/** Source mapping */
const SOURCE_MAP: Record<string, LeadSource> = {
  amocrm: "amocrm",
  web: "manual",
  telegram: "telegram",
}

/** Mock sync function — simulates fetching leads from AmoCRM */
export async function syncLeadsFromAmoCrm(): Promise<SyncResult> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 1500))

  return {
    success: true,
    leadsImported: 3,
    leadsUpdated: 1,
    errors: [],
    syncedAt: new Date().toISOString(),
  }
}

/** Transform AmoCRM lead to internal Lead format */
export function transformAmoCrmLead(amoLead: AmoCrmLead): Omit<Lead, "id"> {
  const stage = STATUS_MAP[amoLead.status_id] ?? "yangi_lid"
  const source = SOURCE_MAP["amocrm"]

  return {
    name: amoLead.name,
    company: amoLead.company_name,
    stage,
    responsible: {
      name: "AmoCRM User",
      initials: "AU",
      color: "#6366F1",
    },
    amount: amoLead.price,
    lastCall: { time: "", type: "none" },
    source,
    createdAt: formatDate(new Date(amoLead.created_at * 1000)),
    amoId: `AMO-${amoLead.id}`,
  }
}
