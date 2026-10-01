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
  clients: ["clients", "client-journey", "client-participations", "client-event-history", "client-cashback", "clients-last-event-dates", "participants", "sotuv", "finance"],
  crm_leads: ["sotuv"], crm_stages: ["sotuv"], crm_calls: ["sotuv"], crm_tasks: ["sotuv"], crm_notes: ["sotuv"],
  tasks: ["tasks"], task_comments: ["tasks"], task_attachments: ["tasks"],
  events: ["events", "event-participant-counts", "tasks", "finance"], event_tariffs: ["event-tariffs"],
  event_participants: ["participants", "event-participant-counts", "finance", "clients", "client-journey", "client-participations", "client-event-history"],
  payments: ["finance", "participants", "recent-payments", "event-payments", "client-participations", "client-journey"],
  expenses: ["finance"],
  cashback_transactions: ["cashback", "client-cashback", "clients", "participants"],
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
      })
      .subscribe()
    return () => { clearTimeout(timer); void supabase.removeChannel(ch) }
  }, [uid, qc])

  return null
}
