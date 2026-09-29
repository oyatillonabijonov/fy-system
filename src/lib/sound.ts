// Interface sounds (cuelume: synthesized with Web Audio, no files). One delegated
// click listener covers every button/tab/checkbox in the app; dialogs, route
// changes and toasts play their own cue. Off switch in Profilim (fy_sound).
import { play, setEnabled, type SoundName, type PlayOptions } from "cuelume"

const KEY = "fy_sound"
let on = true
try { on = localStorage.getItem(KEY) !== "off" } catch { /* storage blocked — keep sound on */ }
setEnabled(on)

export const soundOn = () => on
export function setSoundOn(v: boolean) {
  on = v
  setEnabled(v)
  try { localStorage.setItem(KEY, v ? "on" : "off") } catch { /* not saved — fine */ }
  if (v) cue("toggle")
}

let pendingTap: ReturnType<typeof setTimeout> | undefined
let outcomeAt = 0
const OUTCOMES: SoundName[] = ["success", "error", "warning", "ready"]

/** Play a cue — one per action: it replaces a click's pending tap, and a dialog
 *  closing right after a saved/failed toast stays quiet so the outcome is heard */
export function cue(name: SoundName, opts?: PlayOptions) {
  clearTimeout(pendingTap)
  if (OUTCOMES.includes(name)) outcomeAt = Date.now()
  else if (Date.now() - outcomeAt < 300) return
  play(name, opts)
}

if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    const el = (e.target as Element | null)?.closest?.("button, a[href], [role=button], [role=tab], [role=radio], [role=option], [role=menuitem], [role=switch], input[type=checkbox], input[type=radio], summary")
    if (!el || el.matches(":disabled, [aria-disabled=true]")) return
    const name: SoundName = el.matches("input, [role=switch]") ? "toggle"
      : el.matches("[role=tab], [role=radio], [role=option], [role=menuitem]") ? "select" : "tap"
    clearTimeout(pendingTap)
    // ponytail: deferred one tick so a dialog/route cue fired by this same click replaces the tap
    pendingTap = setTimeout(() => play(name, { emphasis: "subtle" }), 0)
  }, true)
}
