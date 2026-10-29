import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneX, ArrowRight, Plus, Play, X } from "@phosphor-icons/react"
import { useAuth } from "@/context/AuthContext"
import { usePhone } from "@/context/PhoneContext"
import { useCalls, usePipelines, useStages, SOTUV_KEY } from "@/hooks/useSotuv"
import { subscribeCalls, canonPhone, type CallFilter, type CallRow } from "@/lib/supabase/queries/sotuv"
import { formatPhone } from "@/lib/format"
import { tbl } from "@/components/ui/table"
import { Pager } from "@/components/ui/Pager"
import { PersonDot } from "@/components/vazifalar/pickers"
import { LeadCreate } from "@/components/sotuv/LeadCreate"
import { useMedia } from "@/hooks/useMedia"
import { CallButton, EmptyNote, Recording, SotuvSegments, callLabel, secs } from "@/components/sotuv/ui"

const FILTERS: [CallFilter, string][] = [["all", "Hammasi"], ["in", "Kiruvchi"], ["out", "Chiquvchi"], ["missed", "Javobsiz"]]
const when = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" })

/** Sotuv bo'limi → Qo'ng'iroqlar: every PBX call, newest first; call back, open or create the bitim */
export function SotuvCalls() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<CallFilter>("all")
  const [mine, setMine] = useState(false)
  const [page, setPage] = useState(0)
  const mobile = useMedia("(width < 64rem)")
  const [creating, setCreating] = useState<string | null>(null)   // phone of a call with no bitim
  const { data, isLoading } = useCalls({ page, filter, staffId: mine ? user?.id ?? null : null })
  const { data: pipelines = [] } = usePipelines()
  const umumiy = pipelines[0] ?? null   // "Umumiy" is first (075)
  const { data: stages = [] } = useStages(umumiy?.id ?? null)
  const rows = data?.rows ?? []
  const total = data?.total ?? 0

  // A call is logged ~1 min after it ends — the list follows
  useEffect(() => subscribeCalls(() => qc.invalidateQueries({ queryKey: [...SOTUV_KEY, "calls-page"] })), [qc])

  const choose = (f: CallFilter) => { setFilter(f); setPage(0) }

  if (mobile) {
    return (
      <div className="flex flex-col gap-3 pb-6">
        <SotuvSegments active="calls" onPick={(t) => navigate(t === "deals" ? "/sotuv" : t === "tasks" ? "/sotuv?v=tasks" : "/sotuv/qongiroqlar")} />
        <div role="radiogroup" aria-label="Qo'ng'iroq turi" className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:-mx-6 sm:px-6">
          {FILTERS.map(([id, label]) => (
            <button key={id} role="radio" aria-checked={filter === id} onClick={() => choose(id)}
              className={`shrink-0 h-9 px-3.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${filter === id ? "bg-accent text-ink-on-accent" : "bg-surface-sunken text-ink"}`}>{label}</button>
          ))}
          <button type="button" aria-pressed={mine} onClick={() => { setMine(!mine); setPage(0) }}
            className={`shrink-0 h-9 px-3.5 rounded-full text-sm font-medium whitespace-nowrap border transition-colors ${mine ? "bg-accent text-ink-on-accent border-transparent" : "border-line text-ink"}`}>Mening</button>
        </div>
        <p className="text-sm text-ink-muted tabular-nums px-1"><span className="font-semibold text-ink">{total} ta</span> qo'ng'iroq</p>
        {isLoading ? <EmptyNote icon={PhoneX} text="Yuklanmoqda…" />
          : rows.length === 0 ? <EmptyNote icon={PhoneX} text="Qo'ng'iroq yo'q" />
          : <ul className="rounded-surface bg-surface-sunken overflow-hidden">
              {rows.map((c) => <CallRowCard key={c.uuid} call={c} onCreate={setCreating} />)}
            </ul>}
        <Pager page={page} pageCount={Math.max(1, Math.ceil(total / 20))} total={total} onPage={setPage} />
        {creating && umumiy && (
          <LeadCreate pipelineId={umumiy.id} stages={stages} stageId={null} initialPhone={creating}
            onClose={() => setCreating(null)} onCreated={(id) => navigate(`/sotuv/bitim/${id}`)} />
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Qo'ng'iroq turi" className="inline-flex gap-1 p-1 rounded-control bg-surface-sunken">
          {FILTERS.map(([id, label]) => (
            <button key={id} role="radio" aria-checked={filter === id} onClick={() => choose(id)}
              className={`h-7 px-3 rounded-item text-sm font-medium transition-colors ${filter === id ? "bg-surface text-ink" : "text-ink-muted hover:text-ink"}`}>{label}</button>
          ))}
        </div>
        <div role="radiogroup" aria-label="Kimniki" className="inline-flex gap-1 p-1 rounded-control bg-surface-sunken">
          {([[false, "Hamma hodimlar"], [true, "Mening"]] as const).map(([v, label]) => (
            <button key={label} role="radio" aria-checked={mine === v} onClick={() => { setMine(v); setPage(0) }}
              className={`h-7 px-3 rounded-item text-sm font-medium transition-colors ${mine === v ? "bg-surface text-ink" : "text-ink-muted hover:text-ink"}`}>{label}</button>
          ))}
        </div>
        <span className="text-sm text-ink-muted tabular-nums">{total} ta qo'ng'iroq</span>
      </div>

      <div className={tbl.scroll}>
        <table className={tbl.table}>
          <thead>
            <tr>
              <th className={tbl.th}>Qo'ng'iroq</th><th className={tbl.th}>Kim bilan</th><th className={tbl.th}>Hodim</th>
              <th className={tbl.th}>Vaqt</th><th className={tbl.th}>Yozuv</th><th className={`${tbl.th} text-right`}>Amallar</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td colSpan={6} className={tbl.empty}>Yuklanmoqda…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={6} className={tbl.empty}>Qo'ng'iroq yo'q</td></tr>
              : rows.map((c) => <CallRowView key={c.uuid} call={c} onCreate={setCreating} />)}
          </tbody>
        </table>
      </div>
      <Pager page={page} pageCount={Math.max(1, Math.ceil(total / 20))} total={total} onPage={setPage} />

      {creating && umumiy && (
        <LeadCreate pipelineId={umumiy.id} stages={stages} stageId={null} initialPhone={creating}
          onClose={() => setCreating(null)} onCreated={(id) => navigate(`/sotuv/bitim/${id}`)} />
      )}
    </div>
  )
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`

/** Phone: one call as a list row — direction, who, staff · when · how long; ▶ and call on the right; a tap opens (or makes) the bitim */
function CallRowCard({ call: c, onCreate }: { call: CallRow; onCreate: (phone: string) => void }) {
  const navigate = useNavigate()
  const [listening, setListening] = useState(false)
  const missed = c.talk_time === 0
  const Icon = c.direction === "in" ? PhoneIncoming : PhoneOutgoing
  const phone = c.phone ? canonPhone(c.phone) : ""
  const who = c.client?.full_name ?? formatPhone(phone)
  const meta = [c.staff?.full_name.split(" ")[0] ?? c.ext, when(c.started_at), missed ? "Javobsiz" : clock(c.talk_time)].filter(Boolean).join(" · ")
  const act = c.lead_id ? () => navigate(`/sotuv/bitim/${c.lead_id}`) : phone ? () => onCreate(phone) : undefined
  const round = "size-10 shrink-0 rounded-full flex items-center justify-center"
  return (
    <li className="border-b border-line last:border-b-0">
      <div role={act ? "button" : undefined} tabIndex={act ? 0 : undefined} onClick={act} onKeyDown={(e) => { if (act && e.key === "Enter") act() }}
        aria-label={act ? (c.lead_id ? `${who} — bitimni ochish` : `${who} — bitim yaratish`) : undefined}
        className={`min-h-16 px-4 py-3 flex items-center gap-3 ${act ? "cursor-pointer active:bg-mute-ghost-hover" : ""}`}>
        <span className={`${round} ${missed ? "bg-danger-soft text-danger-text" : "bg-surface text-ink-muted"}`}><Icon size={20} /></span>
        <span className="flex-1 min-w-0 flex flex-col">
          <span className={`text-base font-medium line-clamp-1 ${missed ? "text-danger-text" : "text-ink"}`}>{who}</span>
          <span className="text-sm text-ink-muted line-clamp-2">{meta}</span>
          {!c.lead_id && phone && <span className="mt-1 self-start inline-flex items-center gap-1 h-6 px-2 rounded-full bg-warning-soft text-warning-text text-xs font-medium"><Plus size={12} weight="bold" />Bitim yaratish</span>}
        </span>
        <span onClick={(e) => e.stopPropagation()} className="flex items-center gap-2">
          {!missed && (
            <button type="button" onClick={() => setListening((v) => !v)} aria-pressed={listening} aria-label={listening ? "Yozuvni yopish" : "Yozuvni tinglash"}
              className={`${round} ${listening ? "bg-accent text-ink-on-accent" : "bg-surface text-ink"}`}>{listening ? <X size={16} /> : <Play size={16} weight="fill" />}</button>
          )}
          {phone && <CallButton phone={phone} className={`${round} bg-success text-white active:opacity-85 disabled:opacity-40`} />}
        </span>
      </div>
      {listening && <div className="px-4 pb-3 flex flex-col"><Recording uuid={c.uuid} auto /></div>}
    </li>
  )
}

function CallRowView({ call: c, onCreate }: { call: CallRow; onCreate: (phone: string) => void }) {
  const { status, dial, call: active } = usePhone()
  const missed = c.talk_time === 0
  const Icon = c.direction === "in" ? PhoneIncoming : PhoneOutgoing
  const phone = c.phone ? canonPhone(c.phone) : ""
  const btn = "h-8 px-3 inline-flex items-center gap-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap"
  return (
    <tr className={tbl.tr}>
      <td className={tbl.td}>
        <span className="flex items-center gap-2.5 whitespace-nowrap">
          <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${missed ? "bg-danger-soft text-danger-text" : "bg-surface-sunken text-ink-muted"}`}><Icon size={16} /></span>
          <span className="flex flex-col">
            <span className={`text-sm ${missed ? "text-danger-text" : "text-ink"}`}>{callLabel(c)}</span>
            {!missed && <span className="text-sm text-ink-muted tabular-nums">{secs(c.talk_time)}</span>}
          </span>
        </span>
      </td>
      <td className={`${tbl.td} whitespace-nowrap`}>
        <span className="block font-medium">{c.client?.full_name ?? formatPhone(phone)}</span>
        {c.client && <span className="block text-sm text-ink-muted tabular-nums">{formatPhone(phone)}</span>}
      </td>
      <td className={tbl.td}>
        {c.staff ? <span className="inline-flex items-center gap-2 whitespace-nowrap"><PersonDot name={c.staff.full_name} url={c.staff.avatar_url} />{c.staff.full_name}</span>
          : <span className="text-ink-muted">{c.ext ?? "—"}</span>}
      </td>
      <td className={`${tbl.td} tabular-nums whitespace-nowrap text-ink-muted`}>{when(c.started_at)}</td>
      <td className={tbl.td}>{missed ? <span className="text-ink-faint">—</span> : <Recording uuid={c.uuid} compact />}</td>
      <td className={`${tbl.td} text-right`}>
        {/* Fixed widths, so the call and bitim buttons line up row under row */}
        <span className="inline-flex items-center justify-end gap-1.5">
          {phone && (status === "ready"
            ? <button type="button" disabled={!!active} onClick={() => void dial(phone).catch(() => {})} aria-label="Qayta qo'ng'iroq qilish" title="Qayta qo'ng'iroq qilish"
                className={`${btn} w-12 justify-center bg-success text-white hover:opacity-90 disabled:opacity-40`}><Phone size={16} weight="fill" /></button>
            : <a href={`tel:${phone}`} aria-label="Qayta qo'ng'iroq qilish" title="Qayta qo'ng'iroq qilish" className={`${btn} w-12 justify-center bg-success text-white hover:opacity-90`}><Phone size={16} weight="fill" /></a>)}
          {c.lead_id
            ? <Link to={`/sotuv/bitim/${c.lead_id}`} title={c.lead?.name ?? "Bitim"}
                className={`${btn} w-36 justify-center bg-surface-sunken text-ink hover:bg-surface-sunken-hover`}>Bitimni ochish<ArrowRight size={16} /></Link>
            : phone && <button type="button" onClick={() => onCreate(phone)} className={`${btn} w-36 justify-center bg-surface-sunken text-ink hover:bg-surface-sunken-hover`}><Plus size={12} weight="bold" />Bitim yaratish</button>}
        </span>
      </td>
    </tr>
  )
}
