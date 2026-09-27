import { useEvents } from "@/hooks/useEvents"
import { useUsers } from "@/hooks/useUsers"
import { useFinanceFilters } from "@/hooks/useFinanceFilters"
import { PERIOD_LABELS, type Period } from "@/lib/period"

const SELECT =
  "h-control-md pl-3 pr-8 rounded-control bg-surface-sunken text-base text-ink border border-transparent outline-none focus:border-line-focus"

export function FinanceFilterBar() {
  const { period, get, set } = useFinanceFilters()
  const { data: events = [] } = useEvents()
  const { data: users = [] } = useUsers()
  // Inactive sellers stay listed: their past sales still need filtering.
  const sellers = users.filter((u) => u.department === "sotuv")
  const active = period !== "all" || !!get("event") || !!get("seller") || !!get("method")

  return (
    <div className="flex flex-wrap items-center gap-2">
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
          className="px-3 h-control-md text-sm font-semibold text-ink-muted hover:text-ink transition-colors"
        >
          Filtrlarni tozalash
        </button>
      )}
    </div>
  )
}
