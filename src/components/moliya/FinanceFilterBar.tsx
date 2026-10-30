import { useState } from "react"
import { CalendarBlank, CaretDown, SlidersHorizontal, X } from "@phosphor-icons/react"
import { Sheet } from "@/components/ui/Sheet"
import { useEvents } from "@/hooks/useEvents"
import { useUsers } from "@/hooks/useUsers"
import { useFinanceFilters } from "@/hooks/useFinanceFilters"
import { PERIOD_LABELS, type Period } from "@/lib/period"
import type { PaymentMethod } from "@/lib/supabase/queries/payments"
import { BTN_PRIMARY } from "@/components/moliya/mobile"

const SELECT =
  "h-control-md max-w-full pl-3 pr-8 rounded-control bg-surface-sunken text-base text-ink border border-transparent outline-none focus:border-line-focus"

export function FinanceFilterBar() {
  const { period, get, set } = useFinanceFilters()
  const { data: events = [] } = useEvents()
  const { data: users = [] } = useUsers()
  // Inactive sellers stay listed: their past sales still need filtering.
  const sellers = users.filter((u) => u.department === "sotuv")
  const active = period !== "all" || !!get("event") || !!get("seller") || !!get("method")

  return (
    <div className="flex flex-wrap items-center gap-2 max-lg:hidden">
      <select
        aria-label="Davr"
        value={period}
        onChange={(e) => set({ period: e.target.value === "all" ? null : e.target.value, from: null, to: null })}
        className={SELECT}
      >
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <option key={p} value={p}>{PERIOD_LABELS[p]}</option>
        ))}
      </select>

      {period === "custom" && (
        <>
          <input
            type="date"
            aria-label="Boshlanish sanasi"
            value={get("from") ?? ""}
            max={get("to") ?? undefined}
            onChange={(e) => set({ from: e.target.value || null })}
            className={SELECT}
          />
          <span className="text-ink-muted text-sm">—</span>
          <input
            type="date"
            aria-label="Tugash sanasi"
            value={get("to") ?? ""}
            min={get("from") ?? undefined}
            onChange={(e) => set({ to: e.target.value || null })}
            className={SELECT}
          />
        </>
      )}

      <select aria-label="Tadbir" value={get("event") ?? ""} onChange={(e) => set({ event: e.target.value || null })} className={SELECT}>
        <option value="">Barcha tadbirlar</option>
        {events.map((ev) => (
          <option key={ev.id} value={ev.id}>{ev.name}</option>
        ))}
      </select>

      <select aria-label="Sotuvchi" value={get("seller") ?? ""} onChange={(e) => set({ seller: e.target.value || null })} className={SELECT}>
        <option value="">Barcha sotuvchilar</option>
        {sellers.map((s) => (
          <option key={s.id} value={s.id}>{s.full_name}</option>
        ))}
        <option value="none">Belgilanmagan</option>
      </select>

      <select aria-label="To'lov usuli" value={get("method") ?? ""} onChange={(e) => set({ method: e.target.value || null })} className={SELECT}>
        <option value="">Barcha usullar</option>
        <option value="naqd">Naqd</option>
        <option value="karta">Karta</option>
        <option value="transfer">Transfer</option>
      </select>

      {active && (
        <button
          onClick={() => set({ period: null, from: null, to: null, event: null, seller: null, method: null })}
          className="px-3 h-control-md whitespace-nowrap text-sm font-semibold text-ink-muted hover:text-ink transition-colors"
        >
          Filtrlarni tozalash
        </button>
      )}
    </div>
  )
}

const FIELD = "w-full h-12 px-3 rounded-control bg-surface-sunken text-base text-ink border border-transparent outline-none focus:border-line-focus"
const METHOD_OPTIONS: { value: PaymentMethod | ""; label: string }[] = [
  { value: "", label: "Hammasi" },
  { value: "naqd", label: "Naqd" },
  { value: "karta", label: "Karta" },
  { value: "transfer", label: "Transfer" },
]

