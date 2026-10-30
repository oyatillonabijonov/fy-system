/* eslint-disable react-refresh/only-export-components -- class strings and a date helper live with the phone building blocks */
import type { ReactNode } from "react"
import { ThinkingOrb } from "thinking-orbs"
import { formatDate, formatNumber } from "@/lib/format"
import { tashkentToday } from "@/lib/period"

// Phone presentation (below lg) of the Moliya page: small building blocks shared by its tabs.

/** A sum with grouped digits and a small unit — never truncated */
export function Money({ value, sign, unit = true, className = "", unitClassName = "text-[0.62em] font-medium opacity-60" }: { value: number; sign?: boolean; unit?: boolean; className?: string; unitClassName?: string }) {
  const n = Math.round(value)
  const s = n < 0 ? "−" : sign && n > 0 ? "+" : ""
  return (
    <span className={`tabular-nums whitespace-nowrap ${className}`}>
      {s}
      {formatNumber(Math.abs(n))}
      {unit && <span className={`ml-1 ${unitClassName}`}>so'm</span>}
    </span>
  )
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("")
}

/** Initials or an icon in a quiet 40px circle: the grey ground inside the page, a sunken grey inside a sheet */
export function Avatar({ name, icon, inSheet }: { name?: string; icon?: ReactNode; inSheet?: boolean }) {
  return (
    <span className={`size-10 shrink-0 rounded-full ${inSheet ? "bg-surface-sunken" : "bg-surface"} text-ink-muted text-sm font-semibold flex items-center justify-center`}>
      {icon ?? initials(name ?? "")}
    </span>
  )
}

/** 2–4 options, full width */
export function Segmented<T extends string>({ options, value, onChange, label }: {
  options: { id: T; label: string }[]; value: T; onChange: (id: T) => void; label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="grid p-1 rounded-full bg-fill" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} onClick={() => onChange(o.id)}
          className={`h-9 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${value === o.id ? "bg-card text-ink" : "text-ink-muted"}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Many options: one scrolling strip, never wrapped. `count` is a small muted number inside the chip. */
export function ChipStrip<T extends string>({ options, value, onChange, label }: {
  options: { id: T; label: string; count?: number }[]; value: T; onChange: (id: T) => void; label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} onClick={() => onChange(o.id)}
          className={`shrink-0 h-9 px-3.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors active:opacity-80 ${
            value === o.id ? "bg-accent text-ink-on-accent" : "bg-card text-ink"
          }`}>
          {o.label}
          {o.count !== undefined && <span className="ml-1.5 text-xs tabular-nums opacity-60">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

/** Thin progress bar; the track is the control grey (one step darker than the ground) so it reads on a white card */
export function Progress({ pct }: { pct: number }) {
  return (
    <span className="block h-1.5 rounded-full bg-fill overflow-hidden">
      <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </span>
  )
}

/** Inset grouped list */
export const GROUP = "rounded-surface bg-surface-sunken overflow-hidden"
export const ROW = "w-full min-h-16 px-4 py-3 flex items-center gap-3 text-left border-b border-line last:border-b-0 active:bg-surface-sunken-hover transition-colors"

export function GroupHeader({ children }: { children: ReactNode }) {
  return <h3 className="text-base font-semibold text-ink px-1 mb-2">{children}</h3>
}

export function Loading() {
  return (
    <div className="py-10 flex items-center justify-center">
      <ThinkingOrb state="searching" size={20} theme="light" />
    </div>
  )
}

export function Empty({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="py-12 flex flex-col items-center gap-3 text-ink-faint">
      {icon}
      <span className="text-base text-ink-muted text-center">{text}</span>
    </div>
  )
}

/** "Bugun" / "Kecha" / dd.mm.yyyy for a Tashkent day key (YYYY-MM-DD) */
export function dayLabel(key: string): string {
  const today = tashkentToday()
  if (key === today) return "Bugun"
  const y = new Date(`${today}T00:00:00Z`)
  y.setUTCDate(y.getUTCDate() - 1)
  if (key === y.toISOString().slice(0, 10)) return "Kecha"
  return formatDate(key)
}

/** Items in order, split into runs of the same day key */
export function groupByDay<T>(items: T[], key: (t: T) => string): { day: string; items: T[] }[] {
  const out: { day: string; items: T[] }[] = []
  for (const it of items) {
    const d = key(it)
    const last = out[out.length - 1]
    if (last && last.day === d) last.items.push(it)
    else out.push({ day: d, items: [it] })
  }
  return out
}

/** Label left, value right — the detail sheets' rows */
export function KV({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-h-12 px-4 py-2.5 flex items-center justify-between gap-4 border-b border-line last:border-b-0">
      <span className="text-base text-ink-muted shrink-0">{label}</span>
      <span className="text-base text-ink text-right min-w-0 break-words">{children}</span>
    </div>
  )
}

/** A sheet's secondary action: a round icon with its label underneath (a row of these sits above the red "Bekor qilish") */
export const TILE = "w-28 flex flex-col items-center gap-1.5 text-sm font-medium text-ink active:opacity-80 disabled:opacity-50"
export function TileIcon({ children }: { children: ReactNode }) {
  return <span className="size-12 rounded-full bg-surface-sunken flex items-center justify-center">{children}</span>
}

export const BTN_PRIMARY = "h-12 flex-1 rounded-full bg-accent text-ink-on-accent text-base font-semibold disabled:opacity-40"
export const BTN_SECONDARY = "h-12 w-full rounded-full bg-mute-soft text-ink text-base font-semibold flex items-center justify-center gap-2 active:opacity-85"
export const BTN_DANGER = "h-12 w-full rounded-full bg-danger-soft text-danger-dark text-base font-semibold flex items-center justify-center gap-2 active:opacity-85"
