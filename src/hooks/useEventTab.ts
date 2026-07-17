import { useState, useEffect } from "react"

// Sentinel for the always-first "Umumiy" tab on the finance page.
export const UMUMIY = "__umumiy__"

const KEY = "fy_last_event_tab"

// Shared across /tadbirlar/boshqaruv and /tadbirlar/moliya: pick an event on one
// page, land on the same event after switching to the other.
export function useEventTab() {
  const [id, setId] = useState<string>(() => {
    try {
      return localStorage.getItem(KEY) ?? UMUMIY
    } catch { return UMUMIY }
  })

  useEffect(() => {
    try { localStorage.setItem(KEY, id) } catch { /* private browsing */ }
  }, [id])

  return [id, setId] as const
}
