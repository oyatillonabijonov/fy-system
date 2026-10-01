import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Phone, PhoneDisconnect, PhoneIncoming, PhoneOutgoing, Microphone, MicrophoneSlash, ArrowRight, X } from "@phosphor-icons/react"
import { usePhone } from "@/context/PhoneContext"
import { formatPhone } from "@/lib/format"
import { canonPhone } from "@/lib/supabase/queries/sotuv"

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`

/** The call card: incoming (answer / decline), dialing, talking (timer, mute, end) */
export function PhoneWidget() {
  const { call, answer, hangup, toggleMute, dismiss } = usePhone()
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
        <motion.div role="dialog" aria-label="Qo'ng'iroq" aria-live="polite"
          initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16 }}
          className="fixed bottom-5 right-5 z-[120] w-[320px] rounded-surface bg-surface-raised border border-line p-4 flex flex-col gap-3"
          style={{ boxShadow: "var(--toast-shadow)" }}>
          <div className="flex items-start gap-3">
            <span className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${call.state === "ringing" ? "bg-success-soft text-success-text animate-pulse" : "bg-surface-sunken text-ink-muted"}`}>
              <Icon size={20} />
            </span>
            <div className="flex-1 min-w-0">
              <span className="block text-base font-semibold text-ink truncate">{call.contact?.name ?? formatPhone(canonPhone(call.phone) || call.phone)}</span>
              {call.contact && <span className="block text-sm text-ink-muted tabular-nums truncate">{formatPhone(canonPhone(call.phone))}</span>}
              <span className={`block text-sm tabular-nums ${call.state === "ended" ? "text-ink-faint" : "text-ink-muted"}`}>{label}</span>
            </div>
            {call.state === "ended" && (
              <button onClick={dismiss} aria-label="Yopish" className="p-1 rounded-full text-ink-muted hover:bg-mute-ghost-hover transition-colors"><X size={16} /></button>
            )}
          </div>

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
      )}
    </AnimatePresence>
  )
}
