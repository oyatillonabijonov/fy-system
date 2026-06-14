import { STATUS_VARIANTS, type StatusVariant } from '@/lib/constants/theme'

interface StatusBadgeProps {
  label: string
  variant: StatusVariant
  dot?: boolean
}

export function StatusBadge({ label, variant, dot = false }: StatusBadgeProps) {
  const v = STATUS_VARIANTS[variant]
  return (
    <span
      className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-md text-[11px] font-bold whitespace-nowrap"
      style={{ backgroundColor: v.bg, color: v.text }}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: v.text }}
        />
      )}
      {label}
    </span>
  )
}
