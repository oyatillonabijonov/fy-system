import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase/client"
import { useAuth } from "@/context/AuthContext"
import { sourceLabel } from "@/lib/supabase/queries/sotuv"
import { toast } from "@/lib/toast"
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
          if (lead.created_by !== uid) toast.notify(`Yangi lid: ${lead.name ?? ""}`, sourceLabel(lead.source ?? null))
        }
        // 097: RLS delivers these rows only to Mijozlar users — they are the ones who approve
        // at most one sound a minute: a resend is a new row, and a QR at an event brings many at once
        if (p.table === "client_profile_submissions" && p.eventType === "INSERT" && Date.now() - lastAnketa > 60_000) {
          lastAnketa = Date.now()
          toast.notify("Yangi anketa", (p.new as { full_name?: string }).full_name ?? "")
        }
      })
      .subscribe()
    return () => { clearTimeout(timer); void supabase.removeChannel(ch) }
  }, [uid, qc])

  return null
}
