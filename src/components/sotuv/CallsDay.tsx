// Qo'ng'iroqlar → one day in numbers (107): how many calls, how many were picked up and how many weren't —
// outgoing and incoming apart, as a split bar each. Presentational: the page feeds it, so it can be looked at
// with fixtures.
import { CaretLeft, CaretRight, PhoneIncoming, PhoneOutgoing, Timer } from "@phosphor-icons/react"
import type { CallsDaySummary } from "@/lib/supabase/queries/sotuv"
import { addDays } from "@/components/vazifalar/pickers"
import { dayLabel } from "@/lib/telegram"
import { secs } from "@/components/sotuv/ui"

const ARROW = "size-8 shrink-0 rounded-full flex items-center justify-center text-ink-muted hover:bg-mute-ghost-hover hover:text-ink disabled:opacity-30 disabled:pointer-events-none"

export function CallsDay({ day, today, onDay, data, mine }: { day: string; today: string; onDay: (d: string) => void; data: CallsDaySummary | undefined; mine: boolean }) {
  const total = data ? data.out + data.in : 0
  return (
    <section aria-label="Kunlik qo'ng'iroqlar" className="rounded-surface bg-surface-sunken p-4 lg:p-5 flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
        <button type="button" aria-label="Oldingi kun" onClick={() => onDay(addDays(day, -1))} className={ARROW}><CaretLeft size={16} /></button>
        <h2 className="min-w-20 text-center text-base font-semibold text-ink whitespace-nowrap">{dayLabel(`${day}T07:00:00Z`, today)}</h2>
        <button type="button" aria-label="Keyingi kun" disabled={day >= today} onClick={() => onDay(addDays(day, 1))} className={ARROW}><CaretRight size={16} /></button>
        <span className="sm:ml-2 max-sm:basis-full max-sm:px-1 text-sm text-ink-muted">
          {!data ? "Hisoblanmoqda…" : total === 0 ? "Qo'ng'iroq bo'lmagan" : <><b className="text-ink tabular-nums">{total}</b> ta qo'ng'iroq · {data.numbers} ta raqam{mine ? " · faqat meniki" : ""}</>}
        </span>
      </header>
      <div className="grid gap-x-8 max-sm:gap-x-5 gap-y-4 grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
        <Split icon={<PhoneOutgoing size={16} />} title="Chiquvchi" total={data?.out} yes={data?.out_answered} yesLabel="ko'tardi" noLabel="ko'tarmadi" noClass="bg-mute-soft-hover" />
        <Split icon={<PhoneIncoming size={16} />} title="Kiruvchi" total={data?.in} yes={data?.in_answered} yesLabel="javob berildi" noLabel="javobsiz" noClass="bg-danger" noText="text-danger-text" />
        <div className="col-span-2 lg:col-span-1 lg:min-w-40 flex lg:flex-col max-lg:items-baseline max-lg:justify-between gap-1.5">
          <span className="flex items-center gap-1.5 text-sm font-medium text-ink-muted"><Timer size={16} />Gaplashildi</span>
          <span className="text-xl max-lg:text-base font-semibold text-ink tabular-nums whitespace-nowrap">{data ? secs(data.talk_sec) : "—"}</span>
        </div>
      </div>
    </section>
  )
}

/** A direction: its total, then answered vs not as one bar and the two counts under it */
function Split({ icon, title, total, yes, yesLabel, noLabel, noClass, noText = "text-ink-muted" }: {
  icon: React.ReactNode; title: string; total: number | undefined; yes: number | undefined; yesLabel: string; noLabel: string; noClass: string; noText?: string
}) {
  const t = total ?? 0, y = yes ?? 0, n = t - y
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <span className="flex items-center gap-1.5 text-sm font-medium text-ink-muted">{icon}{title}</span>
      <span className="flex items-baseline gap-2">
        <span className="text-xl font-semibold text-ink tabular-nums">{total ?? "—"}</span>
        {t > 0 && <span className="text-sm text-ink-muted tabular-nums">{Math.round((y / t) * 100)}% {yesLabel}</span>}
      </span>
      <span className="flex h-2 rounded-full overflow-hidden bg-surface" role="img" aria-label={`${y} ${yesLabel}, ${n} ${noLabel}`}>
        {y > 0 && <span className="bg-success" style={{ width: `${(y / t) * 100}%` }} />}
        {n > 0 && <span className={noClass} style={{ width: `${(n / t) * 100}%` }} />}
      </span>
      {total !== undefined && (
        <span className="flex flex-wrap gap-x-4 text-sm tabular-nums">
          <span className="text-ink whitespace-nowrap"><b>{y}</b> {yesLabel}</span>
          <span className={`whitespace-nowrap ${n > 0 ? noText : "text-ink-faint"}`}><b>{n}</b> {noLabel}</span>
        </span>
      )}
    </div>
  )
}
