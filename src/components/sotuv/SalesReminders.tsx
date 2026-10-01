import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/context/AuthContext"
import { SOTUV_KEY } from "@/hooks/useSotuv"
import { getMyOpenTasks, fromDue, kindLabel } from "@/lib/supabase/queries/sotuv"
import { toast } from "@/lib/toast"

const KEY = "fy_reminded"   // task id → the deadline already announced (a moved deadline re-arms it)

/** When a time-set task falls due → at that time; an all-day task → at 9:00 Tashkent that day */
const remindAt = (due: string) => {
  const { date, time } = fromDue(due)
  return time ? new Date(due).getTime() : new Date(`${date}T09:00:00+05:00`).getTime()
}

function load(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string> } catch { return {} }
}

/** In-app reminders for my sales tasks (platform only — the page must be open). Renders nothing. */
export function SalesReminders() {
  const { user } = useAuth()
  const [now, setNow] = useState(() => Date.now())
  const { data: tasks } = useQuery({
    queryKey: [...SOTUV_KEY, "my-reminders", user?.id],
    queryFn: () => getMyOpenTasks(user!.id),
    enabled: !!user, refetchInterval: 60_000, refetchOnWindowFocus: true,
  })

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!tasks) return
    const seen = load()
    const due = tasks.filter((t) => remindAt(t.due_date) <= now && seen[t.id] !== t.due_date)
    if (due.length === 0) return
    if (due.length > 2) toast.info(`${due.length} ta vazifa vaqti keldi`, "Sotuv bo'limi → Vazifalar")
    else for (const t of due) toast.info(`Vazifa vaqti keldi: ${kindLabel(t.kind)}`, [t.text, t.lead?.name].filter(Boolean).join(" · "))
    // Keep only still-open tasks in the store
    const next: Record<string, string> = {}
    for (const t of tasks) if (seen[t.id] || due.includes(t)) next[t.id] = t.due_date
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* not saved — may remind again */ }
  }, [tasks, now])

  return null
}
