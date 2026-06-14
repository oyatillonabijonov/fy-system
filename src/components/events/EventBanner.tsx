import type { ReactNode } from "react"
import { eventTint, hashStr } from "@/lib/eventTint"

// Deterministic subtle geometric pattern (dots / grid / diagonal) from the name.
function PatternFill({ name }: { name: string }) {
  const h = hashStr(name || "tadbir")
  const variant = h % 3
  const id = `evtpat-${h}`
  const line = "rgba(255,255,255,0.07)"

  return (
    <svg className="absolute inset-0 w-full h-full" aria-hidden>
      <defs>
        <pattern id={id} width="24" height="24" patternUnits="userSpaceOnUse">
          {variant === 0 && <circle cx="3" cy="3" r="1.5" fill={line} />}
          {variant === 1 && (
            <path d="M0 0H24M0 0V24" stroke={line} strokeWidth="1" fill="none" />
          )}
          {variant === 2 && (
            <path d="M0 24L24 0" stroke={line} strokeWidth="1.5" fill="none" />
          )}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  )
}

interface EventBannerProps {
  name: string
  coverImage: string | null
  className?: string
  children?: ReactNode
}

export function EventBanner({ name, coverImage, className = "", children }: EventBannerProps) {
  if (coverImage) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <img src={coverImage} alt={name} className="absolute inset-0 w-full h-full object-cover" />
        {children}
      </div>
    )
  }

  const tint = eventTint(name)
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ backgroundColor: tint }}
    >
      <PatternFill name={name} />
      {children}
    </div>
  )
}
