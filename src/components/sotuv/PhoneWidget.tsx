import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { motion, AnimatePresence, useDragControls, useMotionValue } from "framer-motion"
import { Phone, PhoneDisconnect, PhoneIncoming, PhoneOutgoing, Microphone, MicrophoneSlash, ArrowRight, X, DotsSixVertical, DotsNine, CaretDown, CornersOut } from "@phosphor-icons/react"
import { usePhone } from "@/context/PhoneContext"
import { formatPhone } from "@/lib/format"
import { canonPhone } from "@/lib/supabase/queries/sotuv"
import { analyse } from "@/lib/phoneAudio"
import { DialKeys } from "@/components/sotuv/DialPad"
import { useMedia } from "@/hooks/useMedia"

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
  const { call, busyCalls, clearBusyCall, sendDigit, dial, status, answer, hangup, toggleMute, dismiss, remoteStream } = usePhone()
  // Draggable by its top part, anywhere on screen (the card mustn't cover what you type mid-call)
  const area = useRef<HTMLDivElement>(null)
  const drag = useDragControls()
  const [start] = useState(savedPos)
  const x = useMotionValue(start.x)
  const y = useMotionValue(start.y)
  const savePos = () => { try { localStorage.setItem(POS_KEY, JSON.stringify({ x: x.get(), y: y.get() })) } catch { /* not saved */ } }
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)
  const [keys, setKeys] = useState(false)
  const phone = useMedia("(width < 64rem)")
  // phone: shrunk to the card, to work on the bitim mid-call; a new call opens full screen again
  const [miniFor, setMiniFor] = useState<string | null>(null)
  const mini = !!call && miniFor === call.id
  const setMini = (on: boolean) => setMiniFor(on && call ? call.id : null)

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

  const busyList = busyCalls.length > 0 && (
    <div className={`flex flex-col gap-2 ${call ? "pt-3 border-t border-line" : ""}`}>
      <span className="text-sm text-ink-muted">{call ? "Yana qo'ng'iroq qilishdi, tugatgach qayta qo'ng'iroq qiling" : "Band paytingizda qo'ng'iroq qilishdi"}</span>
      <div className="flex flex-col gap-2 max-h-40 overflow-y-auto no-scrollbar">
        {busyCalls.map((b) => (
          <div key={b.phone} className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <span className="block text-base font-medium text-ink truncate">{b.name ?? formatPhone(canonPhone(b.phone) || b.phone)}</span>
              {b.name && <span className="block text-sm text-ink-muted tabular-nums truncate">{formatPhone(canonPhone(b.phone))}</span>}
            </div>
            {!call && status === "ready" && (
              <button type="button" aria-label="Qayta qo'ng'iroq qilish" title="Qayta qo'ng'iroq qilish"
                onClick={() => { setError(null); dial(b.phone).then(() => clearBusyCall(b.phone)).catch(() => setError("Mikrofonga ruxsat bering")) }}
                className="size-9 shrink-0 rounded-full bg-success text-white flex items-center justify-center hover:opacity-90 transition-opacity"><Phone size={16} weight="fill" /></button>
            )}
            <button type="button" onClick={() => clearBusyCall(b.phone)} aria-label="Ro'yxatdan olib tashlash"
              className="size-9 shrink-0 rounded-full text-ink-muted flex items-center justify-center hover:bg-mute-ghost-hover transition-colors"><X size={16} /></button>
          </div>
        ))}
      </div>
    </div>
  )

  // Phone: a live call takes the whole screen, like the phone's own call screen
  if (phone && call && call.state !== "ended" && !mini) {
    const name = call.contact?.name ?? formatPhone(canonPhone(call.phone) || call.phone)
    const big = "size-[72px] rounded-full inline-flex items-center justify-center active:opacity-80 transition-opacity"
    const small = "size-16 rounded-full inline-flex items-center justify-center active:opacity-80 transition-colors"
    return (
      <motion.div role="dialog" aria-label="Qo'ng'iroq" aria-live="polite" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="fixed inset-0 z-[120] bg-surface-raised text-ink flex flex-col px-6 pt-[calc(env(safe-area-inset-top)+3rem)] pb-[calc(env(safe-area-inset-bottom)+2rem)]">
        <button onClick={() => setMini(true)} aria-label="Kichraytirish"
          className="absolute left-4 top-[calc(env(safe-area-inset-top)+0.75rem)] size-11 rounded-full flex items-center justify-center text-ink-muted active:bg-surface-sunken"><CaretDown size={24} weight="light" /></button>
        <div className="flex flex-col items-center gap-2 text-center">
          <span className={`size-24 rounded-full flex items-center justify-center bg-surface-sunken text-ink-muted ${call.state === "ringing" ? "animate-pulse" : ""}`}>
            <Icon size={40} weight="thin" />
          </span>
          <span className="mt-2 text-2xl font-semibold line-clamp-2">{name}</span>
          {call.contact && <span className="text-base text-ink-muted tabular-nums">{formatPhone(canonPhone(call.phone))}</span>}
          <span className="text-base text-ink-muted tabular-nums">{label}</span>
          {call.contact?.leadId && (
            <Link to={`/sotuv/bitim/${call.contact.leadId}`} onClick={() => setMini(true)}
              className="mt-2 inline-flex items-center gap-2 h-10 px-4 rounded-full bg-surface-sunken text-sm text-ink max-w-full">
              <span className="truncate">{call.contact.leadName}</span><ArrowRight size={16} className="text-ink-muted shrink-0" />
            </Link>
          )}
        </div>

        <div className="flex-1 flex flex-col justify-center gap-4 min-h-0">
          {call.state === "active" && !keys && <CallBars getStream={remoteStream} />}
          {call.state === "active" && keys && <DialKeys onKey={sendDigit} />}
          {busyList}
        </div>

        {error && <span role="alert" className="mb-3 text-center text-sm text-danger-text">{error}</span>}
        {call.state === "ringing" && call.dir === "in" ? (
          <div className="flex justify-around">
            <span className="flex flex-col items-center gap-2 text-sm text-ink-muted">
              <button onClick={hangup} aria-label="Rad etish" className={`${big} bg-danger text-white`}><PhoneDisconnect size={32} weight="fill" /></button>Rad etish
            </span>
            <span className="flex flex-col items-center gap-2 text-sm text-ink-muted">
              <button onClick={onAnswer} aria-label="Javob berish" className={`${big} bg-success text-white`}><Phone size={32} weight="fill" /></button>Javob berish
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-around">
            <button onClick={() => setKeys((k) => !k)} disabled={call.state !== "active"} aria-pressed={keys} aria-label="Raqam tugmalari"
              className={`${small} disabled:opacity-40 ${keys ? "bg-mute-soft" : "bg-surface-sunken"}`}><DotsNine size={28} weight="light" /></button>
            <button onClick={hangup} aria-label="Tugatish" className={`${big} bg-danger text-white`}><PhoneDisconnect size={32} weight="fill" /></button>
            <button onClick={toggleMute} disabled={call.state !== "active"} aria-pressed={call.muted} aria-label={call.muted ? "Mikrofonni yoqish" : "Mikrofonni o'chirish"}
              className={`${small} disabled:opacity-40 ${call.muted ? "bg-warning-soft text-warning-text" : "bg-surface-sunken"}`}>
              {call.muted ? <MicrophoneSlash size={28} weight="light" /> : <Microphone size={28} weight="light" />}
            </button>
          </div>
        )}
      </motion.div>
    )
  }

  return (
    <AnimatePresence>
      {(call || busyCalls.length > 0) && (
        <div ref={area} className="fixed inset-3 max-lg:bottom-[calc(var(--tabbar-h)+0.75rem)] z-[120] pointer-events-none">
        <motion.div role="dialog" aria-label="Qo'ng'iroq" aria-live="polite"
          drag dragControls={drag} dragListener={false} dragMomentum={false} dragElastic={0} dragConstraints={area} onDragEnd={savePos}
          initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
          className="pointer-events-auto absolute bottom-2 right-2 w-[320px] max-sm:w-full max-w-full rounded-surface bg-surface-raised border border-line p-4 flex flex-col gap-3"
          style={{ boxShadow: "var(--toast-shadow)", x, y }}>
          {call && <>
          <div className="flex items-start gap-3 cursor-grab active:cursor-grabbing touch-none select-none" onPointerDown={(e) => drag.start(e)} title="Sudrab boshqa joyga qo'ying">
            <span className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${call.state === "ringing" ? "bg-success-soft text-success-text animate-pulse" : "bg-surface-sunken text-ink-muted"}`}>
              <Icon size={20} />
            </span>
            <div className="flex-1 min-w-0">
              <span className="block text-base font-semibold text-ink truncate">{call.contact?.name ?? formatPhone(canonPhone(call.phone) || call.phone)}</span>
              {call.contact && <span className="block text-sm text-ink-muted tabular-nums truncate">{formatPhone(canonPhone(call.phone))}</span>}
              <span className={`block text-sm tabular-nums ${call.state === "ended" ? "text-ink-faint" : "text-ink-muted"}`}>{label}</span>
            </div>
            {call.state !== "ended" && (phone
              ? <button onClick={() => setMini(false)} onPointerDown={(e) => e.stopPropagation()} aria-label="Kattalashtirish" className="size-9 -m-1 rounded-full flex items-center justify-center text-ink-muted active:bg-surface-sunken"><CornersOut size={20} /></button>
              : <DotsSixVertical size={16} className="text-ink-faint shrink-0 mt-1" aria-hidden />)}
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
          {call.state === "active" && keys && <DialKeys onKey={sendDigit} />}

          {call.state !== "ended" && (
            <div className="flex items-center gap-2">
              {call.state === "ringing" && call.dir === "in" ? (
                <>
                  <button onClick={onAnswer} className="flex-1 h-10 max-sm:h-12 inline-flex items-center justify-center gap-2 rounded-full bg-success text-white text-base font-medium hover:opacity-90 transition-opacity">
                    <Phone size={16} weight="fill" />Javob berish
                  </button>
                  <button onClick={hangup} className="flex-1 h-10 max-sm:h-12 inline-flex items-center justify-center gap-2 rounded-full bg-danger text-white text-base font-medium hover:opacity-90 transition-opacity">
                    <PhoneDisconnect size={16} weight="fill" />Rad etish
                  </button>
                </>
              ) : (
                <>
                  {call.state === "active" && (
                    <button onClick={() => setKeys((k) => !k)} aria-pressed={keys} aria-label="Raqam tugmalari"
                      className={`h-10 w-10 max-sm:h-12 max-sm:w-12 shrink-0 inline-flex items-center justify-center rounded-full transition-colors ${keys ? "bg-mute-soft text-ink" : "bg-surface-sunken text-ink hover:bg-surface-sunken-hover"}`}>
                      <DotsNine size={20} />
                    </button>
                  )}
                  {call.state === "active" && (
                    <button onClick={toggleMute} aria-pressed={call.muted} aria-label={call.muted ? "Mikrofonni yoqish" : "Mikrofonni o'chirish"}
                      className={`h-10 w-10 max-sm:h-12 max-sm:w-12 shrink-0 inline-flex items-center justify-center rounded-full transition-colors ${call.muted ? "bg-warning-soft text-warning-text" : "bg-surface-sunken text-ink hover:bg-surface-sunken-hover"}`}>
                      {call.muted ? <MicrophoneSlash size={20} /> : <Microphone size={20} />}
                    </button>
                  )}
                  <button onClick={hangup} className="flex-1 h-10 max-sm:h-12 inline-flex items-center justify-center gap-2 rounded-full bg-danger text-white text-base font-medium hover:opacity-90 transition-opacity">
                    <PhoneDisconnect size={16} weight="fill" />Tugatish
                  </button>
                </>
              )}
            </div>
          )}
          </>}

          {error && <span role="alert" className="text-sm text-danger-text">{error}</span>}

          {busyList}
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
