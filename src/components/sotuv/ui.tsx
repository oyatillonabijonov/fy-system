/* eslint-disable react-refresh/only-export-components -- small shared bits of the Sotuv section */
import { Phone, UsersThree, EnvelopeSimple, DotsThreeCircle, type Icon } from "@phosphor-icons/react"
import { dueLabel } from "@/components/vazifalar/pickers"
import { fromDue, type TaskKind } from "@/lib/supabase/queries/sotuv"
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
