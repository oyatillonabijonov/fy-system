import { useRef, useState } from "react"
import { PencilSimple } from "@phosphor-icons/react"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { formatMoney, formatNumber } from "@/lib/format"

// Inline-edit the agreed price (chegirma / individual deal).
export function PriceCell({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState("")
  // Enter blurs and blur commits — one path; `closed` makes an edit save at most once
  // (a blur fired while the input unmounts is ignored) and Escape save nothing
  const closed = useRef(false)

  if (!editing) {
    return (
      <button
        onClick={() => { setVal(value ? String(Math.round(value)) : ""); closed.current = false; setEditing(true) }}
        className="group/price inline-flex items-center gap-1 text-base text-ink tabular-nums"
        title="Kelishuv summasini tahrirlash"
      >
        {formatMoney(value)}
        <PencilSimple size={12} weight="bold" className="text-ink-faint opacity-0 group-hover/price:opacity-100 transition-opacity" />
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
      className="w-28 border border-line-focus rounded-control px-2 py-1 text-base text-right text-ink tabular-nums focus:outline-none"
    />
  )
}

// Per-participant cashback % override; empty = the event default.
export function CashbackPercentCell({
  percent,
  earned,
  defaultPercent,
  onSet,
}: {
  percent: number | null
  earned: number
  defaultPercent: number
  onSet: (percent: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState("")
  const closed = useRef(false)  // same single commit path as PriceCell
  const effective = percent ?? defaultPercent

  if (!editing) {
    return (
      <button
        onClick={() => { setVal(percent !== null ? String(percent) : ""); closed.current = false; setEditing(true) }}
        className="inline-flex items-center gap-1.5 justify-end"
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
        className="w-16 border border-line-focus rounded-control px-2 py-1 pr-5 text-base text-right text-ink focus:outline-none"
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-muted pointer-events-none">%</span>
    </div>
  )
}
