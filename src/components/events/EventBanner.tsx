import { useId, type ReactNode } from "react"
import { eventPalette, hashStr } from "@/lib/eventTint"

// Where the two glows sit — picked from the name so banners don't all look alike.
const GLOWS = [
  ["0% 0%", "100% 100%"],
  ["100% 0%", "0% 100%"],
  ["30% 0%", "100% 80%"],
] as const

interface EventBannerProps {
  name: string
  coverImage: string | null
  className?: string
  children?: ReactNode
}

export function EventBanner({ name, coverImage, className = "", children }: EventBannerProps) {
  const noiseId = useId()

  if (coverImage) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <img src={coverImage} alt={name} className="absolute inset-0 w-full h-full object-cover" />
        {children}
      </div>
    )
  }

  // Generated cover: dark ground + two soft glows from the event's palette + fine grain.
  const p = eventPalette(name)
  const [g1, g2] = GLOWS[hashStr(name || "tadbir") % GLOWS.length]
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        backgroundColor: p.base,
        backgroundImage: `radial-gradient(90% 130% at ${g1}, ${p.a} 0%, transparent 60%), radial-gradient(70% 110% at ${g2}, ${p.b}59 0%, transparent 55%)`,
      }}
    >
      <svg className="absolute inset-0 w-full h-full opacity-[0.22] mix-blend-overlay pointer-events-none" aria-hidden>
        <filter id={noiseId}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${noiseId})`} />
      </svg>
      {children}
    </div>
  )
}
