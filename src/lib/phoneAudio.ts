// Browser phone sound: the ringtone and the call visualizer share one AudioContext.
// The ringtone (public/sounds/ring-waiting.mp3 — Mixkit "Waiting ringtone", Mixkit License) is fetched
// and decoded once when the line comes up, so an incoming call rings from memory at once —
// no network at ring time. Browsers only let audio start after the page was touched, so the
// context is resumed on the first click/key.

let ctx: AudioContext | null = null
let ring: AudioBuffer | null = null

function audio(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext()
    const unlock = () => { void ctx?.resume() }
    window.addEventListener("pointerdown", unlock, { capture: true })
    window.addEventListener("keydown", unlock, { capture: true })
  }
  return ctx
}

/** Fetch + decode the ringtone once (called when the phone line starts) */
export async function preloadRing(): Promise<void> {
  if (ring) return
  const c = audio()
  // A new file name per new sound: Cloudflare cached an HTML fallback under the first name once
  const res = await fetch("/sounds/ring-waiting.mp3")
  if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("audio/")) throw new Error(`ringtone: ${res.status}`)
  ring = await c.decodeAudioData(await res.arrayBuffer())
}

/** Ring until the returned stop() — the file looped; if it isn't ready, a plain two-tone ring */
export function startRing(): () => void {
  const c = audio()
  void c.resume()
  const out = c.createGain()
  out.gain.value = 0.9
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
