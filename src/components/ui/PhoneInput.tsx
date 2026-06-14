import { formatPhone } from '@/lib/format'

interface PhoneInputProps {
  value: string
  onChange: (full: string) => void
  placeholder?: string
  className?: string
}

export function PhoneInput({
  value,
  onChange,
  placeholder = '90 123 45 67',
  className,
}: PhoneInputProps) {
  const digits = value.replace(/^\+998/, '').replace(/\D/g, '').slice(0, 9)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 9)
    onChange(raw.length > 0 ? `+998${raw}` : '')
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text')
    const normalized = formatPhone(pasted)
    const extracted = normalized === '—'
      ? ''
      : normalized.replace(/^\+998/, '').replace(/\D/g, '').slice(0, 9)
    onChange(extracted.length > 0 ? `+998${extracted}` : '')
  }

  return (
    <div
      className={`flex items-center border border-[#E0E0E0] rounded-[8px] focus-within:border-[#141414] transition-colors bg-white ${className ?? ''}`}
    >
      <span className="pl-3 pr-1 text-[13px] text-[#141414] select-none flex-shrink-0">
        +998
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={digits}
        onChange={handleChange}
        onPaste={handlePaste}
        placeholder={placeholder}
        maxLength={9}
        className="flex-1 py-2 pr-3 text-[13px] text-[#141414] placeholder:text-[#CCCCCC] outline-none bg-transparent"
      />
    </div>
  )
}