/** Phone: the period as a chip, the rest behind a "Filtr" sheet; active ones show as removable chips */
export function MobileFilterBar() {
  const { period, get, set } = useFinanceFilters()
  const { data: events = [] } = useEvents()
  const { data: users = [] } = useUsers()
  const sellers = users.filter((u) => u.department === "sotuv")
  const [open, setOpen] = useState(false)

  const eventName = events.find((e) => e.id === get("event"))?.name
  const sellerName = get("seller") === "none" ? "Belgilanmagan" : sellers.find((s) => s.id === get("seller"))?.full_name
  const methodLabel = METHOD_OPTIONS.find((m) => m.value === get("method"))?.label
  const active = [
    get("event") && { key: "event" as const, label: eventName ?? "Tadbir" },
    get("seller") && { key: "seller" as const, label: sellerName ?? "Sotuvchi" },
    get("method") && { key: "method" as const, label: methodLabel ?? "Usul" },
  ].filter((x): x is { key: "event" | "seller" | "method"; label: string } => !!x)

  return (
    <div className="flex flex-col gap-2 lg:hidden">
      <div className="flex items-center gap-2">
        <label className="relative flex-1 min-w-0">
          <CalendarBlank size={20} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
          <CaretDown size={12} weight="bold" className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
          <select
            aria-label="Davr"
            value={period}
            onChange={(e) => set({ period: e.target.value === "all" ? null : e.target.value, from: null, to: null })}
            className="w-full h-11 appearance-none pl-10 pr-9 rounded-full bg-surface-sunken text-base font-medium text-ink outline-none focus-visible:ring-2 ring-line-focus"
          >
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <option key={p} value={p}>{PERIOD_LABELS[p]}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-11 pl-4 pr-4 shrink-0 rounded-full bg-surface-sunken text-base font-medium text-ink flex items-center gap-2 active:opacity-80"
        >
          <SlidersHorizontal size={20} /> Filtr
          {active.length > 0 && (
            <span className="min-w-5 h-5 px-1 rounded-full bg-accent text-ink-on-accent text-xs font-semibold flex items-center justify-center tabular-nums">{active.length}</span>
          )}
        </button>
      </div>

      {period === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            aria-label="Boshlanish sanasi"
            value={get("from") ?? ""}
            max={get("to") ?? undefined}
            onChange={(e) => set({ from: e.target.value || null })}
            className="h-11 min-w-0 px-4 rounded-full bg-surface-sunken text-base text-ink outline-none"
          />
          <input
            type="date"
            aria-label="Tugash sanasi"
            value={get("to") ?? ""}
            min={get("from") ?? undefined}
            onChange={(e) => set({ to: e.target.value || null })}
            className="h-11 min-w-0 px-4 rounded-full bg-surface-sunken text-base text-ink outline-none"
          />
        </div>
      )}

      {active.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
          {active.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => set({ [a.key]: null })}
              aria-label={`${a.label} filtrini olib tashlash`}
              className="shrink-0 h-9 pl-3.5 pr-3 rounded-full bg-surface-sunken text-sm font-medium text-ink flex items-center gap-1.5 active:opacity-80"
            >
              {a.label} <X size={12} weight="bold" className="text-ink-muted" />
            </button>
          ))}
        </div>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Filtr"
        footer={
          <>
            <button
              type="button"
              onClick={() => set({ event: null, seller: null, method: null })}
              disabled={active.length === 0}
              className="h-12 px-5 rounded-full bg-mute-soft text-ink text-base font-semibold disabled:opacity-40"
            >
              Tozalash
            </button>
            <button type="button" onClick={() => setOpen(false)} className={BTN_PRIMARY}>Tayyor</button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Tadbir</span>
            <select value={get("event") ?? ""} onChange={(e) => set({ event: e.target.value || null })} className={FIELD}>
              <option value="">Barcha tadbirlar</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Sotuvchi</span>
            <select value={get("seller") ?? ""} onChange={(e) => set({ seller: e.target.value || null })} className={FIELD}>
              <option value="">Barcha sotuvchilar</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>{s.full_name}</option>
              ))}
              <option value="none">Belgilanmagan</option>
            </select>
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">To'lov usuli</span>
            <div role="group" aria-label="To'lov usuli" className="grid grid-cols-4 p-1 rounded-full bg-surface-sunken">
              {METHOD_OPTIONS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  aria-pressed={(get("method") ?? "") === m.value}
                  onClick={() => set({ method: m.value || null })}
                  className={`h-10 rounded-full text-sm font-medium transition-colors ${(get("method") ?? "") === m.value ? "bg-surface text-ink" : "text-ink-muted"}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Sheet>
    </div>
  )
}
