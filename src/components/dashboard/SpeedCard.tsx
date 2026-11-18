import type { SalesDashboard } from "@/lib/supabase/queries/salesDashboard"
import { tbl } from "@/components/ui/table"
import { formatNumber } from "@/lib/format"
import { Empty } from "./pieces"

const mins = (m: number | null) =>
  m === null ? "—"
  : m < 60 ? `${Math.round(m)} daq`
  : m < 1440 ? `${Math.floor(m / 60)} soat ${Math.round(m % 60)} daq`
  : `${Math.floor(m / 1440)} kun ${Math.round((m % 1440) / 60)} soat`

const TARGET = 15   // working minutes to the first call

/** Form lead → first outgoing call (103). Working time = 09:00–18:00, Mon–Sat: a night lead counts from 09:00.
 *  `compact`: no per-seller table. */
export function SpeedCard({ speed: s, compact = false }: { speed: SalesDashboard["speed"]; compact?: boolean }) {
  if (s.leads === 0) return <div className="bg-surface-sunken rounded-surface"><Empty text="Davrda formadan lid kelmagan" /></div>
  const tiles = [
    { label: "Median · ish vaqtida", value: mins(s.median_biz_min), bad: (s.median_biz_min ?? 0) > TARGET, hint: `maqsad: ${TARGET} daqiqagacha` },
    { label: "O'rtacha · ish vaqtida", value: mins(s.avg_biz_min), hint: "09:00–18:00, Du–Sha" },
    { label: "Median · umumiy", value: mins(s.median_min), hint: `o'rtacha ${mins(s.avg_min)}` },
    { label: "Qo'ng'iroq kutyapti", value: formatNumber(s.waiting), bad: s.waiting > 0, hint: `${formatNumber(s.called)} / ${formatNumber(s.leads)} lidga qo'ng'iroq qilingan` },
  ]
  const bands = [
    { label: "15 daqiqagacha", n: s.lt15, color: "bg-success" }, { label: "15–60 daqiqa", n: s.lt60, color: "bg-info" },
    { label: "1–4 soat", n: s.lt240, color: "bg-warning" }, { label: "4 soatdan ko'p", n: s.gt240, color: "bg-danger" },
  ]
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="bg-surface-sunken rounded-surface px-3 sm:px-4 py-3 flex flex-col gap-1 min-w-0">
            <span className="text-sm font-medium text-ink-muted truncate">{t.label}</span>
            <span className={`text-base sm:text-lg font-semibold tabular-nums whitespace-nowrap ${t.bad ? "text-danger-text" : "text-ink"}`}>{t.value}</span>
            <span className="text-xs text-ink-faint">{t.hint}</span>
          </div>
        ))}
      </div>
      {s.called > 0 && (
        <div className="bg-surface-sunken rounded-surface p-4 sm:p-5 flex flex-col gap-3">
          <span className="text-sm font-medium text-ink-muted">Birinchi qo'ng'iroq ish vaqtida qancha kutdi</span>
          <div className="flex h-2 gap-0.5 rounded-full overflow-hidden">
            {bands.filter((b) => b.n > 0).map((b) => <span key={b.label} className={b.color} style={{ flexGrow: b.n, flexBasis: 0 }} />)}
          </div>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-x-4 gap-y-2">
            {bands.map((b) => (
              <span key={b.label} className="flex items-center gap-1.5 text-sm text-ink-muted min-w-0">
                <span className={`size-2.5 rounded-[3px] shrink-0 ${b.color}`} />
                <span className="truncate">{b.label}</span>
                <span className="ml-auto font-medium tabular-nums text-ink whitespace-nowrap">{formatNumber(b.n)} · {Math.round((b.n / s.called) * 100)}%</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {!compact && s.by_seller.length > 0 && (
        <div className={tbl.scroll}>
          <table className={tbl.table}>
            <thead>
              <tr>
                <th className={tbl.th}>Bitim egasi</th><th className={`${tbl.th} text-right`}>Lid</th>
                <th className={`${tbl.th} text-right`}>Qo'ng'iroq qilindi</th><th className={`${tbl.th} text-right`}>Median · ish vaqtida</th>
                <th className={`${tbl.th} text-right`}>Kutyapti</th>
              </tr>
            </thead>
            <tbody>
              {s.by_seller.map((r) => (
                <tr key={r.id ?? "none"} className={tbl.tr}>
                  <td className={`${tbl.td} whitespace-nowrap ${r.full_name ? "" : "text-ink-muted"}`}>{r.full_name ?? "Mas'ulsiz"}</td>
                  <td className={`${tbl.td} text-right tabular-nums`}>{formatNumber(r.leads)}</td>
                  <td className={`${tbl.td} text-right tabular-nums`}>{formatNumber(r.called)}</td>
                  <td className={`${tbl.td} text-right tabular-nums whitespace-nowrap ${(r.median_biz_min ?? 0) > TARGET ? "text-danger-text" : ""}`}>{mins(r.median_biz_min)}</td>
                  <td className={`${tbl.td} text-right tabular-nums ${r.waiting ? "text-danger-text font-medium" : ""}`}>{formatNumber(r.waiting)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
