// Event sounds (cuelume: synthesized with Web Audio, no files). Only something that
// happened is heard — a task/client/staff saved, a failure — via the toast that
// reports it; clicks, dialogs and navigation stay silent. Off switch in Profilim (fy_sound).
import { play, setEnabled, type SoundName } from "cuelume"

const KEY = "fy_sound"
let on = true
try { on = localStorage.getItem(KEY) !== "off" } catch { /* storage blocked — keep sound on */ }
setEnabled(on)

export const soundOn = () => on
export function setSoundOn(v: boolean) {
  on = v
  setEnabled(v)
  try { localStorage.setItem(KEY, v ? "on" : "off") } catch { /* not saved — fine */ }
  if (v) play("success")
}

export const cue = (name: SoundName) => play(name)
