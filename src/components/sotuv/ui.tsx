/* eslint-disable react-refresh/only-export-components -- small shared bits of the Sotuv section */
import { useEffect, useState, type ReactNode, type SyntheticEvent } from "react"
import { Phone, UsersThree, EnvelopeSimple, DotsThreeCircle, Play, type Icon } from "@phosphor-icons/react"
import { usePhone } from "@/context/PhoneContext"
import { dueLabel } from "@/components/vazifalar/pickers"
import { fromDue, pbxApi, type Call, type TaskKind } from "@/lib/supabase/queries/sotuv"
import { formatNumber } from "@/lib/format"

export const KIND_ICON: Record<TaskKind, Icon> = { call: Phone, meeting: UsersThree, email: EnvelopeSimple, other: DotsThreeCircle }

/** "Kecha", "Bugun · 15:00", "12-okt" and its tone: overdue red, today amber */
export function dueInfo(iso: string, today: string, now = Date.now()) {
  const { date, time } = fromDue(iso)
  const late = new Date(iso).getTime() < now
  return { label: dueLabel(date, time, today), tone: late ? "danger" : date === today ? "warning" : "muted" } as const
}

const TONE = { danger: "bg-danger-soft text-danger-text", warning: "bg-warning-soft text-warning-text", muted: "bg-surface-sunken max-lg:bg-surface text-ink-muted" }
const DUE_TEXT = { danger: "text-danger-text", warning: "text-warning-text", muted: "text-ink-muted" }

/** `lg`: the touch size used on phones (h-8, 16px icon). `onGrey`: the chip sits on a grey card (the Kanban's), so the
 *  neutral tone stays white there instead of turning grey like on a white card */
export function TaskChip({ kind, due, today, lg, onGrey }: { kind: TaskKind; due: string; today: string; lg?: boolean; onGrey?: boolean }) {
  const Icon = KIND_ICON[kind]
  const { label, tone } = dueInfo(due, today)
  return (
    <span className={`inline-flex items-center rounded-full text-sm whitespace-nowrap ${lg ? "h-8 px-3 gap-1.5" : "h-6 px-2 gap-1"} ${onGrey && tone === "muted" ? "bg-surface-sunken text-ink-muted" : TONE[tone]}`}>
      {lg ? <Icon size={16} /> : <Icon size={12} weight="bold" />}{label}
    </span>
  )
}

/** The due time as plain text, coloured by state (overdue red, today amber): the meta line of a phone task row */
export function DueText({ due, today }: { due: string; today: string }) {
  const { label, tone } = dueInfo(due, today)
  return <span className={`whitespace-nowrap ${DUE_TEXT[tone]}`}>{label}</span>
}

export const NoTaskChip = ({ lg }: { lg?: boolean }) => (
  <span className={`inline-flex items-center rounded-full text-sm bg-warning-soft text-warning-text whitespace-nowrap ${lg ? "h-8 px-3" : "h-6 px-2"}`}>Vazifa yo'q</span>
)

/** 1 500 000 → "1,5 mln", 250 000 → "250 ming" */
export function shortMoney(n: number): string {
  if (n >= 1_000_000) return `${String(Math.round(n / 100_000) / 10).replace(".", ",")} mln`
  if (n >= 1_000) return `${formatNumber(Math.round(n / 1_000))} ming`
  return formatNumber(n)
}

/** Stage colour dot (data colour from the voronka setup) */
export const StageDot = ({ color, size = 8 }: { color: string; size?: number }) => (
  <span className="rounded-full shrink-0" style={{ width: size, height: size, backgroundColor: color }} />
)

export const secs = (s: number) =>
  s >= 3600 ? `${Math.floor(s / 3600)} soat ${Math.floor((s % 3600) / 60)} daq` : s >= 60 ? `${Math.floor(s / 60)} daq ${s % 60} s` : `${s} s`

export const callLabel = (c: Pick<Call, "direction" | "talk_time">) =>
  c.direction === "in" ? (c.talk_time ? "Kiruvchi qo'ng'iroq" : "Javobsiz kiruvchi qo'ng'iroq") : c.talk_time ? "Chiquvchi qo'ng'iroq" : "Chiquvchi · javob berilmadi"

/** ▶ → a signed link to the recording, streamed through our API (OnlinePBX's own host is blocked in some browsers) */
export function Recording({ uuid, compact, auto }: { uuid: string; compact?: boolean; auto?: boolean }) {
  const [src, setSrc] = useState<string | null>(null)
  const [state, setState] = useState<"idle" | "loading" | "error">("idle")
  async function play() {
    setState("loading")
    try { setSrc((await pbxApi<{ url: string }>(`record/${uuid}`)).url); setState("idle") } catch { setState("error") }
  }
  // `auto`: opened by a ▶ elsewhere (the phone's call list) — load straight away
  useEffect(() => {
    if (!auto) return
    let live = true
    pbxApi<{ url: string }>(`record/${uuid}`).then((r) => { if (live) setSrc(r.url) }, () => { if (live) setState("error") })
    return () => { live = false }
  }, [auto, uuid])
  // One recording at a time: starting one pauses the others (data-recording keeps the live call's audio out of it)
  const solo = (e: SyntheticEvent<HTMLAudioElement>) =>
    document.querySelectorAll<HTMLAudioElement>("audio[data-recording]").forEach((a) => { if (a !== e.currentTarget) a.pause() })
  if (src) return <audio src={src} controls autoPlay data-recording onPlay={solo} className={compact ? "w-56 h-8" : "w-full h-9"} />
  if (auto && state !== "error") return <span className="self-start text-sm text-ink-muted">Yuklanmoqda…</span>
  return (
    <button type="button" onClick={play} disabled={state === "loading"}
      className="self-start inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-surface-sunken text-sm text-ink hover:bg-surface-sunken-hover transition-colors disabled:opacity-60 whitespace-nowrap">
      <Play size={12} weight="fill" />{state === "loading" ? "Yuklanmoqda…" : state === "error" ? "Topilmadi — qayta" : compact ? "Tinglash" : "Yozuvni tinglash"}
    </button>
  )
}

