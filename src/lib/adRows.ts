// Sales by ad (104): sales_insights' by_ad rows come one per creative; the table shows them at one of
// four depths (source → campaign → ad set → creative), added up.
import type { AdRow } from "@/lib/supabase/queries/salesDashboard"

export const AD_LEVELS = [
  { id: "source", label: "Manba" }, { id: "campaign", label: "Kampaniya" }, { id: "adset", label: "Ad set" }, { id: "creative", label: "Kreativ" },
] as const
export type AdLevel = (typeof AD_LEVELS)[number]["id"]

export interface AdGroup extends Omit<AdRow, "source" | "campaign" | "adset" | "creative"> {
  key: string
  /** the row's own name at this depth (null = the lead carried none) and the names above it */
  name: string | null
  path: string[]
}

/** Rows that share every name down to `level` become one, biggest first; money stays null when it was hidden */
export function groupAds(rows: AdRow[], level: AdLevel): AdGroup[] {
  const depth = AD_LEVELS.findIndex((l) => l.id === level)
  const out = new Map<string, AdGroup>()
  for (const r of rows) {
    const names = AD_LEVELS.slice(0, depth + 1).map((l) => r[l.id])
    const key = JSON.stringify(names)
    const g = out.get(key) ?? { key, name: names[depth], path: names.slice(0, depth).filter((n): n is string => !!n), leads: 0, qualified: 0, won: 0, seats: 0, agreed: r.agreed === null ? null : 0, paid: r.paid === null ? null : 0 }
    g.leads += r.leads; g.qualified += r.qualified; g.won += r.won; g.seats += r.seats
    if (g.agreed !== null) g.agreed += r.agreed ?? 0
    if (g.paid !== null) g.paid += r.paid ?? 0
    out.set(key, g)
  }
  return [...out.values()].sort((a, b) => b.leads - a.leads || b.won - a.won)
}
