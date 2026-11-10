import { useState, type FormEvent } from "react"
import { Backspace, Phone } from "@phosphor-icons/react"
import { usePhone } from "@/context/PhoneContext"
import { Sheet } from "@/components/ui/Sheet"

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"]

/** The 12 phone keys: tones during a call, digits in the dial sheet */
export function DialKeys({ onKey }: { onKey: (key: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map((k) => (
        <button key={k} type="button" onClick={() => onKey(k)}
          className="h-11 rounded-full bg-surface-sunken text-md font-medium text-ink tabular-nums hover:bg-surface-sunken-hover active:opacity-80 transition-colors">{k}</button>
      ))}
    </div>
  )
}

/** Call any number, in the system or not. The PBX history logs it like every other call. */
export function DialSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dial } = usePhone()
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const canCall = value.replace(/\D/g, "").length >= 3

  async function call(e?: FormEvent) {
    e?.preventDefault()
    if (!canCall) return
    setError(null)
    try { await dial(value); setValue(""); onClose() } catch { setError("Mikrofonga ruxsat bering") }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Raqam terish" className="sm:max-w-xs"
      footer={<button type="button" onClick={() => void call()} disabled={!canCall}
        className="flex-1 h-12 sm:h-10 inline-flex items-center justify-center gap-2 rounded-full bg-success text-white text-base font-medium whitespace-nowrap hover:opacity-90 disabled:opacity-40 transition-opacity">
        <Phone size={16} weight="fill" />Qo'ng'iroq qilish
      </button>}>
      <form onSubmit={(e) => void call(e)} className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <input autoFocus type="tel" inputMode="tel" autoComplete="off" value={value} placeholder="+998 90 123 45 67" aria-label="Telefon raqami"
            onChange={(e) => setValue(e.target.value.replace(/[^\d+*#\s()-]/g, ""))}
            className="flex-1 min-w-0 h-12 px-3 rounded-control bg-surface-sunken text-md text-ink tabular-nums border border-transparent outline-none focus:border-line-focus" />
          <button type="button" onClick={() => setValue((v) => v.slice(0, -1))} disabled={!value} aria-label="Oxirgi raqamni o'chirish"
            className="size-10 shrink-0 rounded-full flex items-center justify-center text-ink-muted hover:bg-mute-ghost-hover disabled:opacity-40 transition-colors"><Backspace size={20} /></button>
        </div>
        <DialKeys onKey={(k) => setValue((v) => v + k)} />
        {error && <span role="alert" className="text-sm text-danger-text">{error}</span>}
      </form>
    </Sheet>
  )
}
