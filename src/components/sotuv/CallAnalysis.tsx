// AI analysis of a call (090): a score badge on the call row, the full analysis in a sheet.
import { useState, type ReactNode } from "react"
import { useAuth } from "@/context/AuthContext"
import { Sheet } from "@/components/ui/Sheet"
import { Recording } from "@/components/sotuv/ui"
import { useCallAnalysis, useRequeueAnalysis } from "@/hooks/useCallAnalysis"
import { TAG_LABEL, scoreTone, type CallAnalysis } from "@/lib/supabase/queries/callAnalysis"
import type { Call } from "@/lib/supabase/queries/sotuv"

const PILL = "h-6 px-2 shrink-0 inline-flex items-center rounded-full text-xs font-semibold whitespace-nowrap tabular-nums"

/** The call's score; a tap opens the analysis. Renders nothing when there is none (or it isn't the reader's call) */
export function CallScore({ call }: { call: Pick<Call, "uuid" | "analysis"> }) {
  const [open, setOpen] = useState(false)
  const a = call.analysis
  if (!a || a.status === "skipped") return null
  if (a.status === "pending") return <span className="text-xs text-ink-faint whitespace-nowrap">Tahlil qilinmoqda…</span>
  const label = a.status === "failed" ? "Tahlil bo'lmadi" : a.score === null ? "Tahlil" : String(a.score)
  return (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        aria-label={a.status === "done" && a.score !== null ? `Tahlil: ${a.score} ball` : label} title="Suhbat tahlili"
        className={`${PILL} transition-opacity hover:opacity-80 ${a.status === "done" && a.score !== null ? scoreTone(a.score) : "bg-surface text-ink-muted"}`}>{label}</button>
      <CallAnalysisSheet uuid={open ? call.uuid : null} onClose={() => setOpen(false)} />
    </>
  )
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="flex flex-col gap-2">
    <h4 className="text-sm font-semibold text-ink">{title}</h4>
    {children}
  </section>
)
const Bullets = ({ items }: { items: string[] }) => (
  <ul className="flex flex-col gap-1.5 text-sm text-ink list-disc pl-5">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
)

export function CallAnalysisSheet({ uuid, onClose }: { uuid: string | null; onClose: () => void }) {
  const { data: a, isLoading } = useCallAnalysis(uuid)
  return (
    <Sheet open={!!uuid} onClose={onClose} title="Suhbat tahlili" className="sm:max-w-2xl">
      {isLoading ? <p className="text-sm text-ink-muted py-6">Yuklanmoqda…</p>
        : !a ? <p className="text-sm text-ink-muted py-6">Tahlil topilmadi.</p>
        : <Body a={a} />}
    </Sheet>
  )
}

function Body({ a }: { a: CallAnalysis }) {
  const { isAdmin } = useAuth()
  const requeue = useRequeueAnalysis()
  if (a.status !== "done") {
    return (
      <div className="flex flex-col gap-3 py-2">
        <p className="text-sm text-ink">
          {a.status === "pending" ? "Tahlil qilinmoqda — bir necha daqiqada tayyor bo'ladi." : a.status === "skipped" ? "Bu qo'ng'iroq tahlil qilinmadi." : "Tahlil qilib bo'lmadi."}
        </p>
        {a.error && <p className="text-sm text-ink-muted break-words">{a.error}</p>}
        {a.status === "failed" && isAdmin && (
          <button type="button" disabled={requeue.isPending} onClick={() => requeue.mutate(a.call_uuid)}
            className="self-start h-10 px-4 rounded-full bg-accent text-ink-on-accent text-sm font-semibold disabled:opacity-40">Qayta tahlil</button>
        )}
        <Recording uuid={a.call_uuid} />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-3">
          {a.score === null
            ? <span className="text-lg font-semibold text-ink-muted">Baho qo'yilmadi</span>
            : <span className="text-4xl font-semibold text-ink tabular-nums">{a.score}<span className="text-base text-ink-faint"> / 100</span></span>}
          {a.outcome && <span className="h-6 px-2 inline-flex items-center rounded-full bg-surface-sunken text-xs font-medium text-ink">{a.outcome}</span>}
        </div>
        {a.summary && <p className="text-sm text-ink">{a.summary}</p>}
        <p className="text-xs text-ink-faint">AI tahlili — xato bo'lishi mumkin</p>
      </div>

      {!!a.criteria?.length && (
        <Section title="Mezonlar">
          <ul className="flex flex-col rounded-surface bg-surface-sunken">
            {a.criteria.map((c, i) => (
              <li key={i} className="flex gap-3 px-3 py-2.5 border-b border-line last:border-b-0">
                <span className={`${PILL} mt-0.5 w-9 justify-center ${c.score === null ? "bg-surface text-ink-faint" : scoreTone(c.score * 10)}`}>{c.score ?? "—"}</span>
                <span className="flex-1 min-w-0 flex flex-col">
                  <span className="text-sm font-medium text-ink">{c.name}</span>
                  <span className="text-sm text-ink-muted">{c.comment}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {!!a.good?.length && <Section title="Yaxshi qilgani"><Bullets items={a.good} /></Section>}

      {!!a.mistakes?.length && (
        <Section title="Xatolar">
          {a.mistakes.map((m, i) => (
            <div key={i} className="flex flex-col gap-1.5 rounded-surface bg-surface-sunken p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {m.t && <span className="text-xs text-ink-faint tabular-nums">{m.t}</span>}
                <span className="h-6 px-2 inline-flex items-center rounded-full bg-danger-soft text-danger-text text-xs font-medium whitespace-nowrap">{TAG_LABEL[m.tag] ?? m.tag}</span>
              </div>
              <p className="text-ink">«{m.quote}»</p>
              <p className="text-ink-muted"><span className="font-semibold text-ink">Nega: </span>{m.why}</p>
              <p className="text-ink-muted"><span className="font-semibold text-ink">O'rniga: </span>«{m.better}»</p>
            </div>
          ))}
        </Section>
      )}

      {!!a.words?.length && (
        <Section title="Tashlab yuboriladigan so'zlar">
          <ul className="flex flex-col gap-1.5 text-sm">
            {a.words.map((w, i) => (
              <li key={i} className="text-ink-muted"><span className="font-semibold text-ink">{w.word}</span>{w.count ? <span className="tabular-nums"> × {w.count}</span> : null} — {w.why}</li>
            ))}
          </ul>
        </Section>
      )}

      {!!a.advice?.length && <Section title="Tavsiyalar"><Bullets items={a.advice} /></Section>}
      {!!a.script_missed?.length && <Section title="Skriptdan tushib qolgani"><Bullets items={a.script_missed} /></Section>}

      <Section title="Yozuv"><Recording uuid={a.call_uuid} /></Section>

      {!!a.transcript?.length && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-ink">Suhbat matni</summary>
          <div className="mt-3 flex flex-col gap-2 text-sm">
            {a.transcript.map((l, i) => (
              <p key={i} className={l.who === "seller" ? "text-ink" : "text-ink-muted"}>
                <span className="text-xs text-ink-faint tabular-nums">{l.t} </span>
                <span className="font-semibold">{l.who === "seller" ? "Sotuvchi" : "Mijoz"}: </span>{l.text}
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