/** Phone list rows: a neutral 40px circle on the white card (the grey ground), the icon alone carries the colour */
export const ROUND_BTN = "size-10 shrink-0 rounded-full flex items-center justify-center transition-opacity active:opacity-80 disabled:opacity-40"
export const ROW_BTN = `${ROUND_BTN} bg-surface`

/** The call button of a phone list row: neutral circle, green phone */
export const RowCall = ({ phone }: { phone: string }) => (
  <CallButton phone={phone} className={`${ROW_BTN} text-success`}><Phone size={20} /></CallButton>
)

/** Rings from the browser when this staff member's line is up; otherwise the device's own dialer.
 *  `className`/`wrap`/`children` restyle it (the phone's round action buttons); the defaults are the desktop's. */
export function CallButton({ phone, className = "w-10 h-10 shrink-0 rounded-full bg-success text-white flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40", wrap = "flex flex-col items-end gap-1", children }: {
  phone: string; className?: string; wrap?: string; children?: ReactNode
}) {
  const { status, dial, call } = usePhone()
  const [error, setError] = useState<string | null>(null)
  const inner = children ?? <Phone size={20} weight="fill" />
  if (status !== "ready") {
    return <a href={`tel:${phone}`} aria-label="Qo'ng'iroq qilish" title={status === "off" ? "Qo'ng'iroq qilish" : "Brauzer telefoni ulanmagan — qurilma orqali"} className={className}>{inner}</a>
  }
  return (
    <span className={wrap}>
      <button type="button" disabled={!!call} aria-label="Brauzerdan qo'ng'iroq qilish" title="Brauzerdan qo'ng'iroq qilish" className={className}
        onClick={() => { setError(null); dial(phone).catch(() => setError("Mikrofonga ruxsat bering")) }}>
        {inner}
      </button>
      {error && <span role="alert" className="text-sm text-danger-text">{error}</span>}
    </span>
  )
}

/** Phone segmented control (2–4 options): a `bg-fill` track on the ground, the active option a white `bg-card` pill */
export function Segmented<T extends string | boolean>({ label, options, value, onChange }: {
  label: string; options: readonly (readonly [T, string])[]; value: T; onChange: (v: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} className="grid p-1 rounded-full bg-fill">
      {options.map(([id, text]) => (
        <button key={String(id)} type="button" role="radio" aria-checked={value === id} onClick={() => onChange(id)}
          className={`h-9 rounded-full text-sm font-medium whitespace-nowrap transition-colors active:opacity-80 ${value === id ? "bg-card text-ink" : "text-ink-muted"}`}>{text}</button>
      ))}
    </div>
  )
}

/** Phone chip strip: a white chip on the ground, the active one black. Counts go in a `<ChipCount>` */
export const chip = (on: boolean) =>
  `shrink-0 h-9 px-3.5 rounded-full text-sm font-medium whitespace-nowrap inline-flex items-center gap-2 transition-colors active:opacity-80 ${on ? "bg-accent text-ink-on-accent" : "bg-card text-ink"}`
export const ChipCount = ({ n }: { n: number }) => <span className="text-xs tabular-nums opacity-60">{n}</span>

/** Phone section title: outside the card, above it */
export const SECTION = "text-base font-semibold text-ink px-1 mb-2"

export type SotuvTab = "deals" | "tasks" | "calls"

/** Phone: the three parts of Sotuv bo'limi as one segmented control (the sidebar's sub-items are behind "Yana") */
export const SotuvSegments = ({ active, onPick }: { active: SotuvTab; onPick: (t: SotuvTab) => void }) => (
  <Segmented<SotuvTab> label="Sotuv bo'limi" value={active} onChange={onPick}
    options={[["deals", "Bitimlar"], ["tasks", "Vazifalar"], ["calls", "Qo'ng'iroqlar"]]} />
)

/** Phone empty state: a thin 32px icon and one line */
export const EmptyNote = ({ icon: Icon, text }: { icon: Icon; text: string }) => (
  <div className="rounded-surface bg-surface-sunken py-12 px-6 flex flex-col items-center gap-3 text-center">
    <Icon size={32} weight="thin" className="text-ink-muted" />
    <p className="text-base text-ink-muted">{text}</p>
  </div>
)
