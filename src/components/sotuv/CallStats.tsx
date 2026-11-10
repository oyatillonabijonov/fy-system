// Qo'ng'iroqlar → Tahlil (090): per seller — calls analysed, average score, weekly trend, the most
// repeated mistakes. Admins/managers see every seller, a seller their own row. Admins edit the sales script.
import { useState } from "react"
import { useAuth } from "@/context/AuthContext"
import { isManager } from "@/lib/supabase/queries/auth"
import { tashkentToday } from "@/lib/period"
import { tbl } from "@/components/ui/table"
import { Sheet } from "@/components/ui/Sheet"
import { useMedia } from "@/hooks/useMedia"
import { Pager, usePaged } from "@/components/ui/Pager"
import { CallAnalysisSheet } from "@/components/sotuv/CallAnalysis"
import { formatPhone } from "@/lib/format"
import { useAnalysedCalls, useCallStats, useSalesScript, useSaveSalesScript } from "@/hooks/useCallAnalysis"
import { TAG_LABEL, scoreTone, type SellerStats } from "@/lib/supabase/queries/callAnalysis"

const PERIODS = [[7, "7 kun"], [30, "30 kun"], [90, "90 kun"]] as const
const daysAgo = (today: string, n: number) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10)
const PILL = "h-6 px-2 shrink-0 inline-flex items-center rounded-full text-xs font-semibold whitespace-nowrap tabular-nums"

const Score = ({ n }: { n: number | null }) =>
  n === null ? <span className="text-ink-faint">—</span> : <span className={`${PILL} ${scoreTone(n)}`}>{n}</span>

/** Weekly averages oldest → newest, each with ▲/▼ against the week before */
function Weeks({ weeks }: { weeks: SellerStats["weeks"] }) {
  const scored = weeks.filter((w) => w.avg !== null)
  if (!scored.length) return <span className="text-ink-faint">—</span>
  return (
    <span className="inline-flex items-center gap-2 text-sm tabular-nums whitespace-nowrap">
      {scored.map((w, i) => {
        const prev = scored[i - 1]?.avg ?? null
        const diff = prev === null ? 0 : w.avg! - prev
        return (
          <span key={w.week} title={`${w.week} haftasi · ${w.calls} ta suhbat`} className="inline-flex items-center gap-0.5 text-ink">
            {w.avg}
            {diff !== 0 && <span className={`text-xs ${diff > 0 ? "text-success-text" : "text-danger-text"}`}>{diff > 0 ? "▲" : "▼"}</span>}
          </span>
        )
      })}
    </span>
  )
}

const Tags = ({ tags }: { tags: SellerStats["tags"] }) =>
  tags.length === 0 ? <span className="text-ink-faint">—</span> : (
    <span className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <span key={t.tag} className="h-6 px-2 inline-flex items-center gap-1.5 rounded-full bg-danger-soft text-danger-text text-xs font-medium whitespace-nowrap">
          {TAG_LABEL[t.tag] ?? t.tag}<span className="tabular-nums opacity-70">{t.count}</span>
        </span>
      ))}
    </span>
  )

