import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { motion, AnimatePresence, useDragControls, useMotionValue } from "framer-motion"
import { Phone, PhoneDisconnect, PhoneIncoming, PhoneOutgoing, Microphone, MicrophoneSlash, ArrowRight, X, DotsSixVertical } from "@phosphor-icons/react"
import { usePhone } from "@/context/PhoneContext"
import { formatPhone } from "@/lib/format"
import { canonPhone } from "@/lib/supabase/queries/sotuv"
import { analyse } from "@/lib/phoneAudio"

const POS_KEY = "fy_call_pos"   // where the card was dragged to (offset from bottom-right)
function savedPos(): { x: number; y: number } {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) ?? "") as { x: number; y: number }
    // a smaller window than when it was saved → back to the corner
    return Math.abs(p.x) < window.innerWidth - 340 && Math.abs(p.y) < window.innerHeight - 200 ? p : { x: 0, y: 0 }
  } catch { return { x: 0, y: 0 } }
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`

/** The call card: incoming (answer / decline), dialing, talking (timer, mute, end) */
export function PhoneWidget() {
  const { call, answer, hangup, toggleMute, dismiss, remoteStream } = usePhone()
  // Draggable by its top part, anywhere on screen (the card mustn't cover what you type mid-call)
  const area = useRef<HTMLDivElement>(null)
  const drag = useDragControls()
  const [start] = useState(savedPos)
  const x = useMotionValue(start.x)
  const y = useMotionValue(start.y)
  const savePos = () => { try { localStorage.setItem(POS_KEY, JSON.stringify({ x: x.get(), y: y.get() })) } catch { /* not saved */ } }
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (call?.state !== "active") return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [call?.state])

  const talking = call?.state === "active" && call.answeredAt ? Math.max(0, Math.floor((now - call.answeredAt) / 1000)) : 0
  const label = !call ? "" : call.state === "ringing" ? "Kiruvchi qo'ng'iroq" : call.state === "dialing" ? "Qo'ng'iroq qilinmoqda…" : call.state === "active" ? clock(talking) : "Tugadi"
  const Icon = call?.dir === "in" ? PhoneIncoming : PhoneOutgoing

  async function onAnswer() {
    setError(null)
    try { await answer() } catch { setError("Mikrofonga ruxsat bering") }
  }

  return (
    <AnimatePresence>
      {call && (
        <div ref={area} className="fixed inset-3 z-[120] pointer-events-none">
        <motion.div role="dialog" aria-label="Qo'ng'iroq" aria-live="polite"
          drag dragControls={drag} dragListener={false} dragMomentum={false} dragElastic={0} dragConstraints={area} onDragEnd={savePos}
          initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
          className="pointer-events-auto absolute bottom-2 right-2 w-[320px] rounded-surface bg-surface-raised border border-line p-4 flex flex-col gap-3"
          style={{ boxShadow: "var(--toast-shadow)", x, y }}>
          <div className="flex items-start gap-3 cursor-grab active:cursor-grabbing touch-none select-none" onPointerDown={(e) => drag.start(e)} title="Sudrab boshqa joyga qo'ying">
            <span className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${call.state === "ringing" ? "bg-success-soft text-success-text animate-pulse" : "bg-surface-sunken text-ink-muted"}`}>
              <Icon size={20} />
            </span>
            <div className="flex-1 min-w-0">
              <span className="block text-base font-semibold text-ink truncate">{call.contact?.name ?? formatPhone(canonPhone(call.phone) || call.phone)}</span>
              {call.contact && <span className="block text-sm text-ink-muted tabular-nums truncate">{formatPhone(canonPhone(call.phone))}</span>}
              <span className={`block text-sm tabular-nums ${call.state === "ended" ? "text-ink-faint" : "text-ink-muted"}`}>{label}</span>
            </div>
            {call.state !== "ended" && <DotsSixVertical size={16} className="text-ink-faint shrink-0 mt-1" aria-hidden />}
            {call.state === "ended" && (
              <button onClick={dismiss} onPointerDown={(e) => e.stopPropagation()} aria-label="Yopish" className="p-1 rounded-full text-ink-muted hover:bg-mute-ghost-hover transition-colors"><X size={16} /></button>
            )}
          </div>

          {call.state === "active" && <CallBars getStream={remoteStream} />}

          {call.contact?.leadId && (
            <Link to={`/sotuv/bitim/${call.contact.leadId}`}
              className="flex items-center gap-2 h-9 px-3 rounded-control bg-surface-sunken text-sm text-ink hover:bg-surface-sunken-hover transition-colors">
              <span className="flex-1 min-w-0 truncate">{call.contact.leadName}</span><ArrowRight size={16} className="text-ink-muted" />
            </Link>
          )}
          {error && <span role="alert" className="text-sm text-danger-text">{error}</span>}

          {call.state !== "ended" && (
            <div className="flex items-center gap-2">
              {call.state === "ringing" && call.dir === "in" ? (
                <>
                  <button onClick={onAnswer} className="flex-1 h-10 inline-flex items-center justify-center gap-2 rounded-full bg-success text-white text-base font-medium hover:opacity-90 transition-opacity">
                    <Phone size={16} weight="fill" />Javob berish
                  </button>
                  <button onClick={hangup} className="flex-1 h-10 inline-flex items-center justify-center gap-2 rounded-full bg-danger text-white text-base font-medium hover:opacity-90 transition-opacity">
                    <PhoneDisconnect size={16} weight="fill" />Rad etish
                  </button>
                </>
              ) : (
                <>
                  {call.state === "active" && (
                    <button onClick={toggleMute} aria-pressed={call.muted} aria-label={call.muted ? "Mikrofonni yoqish" : "Mikrofonni o'chirish"}
                      className={`h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-full transition-colors ${call.muted ? "bg-warning-soft text-warning-text" : "bg-surface-sunken text-ink hover:bg-surface-sunken-hover"}`}>
                      {call.muted ? <MicrophoneSlash size={20} /> : <Microphone size={20} />}
                    </button>
                  )}
                  <button onClick={hangup} className="flex-1 h-10 inline-flex items-center justify-center gap-2 rounded-full bg-danger text-white text-base font-medium hover:opacity-90 transition-opacity">
                    <PhoneDisconnect size={16} weight="fill" />Tugatish
                  </button>
                </>
              )}
            </div>
          )}
        </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

/** The other side's voice as mirrored bars (variant 1, chosen by the user) */
function CallBars({ getStream }: { getStream: () => MediaStream | null }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const stream = getStream()
    const el = canvas.current
    if (!stream || !el) return
    const { analyser, close } = analyse(stream)
    const bins = new Uint8Array(analyser.frequencyBinCount)
    const g = el.getContext("2d")!
    const color = getComputedStyle(el).color
    const N = 28, W = el.width, H = el.height, bw = 5, gap = (W - N * bw) / (N - 1)
    let raf = 0
    const draw = () => {
      analyser.getByteFrequencyData(bins)
      g.clearRect(0, 0, W, H)
      g.fillStyle = color
      for (let i = 0; i < N; i++) {
        const k = Math.abs(i - (N - 1) / 2)                       // mirrored: low tones in the middle
        const v = bins[Math.min(bins.length - 1, Math.round(2 + k * 1.6))] / 255
        const h = Math.max(4, v * H * (1 - k / N * 0.5))
        g.beginPath(); g.roundRect(i * (bw + gap), (H - h) / 2, bw, h, 2.5); g.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); close() }
  }, [getStream])
  return <canvas ref={canvas} width={288} height={40} aria-hidden className="w-full h-10 text-[var(--switch-on)]" />
}
