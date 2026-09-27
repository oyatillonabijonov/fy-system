// Calendar periods for the Moliya filters, in Tashkent days (UTC+5, no DST).
export type Period = "all" | "today" | "month" | "last" | "custom"

export const PERIOD_LABELS: Record<Period, string> = {
  all: "Butun davr",
  today: "Bugun",
  month: "Shu oy",
  last: "O'tgan oy",
  custom: "Oraliq",
}

export function tashkentToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(now)
}

export function periodRange(
  period: Period,
  customFrom: string | null,
  customTo: string | null,
  today: string = tashkentToday(),
): { from: string | null; to: string | null } {
  switch (period) {
    case "today":
      return { from: today, to: today }
    case "month":
      return { from: `${today.slice(0, 8)}01`, to: today }
    case "last": {
      const [y, m] = today.split("-").map(Number)
      const iso = (d: Date) => d.toISOString().slice(0, 10)
      return { from: iso(new Date(Date.UTC(y, m - 2, 1))), to: iso(new Date(Date.UTC(y, m - 1, 0))) }
    }
    case "custom":
      return { from: customFrom, to: customTo }
    default:
      return { from: null, to: null }
  }
}

// Inclusive timestamptz bounds of a Tashkent calendar day, for PostgREST filters.
export function dayStart(d: string): string {
  return `${d}T00:00:00+05:00`
}

export function dayEnd(d: string): string {
  return `${d}T23:59:59.999+05:00`
}
