import { useState } from "react"
import { PhoneIncoming, PhoneOutgoing, PhoneX, Clock, CaretDown } from "@phosphor-icons/react"
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

/** Phone version: the three counts and one "answered" bar; the rest (talk time, call-back bar, the callers)
 *  sits behind "Batafsil" */
export function CallsMobile({ calls: c, sellers }: { calls: SalesDashboard["calls"]; sellers: SalesSeller[] }) {
  const [more, setMore] = useState(false)
  const back = c.missed ? Math.round((c.missed_called_back / c.missed) * 100) : null
  const answered = c.in ? Math.round(((c.in - c.missed) / c.in) * 100) : null
  const counts = [
    { label: "Kiruvchi", value: formatNumber(c.in), danger: false },
    { label: "Chiquvchi", value: formatNumber(c.out), danger: false },
    { label: "Javobsiz", value: formatNumber(c.missed), danger: c.missed > 0 },
  ]
  const callers = sellers.filter((s) => s.calls_in + s.calls_out > 0)
  return (
    <div className="bg-surface-sunken rounded-surface p-4 flex flex-col gap-4">
      <div className="grid grid-cols-3 divide-x divide-line">
        {counts.map((t, i) => (
          <div key={t.label} className={`flex flex-col gap-1 min-w-0 ${i > 0 ? "pl-4" : ""}`}>
            <span className="text-sm text-ink-muted truncate">{t.label}</span>
            <span className={`text-2xl font-semibold tabular-nums ${t.danger ? "text-danger-text" : "text-ink"}`}>{t.value}</span>
          </div>
        ))}
      </div>
      <Bar label="Javob berildi" value={answered} fill="bg-success" />
      <button type="button" onClick={() => setMore(!more)} aria-expanded={more}
        className="-mb-1 h-10 -mx-1 px-1 flex items-center justify-between rounded-full text-sm font-medium text-ink-muted active:opacity-80">
        Batafsil
        <CaretDown size={16} className={`text-ink-faint transition-transform ${more ? "rotate-180" : ""}`} />
      </button>
      {more && (
        <div className="flex flex-col gap-4 pt-3 border-t border-line">
          <div className="flex items-center justify-between gap-3">
            <span className="flex flex-col min-w-0">
              <span className="text-base text-ink">Gaplashilgan</span>
              <span className="text-sm text-ink-muted tabular-nums">o'rtacha {secs(c.avg_talk_sec)}</span>
            </span>
            <span className="text-base font-semibold tabular-nums text-ink whitespace-nowrap">{secs(c.talk_sec)}</span>
          </div>
          <Bar label="Javobsizga qayta qo'ng'iroq" value={back} fill="bg-info" />
          {callers.length > 0 && (
            <div className="flex flex-col">
              {callers.map((s) => (
                <div key={s.id} className="min-h-14 py-2 flex items-center gap-3 border-t border-line first:border-t-0">
                  <PersonDot name={s.full_name} url={s.avatar_url} size={40} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-base font-medium text-ink truncate">{s.full_name}</span>
                    <span className="block text-sm text-ink-muted tabular-nums truncate">{formatNumber(s.calls_in)} kiruvchi · {formatNumber(s.calls_out)} chiquvchi</span>
                  </span>
                  <span className="shrink-0 flex flex-col items-end gap-0.5">
                    <span className="text-base font-semibold tabular-nums text-ink whitespace-nowrap">{secs(s.talk_sec)}</span>
                    {s.calls_missed > 0 && <span className="h-5 px-2 inline-flex items-center rounded-full bg-danger-soft text-danger-dark text-xs font-medium tabular-nums">{s.calls_missed} javobsiz</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Label + percentage over a track that stays visible on a white card (bg-fill) */
function Bar({ label, value, fill }: { label: string; value: number | null; fill: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-base text-ink truncate">{label}</span>
        <span className="text-base font-semibold tabular-nums text-ink">{value === null ? "—" : `${value}%`}</span>
      </div>
      <div className="h-2 rounded-full bg-fill overflow-hidden"><div className={`h-full rounded-full ${fill}`} style={{ width: `${value ?? 0}%` }} /></div>
    </div>
  )
}
