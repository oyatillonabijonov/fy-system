import { PhoneIncoming, PhoneOutgoing, PhoneX, Clock, ArrowBendUpLeft } from "@phosphor-icons/react"
import type { SalesDashboard, SalesSeller } from "@/lib/supabase/queries/salesDashboard"
import { secs } from "@/components/sotuv/ui"
import { tbl } from "@/components/ui/table"
import { PersonDot } from "@/components/vazifalar/pickers"
import { formatNumber } from "@/lib/format"

/** Period totals, then the same per seller (only those who called) */
export function CallsCard({ calls: c, sellers }: { calls: SalesDashboard["calls"]; sellers: SalesSeller[] }) {
  const back = c.missed ? `${Math.round((c.missed_called_back / c.missed) * 100)}%` : "—"
  const tiles = [
    { label: "Kiruvchi", icon: <PhoneIncoming size={16} />, value: formatNumber(c.in) },
    { label: "Chiquvchi", icon: <PhoneOutgoing size={16} />, value: formatNumber(c.out) },
    { label: "Javobsiz", icon: <PhoneX size={16} />, value: formatNumber(c.missed), danger: c.missed > 0 },
    { label: "Qayta qo'ng'iroq", icon: <ArrowBendUpLeft size={16} />, value: back, hint: `${c.missed_called_back} / ${c.missed}` },
    { label: "Gaplashilgan", icon: <Clock size={16} />, value: secs(c.talk_sec), hint: `o'rtacha ${secs(c.avg_talk_sec)}` },
  ]
  const callers = sellers.filter((s) => s.calls_in + s.calls_out > 0)
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="bg-surface-sunken rounded-surface px-4 py-3 flex flex-col gap-1 min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-medium text-ink-muted">{t.icon}{t.label}</span>
            <span className={`text-lg font-semibold tabular-nums ${t.danger ? "text-danger-text" : "text-ink"}`}>{t.value}</span>
            {t.hint && <span className="text-xs text-ink-faint">{t.hint}</span>}
          </div>
        ))}
      </div>
      {callers.length > 0 && (
        <div className={tbl.scroll}>
          <table className={tbl.table}>
            <thead>
              <tr>
                <th className={tbl.th}>Sotuvchi</th><th className={`${tbl.th} text-right`}>Kiruvchi</th>
                <th className={`${tbl.th} text-right`}>Chiquvchi</th><th className={`${tbl.th} text-right`}>Javobsiz</th>
                <th className={`${tbl.th} text-right`}>Gaplashilgan</th>
              </tr>
            </thead>
            <tbody>
              {callers.map((s) => (
                <tr key={s.id} className={tbl.tr}>
                  <td className={tbl.td}><span className="inline-flex items-center gap-2 whitespace-nowrap"><PersonDot name={s.full_name} url={s.avatar_url} />{s.full_name}</span></td>
                  <td className={`${tbl.td} text-right tabular-nums`}>{formatNumber(s.calls_in)}</td>
                  <td className={`${tbl.td} text-right tabular-nums`}>{formatNumber(s.calls_out)}</td>
                  <td className={`${tbl.td} text-right tabular-nums ${s.calls_missed ? "text-danger-text" : ""}`}>{formatNumber(s.calls_missed)}</td>
                  <td className={`${tbl.td} text-right tabular-nums whitespace-nowrap`}>{secs(s.talk_sec)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
