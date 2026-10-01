// Browser phone sound: the ringtone and the call visualizer share one AudioContext.
// The ringtone (src/assets/sounds/ring-waiting.mp3 — Mixkit "Waiting ringtone", Mixkit License) is fetched
// and decoded once when the line comes up, so an incoming call rings from memory at once —
// no network at ring time. Browsers only let audio start after the page was touched, so the
// context is resumed on the first click/key.

// Imported, so the build gives it a content-hashed /assets/ name: no URL is ever requested before its
// file exists (a fixed /sounds/ URL got an HTML/404 answer cached by Cloudflare for 4 h, twice).
import ringUrl from "@/assets/sounds/ring-waiting.mp3"
// New lead / task due (Mixkit "Positive notification", Mixkit License; mastered to about −12 LUFS)
import notifyUrl from "@/assets/sounds/notify-positive.mp3"

let ctx: AudioContext | null = null
let ring: AudioBuffer | null = null
let notify: AudioBuffer | null = null

function audio(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext()
    const unlock = () => { void ctx?.resume() }
    window.addEventListener("pointerdown", unlock, { capture: true })
    window.addEventListener("keydown", unlock, { capture: true })
  }
  return ctx
}

async function decode(url: string): Promise<AudioBuffer> {
  const res = await fetch(url)
  if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("audio/")) throw new Error(`sound: ${res.status}`)
  return audio().decodeAudioData(await res.arrayBuffer())
}

/** Fetch + decode the ringtone once (called when the phone line starts) */
export async function preloadRing(): Promise<void> {
  if (!ring) ring = await decode(ringUrl)
}

/** Fetch + decode the notification once (called on sign-in), so it plays the moment it's due */
export async function preloadNotify(): Promise<void> {
  if (!notify) notify = await decode(notifyUrl)
}

/** The notification, once; false if it isn't loaded yet (the caller falls back to the UI cue) */
export function playNotify(): boolean {
  if (!notify) return false
  const c = audio()
  void c.resume()
  const src = c.createBufferSource()
  src.buffer = notify
  src.connect(c.destination)
  src.start()
  return true
}

/** Ring until the returned stop() — the file looped; if it isn't ready, a plain two-tone ring */
export function startRing(): () => void {
  const c = audio()
  void c.resume()
  const out = c.createGain()
  out.gain.value = 1   // the file itself is mastered loud (+7 dB, limited to −1 dBFS ≈ −10 LUFS)
  out.connect(c.destination)
  if (ring) {
    const src = c.createBufferSource()
    src.buffer = ring
    src.loop = true
    src.connect(out)
    src.start()
    return () => { try { src.stop() } catch { /* already stopped */ } out.disconnect() }
  }
  // Fallback: classic ring, 1 s on / 2 s off
  let stopped = false
  const burst = () => {
    if (stopped) return
    const g = c.createGain(); g.gain.value = 0.08; g.connect(out)
    for (const f of [440, 480]) { const o = c.createOscillator(); o.frequency.value = f; o.connect(g); o.start(); o.stop(c.currentTime + 1) }
  }
  burst()
  const t = setInterval(burst, 3000)
  return () => { stopped = true; clearInterval(t); out.disconnect() }
}

/** Frequency analyser on a call's audio stream (not routed to the speakers — the <audio> tag plays it) */
export function analyse(stream: MediaStream): { analyser: AnalyserNode; close: () => void } {
  const c = audio()
  const src = c.createMediaStreamSource(stream)
  const analyser = c.createAnalyser()
  analyser.fftSize = 128
  analyser.smoothingTimeConstant = 0.75
  src.connect(analyser)
  return { analyser, close: () => src.disconnect() }
}
