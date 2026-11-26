import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase/client"
import { useAuth } from "@/context/AuthContext"
import { sourceLabel } from "@/lib/supabase/queries/sotuv"
import { toast } from "@/lib/toast"
import { burst } from "@/lib/burst"
import { preloadNotify } from "@/lib/phoneAudio"

// Table (in the supabase_realtime publication, 072–076) → first elements of the query keys that
// show it. A profile's name/photo is embedded nearly everywhere, so it refreshes everything.
const TOUCHES: Record<string, string[] | "all"> = {
  profiles: "all",
  clients: ["clients", "client-journey", "client-participations", "client-event-history", "client-cashback", "clients-last-event-dates", "participants", "sotuv", "finance", "sales-dashboard"],
  crm_leads: ["sotuv", "sales-dashboard"], crm_stages: ["sotuv", "sales-dashboard"], crm_calls: ["sotuv", "sales-dashboard"], crm_call_analyses: ["sotuv"],
  crm_tasks: ["sotuv", "sales-dashboard"], crm_notes: ["sotuv", "sales-dashboard"],
  tasks: ["tasks"], task_comments: ["tasks"], task_attachments: ["tasks"], task_projects: ["tasks"],
  events: ["events", "event-participant-counts", "tasks", "finance"], event_tariffs: ["event-tariffs"],
  event_participants: ["participants", "event-participant-counts", "finance", "clients", "client-journey", "client-participations", "client-event-history"],
  payments: ["finance", "participants", "recent-payments", "event-payments", "client-participations", "client-journey"],
  expenses: ["finance"],
  cashback_transactions: ["cashback", "client-cashback", "clients", "participants"],
  client_profile_submissions: ["anketa", "clients", "sotuv"],
  tg_chats: ["telegram"], tg_messages: ["telegram"],
}

/** Live updates: one realtime channel for the whole app. Another user's change refetches what shows
 *  it (cached pages too, so they're fresh when opened); a new lead is announced. Renders nothing. */
export function LiveSync() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const uid = user?.id

  useEffect(() => {
    if (!uid) return
    preloadNotify().catch(() => { /* falls back to the UI cue */ })
    let all = false
    let lastAnketa = 0
    const dirty = new Set<string>()
    let timer: ReturnType<typeof setTimeout> | undefined
    // New leads that land together are announced once: one lead as before, several as a count
    const leads = burst<{ name?: string; source?: string | null }>((got) => {
      if (got.length === 1) return toast.notify(`Yangi lid: ${got[0].name ?? ""}`, sourceLabel(got[0].source ?? null))
      const names = got.slice(0, 3).map((l) => l.name).filter(Boolean).join(", ")
      toast.notify(`${got.length} ta yangi lid`, got.length > 3 ? `${names} va yana ${got.length - 3} ta` : names)
    })
    // A burst of rows (an import, a merge) → one refetch
    const flush = () => {
      const every = all, keys = new Set(dirty)
      all = false; dirty.clear()
      void qc.invalidateQueries({ predicate: (q) => every || keys.has(String(q.queryKey[0])), refetchType: "all" })
    }

    const ch = supabase.channel("live")
      .on("postgres_changes", { event: "*", schema: "public" }, (p) => {
        const touches = TOUCHES[p.table]
        if (!touches) return
        if (touches === "all") all = true
        else for (const k of touches) dirty.add(k)
        clearTimeout(timer)
        timer = setTimeout(flush, 400)

        if (p.table === "crm_leads" && p.eventType === "INSERT") {
          const lead = p.new as { name?: string; source?: string | null; created_by?: string | null }
          if (lead.created_by !== uid) leads.add(lead)
        }
        // 097: RLS delivers these rows only to Mijozlar users — they are the ones who approve
        // at most one sound a minute: a resend is a new row, and a QR at an event brings many at once
        if (p.table === "client_profile_submissions" && p.eventType === "INSERT" && Date.now() - lastAnketa > 60_000) {
          lastAnketa = Date.now()
          toast.notify("Yangi anketa", (p.new as { full_name?: string }).full_name ?? "")
        }
        // 100: a lead wrote on Telegram — heard by the bitim's owner, or by everyone when it has none
        if (p.table === "tg_messages" && p.eventType === "INSERT" && (p.new as { direction?: string }).direction === "in") {
          const m = p.new as { chat_id: string; text?: string }
          void (supabase as unknown as SupabaseClient).from("tg_chats").select("title, lead:lead_id(responsible_user_id)").eq("id", m.chat_id).maybeSingle()
            .then(({ data }) => {
              const c = data as { title: string; lead: { responsible_user_id: string | null } | null } | null
              if (c && (!c.lead?.responsible_user_id || c.lead.responsible_user_id === uid)) toast.notify(`Telegram · ${c.title}`, m.text || "📎 Fayl")
            })
        }
      })
      .subscribe()
    return () => { clearTimeout(timer); leads.cancel(); void supabase.removeChannel(ch) }
  }, [uid, qc])

  return null
}
