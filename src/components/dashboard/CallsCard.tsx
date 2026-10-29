import { PhoneIncoming, PhoneOutgoing, PhoneX, Clock } from "@phosphor-icons/react"
import type { SalesDashboard, SalesSeller } from "@/lib/supabase/queries/salesDashboard"
import { secs } from "@/components/sotuv/ui"
import { tbl } from "@/components/ui/table"
import { PersonDot } from "@/components/vazifalar/pickers"
import { formatNumber } from "@/lib/format"
import { DotRing } from "./charts"

/** Period totals, then the same per seller (only those who called) */
export function CallsCard({ calls: c, sellers }: { calls: SalesDashboard["calls"]; sellers: SalesSeller[] }) {
  const back = c.missed ? (c.missed_called_back / c.missed) * 100 : null
  const answered = c.in ? ((c.in - c.missed) / c.in) * 100 : null
  const tiles = [
    { label: "Kiruvchi", icon: <PhoneIncoming size={16} />, value: formatNumber(c.in) },
    { label: "Chiquvchi", icon: <PhoneOutgoing size={16} />, value: formatNumber(c.out) },
    { label: "Javobsiz", icon: <PhoneX size={16} />, value: formatNumber(c.missed), danger: c.missed > 0 },
    { label: "Gaplashilgan", icon: <Clock size={16} />, value: secs(c.talk_sec), hint: `o'rtacha ${secs(c.avg_talk_sec)}` },
  ]
  const callers = sellers.filter((s) => s.calls_in + s.calls_out > 0)
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-surface-sunken rounded-surface p-5">
          <DotRing id="answered" value={answered} color="#059669" caption={`Kiruvchiga javob berildi · ${formatNumber(c.in - c.missed)} / ${formatNumber(c.in)}`} />
        </div>
        <div className="bg-surface-sunken rounded-surface p-5">
          <DotRing id="callback" value={back} caption={`Javobsizga qayta qo'ng'iroq · ${formatNumber(c.missed_called_back)} / ${formatNumber(c.missed)}`} />
        </div>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="bg-surface-sunken rounded-surface px-3 sm:px-4 py-3 flex flex-col gap-1 min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-medium text-ink-muted whitespace-nowrap">{t.icon}{t.label}</span>
            <span className={`text-base sm:text-lg font-semibold tabular-nums ${t.danger ? "text-danger-text" : "text-ink"}`}>{t.value}</span>
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

/** Phone version: two progress bars, four compact tiles and the callers as an inset list */
export function CallsMobile({ calls: c, sellers }: { calls: SalesDashboard["calls"]; sellers: SalesSeller[] }) {
  const back = c.missed ? Math.round((c.missed_called_back / c.missed) * 100) : null
  const answered = c.in ? Math.round(((c.in - c.missed) / c.in) * 100) : null
  const bars = [
    { label: "Kiruvchiga javob berildi", value: answered, of: `${formatNumber(c.in - c.missed)} / ${formatNumber(c.in)}`, fill: "bg-success" },
    { label: "Javobsizga qayta qo'ng'iroq", value: back, of: `${formatNumber(c.missed_called_back)} / ${formatNumber(c.missed)}`, fill: "bg-info" },
  ]
  const tiles = [
    { label: "Kiruvchi", value: formatNumber(c.in) },
    { label: "Chiquvchi", value: formatNumber(c.out) },
    { label: "Javobsiz", value: formatNumber(c.missed), danger: c.missed > 0 },
    { label: "Gaplashilgan", value: secs(c.talk_sec), hint: `o'rtacha ${secs(c.avg_talk_sec)}` },
  ]
  const callers = sellers.filter((s) => s.calls_in + s.calls_out > 0)
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        {tiles.slice(0, 3).map((t) => (
          <div key={t.label} className="bg-surface-sunken rounded-surface p-4 flex flex-col gap-1 min-w-0">
            <span className="text-sm text-ink-muted truncate">{t.label}</span>
            <span className={`text-2xl font-semibold tabular-nums ${t.danger ? "text-danger-text" : "text-ink"}`}>{t.value}</span>
          </div>
        ))}
      </div>
      <div className="bg-surface-sunken rounded-surface px-4 py-3 flex items-center justify-between gap-3">
        <span className="flex flex-col min-w-0">
          <span className="flex items-center gap-1.5 text-sm text-ink-muted"><Clock size={16} />Gaplashilgan</span>
          <span className="text-xs text-ink-faint">{tiles[3].hint}</span>
        </span>
        <span className="text-xl font-semibold tabular-nums text-ink whitespace-nowrap">{tiles[3].value}</span>
      </div>
      <div className="bg-surface-sunken rounded-surface p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
        {bars.map((b) => (
          <div key={b.label} className="flex flex-col gap-2 min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-ink-muted truncate">{b.label}</span>
              <span className="text-base font-semibold tabular-nums text-ink">{b.value === null ? "—" : `${b.value}%`}</span>
            </div>
            <div className="h-2 rounded-full bg-mute-soft overflow-hidden"><div className={`h-full rounded-full ${b.fill}`} style={{ width: `${b.value ?? 0}%` }} /></div>
            <span className="text-xs text-ink-faint tabular-nums">{b.of}</span>
          </div>
        ))}
      </div>
      {callers.length > 0 && (
        <div className="bg-surface-sunken rounded-surface overflow-hidden">
          {callers.map((s) => (
            <div key={s.id} className="min-h-16 px-4 py-3 flex items-center gap-3 border-b border-line last:border-0">
              <PersonDot name={s.full_name} url={s.avatar_url} size={40} />
              <span className="flex-1 min-w-0">
                <span className="block text-base font-medium text-ink truncate">{s.full_name}</span>
                <span className="block text-sm text-ink-muted tabular-nums truncate">{formatNumber(s.calls_in)} kiruvchi · {formatNumber(s.calls_out)} chiquvchi</span>
              </span>
              <span className="shrink-0 flex flex-col items-end gap-0.5">
                <span className="text-base font-semibold tabular-nums text-ink whitespace-nowrap">{secs(s.talk_sec)}</span>
                {s.calls_missed > 0 && <span className="text-xs font-medium text-danger-text tabular-nums">{s.calls_missed} javobsiz</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
