import { useRef, useState } from "react"
import { PencilSimple } from "@phosphor-icons/react"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { formatMoney, formatNumber } from "@/lib/format"

// Inline-edit the agreed price (chegirma / individual deal).
// `large` (phone detail sheet): a 44px pill instead of the table's inline text.
export function PriceCell({ value, onSave, large }: { value: number; onSave: (v: number) => void; large?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState("")
  // Enter blurs and blur commits — one path; `closed` makes an edit save at most once
  // (a blur fired while the input unmounts is ignored) and Escape save nothing
  const closed = useRef(false)

  if (!editing) {
    return (
      <button
        onClick={() => { setVal(value ? String(Math.round(value)) : ""); closed.current = false; setEditing(true) }}
        className={large ? "h-11 px-4 rounded-full bg-mute-soft inline-flex items-center gap-2 text-base font-medium text-ink tabular-nums" : "group/price inline-flex items-center gap-1 text-base text-ink tabular-nums"}
        title="Kelishuv summasini tahrirlash"
      >
        {formatMoney(value)}
        <PencilSimple size={12} weight="bold" className={large ? "text-ink-muted" : "text-ink-faint opacity-0 group-hover/price:opacity-100 transition-opacity"} />
      </button>
    )
  }

  function commit() {
    setEditing(false)
    if (closed.current) return
    closed.current = true
    const next = val ? Number(val) : 0
    if (next !== value) onSave(next)
  }

  return (
    <input
      autoFocus
      inputMode="numeric"
      aria-label="Kelishuv summasi"
      value={val ? formatNumber(Number(val)) : ""}
      onChange={(e) => setVal(e.target.value.replace(/\D/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape") closed.current = true
        if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur()
      }}
      className={`${large ? "w-40 h-11 px-3" : "w-28 px-2 py-1"} border border-line-focus rounded-control text-base text-right text-ink tabular-nums focus:outline-none`}
    />
  )
}

// Per-participant cashback % override; empty = the event default.
export function CashbackPercentCell({
  percent,
  earned,
  defaultPercent,
  onSet,
  large,
}: {
  percent: number | null
  earned: number
  defaultPercent: number
  onSet: (percent: number | null) => void
  large?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState("")
  const closed = useRef(false)  // same single commit path as PriceCell
  const effective = percent ?? defaultPercent

  if (!editing) {
    return (
      <button
        onClick={() => { setVal(percent !== null ? String(percent) : ""); closed.current = false; setEditing(true) }}
        className={large ? "h-11 px-4 rounded-full bg-mute-soft inline-flex items-center gap-2 justify-end" : "inline-flex items-center gap-1.5 justify-end"}
        title="Keshbek foizini tahrirlash (bo'sh = tadbir standarti)"
      >
        <StatusBadge label={`${effective}%`} variant={percent !== null ? "warning" : "neutral"} />
        {earned > 0 && <span className="text-xs text-ink-muted tabular-nums">{formatMoney(earned)}</span>}
      </button>
    )
  }

  function commit() {
    setEditing(false)
    if (closed.current) return
    closed.current = true
    const trimmed = val.trim()
    const next = trimmed === "" ? null : Number(trimmed)
    if (next === percent) return
    if (next === null || (Number.isFinite(next) && next >= 0 && next <= 100)) onSet(next)
  }

  return (
    <div className="relative inline-block">
      <input
        autoFocus
        type="number"
        min={0}
        max={100}
        step={0.5}
        aria-label="Keshbek foizi"
        value={val}
        placeholder={`${defaultPercent}`}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") closed.current = true
          if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur()
        }}
        className={`${large ? "w-24 h-11 px-3 pr-6" : "w-16 px-2 py-1 pr-5"} border border-line-focus rounded-control text-base text-right text-ink focus:outline-none`}
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-muted pointer-events-none">%</span>
    </div>
  )
}