export function CallStats() {
  const { user, isAdmin } = useAuth()
  const [days, setDays] = useState<number>(30)
  const [scriptOpen, setScriptOpen] = useState(false)
  const cards = useMedia("(width < 64rem)") || !isManager(user)   // a seller has one row: a card reads better
  const today = tashkentToday()
  const from = daysAgo(today, days - 1)
  const { data: sellers = [], isLoading } = useCallStats(from, today)
  // The calls behind a seller's row; the first seller's are open from the start
  const [picked, setPicked] = useState<string | null>(null)
  const seller = sellers.find((s) => s.staff_id === picked) ?? sellers[0] ?? null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Davr" className="inline-flex gap-1 p-1 rounded-control bg-surface-sunken">
          {PERIODS.map(([n, label]) => (
            <button key={n} type="button" role="radio" aria-checked={days === n} onClick={() => setDays(n)}
              className={`h-7 px-3 rounded-item text-sm font-medium whitespace-nowrap transition-colors ${days === n ? "bg-surface text-ink" : "text-ink-muted hover:text-ink"}`}>{label}</button>
          ))}
        </div>
        {isAdmin && (
          <button type="button" onClick={() => setScriptOpen(true)}
            className="h-9 px-4 rounded-full bg-surface-sunken text-sm font-medium text-ink whitespace-nowrap hover:bg-surface-sunken-hover">Sotuv skripti</button>
        )}
      </div>

      {isLoading ? <p className={tbl.empty}>Yuklanmoqda…</p>
        : sellers.length === 0 ? <p className={tbl.empty}>Hali tahlil qilingan suhbat yo'q</p>
        : cards ? (
          <ul className="flex flex-col gap-3">
            {sellers.map((s) => (
              <li key={s.staff_id} role="button" tabIndex={0} aria-pressed={seller?.staff_id === s.staff_id}
                onClick={() => setPicked(s.staff_id)} onKeyDown={(e) => { if (e.key === "Enter") setPicked(s.staff_id) }}
                className={`rounded-surface bg-surface-sunken p-4 flex flex-col gap-3 cursor-pointer ${seller?.staff_id === s.staff_id && sellers.length > 1 ? "ring-2 ring-accent" : ""}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-base font-semibold text-ink truncate">{s.name}</span>
                  <Score n={s.avg_score} />
                </div>
                <div className="text-sm text-ink-muted">Tahlil qilingan: <span className="text-ink tabular-nums">{s.calls} ta suhbat</span></div>
                <div className="flex flex-col gap-1"><span className="text-xs text-ink-faint">Haftalik o'rtacha</span><Weeks weeks={s.weeks} /></div>
                <div className="flex flex-col gap-1"><span className="text-xs text-ink-faint">Ko'p takrorlangan xatolar</span><Tags tags={s.tags} /></div>
              </li>
            ))}
          </ul>
        ) : (
          <div className={tbl.scroll}>
            <table className={tbl.table}>
              <thead>
                <tr>
                  <th className={tbl.th}>Sotuvchi</th><th className={tbl.th}>Tahlil qilingan</th><th className={tbl.th}>O'rtacha baho</th>
                  <th className={tbl.th}>Haftalik</th><th className={tbl.th}>Ko'p takrorlangan xatolar</th>
                </tr>
              </thead>
              <tbody>
                {sellers.map((s) => (
                  <tr key={s.staff_id} tabIndex={0} aria-selected={seller?.staff_id === s.staff_id} title="Suhbatlarini ko'rish"
                    onClick={() => setPicked(s.staff_id)} onKeyDown={(e) => { if (e.key === "Enter") setPicked(s.staff_id) }}
                    className={`${tbl.tr} cursor-pointer ${seller?.staff_id === s.staff_id && sellers.length > 1 ? "bg-surface-sunken" : ""}`}>
                    <td className={`${tbl.td} font-medium whitespace-nowrap`}>{s.name}</td>
                    <td className={`${tbl.td} tabular-nums`}>{s.calls}</td>
                    <td className={tbl.td}><Score n={s.avg_score} /></td>
                    <td className={tbl.td}><Weeks weeks={s.weeks} /></td>
                    <td className={tbl.td}><Tags tags={s.tags} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      {seller && <SellerCalls key={`${seller.staff_id}-${days}`} seller={seller} from={from} to={today} />}
      <p className="text-xs text-ink-faint">Baholarni AI qo'yadi — xato bo'lishi mumkin. Bitta suhbatdan ko'ra haftalik o'zgarishga qarang.</p>

      {scriptOpen && <ScriptSheet onClose={() => setScriptOpen(false)} />}
    </div>
  )
}

const when = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" })
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`

/** A seller's analysed calls: a tap opens the full analysis */
function SellerCalls({ seller, from, to }: { seller: SellerStats; from: string; to: string }) {
  const { data: calls = [], isLoading } = useAnalysedCalls(seller.staff_id, from, to)
  const { page, setPage, pageCount, pageItems } = usePaged(calls)
  const [open, setOpen] = useState<string | null>(null)
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-base font-semibold text-ink px-1">{seller.name} — tahlil qilingan suhbatlar</h3>
      {isLoading ? <p className={tbl.empty}>Yuklanmoqda…</p> : (
        <ul className="rounded-surface bg-surface-sunken overflow-hidden">
          {pageItems.map((c) => (
            <li key={c.uuid} className="border-b border-line last:border-b-0">
              <button type="button" onClick={() => setOpen(c.uuid)}
                className="w-full min-h-14 px-4 py-2.5 flex items-center gap-3 text-left transition-colors hover:bg-surface-sunken-hover">
                <Score n={c.analysis.score} />
                <span className="flex-1 min-w-0 flex flex-col">
                  <span className="text-sm font-medium text-ink truncate">{c.client?.full_name ?? formatPhone(c.phone)}</span>
                  <span className="text-sm text-ink-muted truncate tabular-nums">
                    {when(c.started_at)} · {c.direction === "in" ? "Kiruvchi" : "Chiquvchi"} · {clock(c.talk_time)}{c.analysis.outcome ? ` · ${c.analysis.outcome}` : ""}
                  </span>
                </span>
                <span className="text-sm font-medium text-ink whitespace-nowrap shrink-0">Tahlilni ochish</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} pageCount={pageCount} total={calls.length} onPage={setPage} />
      <CallAnalysisSheet uuid={open} onClose={() => setOpen(null)} />
    </section>
  )
}

function ScriptSheet({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const { data: saved, isLoading } = useSalesScript()
  const save = useSaveSalesScript()
  const [draft, setDraft] = useState<string | null>(null)   // null = untouched, shows what's saved
  const body = draft ?? saved ?? ""
  return (
    <Sheet open onClose={onClose} title="Sotuv skripti" className="sm:max-w-2xl"
      footer={
        <button type="button" disabled={isLoading || save.isPending || draft === null}
          onClick={() => save.mutate({ body: body.trim(), userId: user?.id ?? null }, { onSuccess: onClose })}
          className="h-12 w-full rounded-full bg-accent text-ink-on-accent text-base font-semibold disabled:opacity-40">Saqlash</button>
      }>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-muted">To'ldirilsa, AI har bir suhbatni shu skript bilan solishtiradi. Bo'sh bo'lsa — umumiy sotuv qoidalari bo'yicha baholaydi.</p>
        <textarea value={body} onChange={(e) => setDraft(e.target.value)} rows={14} aria-label="Sotuv skripti"
          placeholder={"1. Salomlashish va o'zini tanishtirish\n2. Mijozning biznesi haqida so'rash\n3. …"}
          className="w-full rounded-control bg-surface-sunken p-3 text-base text-ink placeholder:text-ink-faint outline-none focus:ring-2 focus:ring-accent" />
      </div>
    </Sheet>
  )
}
