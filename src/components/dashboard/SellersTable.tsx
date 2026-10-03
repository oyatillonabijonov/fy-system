import { useState } from "react"
import { Link } from "react-router-dom"
import { CaretDown, CaretRight, CheckCircle, WarningCircle } from "@phosphor-icons/react"
import type { SalesSeller } from "@/lib/supabase/queries/salesDashboard"
import { useSellerTasks } from "@/hooks/useSalesDashboard"
import { kindLabel } from "@/lib/supabase/queries/sotuv"
import { tbl } from "@/components/ui/table"
import { Pager, usePaged } from "@/components/ui/Pager"
import { PersonDot } from "@/components/vazifalar/pickers"
import { useAuth } from "@/context/AuthContext"
import { formatNumber } from "@/lib/format"
import { Empty } from "./pieces"

const pct = (v: number | null) => (v === null ? "—" : `${v}%`)
const when = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" })

/** One row per seller; a click opens the seller's tasks in the period (needs the Sotuv module — RLS) */
export function SellersTable({ rows, from, to, pipelineId }: { rows: SalesSeller[]; from: string; to: string; pipelineId: string | null }) {
  const { hasAccess } = useAuth()
  const canOpen = hasAccess("sotuv-crmn")
  const [openId, setOpenId] = useState<string | null>(null)
  const { page, setPage, pageCount, pageItems } = usePaged(rows)
  if (rows.length === 0) return <Empty text="Davrda sotuvchi faoliyati yo'q" />
  return (
    <div className="flex flex-col gap-3">
    <div className={tbl.scroll}>
      <table className={tbl.table}>
        <thead>
          <tr>
            <th className={tbl.th}>Sotuvchi</th>
            <th className={`${tbl.th} text-right`}>Ochiq</th><th className={`${tbl.th} text-right`}>Yangi</th>
            <th className={`${tbl.th} text-right`}>Yutildi</th><th className={`${tbl.th} text-right`}>Yutqazildi</th>
            <th className={`${tbl.th} text-right`}>Konversiya</th><th className={`${tbl.th} text-right`}>Summa</th>
            <th className={`${tbl.th} text-right`}>Yakunlangan vazifa</th><th className={`${tbl.th} text-right`}>O'z vaqtida</th>
            <th className={`${tbl.th} text-right`}>Kechikkan</th>
          </tr>
        </thead>
        <tbody>
          {pageItems.map((s) => {
            const open = openId === s.id
            const onTime = s.tasks_done ? Math.round((s.tasks_on_time / s.tasks_done) * 100) : null
            return [
              <tr key={s.id} className={`${tbl.tr} ${canOpen ? "cursor-pointer" : ""}`} onClick={canOpen ? () => setOpenId(open ? null : s.id) : undefined} aria-expanded={canOpen ? open : undefined}
                tabIndex={canOpen ? 0 : undefined} onKeyDown={canOpen ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(open ? null : s.id) } } : undefined}>
                <td className={tbl.td}>
                  <span className="inline-flex items-center gap-2 whitespace-nowrap">
                    {canOpen && (open ? <CaretDown size={12} weight="bold" /> : <CaretRight size={12} weight="bold" />)}
                    <PersonDot name={s.full_name} url={s.avatar_url} />{s.full_name}
                  </span>
                </td>
                <td className={`${tbl.td} text-right tabular-nums`}>{formatNumber(s.open)}</td>
                <td className={`${tbl.td} text-right tabular-nums`}>{formatNumber(s.new)}</td>
                <td className={`${tbl.td} text-right tabular-nums`}>{formatNumber(s.won)}</td>
                <td className={`${tbl.td} text-right tabular-nums`}>{formatNumber(s.lost)}</td>
                <td className={`${tbl.td} text-right tabular-nums`}>{pct(s.conversion)}</td>
                <td className={`${tbl.td} text-right tabular-nums`}>{formatNumber(s.won_sum)}</td>
                <td className={`${tbl.td} text-right tabular-nums`}>{formatNumber(s.tasks_done)}</td>
                <td className={`${tbl.td} text-right tabular-nums`}>{pct(onTime)}</td>
                <td className={`${tbl.td} text-right tabular-nums ${s.tasks_overdue_open ? "text-danger-text font-medium" : ""}`}>{formatNumber(s.tasks_overdue_open)}</td>
              </tr>,
              open && <tr key={`${s.id}-tasks`}><td colSpan={10} className="p-0"><SellerTasks id={s.id} from={from} to={to} pipelineId={pipelineId} /></td></tr>,
            ]
          })}
        </tbody>
      </table>
    </div>
    <Pager page={page} pageCount={pageCount} total={rows.length} onPage={setPage} />
    </div>
  )
}

function SellerTasks({ id, from, to, pipelineId }: { id: string; from: string; to: string; pipelineId: string | null }) {
  const { data = [], isLoading, isError } = useSellerTasks(id, from, to, pipelineId)
  if (isLoading) return <p className="px-4 py-3 text-sm text-ink-muted">Yuklanmoqda…</p>
  if (isError) return <p className="px-4 py-3 text-sm text-danger-text">Vazifalar yuklanmadi</p>
  if (data.length === 0) return <p className="px-4 py-3 text-sm text-ink-muted">Davrda yakunlangan yoki kechikkan vazifa yo'q</p>
  return (
    <ul className="flex flex-col bg-surface-sunken rounded-surface mx-2 my-2">
      {data.map((t) => {
        const late = t.is_done ? Date.parse(t.done_at!) > Date.parse(t.due_date) : true
        return (
          <li key={t.id} className="flex items-center gap-3 px-4 py-2 border-b border-line last:border-0 text-sm">
            {late ? <WarningCircle size={16} className="text-danger-text shrink-0" /> : <CheckCircle size={16} className="text-success-text shrink-0" />}
            <Link to={`/sotuv/bitim/${t.lead_id}`} className="flex-1 min-w-0 truncate text-ink hover:underline">{t.text || kindLabel(t.kind)} · {t.lead?.name}</Link>
            <span className="text-ink-muted tabular-nums whitespace-nowrap">muddat {when(t.due_date)}</span>
            <span className={`tabular-nums whitespace-nowrap ${late ? "text-danger-text" : "text-success-text"}`}>
              {t.is_done ? `bajarildi ${when(t.done_at!)}` : "bajarilmagan"}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
