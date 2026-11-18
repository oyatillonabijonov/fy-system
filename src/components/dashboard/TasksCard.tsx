import { Link } from "react-router-dom"
import type { SalesDashboard, TaskBuckets } from "@/lib/supabase/queries/salesDashboard"
import { useAuth } from "@/context/AuthContext"
import { tbl } from "@/components/ui/table"
import { PersonDot } from "@/components/vazifalar/pickers"
import { formatNumber } from "@/lib/format"

const COLS: { key: keyof TaskBuckets; label: string; bad?: boolean }[] = [
  { key: "overdue", label: "Muddati o'tgan", bad: true }, { key: "today", label: "Bugun" }, { key: "this_week", label: "Shu hafta" },
  { key: "next_week", label: "Keyingi hafta" }, { key: "later", label: "Keyinroq" }, { key: "idle", label: "Vazifasiz", bad: true },
]

/** Open bitimlar by their nearest open task (103), in all and per owner. The task tiles open the Sotuv
 *  task list; the bitimlar with no task are listed in "E'tibor talab qiladi". `compact`: tiles only. */
export function TasksCard({ tasks, pipelineId, compact = false }: { tasks: SalesDashboard["tasks"]; pipelineId: string | null; compact?: boolean }) {
  const to = useAuth().hasAccess("sotuv-crmn") ? `/sotuv?v=tasks${pipelineId ? `&p=${pipelineId}` : ""}` : null
  const box = "bg-surface-sunken rounded-surface px-3 sm:px-4 py-3 flex flex-col gap-1 min-w-0"
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 xl:grid-cols-6 gap-3">
        {COLS.map((c) => {
          const n = tasks.total[c.key]
          const body = <>
            <span className="text-sm font-medium text-ink-muted truncate">{c.label}</span>
            <span className={`text-base sm:text-lg font-semibold tabular-nums ${c.bad && n > 0 ? "text-danger-text" : "text-ink"}`}>{formatNumber(n)}</span>
          </>
          return to && c.key !== "idle"
            ? <Link key={c.key} to={to} className={`${box} hover:bg-surface-sunken-hover transition-colors`}>{body}</Link>
            : <div key={c.key} className={box}>{body}</div>
        })}
      </div>
      {!compact && tasks.by_seller.length > 0 && (
        <div className={tbl.scroll}>
          <table className={tbl.table}>
            <thead>
              <tr>
                <th className={tbl.th}>Bitim egasi</th>
                {COLS.map((c) => <th key={c.key} className={`${tbl.th} text-right`}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {tasks.by_seller.map((s) => (
                <tr key={s.id ?? "none"} className={tbl.tr}>
                  <td className={tbl.td}>
                    {s.full_name
                      ? <span className="inline-flex items-center gap-2 whitespace-nowrap"><PersonDot name={s.full_name} url={s.avatar_url} />{s.full_name}</span>
                      : <span className="text-ink-muted whitespace-nowrap">Mas'ulsiz</span>}
                  </td>
                  {COLS.map((c) => (
                    <td key={c.key} className={`${tbl.td} text-right tabular-nums ${c.bad && s[c.key] > 0 ? "text-danger-text font-medium" : ""}`}>{formatNumber(s[c.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
