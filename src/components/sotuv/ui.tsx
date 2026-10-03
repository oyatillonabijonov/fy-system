/* eslint-disable react-refresh/only-export-components -- small shared bits of the Sotuv section */
import { useState, type SyntheticEvent } from "react"
import { Phone, UsersThree, EnvelopeSimple, DotsThreeCircle, Play, type Icon } from "@phosphor-icons/react"
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

const TONE = { danger: "bg-danger-soft text-danger-text", warning: "bg-warning-soft text-warning-text", muted: "bg-surface-sunken text-ink-muted" }

export function TaskChip({ kind, due, today }: { kind: TaskKind; due: string; today: string }) {
  const Icon = KIND_ICON[kind]
  const { label, tone } = dueInfo(due, today)
  return (
    <span className={`inline-flex items-center gap-1 h-6 px-2 rounded-full text-sm whitespace-nowrap ${TONE[tone]}`}>
      <Icon size={12} weight="bold" />{label}
    </span>
  )
}

export const NoTaskChip = () => (
  <span className="inline-flex items-center h-6 px-2 rounded-full text-sm bg-warning-soft text-warning-text whitespace-nowrap">Vazifa yo'q</span>
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
export function Recording({ uuid, compact }: { uuid: string; compact?: boolean }) {
  const [src, setSrc] = useState<string | null>(null)
  const [state, setState] = useState<"idle" | "loading" | "error">("idle")
  async function play() {
    setState("loading")
    try { setSrc((await pbxApi<{ url: string }>(`record/${uuid}`)).url); setState("idle") } catch { setState("error") }
  }
  // One recording at a time: starting one pauses the others (data-recording keeps the live call's audio out of it)
  const solo = (e: SyntheticEvent<HTMLAudioElement>) =>
    document.querySelectorAll<HTMLAudioElement>("audio[data-recording]").forEach((a) => { if (a !== e.currentTarget) a.pause() })
  if (src) return <audio src={src} controls autoPlay data-recording onPlay={solo} className={compact ? "w-56 h-8" : "w-full h-9"} />
  return (
    <button type="button" onClick={play} disabled={state === "loading"}
      className="self-start inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-surface-sunken text-sm text-ink hover:bg-surface-sunken-hover transition-colors disabled:opacity-60 whitespace-nowrap">
      <Play size={12} weight="fill" />{state === "loading" ? "Yuklanmoqda…" : state === "error" ? "Topilmadi — qayta" : compact ? "Tinglash" : "Yozuvni tinglash"}
    </button>
  )
}
