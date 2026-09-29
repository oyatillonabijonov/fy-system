/* eslint-disable react-refresh/only-export-components -- small pickers shared by the task create form and panel */
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react"
import { Check, CalendarBlank, UserCircle, Tag, CircleDashed, MagnifyingGlass, X, Clock } from "@phosphor-icons/react"
import { TASK_STATUSES, type TaskStatus } from "@/lib/supabase/queries/tasks"
import { STATUS_VARIANTS } from "@/lib/constants/theme"
import { STATUS_VARIANT, sectionColor } from "./taskUi"

// ─── Popover ────────────────────────────────────────────────────────────────

/** Minimal anchored popover: outside click or Escape closes it (Escape doesn't close the dialog) */
export function Popover({ trigger, children, width = 260 }: {
  trigger: (open: boolean, toggle: (e: ReactMouseEvent<HTMLElement>) => void) => ReactNode
  children: (close: () => void) => ReactNode
  width?: number
}) {
  const [open, setOpen] = useState(false)
  const [shift, setShift] = useState(0)   // px from the trigger's left edge, so the panel stays on screen
  const ref = useRef<HTMLDivElement>(null)
  const toggle = (e: ReactMouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const w = Math.min(width, window.innerWidth - 32)
    setShift(Math.min(Math.max(r.left, 16), window.innerWidth - w - 16) - r.left)
    setOpen((o) => !o)
  }
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false) } }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey, true)
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey, true) }
  }, [open])
  return (
    <div ref={ref} className="relative">
      {trigger(open, toggle)}
      {open && (
        <div className="absolute top-full mt-1.5 z-30" style={{ left: shift, width: Math.min(width, window.innerWidth - 32) }}>
          <div className="bg-surface-raised border border-line rounded-menu p-1.5">
          {children(() => setOpen(false))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Property chip: filled when set, dashed placeholder when empty */
export function Pill({ icon, label, empty, onClick, active }: { icon: ReactNode; label: ReactNode; empty?: boolean; onClick: (e: ReactMouseEvent<HTMLElement>) => void; active?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-sm whitespace-nowrap transition-colors border ${
        empty ? "border-dashed border-line text-ink-muted hover:text-ink" : "border-line text-ink bg-surface"
      } ${active ? "bg-mute-ghost-hover" : "hover:bg-mute-ghost-hover"}`}>
      {icon}{label}
    </button>
  )
}

/** Primary property as a card: small label over the value (Mas'ul, Muddat) */
export function Tile({ label, value, icon, empty, onClick, active, tone }: {
  label: string; value: ReactNode; icon: ReactNode; empty?: boolean; onClick: (e: ReactMouseEvent<HTMLElement>) => void; active?: boolean
  tone?: "danger" | "warning"
}) {
  const color = empty ? "text-ink-faint" : tone === "danger" ? "text-danger-text" : tone === "warning" ? "text-warning-text" : "text-ink"
  return (
    <button type="button" onClick={onClick}
      className={`w-full text-left rounded-surface px-3.5 py-2.5 transition-colors ${active ? "bg-surface-sunken-hover" : "bg-surface-sunken hover:bg-surface-sunken-hover"}`}>
      <span className="block text-sm text-ink-muted">{label}</span>
      <span className={`mt-0.5 flex items-center gap-2 text-base font-medium min-w-0 ${color}`}>{icon}<span className="truncate">{value}</span></span>
    </button>
  )
}

const Option = ({ selected, onClick, children }: { selected?: boolean; onClick: () => void; children: ReactNode }) => (
  <button type="button" onClick={onClick}
    className="w-full flex items-center gap-2 h-9 px-2.5 rounded-item text-base text-ink text-left hover:bg-mute-ghost-hover transition-colors">
    <span className="flex-1 min-w-0 flex items-center gap-2 truncate">{children}</span>
    {selected && <Check size={16} className="text-ink shrink-0" />}
  </button>
)

// ─── Dates ──────────────────────────────────────────────────────────────────

const WEEKDAYS = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"]
const MONTHS = ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sen", "okt", "noy", "dek"]
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay()
/** Nearest coming `wd` (today counts) */
const next = (today: string, wd: number) => addDays(today, (wd - weekday(today) + 7) % 7)

/** "Bugun", "Ertaga", "Juma, 2-okt", "12-okt" */
export function dueLabel(date: string, time: string | null, today: string): string {
  const d = date === today ? "Bugun" : date === addDays(today, 1) ? "Ertaga"
    : date > today && date <= addDays(today, 6) ? `${WEEKDAYS[weekday(date)]}, ${Number(date.slice(8))}-${MONTHS[Number(date.slice(5, 7)) - 1]}`
    : `${Number(date.slice(8))}-${MONTHS[Number(date.slice(5, 7)) - 1]}${date.slice(0, 4) !== today.slice(0, 4) ? ` ${date.slice(0, 4)}` : ""}`
  return time ? `${d} · ${time.slice(0, 5)}` : d
}

const TIMES = ["09:00", "10:00", "12:00", "14:00", "16:00", "18:00"]
const QUICK = (today: string) => [
  { label: "Bugun", day: today },
  { label: "Ertaga", day: addDays(today, 1) },
  { label: "Juma", day: next(today, 5) },
  { label: "Keyingi dushanba", day: addDays(next(today, 1), next(today, 1) === today ? 7 : 0) },
]

const chip = (on: boolean) =>
  `h-8 px-3 rounded-control text-sm font-medium transition-colors ${on ? "bg-accent text-ink-on-accent" : "bg-surface-sunken text-ink hover:bg-surface-sunken-hover"}`

export function DuePicker({ date, time, today, onChange, tile, open: isOpenTask = true }: {
  date: string | null; time: string | null; today: string
  onChange: (date: string | null, time: string | null) => void
  tile?: boolean
  /** the task is still open — only then is a past date shown as late */
  open?: boolean
}) {
  const tone = !date || !isOpenTask ? undefined : date < today ? "danger" : date === today ? "warning" : undefined
  return (
    <Popover width={300} trigger={(open, toggle) => tile ? (
      <Tile label="Muddat" icon={<CalendarBlank size={16} />} value={date ? dueLabel(date, time, today) : "Belgilanmagan"} empty={!date} tone={tone} active={open} onClick={toggle} />
    ) : (
      <Pill icon={<CalendarBlank size={16} />} label={date ? dueLabel(date, time, today) : "Muddat"} empty={!date} active={open} onClick={toggle} />
    )}>
      {(close) => (
        <div className="flex flex-col gap-3 p-1.5">
          <div className="flex flex-wrap gap-1.5">
            {QUICK(today).map((q) => (
              <button key={q.label} type="button" onClick={() => onChange(q.day, time)} className={chip(date === q.day)}>{q.label}</button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <CalendarBlank size={16} />
            <input type="date" value={date ?? ""} onChange={(e) => onChange(e.target.value || null, e.target.value ? time : null)}
              className="flex-1 h-8 px-2 rounded-control border border-line bg-surface text-ink text-sm focus:outline-none focus:border-line-focus" />
          </label>
          <div className={`flex flex-col gap-1.5 ${date ? "" : "opacity-40 pointer-events-none"}`}>
            <span className="flex items-center gap-1.5 text-sm text-ink-muted"><Clock size={16} />Soat {date ? "" : "(avval sanani tanlang)"}</span>
            <div className="grid grid-cols-4 gap-1.5">
              {TIMES.map((t) => (
                <button key={t} type="button" onClick={() => onChange(date, time === t ? null : t)} className={chip(time === t)}>{t}</button>
              ))}
              <input type="time" value={time && !TIMES.includes(time) ? time : ""} onChange={(e) => onChange(date, e.target.value || null)}
                aria-label="Boshqa soat" className="col-span-2 h-8 px-2 rounded-control border border-line bg-surface text-ink text-sm focus:outline-none focus:border-line-focus" />
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-3">
            {date
              ? <button type="button" onClick={() => onChange(null, null)} className="text-sm text-ink-muted hover:text-danger-text transition-colors">Olib tashlash</button>
              : <span />}
            <button type="button" onClick={close}
              className="h-8 px-4 rounded-full bg-accent text-ink-on-accent text-sm font-medium hover:bg-accent-hover transition-colors">Tayyor</button>
          </div>
        </div>
      )}
    </Popover>
  )
}

// ─── People, sections, events, status ───────────────────────────────────────

export interface StaffOption { id: string; full_name: string; avatar_url: string | null }
export type Owner = { assignee_id: string | null; assignee_name: string | null }

const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("")
export function PersonDot({ name, url, outside, size = 20 }: { name: string; url?: string | null; outside?: boolean; size?: number }) {
  const box = { width: size, height: size, fontSize: size * 0.42 }
  return url
    ? <img src={url} alt="" className="rounded-full object-cover shrink-0" style={box} />
    : <span className={`rounded-full shrink-0 inline-flex items-center justify-center font-semibold text-ink ${outside ? "border border-dashed border-line bg-surface" : "bg-mute-soft"}`} style={box}>{initials(name)}</span>
}

export function OwnerPicker({ value, staff, onChange, tile }: { value: Owner; staff: StaffOption[]; onChange: (o: Owner) => void; tile?: boolean }) {
  const [q, setQ] = useState("")
  const person = staff.find((s) => s.id === value.assignee_id)
  const name = person?.full_name ?? value.assignee_name
  const shown = staff.filter((s) => s.full_name.toLowerCase().includes(q.trim().toLowerCase()))
  const pick = (o: Owner, close: () => void) => { onChange(o); setQ(""); close() }
  return (
    <Popover trigger={(open, toggle) => tile ? (
      <Tile label="Mas'ul" icon={name ? <PersonDot name={name} url={person?.avatar_url} outside={!person} /> : <UserCircle size={16} />}
        value={name ?? "Belgilanmagan"} empty={!name} active={open} onClick={toggle} />
    ) : (
      <Pill icon={name ? <PersonDot name={name} url={person?.avatar_url} outside={!person} /> : <UserCircle size={16} />}
        label={name ? name.split(" ")[0] : "Mas'ul"} empty={!name} active={open} onClick={toggle} />
    )}>
      {(close) => (
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2 h-9 px-2.5 rounded-item bg-surface-sunken">
            <MagnifyingGlass size={16} className="text-ink-muted" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ism yoki tashqi odam…"
              onKeyDown={(e) => { if (e.key === "Enter" && q.trim()) { e.preventDefault(); pick(shown.length === 1 ? { assignee_id: shown[0].id, assignee_name: null } : { assignee_id: null, assignee_name: q.trim() }, close) } }}
              className="flex-1 bg-transparent text-base text-ink placeholder:text-ink-faint focus:outline-none" />
          </label>
          <div className="max-h-60 overflow-y-auto">
            {shown.map((s) => (
              <Option key={s.id} selected={s.id === value.assignee_id} onClick={() => pick({ assignee_id: s.id, assignee_name: null }, close)}>
                <PersonDot name={s.full_name} url={s.avatar_url} />{s.full_name}
              </Option>
            ))}
            {q.trim() && !staff.some((s) => s.full_name.toLowerCase() === q.trim().toLowerCase()) && (
              <Option onClick={() => pick({ assignee_id: null, assignee_name: q.trim() }, close)}>
                <PersonDot name={q} outside />Tashqi: <span className="font-medium">{q.trim()}</span>
              </Option>
            )}
          </div>
          {name && <Option onClick={() => pick({ assignee_id: null, assignee_name: null }, close)}><X size={16} className="text-ink-muted" />Mas'ulni olib tashlash</Option>}
        </div>
      )}
    </Popover>
  )
}

export function SectionPicker({ value, sections, onChange }: { value: string | null; sections: string[]; onChange: (s: string | null) => void }) {
  const [q, setQ] = useState("")
  const shown = sections.filter((s) => s.toLowerCase().includes(q.trim().toLowerCase()))
  const pick = (s: string | null, close: () => void) => { onChange(s); setQ(""); close() }
  return (
    <Popover trigger={(open, toggle) => (
      <Pill icon={value ? <span className="size-2 rounded-full" style={{ backgroundColor: sectionColor(value, sections) }} /> : <Tag size={16} />}
        label={value ?? "Bo'lim"} empty={!value} active={open} onClick={toggle} />
    )}>
      {(close) => (
        <div className="flex flex-col gap-1">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bo'lim nomi…"
            onKeyDown={(e) => { if (e.key === "Enter" && q.trim()) { e.preventDefault(); pick(shown.find((s) => s.toLowerCase() === q.trim().toLowerCase()) ?? q.trim(), close) } }}
            className="h-9 px-2.5 rounded-item bg-surface-sunken text-base text-ink placeholder:text-ink-faint focus:outline-none" />
          <div className="max-h-60 overflow-y-auto">
            {shown.map((s) => (
              <Option key={s} selected={s === value} onClick={() => pick(s, close)}>
                <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: sectionColor(s, sections) }} />{s}
              </Option>
            ))}
            {q.trim() && !sections.some((s) => s.toLowerCase() === q.trim().toLowerCase()) && (
              <Option onClick={() => pick(q.trim(), close)}>Yangi bo'lim: <span className="font-medium">{q.trim()}</span></Option>
            )}
          </div>
          {value && <Option onClick={() => pick(null, close)}><X size={16} className="text-ink-muted" />Bo'limsiz</Option>}
        </div>
      )}
    </Popover>
  )
}

export function EventPicker({ value, events, onChange }: { value: string | null; events: { id: string; name: string }[]; onChange: (id: string | null) => void }) {
  const current = events.find((e) => e.id === value)
  return (
    <Popover trigger={(open, toggle) => (
      <Pill icon={<CalendarBlank size={16} />} label={current?.name ?? "Umumiy"} active={open} onClick={toggle} />
    )}>
      {(close) => (
        <div className="max-h-72 overflow-y-auto">
          {events.map((e) => <Option key={e.id} selected={e.id === value} onClick={() => { onChange(e.id); close() }}>{e.name}</Option>)}
          <Option selected={!value} onClick={() => { onChange(null); close() }}>Umumiy vazifalar</Option>
        </div>
      )}
    </Popover>
  )
}

export function StatusPicker({ value, onChange }: { value: TaskStatus; onChange: (s: TaskStatus) => void }) {
  const v = STATUS_VARIANTS[STATUS_VARIANT[value]]
  return (
    <Popover width={200} trigger={(open, toggle) => (
      <button type="button" onClick={toggle} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-sm font-medium"
        style={{ backgroundColor: v.bg, color: v.text }}>
        <CircleDashed size={16} />{TASK_STATUSES.find((s) => s.id === value)!.label}
        <span className="sr-only">{open ? "yopish" : "o'zgartirish"}</span>
      </button>
    )}>
      {(close) => TASK_STATUSES.map((s) => {
        const c = STATUS_VARIANTS[STATUS_VARIANT[s.id]]
        return (
          <Option key={s.id} selected={s.id === value} onClick={() => { onChange(s.id); close() }}>
            <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: c.text }} />{s.label}
          </Option>
        )
      })}
    </Popover>
  )
}
