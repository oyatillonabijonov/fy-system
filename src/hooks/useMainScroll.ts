import { useSyncExternalStore } from "react"

/** Where the app's scroll area (<main>) is: at the top, or last moving down / up. The phone shell uses it
 *  for the header hairline (only once scrolled) and to fold the Fab to its icon while scrolling down. */
export type MainScroll = "top" | "down" | "up"

let y = 0
let state: MainScroll = "top"
const subs = new Set<() => void>()

function onScroll(e: Event) {
  const el = e.target
  if (!(el instanceof HTMLElement) || el.tagName !== "MAIN") return
  const ny = el.scrollTop
  const next: MainScroll = ny <= 4 ? "top" : ny > y + 4 ? "down" : ny < y - 4 ? "up" : state
  y = ny
  if (next !== state) { state = next; subs.forEach((f) => f()) }
}

export function useMainScroll(): MainScroll {
  return useSyncExternalStore(
    (cb) => {
      if (subs.size === 0) document.addEventListener("scroll", onScroll, true)   // capture: <main> scroll doesn't bubble
      subs.add(cb)
      return () => { subs.delete(cb); if (subs.size === 0) document.removeEventListener("scroll", onScroll, true) }
    },
    () => state,
  )
}
