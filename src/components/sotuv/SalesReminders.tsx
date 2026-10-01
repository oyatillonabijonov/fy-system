import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Bell } from "@phosphor-icons/react"
import { useAuth } from "@/context/AuthContext"
import { SOTUV_KEY } from "@/hooks/useSotuv"
import { getMyOpenTasks, fromDue, kindLabel } from "@/lib/supabase/queries/sotuv"
import { toast } from "@/lib/toast"
import { tashkentToday } from "@/lib/period"
import { Popover } from "@/components/vazifalar/pickers"
import { TaskChip } from "./ui"

const KEY = "fy_reminded"   // task id → the deadline already announced (a moved deadline re-arms it)

/** When a time-set task falls due → at that time; an all-day task → at 9:00 Tashkent that day */
const remindAt = (due: string) => {
  const { date, time } = fromDue(due)
  return time ? new Date(due).getTime() : new Date(`${date}T09:00:00+05:00`).getTime()
}

function load(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string> } catch { return {} }
}

/** In-app reminders for my sales tasks (platform only — the page must be open): a toast when one
 *  falls due, and a header bell with a red count of every due task until it's done or moved. */
export function SalesReminders() {
  const { user } = useAuth()
  const navigate = useNavigate()
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

  const due = (tasks ?? []).filter((t) => remindAt(t.due_date) <= now)
  return (
    <Popover width={360} trigger={(open, toggle) => (
      <button type="button" onClick={toggle} aria-expanded={open}
        aria-label={due.length ? `Eslatmalar: ${due.length} ta vazifa vaqti keldi` : "Eslatmalar"}
        className="relative size-9 shrink-0 rounded-full bg-surface-sunken flex items-center justify-center text-ink hover:bg-surface-sunken-hover transition-colors">
        <Bell size={18} weight={due.length ? "fill" : "regular"} className={due.length ? "text-danger" : ""} />
        {due.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-danger text-white text-xs font-semibold tabular-nums flex items-center justify-center">
            {due.length > 99 ? "99+" : due.length}
          </span>
        )}
      </button>
    )}>
      {(close) => (
        <div className="flex flex-col">
          <p className="px-2.5 pt-1.5 pb-2 text-sm font-semibold text-ink">Vaqti kelgan vazifalar</p>
          {due.length === 0 ? <p className="px-2.5 py-6 text-center text-sm text-ink-muted">Hozircha yo'q</p> : (
            <div className="max-h-[60vh] overflow-y-auto flex flex-col">
              {due.map((t) => (
                <button key={t.id} type="button" onClick={() => { close(); navigate(`/sotuv/bitim/${t.lead_id}`) }}
                  className="flex items-center gap-3 px-2.5 py-2 rounded-item text-left hover:bg-mute-ghost-hover transition-colors">
                  <span className="flex-1 min-w-0">
                    <span className="block text-base text-ink truncate">{t.text || kindLabel(t.kind)}</span>
                    {t.lead && <span className="block text-sm text-ink-muted truncate">{t.lead.name}</span>}
                  </span>
                  <TaskChip kind={t.kind} due={t.due_date} today={tashkentToday()} />
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => { close(); navigate("/sotuv?v=tasks") }}
            className="mt-1 h-control-sm rounded-item text-sm font-medium text-ink-muted hover:text-ink hover:bg-mute-ghost-hover transition-colors">
            Barcha vazifalar
          </button>
        </div>
      )}
    </Popover>
  )
}
