import { useState } from 'react'
import { CaretDown, GlobeHemisphereWest } from '@phosphor-icons/react'
import { inputDigits, isForeign, pastedPhone, phoneFromInput } from '@/lib/phone'

interface PhoneInputProps {
  value: string
  onChange: (full: string) => void
  placeholder?: string
  className?: string
  id?: string
}

/** A phone field. Uzbek by default: "+998" and nine digits. The prefix is a switch — "Boshqa davlat" takes a
 *  whole number of any country behind "+" (clients from abroad, 2026-11-25); pasting "+7…" switches by itself. */
export function PhoneInput({ value, onChange, placeholder, className, id }: PhoneInputProps) {
  const [foreign, setForeign] = useState(() => isForeign(value))
  const digits = inputDigits(value, foreign)

  function toggle() {
    setForeign(!foreign)
    onChange('')   // +998 90… and +90… are different numbers: don't carry digits across
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const p = pastedPhone(e.clipboardData.getData('text'))
    setForeign(p.foreign)
    onChange(p.value)
  }

  return (
    <div
      className={`flex items-center border border-line rounded-control focus-within:border-line-focus transition-colors bg-surface ${className ?? ''}`}
    >
      <button type="button" onClick={toggle} aria-pressed={foreign}
        aria-label={foreign ? "O'zbekiston raqamiga qaytish" : 'Boshqa davlat raqami'}
        title={foreign ? "O'zbekiston raqamiga qaytish (+998)" : 'Boshqa davlat raqami'}
        className="ml-1 pl-2 pr-1 h-8 flex-shrink-0 inline-flex items-center gap-1 rounded-item text-base text-ink select-none hover:bg-mute-ghost-hover">
        {foreign ? <><GlobeHemisphereWest size={16} className="text-ink-muted" />+</> : '+998'}
        <CaretDown size={12} weight="bold" className="text-ink-faint" />
      </button>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete={foreign ? 'tel' : 'tel-national'}
        value={digits}
        onChange={(e) => onChange(phoneFromInput(e.target.value, foreign))}
        onPaste={handlePaste}
        placeholder={placeholder ?? (foreign ? 'davlat kodi va raqam' : '90 123 45 67')}
        maxLength={foreign ? 15 : 9}
        className="flex-1 min-w-0 py-2 pl-1 pr-3 text-base text-ink placeholder:text-ink-faint outline-none bg-transparent"
      />
    </div>
  )
}
